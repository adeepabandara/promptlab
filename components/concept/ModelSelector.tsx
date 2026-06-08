'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Model } from '@/types';

const providerColors: Record<string, string> = {
  anthropic: 'bg-orange-100 text-orange-700',
  openai: 'bg-green-100 text-green-700',
  custom: 'bg-purple-100 text-purple-700',
};

interface ModelSelectorProps {
  models: Model[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function ModelSelector({ models, selected, onChange }: ModelSelectorProps) {
  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  if (models.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        No active models. <a href="/models" className="text-blue-600 hover:underline">Add one.</a>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {models.map((m) => (
        <div key={m.id} className="flex items-center gap-2">
          <Checkbox
            id={`model-${m.id}`}
            checked={selected.includes(m.id)}
            onCheckedChange={() => toggle(m.id)}
          />
          <Label htmlFor={`model-${m.id}`} className="flex items-center gap-2 cursor-pointer text-sm">
            <span>{m.name}</span>
            <Badge className={`text-xs border-0 ${providerColors[m.provider] ?? ''}`}>
              {m.provider}
            </Badge>
          </Label>
        </div>
      ))}
    </div>
  );
}
