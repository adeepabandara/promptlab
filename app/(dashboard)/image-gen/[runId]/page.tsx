'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ImageResultCard } from '@/components/image-gen/ImageResultCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ImageRun } from '@/types';

export default function ImageRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const router = useRouter();
  const [run, setRun] = useState<ImageRun | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from('image_runs')
        .select('*, models(*), prompt_versions(*, prompts(*))')
        .eq('id', runId)
        .single();
      setRun(data as ImageRun);
    }
    load();
  }, [runId]);

  return (
    <div className="max-w-2xl space-y-4">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>← Back</Button>
      {run ? <ImageResultCard run={run} /> : <Skeleton className="h-64" />}
    </div>
  );
}
