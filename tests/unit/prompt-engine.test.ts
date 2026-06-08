import { describe, it, expect } from 'vitest';
import { replaceVariables, detectVariables, validateParams } from '@/lib/prompt-engine';
import { PromptParameter } from '@/types';

describe('replaceVariables', () => {
  it('replaces a single variable', () => {
    expect(replaceVariables('Hello {{name}}!', { name: 'World' })).toBe('Hello World!');
  });

  it('replaces multiple variables', () => {
    expect(replaceVariables('{{a}} and {{b}}', { a: 'foo', b: 'bar' })).toBe('foo and bar');
  });

  it('leaves unresolved variables unchanged', () => {
    expect(replaceVariables('Hello {{name}}!', {})).toBe('Hello {{name}}!');
  });

  it('returns template unchanged when no variables present', () => {
    expect(replaceVariables('No variables here', { x: '1' })).toBe('No variables here');
  });

  it('handles duplicate variables', () => {
    expect(replaceVariables('{{x}} and {{x}}', { x: 'hello' })).toBe('hello and hello');
  });
});

describe('detectVariables', () => {
  it('returns unique variable names', () => {
    const vars = detectVariables('{{a}} {{b}} {{a}}');
    expect(vars).toHaveLength(2);
    expect(vars).toContain('a');
    expect(vars).toContain('b');
  });

  it('returns empty array when no variables', () => {
    expect(detectVariables('no vars')).toEqual([]);
  });

  it('handles multiple different variables', () => {
    const vars = detectVariables('{{product}} for {{audience}} in {{region}}');
    expect(vars).toEqual(['product', 'audience', 'region']);
  });
});

describe('validateParams', () => {
  const params: PromptParameter[] = [
    { name: 'product', type: 'text', label: 'Product', required: true },
    { name: 'style', type: 'text', label: 'Style', required: false },
    { name: 'count', type: 'number', label: 'Count', required: true },
  ];

  it('returns valid when all required params provided', () => {
    const result = validateParams(params, { product: 'shoes', count: '5' });
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('returns missing fields when required params absent', () => {
    const result = validateParams(params, { style: 'minimal' });
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('product');
    expect(result.missing).toContain('count');
  });

  it('optional param not flagged as missing', () => {
    const result = validateParams(params, { product: 'bag', count: '2' });
    expect(result.missing).not.toContain('style');
  });
});
