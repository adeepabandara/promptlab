'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { ModelCard } from '@/components/models/ModelCard';
import { ModelForm } from '@/components/models/ModelForm';
import { Skeleton } from '@/components/ui/skeleton';
import { Model } from '@/types';

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  async function loadModels() {
    const supabase = createClient();
    const { data } = await supabase.from('models').select('*').order('created_at', { ascending: false });
    setModels((data as Model[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { loadModels(); }, []);

  const textModels = models.filter((m) => m.type === 'text');
  const imageModels = models.filter((m) => m.type === 'image');

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Models</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your AI model configurations</p>
        </div>
        <Button onClick={() => setAdding(true)}>Add Model</Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Text Models</h2>
            {textModels.length === 0 ? (
              <p className="text-sm text-gray-500">No text models yet.</p>
            ) : (
              <div className="space-y-2">
                {textModels.map((m) => (
                  <ModelCard key={m.id} model={m} onRefresh={loadModels} />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Image Models</h2>
            {imageModels.length === 0 ? (
              <p className="text-sm text-gray-500">No image models yet.</p>
            ) : (
              <div className="space-y-2">
                {imageModels.map((m) => (
                  <ModelCard key={m.id} model={m} onRefresh={loadModels} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <ModelForm
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={loadModels}
      />
    </div>
  );
}
