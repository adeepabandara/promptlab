'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ModelSelector } from '@/components/concept/ModelSelector';
import { replaceVariables } from '@/lib/prompt-engine';
import { ConceptRun, Model, Prompt, PromptVersion } from '@/types';
import { toast } from 'sonner';

interface ImageRunFormProps {
  onRunStarted: (runIds: string[]) => Promise<void>;
  onRunningChange?: (running: boolean) => void;
}

export function ImageRunForm({ onRunStarted, onRunningChange }: ImageRunFormProps) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [conceptRuns, setConceptRuns] = useState<ConceptRun[]>([]);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState('');
  const [selectedVersion, setSelectedVersion] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [conceptJson, setConceptJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [selectedConceptRun, setSelectedConceptRun] = useState('');
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Prompt editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [changelog, setChangelog] = useState('');
  const [saving, setSaving] = useState(false);

  const currentVersion = versions.find((v) => v.id === selectedVersion);
  const livePreview = currentVersion
    ? replaceVariables(currentVersion.content, {
        ...paramValues,
        concept_json: conceptJson,
      })
    : '';
  const promptHasConceptVar = currentVersion?.content.includes('{{concept_json}}') ?? false;
  const promptHasImageVar = currentVersion?.content.includes('{{reference_image_url}}') ?? false;

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [{ data: p }, { data: m }, { data: cr }] = await Promise.all([
        supabase.from('prompts').select('*').eq('type', 'image').order('created_at', { ascending: false }),
        supabase.from('models').select('*').eq('type', 'image').eq('is_active', true).order('name'),
        supabase
          .from('concept_runs')
          .select('*, models(*), prompt_versions(*, prompts(*))')
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      const promptList = (p as Prompt[]) ?? [];
      const conceptRunList = (cr as ConceptRun[]) ?? [];
      setPrompts(promptList);
      setModels((m as Model[]) ?? []);
      setConceptRuns(conceptRunList);

      // Auto-select latest image prompt
      if (promptList.length > 0) {
        const latestPrompt = promptList[0];
        setSelectedPrompt(latestPrompt.id);
        const { data: versions } = await supabase
          .from('prompt_versions')
          .select('*')
          .eq('prompt_id', latestPrompt.id)
          .order('version_number', { ascending: false });
        const vList = (versions as PromptVersion[]) ?? [];
        setVersions(vList);
        if (vList.length > 0) setSelectedVersion(vList[0].id);
      }

      // Auto-import latest concept run
      if (conceptRunList.length > 0) {
        const latest = conceptRunList[0];
        if (latest.output_json) {
          setConceptJson(JSON.stringify(latest.output_json, null, 2));
          setSelectedConceptRun(latest.id);
        } else if (latest.raw_output) {
          try {
            const parsed = JSON.parse(latest.raw_output);
            setConceptJson(JSON.stringify(parsed, null, 2));
            setSelectedConceptRun(latest.id);
          } catch { /* no valid JSON — leave blank */ }
        }
      }
    }
    load();
  }, []);

  async function loadVersions(promptId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from('prompt_versions')
      .select('*')
      .eq('prompt_id', promptId)
      .order('version_number', { ascending: false });
    const vList = (data as PromptVersion[]) ?? [];
    setVersions(vList);
    if (vList.length > 0) setSelectedVersion(vList[0].id);
  }

  function openEditor() {
    setEditorContent(currentVersion?.content ?? '');
    setChangelog('');
    setEditorOpen(true);
  }

  async function handleSaveVersion(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPrompt || !editorContent.trim()) return;
    setSaving(true);

    const nextVersion = (versions[0]?.version_number ?? 0) + 1;
    const res = await fetch('/api/prompt-versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt_id: selectedPrompt,
        version_number: nextVersion,
        content: editorContent.trim(),
        parameters: currentVersion?.parameters ?? [],
        changelog: changelog || `v${nextVersion}`,
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      toast.error(data.error ?? 'Save failed');
      return;
    }

    toast.success(`Saved as v${nextVersion}`);
    setEditorOpen(false);
    await loadVersions(selectedPrompt);
    setSelectedVersion(data.id);
  }

  function handleJsonChange(v: string) {
    setConceptJson(v);
    try {
      JSON.parse(v);
      setJsonError('');
    } catch {
      setJsonError('Invalid JSON');
    }
  }

  function importFromRun(runId: string) {
    const run = conceptRuns.find((r) => r.id === runId);
    if (!run) return;

    if (run.output_json) {
      setConceptJson(JSON.stringify(run.output_json, null, 2));
      setJsonError('');
      setSelectedConceptRun(runId);
      return;
    }

    // Fallback: try parsing raw_output
    if (run.raw_output) {
      try {
        const parsed = JSON.parse(run.raw_output);
        setConceptJson(JSON.stringify(parsed, null, 2));
        setJsonError('');
        setSelectedConceptRun(runId);
        return;
      } catch {
        // raw_output isn't valid JSON either
      }
    }

    // Clear any stale concept JSON so old data isn't silently used
    setConceptJson('');
    setJsonError('');
    setSelectedConceptRun('');
    toast.error('This run has no JSON output — re-run the concept generation first');
  }

  async function uploadImage(file: File): Promise<string> {
    setUploading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const path = `${user!.id}/inputs/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('generated-images').upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from('generated-images').getPublicUrl(path);
    setUploading(false);
    return data.publicUrl;
  }

  async function handleRun() {
    if (!selectedVersion || selectedModels.length === 0) {
      toast.error('Select a prompt and at least one model');
      return;
    }
    if (!conceptJson || jsonError) {
      toast.error('Enter valid concept JSON');
      return;
    }

    let parsedJson: Record<string, unknown>;
    try {
      parsedJson = JSON.parse(conceptJson);
    } catch {
      toast.error('Invalid JSON');
      return;
    }

    setRunning(true);
    onRunningChange?.(true);
    let finalImageUrl = '';
    if (imageFile) {
      try {
        finalImageUrl = await uploadImage(imageFile);
      } catch {
        toast.error('Image upload failed');
        setRunning(false);
        onRunningChange?.(false);
        return;
      }
    }

    const res = await fetch('/api/image/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptVersionId: selectedVersion,
        modelIds: selectedModels,
        inputConceptJson: parsedJson,
        inputParams: paramValues,
        inputImageUrl: finalImageUrl || undefined,
        conceptRunId: selectedConceptRun || undefined,
      }),
    });

    const data = await res.json();
    setRunning(false);
    onRunningChange?.(false);

    if (!res.ok) {
      toast.error(data.error ?? 'Run failed');
      return;
    }

    toast.success(`Started ${data.runIds.length} image run(s)`);
    onRunStarted(data.runIds);
  }

  return (
    <>
      <div className="space-y-5">
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">1. Concept JSON</Label>
          <div className="flex gap-2 items-center mb-1">
            <Select value={selectedConceptRun} onValueChange={(v) => { if (v) importFromRun(v); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Import from concept run…" /></SelectTrigger>
              <SelectContent>
                {conceptRuns.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-xs">
                    {new Date(r.created_at).toLocaleDateString()} {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {conceptJson && !jsonError && (
              <Badge className="bg-green-100 text-green-700 border-0 text-xs shrink-0">Valid JSON</Badge>
            )}
            {jsonError && (
              <Badge className="bg-red-100 text-red-700 border-0 text-xs shrink-0">Invalid JSON</Badge>
            )}
          </div>
          <Textarea
            value={conceptJson}
            onChange={(e) => handleJsonChange(e.target.value)}
            rows={6}
            placeholder='{"product": "...", "style": "..."}'
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">2. Select Image Prompt</Label>
          <Select value={selectedPrompt} onValueChange={(v) => { if (v) { setSelectedPrompt(v); loadVersions(v); } }}>
            <SelectTrigger><SelectValue placeholder="Choose a prompt…" /></SelectTrigger>
            <SelectContent>
              {prompts.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {currentVersion?.parameters && currentVersion.parameters.length > 0 && (
            <div className="space-y-2 mt-2">
              {currentVersion.parameters.map((param) => (
                <div key={param.name} className="space-y-1">
                  <Label className="text-xs">{param.label}</Label>
                  <Input
                    value={paramValues[param.name] ?? param.default_value ?? ''}
                    onChange={(e) => setParamValues({ ...paramValues, [param.name]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          )}

          {currentVersion && (
            <div className="space-y-1 mt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-gray-500">Preview</Label>
                  {conceptJson && !jsonError && !promptHasConceptVar && (
                    <Badge className="bg-yellow-100 text-yellow-700 border-0 text-xs shrink-0">
                      ⚠ prompt missing &#123;&#123;concept_json&#125;&#125; — concept will not be sent
                    </Badge>
                  )}
                  {conceptJson && !jsonError && promptHasConceptVar && (
                    <Badge className="bg-green-100 text-green-700 border-0 text-xs shrink-0">concept injected</Badge>
                  )}
                </div>
                <button
                  onClick={openEditor}
                  title="Open in editor"
                  className="text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h6v6M14 10l6.1-6.1M9 21H3v-6M10 14l-6.1 6.1"/>
                  </svg>
                </button>
              </div>
              <pre className="text-xs bg-gray-50 border rounded-lg p-3 whitespace-pre-wrap max-h-48 overflow-y-auto text-gray-600 leading-relaxed">
                {livePreview}
              </pre>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">3. Product Image <span className="normal-case text-gray-400">(optional)</span></Label>
          <Input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
          {imageFile && !promptHasImageVar && (
            <p className="text-xs text-amber-600">
              ⚠ Add <code className="bg-amber-50 px-1 rounded font-mono">&#123;&#123;reference_image_url&#125;&#125;</code> to your prompt template so the image URL gets injected into the prompt sent to the model.
            </p>
          )}
          {imageFile && promptHasImageVar && (
            <p className="text-xs text-green-600">✓ Image URL will be injected via &#123;&#123;reference_image_url&#125;&#125;</p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">4. Select Models</Label>
          <ModelSelector models={models} selected={selectedModels} onChange={setSelectedModels} />
        </div>

        <Button
          className="w-full"
          onClick={handleRun}
          disabled={running || uploading || !selectedVersion || selectedModels.length === 0 || !!jsonError}
        >
          {running ? 'Running…' : uploading ? 'Uploading…' : 'Generate Images'}
        </Button>
      </div>

      {/* Full-screen prompt editor */}
      {editorOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit Image Prompt</h2>
              <p className="text-xs text-gray-400 mt-0.5">Saving creates a new version — current version stays unchanged</p>
            </div>
            <button
              onClick={() => setEditorOpen(false)}
              className="text-gray-400 hover:text-gray-700 transition-colors p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <form onSubmit={handleSaveVersion} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 p-6 min-h-0">
              <textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                className="w-full h-full resize-none font-mono text-sm leading-relaxed border rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-gray-300"
                placeholder="Write your prompt here. Use {{variable}} for dynamic placeholders…"
                autoFocus
              />
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 shrink-0 flex items-center gap-3">
              <Input
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                placeholder="What changed? (optional)"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !editorContent.trim()}>
                {saving ? 'Saving…' : 'Save as new version'}
              </Button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </>
  );
}
