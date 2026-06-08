'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createPortal } from 'react-dom';
import { ModelSelector } from './ModelSelector';
import { replaceVariables } from '@/lib/prompt-engine';
import { Model, Prompt, PromptVersion } from '@/types';
import { toast } from 'sonner';

/* ── Product input presets (from foam request files) ─────────────── */
const PRODUCT_PRESETS = [
  {
    id: '339210-000',
    name: 'Cylindrical Filter Vessel',
    inputText: `=== FOAM CUSHION DESIGN REQUEST ===

--- INPUT A: Product Data ---
Product name:       Tapered Cylindrical Filter Vessel with Bottom Neck & Side Nozzles
Product ID:         339210-000
Weight:             13.0 kg
Overall envelope:   X = 317.3 mm | Y = 317.4 mm | Z = 556.3 mm
Design orientation: Bottom face down (upright — tallest axis vertical)
Fragility G-value:  60 G
Drop height:        610 mm

--- INPUT C: API Material Options ---
Option 1 — Laminated PE LD:
  Density:  23 kg/m³  |  T_req: 50 mm  |  A_req: 18200 mm²
Option 2 — Non-laminated PE:
  Density:  35 kg/m³  |  T_req: 40 mm  |  A_req:  9100 mm²
Option 3 — PU Foam:
  Density:  44 kg/m³  |  T_req: 65 mm  |  A_req: 25500 mm²

{"meta":{"product_id":"339210-000"}}`,
  },
  {
    id: '340251-000',
    name: 'Electrical Enclosure',
    inputText: `=== FOAM CUSHION DESIGN REQUEST ===

--- INPUT A: Product Data ---
Product name:       Industrial Electrical Enclosure / Junction Box with Sub-Modules
Product ID:         340251-000
Weight:             15.0 kg
Overall envelope:   X = 514.0 mm | Y = 348.0 mm | Z = 195.0 mm
Design orientation: Bottom face down (feet down)
Fragility G-value:  50 G
Drop height:        560 mm

--- INPUT C: API Material Options ---
Option 1 — Laminated PE LD:
  Density:  23 kg/m³  |  T_req: 55 mm  |  A_req: 21000 mm²
Option 2 — Non-laminated PE:
  Density:  35 kg/m³  |  T_req: 45 mm  |  A_req: 10500 mm²
Option 3 — PU Foam:
  Density:  44 kg/m³  |  T_req: 70 mm  |  A_req: 29400 mm²

{"meta":{"product_id":"340251-000"}}`,
  },
  {
    id: '345856-200',
    name: 'Circular Metal Disc / Flange',
    inputText: `=== FOAM CUSHION DESIGN REQUEST ===

--- INPUT A: Product Data ---
Product name:       Large Circular Metal Disc / Flange Plate
Product ID:         345856-200
Weight:             28.0 kg
Overall envelope:   X = 472.0 mm | Y = 472.0 mm | Z = 45.8 mm
Design orientation: Bottom face down (lying flat — circular face down)
Fragility G-value:  100 G
Drop height:        480 mm

--- INPUT C: API Material Options ---
Option 1 — Laminated PE LD:
  Density:  23 kg/m³  |  T_req: 40 mm  |  A_req: 39200 mm²
Option 2 — Non-laminated PE:
  Density:  35 kg/m³  |  T_req: 30 mm  |  A_req: 19600 mm²
Option 3 — PU Foam:
  Density:  44 kg/m³  |  T_req: 55 mm  |  A_req: 54900 mm²

{"meta":{"product_id":"345856-200"}}`,
  },
  {
    id: '722601-200',
    name: 'Flat Electronics Enclosure',
    inputText: `=== FOAM CUSHION DESIGN REQUEST ===

--- INPUT A: Product Data ---
Product name:       Large Flat Industrial Electronics Enclosure
Product ID:         722601-200
Weight:             18.0 kg
Overall envelope:   X = 746.0 mm | Y = 629.8 mm | Z = 142.0 mm
Design orientation: Bottom face down (flat, widest face down)
Fragility G-value:  50 G
Drop height:        530 mm

--- INPUT C: API Material Options ---
Option 1 — Laminated PE LD:
  Density:  23 kg/m³  |  T_req: 55 mm  |  A_req: 25200 mm²
Option 2 — Non-laminated PE:
  Density:  35 kg/m³  |  T_req: 45 mm  |  A_req: 12600 mm²
Option 3 — PU Foam:
  Density:  44 kg/m³  |  T_req: 70 mm  |  A_req: 35300 mm²

{"meta":{"product_id":"722601-200"}}`,
  },
];

interface ConceptRunFormProps {
  onRunStarted: (runIds: string[]) => void;
  onRunningChange?: (running: boolean) => void;
}

