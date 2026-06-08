import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { runOpenAIImage } from '@/lib/ai/openai-image';
import { replaceVariables } from '@/lib/prompt-engine';
import { ImageRunRequest, Model, PromptVersion } from '@/types';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body: ImageRunRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const { promptVersionId, modelIds, inputConceptJson, inputParams, inputImageUrl, conceptRunId } = body;
  if (!promptVersionId || !modelIds?.length) {
    return NextResponse.json({ error: 'Missing required fields', code: 'BAD_REQUEST' }, { status: 400 });
  }

  if (!inputConceptJson || typeof inputConceptJson !== 'object') {
    return NextResponse.json({ error: 'Invalid concept JSON', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const serviceClient = await createServiceClient();

  const { data: promptVersion, error: pvError } = await serviceClient
    .from('prompt_versions')
    .select('*')
    .eq('id', promptVersionId)
    .single();

  if (pvError || !promptVersion) {
    return NextResponse.json({ error: 'Prompt version not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const runIds: string[] = [];

  for (const modelId of modelIds) {
    const { data: model, error: modelError } = await serviceClient
      .from('models')
      .select('*')
      .eq('id', modelId)
      .eq('user_id', user.id)
      .single();

    if (modelError || !model) {
      return NextResponse.json({ error: `Model ${modelId} not found`, code: 'NOT_FOUND' }, { status: 404 });
    }

    const { data: run } = await serviceClient
      .from('image_runs')
      .insert({
        user_id: user.id,
        prompt_version_id: promptVersionId,
        model_id: modelId,
        input_concept_json: inputConceptJson,
        concept_run_id: conceptRunId,
        input_image_url: inputImageUrl,
        status: 'running',
      })
      .select()
      .single();

    if (run) runIds.push(run.id);

    waitUntil(executeImageRun(
      run?.id,
      user.id,
      model as Model,
      promptVersion as PromptVersion,
      inputConceptJson,
      inputParams ?? {},
      inputImageUrl,
      serviceClient
    ));
  }

  return NextResponse.json({ runIds });
}

async function executeImageRun(
  runId: string,
  userId: string,
  model: Model,
  promptVersion: PromptVersion,
  conceptJson: Record<string, unknown>,
  inputParams: Record<string, string>,
  inputImageUrl: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any
) {
  // Use model-specific char limit if set in extra_config, otherwise default to 30000
  const IMAGE_PROMPT_CHAR_LIMIT = (model.extra_config as Record<string, unknown>)?.prompt_char_limit as number ?? 30000;
  const promptWithoutConcept = replaceVariables(promptVersion.content, {
    ...inputParams,
    concept_json: '',
    reference_image_url: inputImageUrl ?? '',
  });
  const conceptBudget = IMAGE_PROMPT_CHAR_LIMIT - promptWithoutConcept.length;
  let conceptJsonStr = JSON.stringify(conceptJson, null, 2);
  if (conceptJsonStr.length > conceptBudget) {
    conceptJsonStr = conceptJsonStr.slice(0, Math.max(0, conceptBudget - 20)) + '\n  ... (truncated)';
    console.warn(`[image-run:${runId}] concept_json truncated to fit image prompt limit (budget=${conceptBudget})`);
  }

  const paramsWithConcept = {
    ...inputParams,
    concept_json: conceptJsonStr,
    reference_image_url: inputImageUrl ?? '',
  };
  let resolvedPrompt = replaceVariables(promptVersion.content, paramsWithConcept);

  // Hard clamp the final prompt — catches cases where the template itself is very long
  if (resolvedPrompt.length > IMAGE_PROMPT_CHAR_LIMIT) {
    console.warn(`[image-run:${runId}] resolved prompt (${resolvedPrompt.length}) still exceeds limit (${IMAGE_PROMPT_CHAR_LIMIT}) — clamping`);
    resolvedPrompt = resolvedPrompt.slice(0, IMAGE_PROMPT_CHAR_LIMIT);
  }
  const apiKey = (model.api_key_secret ?? process.env.OPENAI_API_KEY ?? '').trim();
  const baseUrl = model.base_url ?? undefined;
  const useEdits = !!inputImageUrl && (model.extra_config as Record<string, unknown>)?.use_edits === true;

  const conceptJsonInjected = promptVersion.content.includes('{{concept_json}}');
  const imageInjected = promptVersion.content.includes('{{reference_image_url}}');
  console.log(`[image-run:${runId}] model=${model.model_string}`);
  console.log(`[image-run:${runId}] concept_json_in_template=${conceptJsonInjected} image_url_in_template=${imageInjected} useEdits=${useEdits}`);
  console.log(`[image-run:${runId}] inputImageUrl=${inputImageUrl ?? 'none'}`);
  console.log(`[image-run:${runId}] resolvedPrompt(500)=${resolvedPrompt.slice(0, 500)}`);

  try {
    const result = await runOpenAIImage(
      model.model_string,
      apiKey,
      resolvedPrompt,
      model.extra_config as Record<string, unknown>,
      baseUrl,
      inputImageUrl
    );

    if (result.error || !result.imageUrls.length) {
      await serviceClient.from('image_runs').update({
        status: 'failed',
        error_message: result.error ?? 'No images generated',
        generation_time_ms: result.generationTimeMs,
      }).eq('id', runId);
      return;
    }

    // Upload images to Supabase Storage
    const storedUrls: string[] = [];
    for (let i = 0; i < result.imageUrls.length; i++) {
      try {
        const imageUrl = result.imageUrls[i];
        let buf: ArrayBuffer;

        if (imageUrl.startsWith('data:')) {
          // Base64 data URL — decode directly without fetch
          const base64 = imageUrl.split(',')[1];
          const binary = Buffer.from(base64, 'base64');
          buf = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
        } else {
          const res = await fetch(imageUrl);
          buf = await res.arrayBuffer();
        }

        const path = `${userId}/${runId}/${Date.now()}_${i}.png`;
        const { data: uploaded } = await serviceClient.storage
          .from('generated-images')
          .upload(path, buf, { contentType: 'image/png', upsert: true });

        if (uploaded) {
          const { data: publicUrl } = serviceClient.storage
            .from('generated-images')
            .getPublicUrl(path);
          storedUrls.push(publicUrl.publicUrl);
        } else {
          storedUrls.push(imageUrl);
        }
      } catch (err) {
        console.error(`[image-run] storage upload failed for image ${i}:`, err);
        storedUrls.push(result.imageUrls[i]);
      }
    }

    await serviceClient.from('image_runs').update({
      status: 'completed',
      output_image_urls: storedUrls,
      generation_time_ms: result.generationTimeMs,
      estimated_cost_usd: result.estimatedCostUsd,
    }).eq('id', runId);
  } catch (err) {
    await serviceClient.from('image_runs').update({
      status: 'failed',
      error_message: err instanceof Error ? err.message : String(err),
    }).eq('id', runId);
  }
}
