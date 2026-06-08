'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { GenerationTimeChart } from '@/components/dashboard/GenerationTimeChart';
import { CostChart } from '@/components/dashboard/CostChart';
import { QualityRatingChart } from '@/components/dashboard/QualityRatingChart';
import { RunsTable } from '@/components/dashboard/RunsTable';
import { Skeleton } from '@/components/ui/skeleton';
import { ConceptRun, ImageRun } from '@/types';

export default function ResultsPage() {
  const [conceptRuns, setConceptRuns] = useState<ConceptRun[]>([]);
  const [imageRuns, setImageRuns] = useState<ImageRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'concept' | 'image'>('concept');

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [{ data: cr }, { data: ir }] = await Promise.all([
        supabase
          .from('concept_runs')
          .select('*, models(*), prompt_versions(*, prompts(*))')
          .order('created_at', { ascending: false }),
        supabase
          .from('image_runs')
          .select('*, models(*), prompt_versions(*, prompts(*))')
          .order('created_at', { ascending: false }),
      ]);
      setConceptRuns((cr as ConceptRun[]) ?? []);
      setImageRuns((ir as ImageRun[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const completedConcept = conceptRuns.filter((r) => r.status === 'completed');
  const avgTime = completedConcept.length
    ? Math.round(completedConcept.reduce((s, r) => s + (r.generation_time_ms ?? 0), 0) / completedConcept.length)
    : 0;
  const totalCost = [...conceptRuns, ...imageRuns].reduce((s, r) => s + Number(r.estimated_cost_usd ?? 0), 0);
  const rated = [...conceptRuns, ...imageRuns].filter((r) => r.quality_rating);
  const avgRating = rated.length
    ? rated.reduce((s, r) => s + (r.quality_rating ?? 0), 0) / rated.length
    : 0;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Results Dashboard</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open('/api/export/concept', '_blank')}>
            Export Concept CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open('/api/export/image', '_blank')}>
            Export Image CSV
          </Button>
        </div>
      </div>

      {/* KPI metric cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          label="Total Runs"
          value={String(conceptRuns.length + imageRuns.length)}
          sub={`${conceptRuns.length} concept · ${imageRuns.length} image`}
        />
        <MetricCard
          label="Avg Generation Time"
          value={avgTime ? `${(avgTime / 1000).toFixed(1)}s` : '—'}
          sub="Concept runs"
        />
        <MetricCard
          label="Total Estimated Cost"
          value={`$${totalCost.toFixed(4)}`}
          sub="All runs"
        />
        <MetricCard
          label="Avg Quality Rating"
          value={avgRating ? `${avgRating.toFixed(1)} / 5` : '—'}
          sub={`${rated.length} rated`}
        />
      </div>

      {/* Compact chip tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveTab('concept')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeTab === 'concept'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          Concept Runs
          <span className={`ml-2 text-xs ${activeTab === 'concept' ? 'text-gray-300' : 'text-gray-400'}`}>
            {conceptRuns.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('image')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeTab === 'image'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          Image Runs
          <span className={`ml-2 text-xs ${activeTab === 'image' ? 'text-gray-300' : 'text-gray-400'}`}>
            {imageRuns.length}
          </span>
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'concept' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Generation Time by Model</CardTitle>
              </CardHeader>
              <CardContent>
                <GenerationTimeChart runs={conceptRuns} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Cost by Model</CardTitle>
              </CardHeader>
              <CardContent>
                <CostChart runs={conceptRuns} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Quality Rating Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <QualityRatingChart runs={conceptRuns} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">All Concept Runs</CardTitle>
            </CardHeader>
            <CardContent>
              <RunsTable runs={conceptRuns} type="concept" />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'image' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">All Image Runs</CardTitle>
            </CardHeader>
            <CardContent>
              <RunsTable runs={imageRuns as unknown as ConceptRun[]} type="image" />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
