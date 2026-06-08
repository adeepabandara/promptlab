'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Model } from '@/types';

interface ModelFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: Model;
}

export function ModelForm({ open, onClose, onSaved, editing }: ModelFormProps) {
  const [name, setName] = useState(editing?.name ?? '');
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'custom'>(editing?.provider ?? 'anthropic');
  const [modelString, setModelString] = useState(editing?.model_string ?? '');
  const [type, setType] = useState<'text' | 'image'>(editing?.type ?? 'text');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(editing?.base_url ?? '');
  const [extraConfig, setExtraConfig] = useState(
    editing?.extra_config ? JSON.stringify(editing.extra_config, null, 2) : '{}'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = JSON.parse(extraConfig);
    } catch {
      setError('Extra config must be valid JSON');
      return;
    }

    setLoading(true);

    const payload: Record<string, unknown> = {
      name,
      provider,
      model_string: modelString,
      type,
      base_url: baseUrl || null,
      extra_config: parsedConfig,
    };

    if (apiKey) payload.api_key_secret = apiKey.trim();
    if (editing) payload.id = editing.id;

    const res = await fetch('/api/models', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? 'Save failed');
      return;
    }

    toast.success(editing ? 'Model updated' : 'Model added');
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Model' : 'Add Model'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input placeholder="Claude Sonnet 4.6" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => { if (v) setProvider(v as typeof provider); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => { if (v) setType(v as typeof type); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Model String</Label>
            <Input
              placeholder="e.g. claude-sonnet-4-6"
              value={modelString}
              onChange={(e) => setModelString(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              placeholder={editing ? 'Enter new key to update, or leave blank to keep existing' : 'sk-...'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          {provider === 'custom' && (
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                placeholder="https://your-api.com"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Extra Config (JSON)</Label>
            <Textarea
              value={extraConfig}
              onChange={(e) => setExtraConfig(e.target.value)}
              rows={3}
              className="font-mono text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
