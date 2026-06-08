'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { StarRating } from '@/components/shared/StarRating';
import { ImagePreview } from '@/components/shared/ImagePreview';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageRun } from '@/types';
import { toast } from 'sonner';

const providerColors: Record<string, string> = {
  openai: 'bg-green-100 text-green-700',
  anthropic: 'bg-orange-100 text-orange-700',
  custom: 'bg-violet-100 text-violet-700',
};

export function ImageResultCard({ run }: { run: ImageRun }) {
  const [rating, setRating] = useState(run.quality_rating ?? 0);
  const [showInputs, setShowInputs] = useState(false);
  const [stopping, setStopping] = useState(false);

  async function handleStop() {
    setStopping(true);
    const supabase = (await import('@/lib/supabase/client')).createClient();
    await supabase
      .from('image_runs')
      .update({ status: 'failed', error_message: 'Cancelled by user' })
      .eq('id', run.id);
    setStopping(false);
  }

  async function handleRate(value: number) {
    setRating(value);
    const res = await fetch(`/api/runs/${run.id}/rating`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: value, type: 'image' }),
    });
    if (!res.ok) toast.error('Failed to save rating');
  }

  async function downloadAll() {
    const urls = run.output_image_urls ?? [];
    if (!urls.length) return;
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    await Promise.all(
      urls.map(async (url, i) => {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        zip.file(`image-${i + 1}.png`, buf);
      })
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `images-${run.id.slice(0, 8)}.zip`;
    a.click();
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
            {run.generation_time_ms && <span>{(run.generation_time_ms / 1000).toFixed(1)}s</span>}
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
              Generating image…
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="aspect-square rounded-lg" />
              <Skeleton className="aspect-square rounded-lg" />
            </div>
          </div>
        )}

        {run.status === 'failed' && (
          <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
            <p className="font-medium mb-0.5">Generation failed</p>
            <p className="text-red-500 text-xs">{run.error_message ?? 'Unknown error'}</p>
          </div>
        )}

        {(run.output_image_urls ?? []).length > 0 && (
          <ImagePreview urls={run.output_image_urls ?? []} onDownloadAll={downloadAll} />
        )}

        {/* Input details toggle */}
        <div className="mt-3 border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-gray-400 hover:text-gray-600"
            onClick={() => setShowInputs((v) => !v)}
          >
            {showInputs ? '▲ Hide inputs' : '▼ Show inputs sent to model'}
          </Button>
          {showInputs && (
            <div className="mt-2 space-y-2">
              {run.input_image_url && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Reference image</p>
                  <a href={run.input_image_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-500 underline break-all">
                    {run.input_image_url}
                  </a>
                </div>
              )}
              {run.input_concept_json && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Concept JSON sent</p>
                  <pre className="text-xs bg-gray-50 border rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-gray-600">
                    {JSON.stringify(run.input_concept_json, null, 2)}
                  </pre>
                </div>
              )}
              {!run.input_image_url && !run.input_concept_json && (
                <p className="text-xs text-gray-400">No concept JSON or reference image was stored for this run.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
