'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ConceptRun } from '@/types';

interface GenerationTimeChartProps {
  runs: ConceptRun[];
}

export function GenerationTimeChart({ runs }: GenerationTimeChartProps) {
  const byModel: Record<string, { total: number; count: number; name: string }> = {};

  for (const run of runs) {
    if (run.generation_time_ms && run.models) {
      const key = run.model_id;
      if (!byModel[key]) byModel[key] = { total: 0, count: 0, name: run.models.name };
      byModel[key].total += run.generation_time_ms;
      byModel[key].count++;
    }
  }

  const data = Object.values(byModel).map((m) => ({
    name: m.name,
    avg_ms: Math.round(m.total / m.count),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" unit="ms" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => [`${v}ms`, 'Avg time']} />
        <Bar dataKey="avg_ms" fill="#3b82f6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
