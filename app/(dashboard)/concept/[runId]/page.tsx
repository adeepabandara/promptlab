'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ConceptRunCard } from '@/components/concept/ConceptRunCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ConceptRun } from '@/types';

export default function ConceptRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const router = useRouter();
  const [run, setRun] = useState<ConceptRun | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from('concept_runs')
        .select('*, models(*), prompt_versions(*, prompts(*))')
        .eq('id', runId)
        .single();
      setRun(data as ConceptRun);
    }
    load();
  }, [runId]);

  return (
    <div className="max-w-2xl space-y-4">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>← Back</Button>
      {run ? <ConceptRunCard run={run} /> : <Skeleton className="h-64" />}
    </div>
  );
}
