'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ConceptRun } from '@/types';

interface CostChartProps {
  runs: ConceptRun[];
}

export function CostChart({ runs }: CostChartProps) {
  const byModel: Record<string, { total: number; name: string }> = {};

  for (const run of runs) {
    if (run.estimated_cost_usd && run.models) {
      const key = run.model_id;
      if (!byModel[key]) byModel[key] = { total: 0, name: run.models.name };
      byModel[key].total += Number(run.estimated_cost_usd);
    }
  }

  const data = Object.values(byModel).map((m) => ({
    name: m.name,
    cost: Number(m.total.toFixed(4)),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" unit="$" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => [`$${v}`, 'Total cost']} />
        <Bar dataKey="cost" fill="#10b981" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
