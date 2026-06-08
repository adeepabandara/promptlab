'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PromptEditor } from '@/components/prompts/PromptEditor';
import { PromptVersionHistory } from '@/components/prompts/PromptVersionHistory';
import { PromptDiffViewer } from '@/components/prompts/PromptDiffViewer';
import { ParamBuilder } from '@/components/prompts/ParamBuilder';
import { usePromptVersions } from '@/hooks/usePromptVersions';
import { detectVariables } from '@/lib/prompt-engine';
import { Prompt, PromptParameter, PromptVersion } from '@/types';
import { toast } from 'sonner';

export default function PromptDetailPage({ params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = use(params);
  const router = useRouter();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [content, setContent] = useState('');
  const [parameters, setParameters] = useState<PromptParameter[]>([]);
  const [changelog, setChangelog] = useState('');
  const [detectedVars, setDetectedVars] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);
  const [compareVersion, setCompareVersion] = useState<PromptVersion | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  const { versions, loading: versionsLoading, refetch } = usePromptVersions(promptId);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.from('prompts').select('*').eq('id', promptId).single();
      if (!data) { router.push('/prompts'); return; }
      setPrompt(data as Prompt);
    }
    load();
  }, [promptId, router]);

  useEffect(() => {
    if (versions.length > 0 && !selectedVersion) {
      const latest = versions[0];
      setSelectedVersion(latest);
      setContent(latest.content);
      setParameters(latest.parameters ?? []);
    }
  }, [versions, selectedVersion]);

  useEffect(() => {
    setDetectedVars(detectVariables(content));
  }, [content]);

  function handleSelectVersion(v: PromptVersion) {
    setSelectedVersion(v);
    setContent(v.content);
    setParameters(v.parameters ?? []);
  }

  async function handleSaveVersion(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const nextVersion = (versions[0]?.version_number ?? 0) + 1;

    const res = await fetch('/api/prompt-versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt_id: promptId,
        version_number: nextVersion,
        content,
        parameters,
        changelog,
      }),
    });

    const data = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(data.error ?? 'Save failed'); return; }
    toast.success(`Saved as v${nextVersion}`);
    setShowSaveDialog(false);
    setChangelog('');
    refetch();
  }

  async function handleDelete() {
    if (!confirm('Delete this prompt and all its versions?')) return;
    const res = await fetch('/api/prompts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: promptId }),
    });
    if (!res.ok) { toast.error('Delete failed'); return; }
    toast.success('Prompt deleted');
    router.push('/prompts');
  }

  if (!prompt) return <Skeleton className="h-96" />;

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>← Back</Button>
          <h1 className="text-xl font-bold">{prompt.name}</h1>
          <Badge className={`border-0 ${prompt.type === 'concept' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
            {prompt.type}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(true)}>
            Save as new version
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-600 hover:text-red-700">
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Prompt Content</Label>
            <PromptEditor value={content} onChange={setContent} />
          </div>

          {detectedVars.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-gray-500">Detected variables:</span>
              {detectedVars.map((v) => (
                <code key={v} className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono">
                  {`{{${v}}}`}
                </code>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label>Parameters</Label>
            <ParamBuilder
              detectedVars={detectedVars}
              value={parameters}
              onChange={setParameters}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Version History</h3>
            {versions.length >= 2 && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setShowDiff(true)}>
                Compare
              </Button>
            )}
          </div>
          <PromptVersionHistory
            versions={versions}
            loading={versionsLoading}
            selectedId={selectedVersion?.id}
            onSelect={handleSelectVersion}
            onCompare={(v) => { setCompareVersion(v); setShowDiff(true); }}
            onUse={(v) => { setContent(v.content); setParameters(v.parameters ?? []); }}
          />
        </div>
      </div>

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as new version</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveVersion} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Changelog</Label>
              <Textarea
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                placeholder="What changed in this version?"
                rows={3}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowSaveDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {showDiff && versions.length >= 2 && (
        <PromptDiffViewer
          open={showDiff}
          onClose={() => { setShowDiff(false); setCompareVersion(null); }}
          versions={versions}
          initialA={versions[versions.length - 1]?.id}
          initialB={compareVersion?.id ?? versions[0]?.id}
        />
      )}
    </div>
  );
}
