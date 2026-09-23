-- Listings the user can view, edit, and delete.
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  photo_count smallint not null,
  thumbnail text,           -- small JPEG data URL for the history screen
  data jsonb not null        -- the listing fields (see src/lib/listing-schema.ts)
);

create index listings_user_created_idx on public.listings (user_id, created_at desc);

alter table public.listings enable row level security;

create policy "listings: read own" on public.listings
  for select using (auth.uid() = user_id);
create policy "listings: insert own" on public.listings
  for insert with check (auth.uid() = user_id);
create policy "listings: update own" on public.listings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "listings: delete own" on public.listings
  for delete using (auth.uid() = user_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger listings_touch_updated_at
  before update on public.listings
  for each row execute function public.touch_updated_at();

-- One row per Claude call: drives the daily limit and cost reporting.
-- No update/delete policies, so users cannot erase rows to reset their limit.
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null check (status in ('success', 'refused', 'error')),
  model text not null,
  photo_count smallint not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  duration_ms integer
);

create index generations_user_created_idx on public.generations (user_id, created_at desc);

alter table public.generations enable row level security;

create policy "generations: read own" on public.generations
  for select using (auth.uid() = user_id);
create policy "generations: insert own" on public.generations
  for insert with check (auth.uid() = user_id);

-- Cost reporting across all users (run from the SQL editor):
--   select date_trunc('day', created_at) as day, count(*) as generations,
--          sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens,
--          sum(cost_usd) as cost_usd, avg(cost_usd) as avg_cost_per_listing
--   from public.generations group by 1 order by 1 desc;
