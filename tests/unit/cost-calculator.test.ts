import { describe, it, expect } from 'vitest';
import { estimateTextCost, estimateImageCost } from '@/lib/cost-calculator';

describe('estimateTextCost', () => {
  it('calculates cost for claude-sonnet-4-6', () => {
    const cost = estimateTextCost('claude-sonnet-4-6', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(3 + 15, 1); // $3 input + $15 output per 1M tokens
  });

  it('calculates cost for gpt-4o', () => {
    const cost = estimateTextCost('gpt-4o', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(2.5 + 10, 1);
  });

  it('returns 0 for zero tokens', () => {
    expect(estimateTextCost('claude-sonnet-4-6', 0, 0)).toBe(0);
  });

  it('returns 0 for unknown model', () => {
    expect(estimateTextCost('unknown-model-xyz', 1000, 1000)).toBe(0);
  });

  it('calculates partial token cost correctly', () => {
    const cost = estimateTextCost('claude-sonnet-4-6', 500_000, 0);
    expect(cost).toBeCloseTo(1.5, 2);
  });
});

describe('estimateImageCost', () => {
  it('returns cost per image for dall-e-3', () => {
    expect(estimateImageCost('dall-e-3', 1)).toBeCloseTo(0.04);
    expect(estimateImageCost('dall-e-3', 4)).toBeCloseTo(0.16);
  });

  it('returns 0 for unknown model', () => {
    expect(estimateImageCost('unknown-image-model', 1)).toBe(0);
  });

  it('defaults to 1 image when count not specified', () => {
    expect(estimateImageCost('gpt-image-1')).toBeCloseTo(0.04);
  });
});
