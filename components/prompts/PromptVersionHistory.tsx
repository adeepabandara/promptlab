'use client';

import { PromptVersion } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

interface PromptVersionHistoryProps {
  versions: PromptVersion[];
  loading: boolean;
  selectedId?: string;
  onSelect: (v: PromptVersion) => void;
  onCompare: (v: PromptVersion) => void;
  onUse: (v: PromptVersion) => void;
}

export function PromptVersionHistory({
  versions,
  loading,
  selectedId,
  onSelect,
  onCompare,
  onUse,
}: PromptVersionHistoryProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  return (
    <ScrollArea className="h-[600px]">
      <div className="space-y-2 pr-2">
        {versions.map((v) => (
          <div
            key={v.id}
            className={`rounded-md border p-3 cursor-pointer transition-colors ${
              selectedId === v.id ? 'border-blue-300 bg-blue-50' : 'hover:bg-gray-50'
            }`}
            onClick={() => onSelect(v)}
          >
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs font-mono">v{v.version_number}</Badge>
              <span className="text-xs text-gray-500">
                {new Date(v.created_at).toLocaleDateString()}
              </span>
            </div>
            {v.changelog && (
              <p className="text-xs text-gray-600 line-clamp-2">{v.changelog}</p>
            )}
            <div className="flex gap-1 mt-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={(e) => { e.stopPropagation(); onCompare(v); }}
              >
                Compare
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-blue-600"
                onClick={(e) => { e.stopPropagation(); onUse(v); }}
              >
                Use this
              </Button>
            </div>
          </div>
        ))}
        {versions.length === 0 && (
          <p className="text-sm text-gray-500 italic">No versions yet.</p>
        )}
      </div>
    </ScrollArea>
  );
}
