'use client';

import Link from 'next/link';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { StarRating } from '@/components/shared/StarRating';
import { ConceptRun } from '@/types';

interface RunsTableProps {
  runs: ConceptRun[];
  type: 'concept' | 'image';
}

export function RunsTable({ runs, type }: RunsTableProps) {
  if (runs.length === 0) {
    return <p className="text-sm text-gray-500 py-6 text-center">No runs found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wide">
            <th className="pb-2 pr-4">Date</th>
            <th className="pb-2 pr-4">Prompt</th>
            <th className="pb-2 pr-4">Model</th>
            <th className="pb-2 pr-4">Status</th>
            <th className="pb-2 pr-4">Time</th>
            {type === 'concept' && <th className="pb-2 pr-4">Tokens</th>}
            <th className="pb-2 pr-4">Cost</th>
            <th className="pb-2 pr-4">Rating</th>
            <th className="pb-2">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {runs.map((run) => (
            <tr key={run.id} className="hover:bg-gray-50">
              <td className="py-2 pr-4 text-xs text-gray-500 whitespace-nowrap">
                {new Date(run.created_at).toLocaleString()}
              </td>
              <td className="py-2 pr-4 text-xs">
                <span className="font-medium">{run.prompt_versions?.prompts?.name ?? '—'}</span>
                {run.prompt_versions && (
                  <span className="text-gray-400 ml-1">v{run.prompt_versions.version_number}</span>
                )}
              </td>
              <td className="py-2 pr-4 text-xs">{run.models?.name ?? '—'}</td>
              <td className="py-2 pr-4"><StatusBadge status={run.status} /></td>
              <td className="py-2 pr-4 text-xs text-gray-500">
                {run.generation_time_ms ? `${(run.generation_time_ms / 1000).toFixed(1)}s` : '—'}
              </td>
              {type === 'concept' && (
                <td className="py-2 pr-4 text-xs text-gray-500">
                  {run.prompt_tokens
                    ? `${run.prompt_tokens + (run.completion_tokens ?? 0)}`
                    : '—'}
                </td>
              )}
              <td className="py-2 pr-4 text-xs text-gray-500">
                {run.estimated_cost_usd ? `$${Number(run.estimated_cost_usd).toFixed(4)}` : '—'}
              </td>
              <td className="py-2 pr-4">
                {run.quality_rating ? (
                  <StarRating value={run.quality_rating} readOnly />
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
              </td>
              <td className="py-2">
                <Link
                  href={`/${type === 'concept' ? 'concept' : 'image-gen'}/${run.id}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
