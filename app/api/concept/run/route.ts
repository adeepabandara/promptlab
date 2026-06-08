import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { runAnthropicText } from '@/lib/ai/anthropic';
import { runOpenAIText } from '@/lib/ai/openai-text';
import { runCustomText } from '@/lib/ai/custom';
import { replaceVariables, extractJson } from '@/lib/prompt-engine';
import { ConceptRunRequest, Model, PromptVersion } from '@/types';

const JSON_INSTRUCTION = `\n\nRespond ONLY with a valid JSON object. Do not include markdown code fences, explanation, or any text outside the JSON object.`;
const JSON_SYSTEM_PROMPT = `You must respond with a single valid JSON object only. No markdown, no code fences, no explanation, no text before or after the JSON. Your entire response must be parseable by JSON.parse().`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body: ConceptRunRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const { promptVersionId, modelIds, inputParams, inputImageUrl, userPrompt } = body;
  if (!promptVersionId || !modelIds?.length) {
    return NextResponse.json({ error: 'Missing required fields', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const serviceClient = await createServiceClient();

  // Fetch prompt version
  const { data: promptVersion, error: pvError } = await serviceClient
    .from('prompt_versions')
    .select('*, prompts(*)')
    .eq('id', promptVersionId)
    .single();

  if (pvError || !promptVersion) {
    return NextResponse.json({ error: 'Prompt version not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  // Create run records and execute sequentially
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
      .from('concept_runs')
      .insert({
        user_id: user.id,
        prompt_version_id: promptVersionId,
        model_id: modelId,
        input_params: inputParams ?? {},
        input_image_url: inputImageUrl,
        status: 'running',
      })
      .select()
      .single();

    if (run) runIds.push(run.id);

    waitUntil(executeConceptRun(
      run?.id,
      model as Model,
      promptVersion as PromptVersion,
      inputParams ?? {},
      inputImageUrl,
      serviceClient,
      userPrompt
    ));
  }

  return NextResponse.json({ runIds });
}

async function executeConceptRun(
  runId: string,
  model: Model,
  promptVersion: PromptVersion,
  inputParams: Record<string, string>,
  inputImageUrl: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any,
  userPrompt?: string
) {
  const basePrompt = replaceVariables(promptVersion.content, inputParams);
  const resolvedPrompt = (userPrompt?.trim()
    ? `${basePrompt}\n\n---\nUser input:\n${userPrompt.trim()}`
    : basePrompt) + JSON_INSTRUCTION;
  const apiKey = (model.api_key_secret ?? process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY ?? '').trim();

  console.log(`[run:${runId}] provider=${model.provider} model=${model.model_string} hasKey=${!!apiKey}`);

  let result;

  try {
    if (model.provider === 'anthropic') {
      result = await runAnthropicText(
        model.model_string,
        apiKey,
        resolvedPrompt,
        inputImageUrl,
        model.extra_config as Record<string, unknown>
      );
    } else if (model.provider === 'openai') {
      result = await runOpenAIText(
        model.model_string,
        apiKey,
        resolvedPrompt,
        inputImageUrl,
        model.extra_config as Record<string, unknown>
      );
    } else {
      result = await runCustomText(
        model.model_string,
        apiKey,
        model.base_url ?? '',
        resolvedPrompt,
        model.extra_config as Record<string, unknown>,
        inputImageUrl,
        JSON_SYSTEM_PROMPT
      );
    }

    if (result.error) {
      console.error(`[run:${runId}] AI error:`, result.error);
      await serviceClient.from('concept_runs').update({
        status: 'failed',
        error_message: result.error,
        generation_time_ms: result.generationTimeMs,
      }).eq('id', runId);
      return;
    }

    console.log(`[run:${runId}] completed, tokens=${result.promptTokens}+${result.completionTokens}`);
    console.log(`[run:${runId}] raw output (first 500):`, result.content?.slice(0, 500));

    const outputJson = extractJson(result.content);
    console.log(`[run:${runId}] extractJson result:`, outputJson ? 'OK' : 'NULL');

    await serviceClient.from('concept_runs').update({
      status: 'completed',
      output_json: outputJson,
      raw_output: result.content,
      generation_time_ms: result.generationTimeMs,
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
      estimated_cost_usd: result.estimatedCostUsd,
    }).eq('id', runId);
  } catch (err) {
    console.error(`[run:${runId}] exception:`, err);
    await serviceClient.from('concept_runs').update({
      status: 'failed',
      error_message: err instanceof Error ? err.message : String(err),
    }).eq('id', runId);
  }
}
