import { estimateTextCost } from '@/lib/cost-calculator';
import { GenerationResult } from '@/types';

export async function runCustomText(
  modelString: string,
  apiKey: string,
  baseUrl: string,
  prompt: string,
  extraConfig: Record<string, unknown> = {},
  imageUrl?: string,
  systemPrompt?: string
): Promise<GenerationResult> {
  const start = Date.now();

  try {
    const apiVersion = extraConfig.api_version as string | undefined;

    // Auto-append Azure AI Foundry chat completions path only when the base URL has no API path
    const hasPath = /\/(chat\/completions|completions|messages|v1\/chat)/.test(baseUrl);
    const resolvedBase = hasPath
      ? baseUrl
      : `${baseUrl.replace(/\/$/, '')}/openai/deployments/${modelString}/chat/completions`;

    const sep = resolvedBase.includes('?') ? '&' : '?';
    const endpoint = apiVersion ? `${resolvedBase}${sep}api-version=${apiVersion}` : resolvedBase;

    // Build message content — multimodal if an image URL is provided
    // Default to Anthropic format; only use OpenAI format when api_format is explicitly 'openai'
    const isAnthropicFormat = (extraConfig.api_format as string) !== 'openai';

    type ContentPart =
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'url'; url: string } }
      | { type: 'image_url'; image_url: { url: string } };

    let messageContent: string | ContentPart[];
    if (imageUrl) {
      if (isAnthropicFormat) {
        messageContent = [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text', text: prompt },
        ];
      } else {
        messageContent = [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: prompt },
        ];
      }
    } else {
      messageContent = prompt;
    }

    const effectiveMaxTokens = (extraConfig.max_tokens as number) ?? 32000;
    // Extended output beta header unlocks >8192 output tokens on Claude models
    const anthropicBeta = isAnthropicFormat
      ? ((extraConfig.anthropic_beta as string) ?? 'output-128k-2025-02-19')
      : undefined;

    const timeoutMs = ((extraConfig.timeout_seconds as number) ?? 240) * 1000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    console.log(`[custom] endpoint=${endpoint} hasPath=${hasPath} max_tokens=${effectiveMaxTokens} beta=${anthropicBeta} timeout=${timeoutMs}ms`);
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'api-key': apiKey,
          'x-api-key': apiKey,
          'anthropic-version': (extraConfig.anthropic_version as string) ?? '2023-06-01',
          ...(anthropicBeta ? { 'anthropic-beta': anthropicBeta } : {}),
        },
        body: JSON.stringify({
          model: modelString,
          max_tokens: effectiveMaxTokens,
          ...(isAnthropicFormat && systemPrompt ? { system: systemPrompt } : {}),
          messages: [{ role: 'user', content: messageContent }],
          ...(extraConfig.temperature !== undefined ? { temperature: extraConfig.temperature } : {}),
        }),
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const isTimeout = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      throw new Error(isTimeout
        ? `Request timed out after ${timeoutMs / 1000}s — the model is taking too long. Try a shorter prompt or increase timeout_seconds in model extra_config.`
        : `Network error: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`
      );
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const generationTimeMs = Date.now() - start;

    // Auto-detect response format: Anthropic vs OpenAI
    const isAnthropicResponse = Array.isArray(data.content);
    const text = isAnthropicResponse
      ? (data.content?.[0]?.text ?? '')
      : (data.choices?.[0]?.message?.content ?? '');
    const promptTokens = isAnthropicResponse
      ? (data.usage?.input_tokens ?? 0)
      : (data.usage?.prompt_tokens ?? 0);
    const completionTokens = isAnthropicResponse
      ? (data.usage?.output_tokens ?? 0)
      : (data.usage?.completion_tokens ?? 0);
    const stopReason = isAnthropicResponse
      ? data.stop_reason
      : data.choices?.[0]?.finish_reason;

    console.log(`[custom] stop_reason=${stopReason} tokens=${promptTokens}+${completionTokens} max_tokens_sent=${effectiveMaxTokens} textLen=${text.length}`);
    if (stopReason === 'max_tokens' || stopReason === 'length') {
      console.warn(`[custom] OUTPUT TRUNCATED — hit token limit of ${effectiveMaxTokens}`);
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
