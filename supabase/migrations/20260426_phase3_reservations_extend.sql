-- Phase 3: Extend reservations table with master data fields.
-- Run this in the Supabase SQL editor after phase1_master_data.sql.

alter table public.reservations
  add column if not exists selected_items    jsonb        not null default '[]',
  add column if not exists cast_reward       numeric(12,2),
  add column if not exists fee_adjustment    numeric(12,2) not null default 0,
  add column if not exists reward_adjustment numeric(12,2) not null default 0,
  add column if not exists payment_method    text          not null default 'cash',
  add column if not exists advance_cash      numeric(12,2),
  add column if not exists is_triple         boolean       not null default false,
  add column if not exists is_first_meet     boolean;

-- selected_items format (stored as JSON snapshot at booking time):
-- [
--   { "item_id": "uuid", "group_id": "uuid", "kind": "course",
--     "name": "90分", "amount": 35000, "reward": 17500 },
--   { "item_id": "uuid", "group_id": "uuid", "kind": "nomination",
--     "name": "ネット指名", "amount": 3000, "reward": 0 },
--   ...
-- ]