export function ConceptRunForm({ onRunStarted, onRunningChange }: ConceptRunFormProps) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState('');
  const [selectedVersion, setSelectedVersion] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [userPrompt, setUserPrompt] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);

  // Prompt editor modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [changelog, setChangelog] = useState('');
  const [saving, setSaving] = useState(false);

  const currentVersion = versions.find((v) => v.id === selectedVersion);
  const livePreview = currentVersion ? replaceVariables(currentVersion.content, paramValues) : '';

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [{ data: p }, { data: m }] = await Promise.all([
        supabase.from('prompts').select('*').eq('type', 'concept').order('created_at', { ascending: false }),
        supabase.from('models').select('*').eq('type', 'text').eq('is_active', true).order('name'),
      ]);
      const promptList = (p as Prompt[]) ?? [];
      setPrompts(promptList);
      setModels((m as Model[]) ?? []);

      // Auto-select latest concept prompt and its latest version
      if (promptList.length > 0) {
        const latest = promptList[0];
        setSelectedPrompt(latest.id);
        const { data: versions } = await supabase
          .from('prompt_versions')
          .select('*')
          .eq('prompt_id', latest.id)
          .order('version_number', { ascending: false });
        const vList = (versions as PromptVersion[]) ?? [];
        setVersions(vList);
        if (vList.length > 0) setSelectedVersion(vList[0].id);
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
    setParamValues({});
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
      toast.error('Select a prompt version and at least one model');
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

    const res = await fetch('/api/concept/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptVersionId: selectedVersion,
        modelIds: selectedModels,
        inputParams: paramValues,
        inputImageUrl: finalImageUrl || undefined,
        userPrompt: userPrompt.trim() || undefined,
      }),
    });

    const data = await res.json();
    setRunning(false);
    onRunningChange?.(false);

    if (!res.ok) {
      toast.error(data.error ?? 'Run failed');
      return;
    }

    toast.success(`Started ${data.runIds.length} run(s)`);
    onRunStarted(data.runIds);
  }

  return (
    <>
      <div className="space-y-6">
        {/* Prompt selection */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Prompt</Label>
          <Select value={selectedPrompt} onValueChange={(v) => { if (v) { setSelectedPrompt(v); loadVersions(v); } }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a prompt…" />
            </SelectTrigger>
            <SelectContent>
              {prompts.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

        </div>

        {/* Parameters */}
        {currentVersion?.parameters && currentVersion.parameters.length > 0 && (
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Parameters</Label>
            {currentVersion.parameters.map((param) => (
              <div key={param.name} className="space-y-1.5">
                <Label className="text-xs text-gray-600">
                  {param.label}
                  {param.required && <span className="text-red-500 ml-0.5">*</span>}
                </Label>
                {param.type === 'textarea' ? (
                  <Textarea
                    value={paramValues[param.name] ?? param.default_value ?? ''}
                    onChange={(e) => setParamValues({ ...paramValues, [param.name]: e.target.value })}
                    rows={3}
                  />
                ) : param.type === 'select' ? (
                  <Select
                    value={paramValues[param.name] ?? param.default_value ?? ''}
                    onValueChange={(v) => { if (v) setParamValues({ ...paramValues, [param.name]: v }); }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {(param.options ?? []).map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={param.type === 'number' ? 'number' : 'text'}
                    value={paramValues[param.name] ?? param.default_value ?? ''}
                    onChange={(e) => setParamValues({ ...paramValues, [param.name]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Prompt preview */}
        {currentVersion && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Preview</Label>
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

        {/* User input — product preset selector */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            User Input
          </Label>

          {/* Preset dropdown */}
          <Select
            value={selectedPreset}
            onValueChange={(v) => {
              setSelectedPreset(v);
              if (v === '__custom__') {
                setUserPrompt('');
              } else {
                const p = PRODUCT_PRESETS.find((p) => p.id === v);
                if (p) setUserPrompt(p.inputText);
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a product…" />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="font-mono text-xs text-gray-500 mr-1">{p.id}</span>
                  {p.name}
                </SelectItem>
              ))}
              <SelectItem value="__custom__">Custom input…</SelectItem>
            </SelectContent>
          </Select>

          {/* Show editable text when Custom is selected, or a read-only preview for presets */}
          {selectedPreset === '__custom__' ? (
            <Textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="Paste additional context or instructions here…"
              rows={4}
              className="text-sm resize-none"
            />
          ) : selectedPreset ? (
            <pre className="text-xs bg-gray-50 border rounded-lg p-3 whitespace-pre-wrap max-h-36 overflow-y-auto text-gray-500 leading-relaxed">
              {userPrompt}
            </pre>
          ) : null}
        </div>

        {/* Reference image */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Reference Image <span className="normal-case text-gray-300">(optional)</span>
          </Label>
          <Input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
        </div>

        {/* Model selector */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Models</Label>
          <ModelSelector models={models} selected={selectedModels} onChange={setSelectedModels} />
        </div>

        <Button
          className="w-full"
          onClick={handleRun}
          disabled={running || uploading || !selectedVersion || selectedModels.length === 0}
        >
          {running ? 'Running…' : uploading ? 'Uploading…' : 'Run'}
        </Button>
      </div>

      {/* Full-screen prompt editor */}
      {editorOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit Prompt</h2>
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

          {/* Editor */}
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

            {/* Footer */}
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
