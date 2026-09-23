-- Sale and cost tracking for profit reports.
alter table public.listings
  add column cost_paid numeric(10, 2),
  add column sourcing_miles numeric(8, 1),
  add column status text not null default 'active' check (status in ('active', 'sold')),
  add column sold_at date,
  add column sold_platform text,
  add column sold_price numeric(10, 2),
  add column sale_fees numeric(10, 2),
  add column shipping_cost numeric(10, 2);

create index listings_user_status_idx on public.listings (user_id, status, sold_at desc);
