import Papa from 'papaparse';
import { ConceptRun, ImageRun } from '@/types';

const CONCEPT_FIELDS = [
  'run_id', 'date', 'prompt_name', 'prompt_version', 'model_name',
  'status', 'generation_time_ms', 'prompt_tokens', 'completion_tokens',
  'estimated_cost_usd', 'quality_rating', 'output_json_preview',
];

const IMAGE_FIELDS = [
  'run_id', 'date', 'prompt_name', 'prompt_version', 'model_name',
  'status', 'generation_time_ms', 'estimated_cost_usd', 'quality_rating',
  'image_count', 'image_urls',
];

export function exportConceptRunsCsv(runs: ConceptRun[]): string {
  const rows = runs.map((r) => ({
    run_id: r.id,
    date: r.created_at,
    prompt_name: r.prompt_versions?.prompts?.name ?? '',
    prompt_version: r.prompt_versions?.version_number ?? '',
    model_name: r.models?.name ?? '',
    status: r.status,
    generation_time_ms: r.generation_time_ms ?? '',
    prompt_tokens: r.prompt_tokens ?? '',
    completion_tokens: r.completion_tokens ?? '',
    estimated_cost_usd: r.estimated_cost_usd ?? '',
    quality_rating: r.quality_rating ?? '',
    output_json_preview: r.output_json
      ? JSON.stringify(r.output_json).slice(0, 200)
      : '',
  }));
  return Papa.unparse({ fields: CONCEPT_FIELDS, data: rows });
}

export function exportImageRunsCsv(runs: ImageRun[]): string {
  const rows = runs.map((r) => ({
    run_id: r.id,
    date: r.created_at,
    prompt_name: r.prompt_versions?.prompts?.name ?? '',
    prompt_version: r.prompt_versions?.version_number ?? '',
    model_name: r.models?.name ?? '',
    status: r.status,
    generation_time_ms: r.generation_time_ms ?? '',
    estimated_cost_usd: r.estimated_cost_usd ?? '',
    quality_rating: r.quality_rating ?? '',
    image_count: r.output_image_urls.length,
    image_urls: r.output_image_urls.join(', '),
  }));
  return Papa.unparse({ fields: IMAGE_FIELDS, data: rows });
}
