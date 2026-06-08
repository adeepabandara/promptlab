'use client';

import { useState } from 'react';
import { ConceptRunForm } from '@/components/concept/ConceptRunForm';
import { ConceptRunCard } from '@/components/concept/ConceptRunCard';
import { RunHistoryPanel } from '@/components/shared/RunHistoryPanel';
import { useConceptRuns } from '@/hooks/useConceptRuns';
import { useImageRuns } from '@/hooks/useImageRuns';
import { ConceptRun, ImageRun } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ElapsedTimer } from '@/components/shared/ElapsedTimer';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function ConceptPage() {
  const { runs: conceptRuns, loading: conceptLoading, refetch } = useConceptRuns();
  const { runs: imageRuns, loading: imageLoading } = useImageRuns();
  const [selectedRun, setSelectedRun] = useState<ConceptRun | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<'concept' | 'image'>('concept');
  const router = useRouter();

  async function handleRunStarted(runIds: string[]) {
    setPendingCount(runIds.length);
    await refetch();
    setPendingCount(0);
  }

  function handleRunningChange(running: boolean) {
    setGenerating(running);
    if (running) setGenerationStartedAt(Date.now());
  }

  const runningRuns = conceptRuns.filter((r) => r.status === 'running' || r.status === 'pending');

  async function stopAll() {
    if (!runningRuns.length) return;
    const supabase = createClient();
    await supabase
      .from('concept_runs')
      .update({ status: 'failed', error_message: 'Cancelled by user' })
      .in('id', runningRuns.map((r) => r.id));
    setGenerating(false);
    setPendingCount(0);
    await refetch();
    toast.success(`Cancelled ${runningRuns.length} run(s)`);
  }

  const displayRun = selectedRun ?? (conceptRuns.find((r) => r.status === 'running') ?? conceptRuns[0]);
  const extraRunning = conceptRuns.filter(
    (r) => r.id !== displayRun?.id && (r.status === 'running' || r.status === 'pending')
  );

  function handleSelectImage(run: ImageRun) {
    router.push(`/image-gen/${run.id}`);
  }

  return (
    <div className="flex h-full">
      {/* Left config panel */}
      <div className="w-80 shrink-0 border-r bg-white flex flex-col h-full overflow-y-auto">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Concept Generation</h1>
            <p className="text-xs text-gray-400 mt-0.5">Run prompts against models and compare outputs</p>
          </div>
          {runningRuns.length > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 shrink-0" onClick={stopAll}>
              Stop all ({runningRuns.length})
            </Button>
          )}
        </div>
        <div className="flex-1 px-5 py-4">
          <ConceptRunForm onRunStarted={handleRunStarted} onRunningChange={handleRunningChange} />
        </div>
      </div>

      {/* Center results */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="flex-1 p-6 space-y-4">
          {(generating || pendingCount > 0) && (
            <div className="rounded-xl border bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700">Generating concept…</span>
                </div>
                {generationStartedAt && (
                  <ElapsedTimer startedAt={generationStartedAt} className="text-sm font-mono text-blue-500 tabular-nums" />
                )}
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          )}

          {displayRun ? (
            <ConceptRunCard run={displayRun} />
          ) : pendingCount === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <span className="text-2xl">🧠</span>
              </div>
              <p className="text-sm font-medium text-gray-700">No runs yet</p>
              <p className="text-xs text-gray-400 mt-1">Select a prompt and model, then click Run</p>
            </div>
          )}

          {extraRunning.map((r) => (
            <ConceptRunCard key={r.id} run={r} />
          ))}
        </div>
      </div>

      {/* Right history panel */}
      <RunHistoryPanel
        open={historyOpen}
        onToggle={() => setHistoryOpen((o) => !o)}
        activeTab={historyTab}
        onTabChange={setHistoryTab}
        conceptRuns={conceptRuns}
        imageRuns={imageRuns}
        conceptLoading={conceptLoading}
        imageLoading={imageLoading}
        selectedConceptId={selectedRun?.id}
        onSelectConcept={setSelectedRun}
        onSelectImage={handleSelectImage}
      />
    </div>
  );
}
