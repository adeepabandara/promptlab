export interface Product {
  id: string;
  user_id: string;
  name: string;
  glb_url?: string;
  created_at: string;
}

export interface Model {
  id: string;
  user_id: string;
  name: string;
  provider: 'anthropic' | 'openai' | 'custom';
  model_string: string;
  type: 'text' | 'image';
  api_key_secret?: string;
  base_url?: string;
  extra_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface Prompt {
  id: string;
  user_id: string;
  name: string;
  type: 'concept' | 'image';
  description?: string;
  created_at: string;
}

export interface PromptParameter {
  name: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'image';
  label: string;
  default_value?: string;
  required: boolean;
  options?: string[];
}

export interface PromptVersion {
  id: string;
  prompt_id: string;
  version_number: number;
  content: string;
  parameters: PromptParameter[];
  changelog?: string;
  created_at: string;
}

export interface ConceptRun {
  id: string;
  user_id: string;
  prompt_version_id: string;
  model_id: string;
  input_params: Record<string, string>;
  input_image_url?: string;
  output_json?: Record<string, unknown>;
  raw_output?: string;
  generation_time_ms?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  estimated_cost_usd?: number;
  quality_rating?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string;
  created_at: string;
  // Joined fields
  prompt_versions?: PromptVersion & { prompts?: Prompt };
  models?: Model;
}

export interface ImageRun {
  id: string;
  user_id: string;
  prompt_version_id: string;
  model_id: string;
  input_concept_json?: Record<string, unknown>;
  concept_run_id?: string;
  input_image_url?: string;
  output_image_urls: string[];
  generation_time_ms?: number;
  estimated_cost_usd?: number;
  quality_rating?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string;
  created_at: string;
  // Joined fields
  prompt_versions?: PromptVersion & { prompts?: Prompt };
  models?: Model;
}

export interface GenerationResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  generationTimeMs: number;
  estimatedCostUsd: number;
  error?: string;
}

export interface ImageGenerationResult {
  imageUrls: string[];
  generationTimeMs: number;
  estimatedCostUsd: number;
  error?: string;
}

export interface ConceptRunRequest {
  promptVersionId: string;
  modelIds: string[];
  inputParams: Record<string, string>;
  inputImageUrl?: string;
  userPrompt?: string;
}

export interface ImageRunRequest {
  promptVersionId: string;
  modelIds: string[];
  inputConceptJson: Record<string, unknown>;
  inputParams: Record<string, string>;
  inputImageUrl?: string;
  conceptRunId?: string;
}

export interface DashboardMetrics {
  totalRuns: number;
  avgGenerationTimeMs: number;
  totalCostUsd: number;
  avgQualityRating: number;
}
