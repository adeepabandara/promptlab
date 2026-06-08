-- Products table — stores product records with optional GLB asset
create table products (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  glb_url text,                        -- Supabase Storage path (relative, not full URL)
  created_at timestamptz default now()
);

alter table products enable row level security;
create policy "users own their products" on products for all using (auth.uid() = user_id);

-- Storage bucket for product GLB assets
insert into storage.buckets (id, name, public) values ('product-assets', 'product-assets', true)
  on conflict (id) do nothing;

create policy "users can upload product assets" on storage.objects
  for insert with check (bucket_id = 'product-assets' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "product assets are publicly readable" on storage.objects
  for select using (bucket_id = 'product-assets');
create policy "users can delete own product assets" on storage.objects
  for delete using (bucket_id = 'product-assets' and auth.uid()::text = (storage.foldername(name))[1]);
