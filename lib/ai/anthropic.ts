import Anthropic from '@anthropic-ai/sdk';
import { estimateTextCost } from '@/lib/cost-calculator';
import { GenerationResult } from '@/types';

export async function runAnthropicText(
  modelString: string,
  apiKey: string,
  prompt: string,
  imageUrl?: string,
  extraConfig: Record<string, unknown> = {}
): Promise<GenerationResult> {
  const client = new Anthropic({ apiKey });
  const start = Date.now();

  try {
    const content: Anthropic.MessageParam['content'] = [];

    if (imageUrl) {
      const res = await fetch(imageUrl);
      const buf = await res.arrayBuffer();
      const b64 = Buffer.from(buf).toString('base64');
      const contentType = res.headers.get('content-type') ?? 'image/png';
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: contentType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
          data: b64,
        },
      });
    }

    content.push({ type: 'text', text: prompt });

    const effectiveMaxTokens = (extraConfig.max_tokens as number) ?? 8192;
    const response = await client.messages.create({
      model: modelString,
      max_tokens: effectiveMaxTokens,
      messages: [{ role: 'user', content }],
      ...(extraConfig.temperature !== undefined
        ? { temperature: extraConfig.temperature as number }
        : {}),
    });

    const generationTimeMs = Date.now() - start;
    const promptTokens = response.usage.input_tokens;
    const completionTokens = response.usage.output_tokens;
    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    console.log(`[anthropic] stop_reason=${response.stop_reason} tokens=${promptTokens}+${completionTokens} max_tokens_sent=${effectiveMaxTokens}`);
    if (response.stop_reason === 'max_tokens') {
      console.warn(`[anthropic] OUTPUT TRUNCATED — hit token limit of ${effectiveMaxTokens}`);
    }

    return {
      content: text,
      promptTokens,
      completionTokens,
      generationTimeMs,
      estimatedCostUsd: estimateTextCost(modelString, promptTokens, completionTokens),
    };
  } catch (err) {
    return {
      content: '',
      promptTokens: 0,
      completionTokens: 0,
      generationTimeMs: Date.now() - start,
      estimatedCostUsd: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
