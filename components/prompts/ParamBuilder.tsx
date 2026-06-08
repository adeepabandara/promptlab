'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PromptParameter } from '@/types';

interface ParamBuilderProps {
  detectedVars: string[];
  value: PromptParameter[];
  onChange: (params: PromptParameter[]) => void;
}

export function ParamBuilder({ detectedVars, value, onChange }: ParamBuilderProps) {
  const [params, setParams] = useState<PromptParameter[]>(value);

  useEffect(() => {
    // Merge: add new detected vars, keep existing config
    const merged: PromptParameter[] = detectedVars.map((varName) => {
      const existing = params.find((p) => p.name === varName);
      return existing ?? {
        name: varName,
        type: 'text',
        label: varName,
        default_value: '',
        required: true,
        options: [],
      };
    });
    setParams(merged);
    onChange(merged);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedVars.join(',')]);

  function update(index: number, field: keyof PromptParameter, val: unknown) {
    const next = [...params];
    next[index] = { ...next[index], [field]: val };
    setParams(next);
    onChange(next);
  }

  if (params.length === 0) {
    return <p className="text-sm text-gray-500 italic">No variables detected in prompt.</p>;
  }

  return (
    <div className="space-y-4">
      {params.map((param, i) => (
        <div key={param.name} className="rounded-md border p-3 space-y-3 bg-gray-50">
          <div className="flex items-center gap-2">
            <code className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono">
              {`{{${param.name}}}`}
            </code>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={param.label}
                onChange={(e) => update(i, 'label', e.target.value)}
                placeholder={param.name}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={param.type}
                onValueChange={(v) => { if (v) update(i, 'type', v); }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="textarea">Textarea</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="select">Select</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Default Value</Label>
            <Input
              value={param.default_value ?? ''}
              onChange={(e) => update(i, 'default_value', e.target.value)}
              placeholder="Optional default"
            />
          </div>
          {param.type === 'select' && (
            <div className="space-y-1">
              <Label className="text-xs">Options (comma-separated)</Label>
              <Input
                value={(param.options ?? []).join(',')}
                onChange={(e) => update(i, 'options', e.target.value.split(',').map(s => s.trim()))}
                placeholder="option1, option2, option3"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id={`req-${i}`}
              checked={param.required}
              onCheckedChange={(c) => update(i, 'required', !!c)}
            />
            <Label htmlFor={`req-${i}`} className="text-xs cursor-pointer">Required</Label>
          </div>
        </div>
      ))}
    </div>
  );
}
