// Cost per 1M tokens in USD
const TEXT_COSTS: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-opus-4-5': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 0.8, output: 4 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-3-opus-20240229': { input: 15, output: 75 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4.5': { input: 75, output: 150 },
};

// Image costs per image in USD
const IMAGE_COSTS: Record<string, number> = {
  'dall-e-3': 0.04,
  'dall-e-2': 0.02,
  'gpt-image-1': 0.04,
};

export function estimateTextCost(
  modelString: string,
  promptTokens: number,
  completionTokens: number
): number {
  const rates = TEXT_COSTS[modelString];
  if (!rates) return 0;
  return (
    (promptTokens / 1_000_000) * rates.input +
    (completionTokens / 1_000_000) * rates.output
  );
}

export function estimateImageCost(modelString: string, imageCount = 1): number {
  const rate = IMAGE_COSTS[modelString] ?? 0;
  return rate * imageCount;
}
