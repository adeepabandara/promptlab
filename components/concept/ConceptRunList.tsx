'use client';

import { ConceptRun } from '@/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { StarRating } from '@/components/shared/StarRating';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

interface ConceptRunListProps {
  runs: ConceptRun[];
  loading: boolean;
  selectedId?: string;
  onSelect: (run: ConceptRun) => void;
}

export function ConceptRunList({ runs, loading, selectedId, onSelect }: ConceptRunListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Run History</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => window.open('/api/export/concept', '_blank')}
        >
          Export CSV
        </Button>
      </div>
      <ScrollArea className="h-[600px]">
        <div className="space-y-2 pr-2">
          {runs.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No runs yet.</p>
          ) : (
            runs.map((run) => (
              <button
                key={run.id}
                onClick={() => onSelect(run)}
                className={`w-full text-left rounded-md border p-2.5 transition-colors ${
                  selectedId === run.id ? 'border-blue-300 bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium truncate">{run.models?.name ?? 'Unknown'}</span>
                  <StatusBadge status={run.status} />
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-400">
                    {new Date(run.created_at).toLocaleDateString()}
                  </span>
                  {run.quality_rating && (
                    <StarRating value={run.quality_rating} readOnly />
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </>
  );
}
