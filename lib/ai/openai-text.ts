import OpenAI from 'openai';
import { estimateTextCost } from '@/lib/cost-calculator';
import { GenerationResult } from '@/types';

export async function runOpenAIText(
  modelString: string,
  apiKey: string,
  prompt: string,
  imageUrl?: string,
  extraConfig: Record<string, unknown> = {}
): Promise<GenerationResult> {
  const client = new OpenAI({ apiKey });
  const start = Date.now();

  try {
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];

    if (imageUrl) {
      userContent.push({ type: 'image_url', image_url: { url: imageUrl } });
    }
    userContent.push({ type: 'text', text: prompt });

    const response = await client.chat.completions.create({
      model: modelString,
      messages: [{ role: 'user', content: userContent }],
      max_tokens: (extraConfig.max_tokens as number) ?? 4096,
      ...(extraConfig.temperature !== undefined
        ? { temperature: extraConfig.temperature as number }
        : {}),
    });

    const generationTimeMs = Date.now() - start;
    const promptTokens = response.usage?.prompt_tokens ?? 0;
    const completionTokens = response.usage?.completion_tokens ?? 0;
    const text = response.choices[0]?.message?.content ?? '';

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
