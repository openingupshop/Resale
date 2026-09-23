-- eBay OAuth tokens. RLS on with no policies: only the server (service role)
-- can read or write them, so tokens never reach the browser.
create table public.ebay_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ebay_user_id text not null,
  ebay_username text,
  access_token text not null,
  access_expires_at timestamptz not null,
  refresh_token text not null,
  refresh_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ebay_accounts_ebay_user_idx on public.ebay_accounts (ebay_user_id);
alter table public.ebay_accounts enable row level security;

create trigger ebay_accounts_touch_updated_at
  before update on public.ebay_accounts
  for each row execute function public.touch_updated_at();

alter table public.listings
  add column ebay_offer_id text,
  add column ebay_listing_id text,
  add column ebay_listed_at timestamptz;
