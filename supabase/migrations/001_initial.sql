-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Models registry (user-defined)
create table models (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  provider text not null,           -- 'anthropic' | 'openai' | 'custom'
  model_string text not null,       -- e.g. 'claude-sonnet-4-20250514'
  type text not null,               -- 'text' | 'image'
  api_key_secret text,              -- stored encrypted via Supabase Vault or env
  base_url text,                    -- for custom/self-hosted endpoints
  extra_config jsonb default '{}',  -- any provider-specific params
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Prompt library (both concept and image prompts)
create table prompts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  type text not null,               -- 'concept' | 'image'
  description text,
  created_at timestamptz default now()
);

-- Prompt versions (immutable once created, new edits = new version)
create table prompt_versions (
  id uuid primary key default uuid_generate_v4(),
  prompt_id uuid references prompts(id) on delete cascade not null,
  version_number integer not null,
  content text not null,            -- The prompt text with {{variable}} placeholders
  parameters jsonb default '[]',    -- [{ name, type, label, default_value, required }]
  changelog text,
  created_at timestamptz default now(),
  unique(prompt_id, version_number)
);

-- Concept generation runs (Part 1)
create table concept_runs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  prompt_version_id uuid references prompt_versions(id) not null,
  model_id uuid references models(id) not null,
  input_params jsonb default '{}',  -- resolved parameter values used
  input_image_url text,             -- optional product/reference image
  output_json jsonb,                -- the generated concept JSON
  raw_output text,                  -- raw model response (for debugging)
  generation_time_ms integer,
  prompt_tokens integer,
  completion_tokens integer,
  estimated_cost_usd numeric(10,6),
  quality_rating integer check (quality_rating between 1 and 5),
  status text default 'pending',    -- 'pending' | 'running' | 'completed' | 'failed'
  error_message text,
  created_at timestamptz default now()
);

-- Image generation runs (Part 2)
create table image_runs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  prompt_version_id uuid references prompt_versions(id) not null,
  model_id uuid references models(id) not null,
  input_concept_json jsonb,         -- the JSON fed as input (pasted manually)
  concept_run_id uuid references concept_runs(id),  -- optional link to Part 1 run
  input_image_url text,             -- product reference image
  output_image_urls text[] default '{}',  -- Supabase Storage URLs
  generation_time_ms integer,
  estimated_cost_usd numeric(10,6),
  quality_rating integer check (quality_rating between 1 and 5),
  status text default 'pending',
  error_message text,
  created_at timestamptz default now()
);

-- RLS policies
alter table models enable row level security;
alter table prompts enable row level security;
alter table prompt_versions enable row level security;
alter table concept_runs enable row level security;
alter table image_runs enable row level security;

create policy "users own their models" on models for all using (auth.uid() = user_id);
create policy "users own their prompts" on prompts for all using (auth.uid() = user_id);
create policy "users own their prompt versions" on prompt_versions for all
  using (exists (select 1 from prompts where prompts.id = prompt_versions.prompt_id and prompts.user_id = auth.uid()));
create policy "users own their concept runs" on concept_runs for all using (auth.uid() = user_id);
create policy "users own their image runs" on image_runs for all using (auth.uid() = user_id);

-- Supabase Storage bucket for generated images
insert into storage.buckets (id, name, public) values ('generated-images', 'generated-images', true);
create policy "users can upload images" on storage.objects for insert with check (bucket_id = 'generated-images' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "images are publicly readable" on storage.objects for select using (bucket_id = 'generated-images');
create policy "users can delete own images" on storage.objects for delete using (bucket_id = 'generated-images' and auth.uid()::text = (storage.foldername(name))[1]);
