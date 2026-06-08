'use client';

import { useState } from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { PromptVersion } from '@/types';

interface PromptDiffViewerProps {
  open: boolean;
  onClose: () => void;
  versions: PromptVersion[];
  initialA?: string;
  initialB?: string;
}

export function PromptDiffViewer({ open, onClose, versions, initialA, initialB }: PromptDiffViewerProps) {
  const [versionA, setVersionA] = useState(initialA ?? versions[versions.length - 1]?.id ?? '');
  const [versionB, setVersionB] = useState(initialB ?? versions[0]?.id ?? '');

  const vA = versions.find((v) => v.id === versionA);
  const vB = versions.find((v) => v.id === versionB);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Compare Versions</DialogTitle>
        </DialogHeader>
        <div className="flex gap-4 mb-4">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Version A (old)</Label>
            <Select value={versionA} onValueChange={(v) => { if (v) setVersionA(v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>v{v.version_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Version B (new)</Label>
            <Select value={versionB} onValueChange={(v) => { if (v) setVersionB(v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>v{v.version_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {vA && vB && (
          <div className="text-sm">
            <ReactDiffViewer
              oldValue={vA.content}
              newValue={vB.content}
              splitView
              useDarkTheme={false}
              leftTitle={`v${vA.version_number}`}
              rightTitle={`v${vB.version_number}`}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
