'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { ConceptRun } from '@/types';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];

interface QualityRatingChartProps {
  runs: ConceptRun[];
}

export function QualityRatingChart({ runs }: QualityRatingChartProps) {
  const byModel: Record<string, { name: string; [key: string]: number | string }> = {};

  for (const run of runs) {
    if (run.quality_rating && run.models) {
      const key = run.model_id;
      if (!byModel[key]) {
        byModel[key] = { name: run.models.name, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };
      }
      const rKey = `r${run.quality_rating}`;
      byModel[key][rKey] = (byModel[key][rKey] as number) + 1;
    }
  }

  const data = Object.values(byModel);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {[1, 2, 3, 4, 5].map((r, i) => (
          <Bar key={r} dataKey={`r${r}`} name={`${r}★`} stackId="a" fill={COLORS[i]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
