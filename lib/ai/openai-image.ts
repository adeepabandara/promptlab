import OpenAI from 'openai';
import { estimateImageCost } from '@/lib/cost-calculator';
import { ImageGenerationResult } from '@/types';

async function pollForResult(
  operationUrl: string,
  apiKey: string,
  maxWaitMs = 120_000
): Promise<{ data?: { url?: string; b64_json?: string }[] }> {
  const deadline = Date.now() + maxWaitMs;
  let pollInterval = 1000; // start fast, back off after first check
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));
    pollInterval = 3000; // subsequent checks every 3s
    const res = await fetch(operationUrl, {
      headers: { 'api-key': apiKey, 'Authorization': `Bearer ${apiKey}` },
    });
    const text = await res.text();
    if (!text.trim()) continue;
    const json = JSON.parse(text);
    const status = (json.status ?? '').toLowerCase();
    if (status === 'succeeded') return json.result ?? json;
    if (status === 'failed' || status === 'cancelled') {
      throw new Error(`Azure image operation ${status}: ${json.error?.message ?? text}`);
    }
    // still running — keep polling
  }
  throw new Error('Azure image generation timed out after 2 minutes');
}

export async function runOpenAIImage(
  modelString: string,
  apiKey: string,
  prompt: string,
  extraConfig: Record<string, unknown> = {},
  baseUrl?: string,
  inputImageUrl?: string
): Promise<ImageGenerationResult> {
  const start = Date.now();

  try {
    let imageUrls: string[] = [];

    if (baseUrl) {
      // Azure / custom endpoint — direct fetch
      const apiVersion = extraConfig.api_version as string | undefined;
      // Auto-append Azure AI Foundry image path when only a root URL is given.
      // Override by setting extra_config.image_path (e.g. "/openai/images/generations")
      const useEdits = !!inputImageUrl && extraConfig.use_edits === true;
      const imagePath = extraConfig.image_path as string | undefined;
      let resolvedBase: string;
      if (baseUrl.includes('/images/')) {
        resolvedBase = baseUrl;
      } else if (imagePath) {
        resolvedBase = `${baseUrl.replace(/\/$/, '')}${imagePath}`;
      } else {
        const deploymentBase = `${baseUrl.replace(/\/$/, '')}/openai/deployments/${modelString}`;
        resolvedBase = `${deploymentBase}/images/${useEdits ? 'edits' : 'generations'}`;
      }
      const sep = resolvedBase.includes('?') ? '&' : '?';
      const endpoint = apiVersion ? `${resolvedBase}${sep}api-version=${apiVersion}` : resolvedBase;

      console.log(`[image-run] endpoint=${endpoint} useEdits=${useEdits}`);

      let res: Response;

      if (useEdits && inputImageUrl) {
        // Edits endpoint requires multipart/form-data with the reference image
        const imgRes = await fetch(inputImageUrl);
        const imgBuf = await imgRes.arrayBuffer();
        const form = new FormData();
        form.append('image', new Blob([imgBuf], { type: 'image/png' }), 'reference.png');
        form.append('prompt', prompt);
        form.append('model', modelString);
        form.append('n', String((extraConfig.n as number) ?? 1));
        form.append('size', (extraConfig.size as string) ?? '1024x1024');
        form.append('quality', (extraConfig.quality as string) ?? 'medium');

        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'api-key': apiKey,
            'Authorization': `Bearer ${apiKey}`,
          },
          body: form,
        });
      } else {
        const reqBody: Record<string, unknown> = { prompt, model: modelString };

        // Support width/height (MAI-style) or size (DALL-E style)
        if (extraConfig.width !== undefined || extraConfig.height !== undefined) {
          reqBody.width = (extraConfig.width as number) ?? 1024;
          reqBody.height = (extraConfig.height as number) ?? 1024;
        } else if (extraConfig.size !== undefined) {
          reqBody.size = extraConfig.size;
        }
        if (extraConfig.n !== undefined) reqBody.n = extraConfig.n;
        if (extraConfig.quality !== undefined) reqBody.quality = extraConfig.quality;
        if (extraConfig.response_format) reqBody.response_format = extraConfig.response_format;

        console.log(`[image-run] reqBody=${JSON.stringify({ ...reqBody, prompt: reqBody.prompt?.toString().slice(0, 80) + '...' })}`);
        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey,
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(reqBody),
        });
      }

      const opLocation = res.headers.get('operation-location');
      console.log(`[image-run] status=${res.status} op-location=${opLocation ?? 'none'}`);

      // Azure returns 202 + operation-location for async generation
      if (res.status === 202 && opLocation) {
        const result = await pollForResult(opLocation, apiKey);
        imageUrls = (result.data ?? [])
          .map((d) => d.url ?? (d.b64_json ? `data:image/png;base64,${d.b64_json}` : undefined))
          .filter((u): u is string => Boolean(u));
      } else {
        const rawText = await res.text();
        console.log(`[image-run] body(300)=${rawText.slice(0, 300)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${rawText} [endpoint: ${endpoint}]`);
        if (!rawText.trim()) throw new Error(`Empty response from image API (status=${res.status})`);
        const data = JSON.parse(rawText) as { data?: { url?: string; b64_json?: string }[] };
        imageUrls = (data.data ?? [])
          .map((d) => d.url ?? (d.b64_json ? `data:image/png;base64,${d.b64_json}` : undefined))
          .filter((u): u is string => Boolean(u));
      }
    } else {
      // Standard OpenAI
      const client = new OpenAI({ apiKey });

      if (inputImageUrl) {
        // Use images.edit() so the reference image is actually sent to the model
        const imgRes = await fetch(inputImageUrl);
        const imgBuf = await imgRes.arrayBuffer();
        const imgFile = new File([imgBuf], 'reference.png', { type: 'image/png' });

        const response = await client.images.edit({
          model: modelString,
          image: imgFile,
          prompt,
          n: (extraConfig.n as number) ?? 1,
          size: (extraConfig.size as '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024') ?? '1024x1024',
        });
        imageUrls = (response.data ?? [])
          .map((d) => d.url)
          .filter((u): u is string => Boolean(u));
      } else {
        const response = await client.images.generate({
          model: modelString,
          prompt,
          n: (extraConfig.n as number) ?? 1,
          size: (extraConfig.size as '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024') ?? '1024x1024',
          response_format: 'url',
        });
        imageUrls = (response.data ?? [])
          .map((d) => d.url)
          .filter((u): u is string => Boolean(u));
      }
    }

    return {
      imageUrls,
      generationTimeMs: Date.now() - start,
      estimatedCostUsd: estimateImageCost(modelString, imageUrls.length),
    };
  } catch (err) {
    return {
      imageUrls: [],
      generationTimeMs: Date.now() - start,
      estimatedCostUsd: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
