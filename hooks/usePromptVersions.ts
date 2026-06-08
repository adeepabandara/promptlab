'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PromptVersion } from '@/types';

export function usePromptVersions(promptId: string) {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!promptId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('prompt_versions')
      .select('*')
      .eq('prompt_id', promptId)
      .order('version_number', { ascending: false });

    setVersions((data as PromptVersion[]) ?? []);
    setLoading(false);
  }, [promptId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { versions, loading, refetch: fetch };
}
