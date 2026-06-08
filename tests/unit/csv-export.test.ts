import { describe, it, expect } from 'vitest';
import { exportConceptRunsCsv, exportImageRunsCsv } from '@/lib/csv-export';
import { ConceptRun, ImageRun } from '@/types';

const mockConceptRun: ConceptRun = {
  id: 'run-123',
  user_id: 'user-1',
  prompt_version_id: 'pv-1',
  model_id: 'model-1',
  input_params: {},
  status: 'completed',
  created_at: '2026-05-12T10:00:00Z',
  generation_time_ms: 3200,
  prompt_tokens: 100,
  completion_tokens: 200,
  estimated_cost_usd: 0.0042,
  quality_rating: 4,
  output_json: { result: 'test' },
  prompt_versions: {
    id: 'pv-1',
    prompt_id: 'p-1',
    version_number: 2,
    content: 'test',
    parameters: [],
    created_at: '2026-05-12T00:00:00Z',
    prompts: {
      id: 'p-1',
      user_id: 'user-1',
      name: 'My Prompt',
      type: 'concept',
      created_at: '2026-05-12T00:00:00Z',
    },
  },
  models: {
    id: 'model-1',
    user_id: 'user-1',
    name: 'Claude Sonnet',
    provider: 'anthropic',
    model_string: 'claude-sonnet-4-6',
    type: 'text',
    extra_config: {},
    is_active: true,
    created_at: '2026-05-12T00:00:00Z',
  },
};

describe('exportConceptRunsCsv', () => {
  it('returns CSV with correct headers', () => {
    const csv = exportConceptRunsCsv([]);
    expect(csv).toContain('run_id');
    expect(csv).toContain('prompt_name');
    expect(csv).toContain('model_name');
    expect(csv).toContain('status');
    expect(csv).toContain('estimated_cost_usd');
  });

  it('returns headers only for empty dataset', () => {
    const csv = exportConceptRunsCsv([]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
  });

  it('includes run data in output', () => {
    const csv = exportConceptRunsCsv([mockConceptRun]);
    expect(csv).toContain('run-123');
    expect(csv).toContain('My Prompt');
    expect(csv).toContain('Claude Sonnet');
    expect(csv).toContain('completed');
  });

  it('escapes special characters', () => {
    const runWithComma: ConceptRun = {
      ...mockConceptRun,
      models: {
        ...mockConceptRun.models!,
        name: 'Model, with comma',
      },
    };
    const csv = exportConceptRunsCsv([runWithComma]);
    expect(csv).toContain('"Model, with comma"');
  });
});

describe('exportImageRunsCsv', () => {
  const mockImageRun: ImageRun = {
    id: 'img-run-1',
    user_id: 'user-1',
    prompt_version_id: 'pv-1',
    model_id: 'model-2',
    output_image_urls: ['https://example.com/1.png', 'https://example.com/2.png'],
    status: 'completed',
    created_at: '2026-05-12T10:00:00Z',
    estimated_cost_usd: 0.08,
    quality_rating: 5,
  };

  it('has correct headers', () => {
    const csv = exportImageRunsCsv([]);
    expect(csv).toContain('image_count');
    expect(csv).toContain('image_urls');
  });

  it('includes image count', () => {
    const csv = exportImageRunsCsv([mockImageRun]);
    expect(csv).toContain('2');
  });
});
