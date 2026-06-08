'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Prompt } from '@/types';
import { toast } from 'sonner';

type PromptForm = {
  name: string;
  type: 'concept' | 'image';
  description: string;
  content: string;
};

const emptyForm: PromptForm = { name: '', type: 'concept', description: '', content: '' };

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [form, setForm] = useState<PromptForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  async function loadPrompts() {
    const supabase = createClient();
    const { data } = await supabase
      .from('prompts')
      .select('*')
      .order('created_at', { ascending: false });
    setPrompts((data as Prompt[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { loadPrompts(); }, []);

  function field<K extends keyof PromptForm>(key: K, value: PromptForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function openEdit(e: React.MouseEvent, p: Prompt) {
    e.preventDefault();
    e.stopPropagation();
    const supabase = createClient();
    const { data: versions } = await supabase
      .from('prompt_versions')
      .select('content')
      .eq('prompt_id', p.id)
      .order('version_number', { ascending: false })
      .limit(1);
    setForm({
      name: p.name,
      type: p.type as 'concept' | 'image',
      description: p.description ?? '',
      content: versions?.[0]?.content ?? '',
    });
    setEditingPrompt(p);
  }

  async function handleDelete(e: React.MouseEvent, p: Prompt) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${p.name}" and all its versions?`)) return;
    const res = await fetch('/api/prompts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id }),
    });
    if (!res.ok) { toast.error('Delete failed'); return; }
    toast.success('Prompt deleted');
    loadPrompts();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const res = await fetch('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, type: form.type, description: form.description }),
    });
    const data = await res.json();

    if (!res.ok) {
      setSaving(false);
      toast.error(data.error ?? 'Failed to create prompt');
      return;
    }

    if (form.content.trim()) {
      await fetch('/api/prompt-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt_id: data.id,
          version_number: 1,
          content: form.content.trim(),
          parameters: [],
          changelog: 'Initial version',
        }),
      });
    }

    setSaving(false);
    toast.success('Prompt created');
    setCreating(false);
    setForm(emptyForm);
    loadPrompts();
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPrompt) return;
    setSaving(true);

    const metaRes = await fetch('/api/prompts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingPrompt.id,
        name: form.name,
        type: form.type,
        description: form.description,
      }),
    });

    if (!metaRes.ok) {
      const d = await metaRes.json();
      setSaving(false);
      toast.error(d.error ?? 'Update failed');
      return;
    }

    if (form.content.trim()) {
      const supabase = createClient();
      const { data: versions } = await supabase
        .from('prompt_versions')
        .select('version_number, content')
        .eq('prompt_id', editingPrompt.id)
        .order('version_number', { ascending: false })
        .limit(1);

      const latest = versions?.[0];
      if (!latest || latest.content !== form.content.trim()) {
        await fetch('/api/prompt-versions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt_id: editingPrompt.id,
            version_number: (latest?.version_number ?? 0) + 1,
            content: form.content.trim(),
            parameters: [],
            changelog: 'Edited from prompt list',
          }),
        });
      }
    }

    setSaving(false);
    toast.success('Prompt updated');
    setEditingPrompt(null);
    setForm(emptyForm);
    loadPrompts();
  }

  const isOpen = creating || !!editingPrompt;
  const isEdit = !!editingPrompt;

  function closeEditor() {
    setCreating(false);
    setEditingPrompt(null);
    setForm(emptyForm);
  }

  const conceptPrompts = prompts.filter((p) => p.type === 'concept');
  const imagePrompts = prompts.filter((p) => p.type === 'image');

  function newPrompt(type: 'concept' | 'image') {
    setForm({ ...emptyForm, type });
    setCreating(true);
  }

  function renderPromptList(list: Prompt[], type: 'concept' | 'image') {
    if (loading) {
      return (
        <div className="space-y-2 p-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
          <p>No {type} prompts yet.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => newPrompt(type)}>
            Create one
          </Button>
        </div>
      );
    }
    return (
      <div className="divide-y">
        {list.map((p) => (
          <Link key={p.id} href={`/prompts/${p.id}`}>
            <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm block truncate">{p.name}</span>
                {p.description && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{p.description}</p>
                )}
                <p className="text-xs text-gray-300 mt-0.5">{new Date(p.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={(e) => openEdit(e, p)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-red-500 hover:text-red-700"
                  onClick={(e) => handleDelete(e, p)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Prompts</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your prompt library</p>
      </div>

      <div className="grid grid-cols-2 gap-5 h-[calc(100vh-160px)]">
        {/* Concept Prompts */}
        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Concept Prompts</span>
              {!loading && (
                <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">{conceptPrompts.length}</Badge>
              )}
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={() => newPrompt('concept')}>
              + New
            </Button>
          </div>
          <CardContent className="p-0 flex-1 overflow-y-auto">
            {renderPromptList(conceptPrompts, 'concept')}
          </CardContent>
        </Card>

        {/* Image Prompts */}
        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Image Prompts</span>
              {!loading && (
                <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">{imagePrompts.length}</Badge>
              )}
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={() => newPrompt('image')}>
              + New
            </Button>
          </div>
          <CardContent className="p-0 flex-1 overflow-y-auto">
            {renderPromptList(imagePrompts, 'image')}
          </CardContent>
        </Card>
      </div>

      {/* Full-screen prompt editor portal */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          {/* Header */}
          <div className="flex items-center gap-4 px-6 py-3 border-b bg-white shrink-0">
            <div className="flex-1 flex items-center gap-3 min-w-0">
              <Input
                value={form.name}
                onChange={(e) => field('name', e.target.value)}
                placeholder="Prompt name"
                className="w-48 h-8 text-sm font-medium"
                required
              />
              <Select value={form.type} onValueChange={(v) => { if (v) field('type', v as 'concept' | 'image'); }}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="concept">Concept</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={form.description}
                onChange={(e) => field('description', e.target.value)}
                placeholder="Description (optional)"
                className="flex-1 h-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Label className="text-xs text-gray-400">
                {isEdit ? 'Saving creates a new version' : 'New prompt'}
              </Label>
              <button
                onClick={closeEditor}
                className="text-gray-400 hover:text-gray-700 transition-colors p-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Editor */}
          <form onSubmit={isEdit ? handleEdit : handleCreate} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 p-6 min-h-0">
              <textarea
                value={form.content}
                onChange={(e) => field('content', e.target.value)}
                className="w-full h-full resize-none font-mono text-sm leading-relaxed border rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-gray-300"
                placeholder="Write your prompt here. Use {{variable}} for dynamic placeholders…"
                autoFocus
              />
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 shrink-0 flex items-center justify-end gap-3">
              <Button type="button" variant="outline" onClick={closeEditor}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !form.name.trim()}>
                {saving ? 'Saving…' : isEdit ? 'Save as new version' : 'Create prompt'}
              </Button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
}
