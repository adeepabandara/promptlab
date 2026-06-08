'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ImageRun } from '@/types';
import { playCompletionSound } from '@/lib/notify-sound';

export function useImageRuns() {
  const [runs, setRuns] = useState<ImageRun[]>([]);
  const [loading, setLoading] = useState(true);
  const prevStatusMap = useRef<Record<string, string>>({});

  const fetch = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('image_runs')
      .select(`
        *,
        models(*),
        prompt_versions(*, prompts(*))
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    const newRuns = (data as ImageRun[]) ?? [];

    // Play sound when a run transitions to completed or failed
    newRuns.forEach((r) => {
      const prev = prevStatusMap.current[r.id];
      if (prev && prev !== r.status && (r.status === 'completed' || r.status === 'failed')) {
        playCompletionSound(r.status === 'completed' ? 'success' : 'error');
      }
    });
    prevStatusMap.current = Object.fromEntries(newRuns.map((r) => [r.id, r.status]));

    setRuns(newRuns);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();

    const supabase = createClient();
    const channel = supabase
      .channel('image_runs_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'image_runs' },
        () => fetch()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetch]);

  // Polling fallback while any run is in-progress
  useEffect(() => {
    const hasInProgress = runs.some((r) => r.status === 'running' || r.status === 'pending');
    if (!hasInProgress) return;
    const id = setInterval(fetch, 3000);
    return () => clearInterval(id);
  }, [runs, fetch]);

  return { runs, loading, refetch: fetch };
}
