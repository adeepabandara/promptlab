'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ModelForm } from './ModelForm';
import { Model } from '@/types';
import { toast } from 'sonner';

interface ModelCardProps {
  model: Model;
  onRefresh: () => void;
}

const providerColors: Record<string, string> = {
  anthropic: 'bg-orange-100 text-orange-700',
  openai: 'bg-green-100 text-green-700',
  custom: 'bg-purple-100 text-purple-700',
};

export function ModelCard({ model, onRefresh }: ModelCardProps) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${model.name}"?`)) return;
    setDeleting(true);
    const res = await fetch('/api/models', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: model.id }),
    });
    setDeleting(false);
    if (!res.ok) { toast.error('Delete failed'); return; }
    toast.success('Model deleted');
    onRefresh();
  }

  async function toggleActive() {
    await fetch('/api/models', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: model.id, is_active: !model.is_active }),
    });
    onRefresh();
  }

  return (
    <>
      <Card className={model.is_active ? '' : 'opacity-50'}>
        <CardContent className="pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate">{model.name}</span>
                <Badge className={`text-xs border-0 ${providerColors[model.provider] ?? ''}`}>
                  {model.provider}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {model.type}
                </Badge>
              </div>
              <p className="text-xs text-gray-500 font-mono mt-1 truncate">{model.model_string}</p>
              {model.base_url && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">{model.base_url}</p>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={toggleActive} className="h-7 px-2 text-xs">
                {model.is_active ? 'Disable' : 'Enable'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="h-7 px-2 text-xs">
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
              >
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ModelForm
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={onRefresh}
        editing={model}
      />
    </>
  );
}
