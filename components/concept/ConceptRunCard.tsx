'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { StarRating } from '@/components/shared/StarRating';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { Skeleton } from '@/components/ui/skeleton';
import { ConceptRun } from '@/types';
import { toast } from 'sonner';
import { FoamVisualizer } from './FoamVisualizer';

const providerColors: Record<string, string> = {
  anthropic: 'bg-orange-100 text-orange-700',
  openai: 'bg-green-100 text-green-700',
  custom: 'bg-violet-100 text-violet-700',
};

export function ConceptRunCard({ run }: { run: ConceptRun }) {
  const [rating, setRating] = useState(run.quality_rating ?? 0);
  const [stopping, setStopping] = useState(false);

  async function handleStop() {
    setStopping(true);
    const supabase = (await import('@/lib/supabase/client')).createClient();
    await supabase
      .from('concept_runs')
      .update({ status: 'failed', error_message: 'Cancelled by user' })
      .eq('id', run.id);
    setStopping(false);
  }

  async function handleRate(value: number) {
    setRating(value);
    const res = await fetch(`/api/runs/${run.id}/rating`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: value, type: 'concept' }),
    });
    if (!res.ok) toast.error('Failed to save rating');
  }

  function downloadJson() {
    if (!run.output_json) return;
    const blob = new Blob([JSON.stringify(run.output_json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `run-${run.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isLoading = run.status === 'running' || run.status === 'pending';

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-gray-900">{run.models?.name ?? 'Unknown Model'}</span>
          <Badge className={`text-xs border-0 ${providerColors[run.models?.provider ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
            {run.models?.provider}
          </Badge>
          <StatusBadge status={run.status} />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-3 text-xs text-gray-400">
            <span>{new Date(run.created_at).toLocaleString()}</span>
            {run.generation_time_ms && <span>{(run.generation_time_ms / 1000).toFixed(1)}s</span>}
            {run.prompt_tokens && <span>{run.prompt_tokens + (run.completion_tokens ?? 0)} tokens</span>}
            {run.estimated_cost_usd && <span>${run.estimated_cost_usd.toFixed(4)}</span>}
            {run.prompt_versions && <span>v{run.prompt_versions.version_number}</span>}
          </div>
          {isLoading && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={handleStop} disabled={stopping}>
              {stopping ? 'Stopping…' : 'Stop'}
            </Button>
          )}
          <StarRating value={rating} onChange={handleRate} />
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        {isLoading && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Generating…
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-4/6" />
            <Skeleton className="h-3 w-3/6" />
          </div>
        )}

        {run.status === 'failed' && (
          <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
            <p className="font-medium mb-0.5">Run failed</p>
            <p className="text-red-500 text-xs">{run.error_message ?? 'Unknown error'}</p>
          </div>
        )}

        {run.output_json && (
          <div className="space-y-3">
            <JsonViewer data={run.output_json} />
            <Button variant="outline" size="sm" onClick={downloadJson} className="text-xs">
              Download JSON
            </Button>
            <FoamVisualizer conceptJson={run.output_json} />
          </div>
        )}

        {!run.output_json && run.raw_output && (
          <pre className="text-sm bg-gray-50 border rounded-lg p-4 whitespace-pre-wrap overflow-auto text-gray-700 leading-relaxed" style={{ maxHeight: 'calc(100vh - 220px)', minHeight: '200px' }}>
            {run.raw_output}
          </pre>
        )}
      </div>
    </div>
  );
}
