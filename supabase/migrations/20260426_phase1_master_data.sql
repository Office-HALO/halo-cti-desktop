-- HALO CTI Phase 1+2: Multi-store, cast ranks, master data tables.
-- Run in the Supabase SQL editor on the project's database.
-- This migration drops existing reservations data; export beforehand if needed.

-- =============================================================
-- 1. stores
-- =============================================================
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.stores disable row level security;

-- Seed default store
insert into public.stores (code, name, display_order)
  values ('main', '本店', 0)
  on conflict (code) do nothing;

-- =============================================================
-- 2. cast_ranks (per store)
-- =============================================================
create table if not exists public.cast_ranks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null,
  label text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (store_id, code)
);
alter table public.cast_ranks disable row level security;
create index if not exists idx_cast_ranks_store on public.cast_ranks(store_id, display_order);

-- =============================================================
-- 3. option_groups + option_items + option_item_rank_prices
-- =============================================================
create table if not exists public.option_groups (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  kind text not null check (kind in (
    'course','nomination','extension','event','option',
    'discount','transport','hotel','driver','media','other'
  )),
  label text not null,
  required boolean not null default false,
  multi_select boolean not null default false,
  triple_multiplier numeric(6,3) not null default 2.0,
  meta jsonb not null default '{}'::jsonb,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.option_groups disable row level security;
create index if not exists idx_option_groups_store_kind on public.option_groups(store_id, kind, display_order);

create table if not exists public.option_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.option_groups(id) on delete cascade,
  name text not null,
  display_order int not null default 0,
  is_active boolean not null default true,

  duration_min int,
  allow_zero_min boolean not null default false,

  price_mode text not null default 'flat' check (price_mode in ('flat','per_rank')),
  price_flat numeric(12,2),

  reward_mode text not null default 'percent' check (reward_mode in (
    'percent','flat','first_vs_repeat','none'
  )),
  reward_percent numeric(6,3),
  reward_flat numeric(12,2),
  reward_first numeric(12,2),
  reward_repeat numeric(12,2),

  created_at timestamptz not null default now()
);
alter table public.option_items disable row level security;
create index if not exists idx_option_items_group on public.option_items(group_id, display_order);

create table if not exists public.option_item_rank_prices (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.option_items(id) on delete cascade,
  cast_rank_id uuid not null references public.cast_ranks(id) on delete cascade,
  price numeric(12,2) not null,
  reward_override numeric(12,2),
  created_at timestamptz not null default now(),
  unique (item_id, cast_rank_id)
);
alter table public.option_item_rank_prices disable row level security;
create index if not exists idx_oirp_item on public.option_item_rank_prices(item_id);

-- =============================================================
-- 4. ladies: store_id / cast_rank_id
-- =============================================================
alter table public.ladies
  add column if not exists store_id uuid references public.stores(id),
  add column if not exists cast_rank_id uuid references public.cast_ranks(id);

-- backfill ladies.store_id to default store
update public.ladies
   set store_id = (select id from public.stores where code = 'main')
 where store_id is null;

-- Note: legacy column ladies.store_code is left in place. Drop manually
-- once you have confirmed the migration:
--   alter table public.ladies drop column store_code;

-- =============================================================
-- 5. staff: default_store_id
-- =============================================================
alter table public.staff
  add column if not exists default_store_id uuid references public.stores(id);

update public.staff
   set default_store_id = (select id from public.stores where code = 'main')
 where default_store_id is null;

-- =============================================================
-- 6. reservations: drop and recreate as a minimal skeleton
--    (Phase 3 will extend this with full schema)
-- =============================================================
drop table if exists public.reservations cascade;

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  customer_id uuid references public.customers(id) on delete set null,
  lady_id uuid references public.ladies(id) on delete set null,
  reserved_date date not null,
  start_time time not null,
  end_time time,
  duration_min int,
  status text not null default 'reserved',
  course text,
  hotel text,
  room_no text,
  amount numeric(12,2),
  memo text,
  created_at timestamptz not null default now()
);
alter table public.reservations disable row level security;
create index if not exists idx_reservations_date on public.reservations(reserved_date);
create index if not exists idx_reservations_lady on public.reservations(lady_id);
create index if not exists idx_reservations_customer on public.reservations(customer_id);
create index if not exists idx_reservations_store on public.reservations(store_id);
