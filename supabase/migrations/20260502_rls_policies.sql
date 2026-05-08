-- =============================================================
-- RLS Phase 1: authenticated ユーザーのみアクセス可
-- 対象: マスターデータ・予約・顧客テーブル
-- 実行前提: 20260426_phase1_master_data.sql および call_logs.sql 適用済み
-- =============================================================

-- -------------------------------------------------------------
-- 1. stores  （読み取り専用: 管理者のみ変更想定）
-- -------------------------------------------------------------
alter table public.stores enable row level security;

create policy "stores authenticated read"
  on public.stores for select
  to authenticated using (true);

-- -------------------------------------------------------------
-- 2. cast_ranks
-- -------------------------------------------------------------
alter table public.cast_ranks enable row level security;

create policy "cast_ranks authenticated read"
  on public.cast_ranks for select
  to authenticated using (true);

create policy "cast_ranks authenticated write"
  on public.cast_ranks for all
  to authenticated using (true);

-- -------------------------------------------------------------
-- 3. option_groups
-- -------------------------------------------------------------
alter table public.option_groups enable row level security;

create policy "option_groups authenticated read"
  on public.option_groups for select
  to authenticated using (true);

create policy "option_groups authenticated write"
  on public.option_groups for all
  to authenticated using (true);

-- -------------------------------------------------------------
-- 4. option_items
-- -------------------------------------------------------------
alter table public.option_items enable row level security;

create policy "option_items authenticated read"
  on public.option_items for select
  to authenticated using (true);

create policy "option_items authenticated write"
  on public.option_items for all
  to authenticated using (true);

-- -------------------------------------------------------------
-- 5. option_item_rank_prices
-- -------------------------------------------------------------
alter table public.option_item_rank_prices enable row level security;

create policy "option_item_rank_prices authenticated read"
  on public.option_item_rank_prices for select
  to authenticated using (true);

create policy "option_item_rank_prices authenticated write"
  on public.option_item_rank_prices for all
  to authenticated using (true);

-- -------------------------------------------------------------
-- 6. ladies
-- -------------------------------------------------------------
alter table public.ladies enable row level security;

create policy "ladies authenticated read"
  on public.ladies for select
  to authenticated using (true);

create policy "ladies authenticated write"
  on public.ladies for all
  to authenticated using (true);

-- -------------------------------------------------------------
-- 7. staff
-- -------------------------------------------------------------
alter table public.staff enable row level security;

create policy "staff authenticated read"
  on public.staff for select
  to authenticated using (true);

-- -------------------------------------------------------------
-- 8. customers
-- -------------------------------------------------------------
alter table public.customers enable row level security;

create policy "customers authenticated read"
  on public.customers for select
  to authenticated using (true);

create policy "customers authenticated write"
  on public.customers for all
  to authenticated using (true);

-- -------------------------------------------------------------
-- 9. reservations
-- -------------------------------------------------------------
alter table public.reservations enable row level security;

create policy "reservations authenticated read"
  on public.reservations for select
  to authenticated using (true);

create policy "reservations authenticated write"
  on public.reservations for all
  to authenticated using (true);

-- -------------------------------------------------------------
-- 10. call_logs  （既存ポリシーを同パターンに統一）
--     元のポリシー: select と update のみ定義。insert/delete が漏れているため置換。
-- -------------------------------------------------------------
drop policy if exists "staff can read call_logs"   on public.call_logs;
drop policy if exists "staff can update call_logs" on public.call_logs;

-- RLS はすでに enable 済みだが冪等に再実行
alter table public.call_logs enable row level security;

create policy "call_logs authenticated read"
  on public.call_logs for select
  to authenticated using (true);

create policy "call_logs authenticated write"
  on public.call_logs for all
  to authenticated using (true);

-- -------------------------------------------------------------
-- 11. shift_form_fields / shift_field_options / resv_form_fields
--     現時点では未作成のため、テーブルが存在する場合のみ適用する。
--     各テーブルが追加された際は下記コメントを外して実行すること。
-- -------------------------------------------------------------

-- alter table public.shift_form_fields enable row level security;
-- create policy "shift_form_fields authenticated read"
--   on public.shift_form_fields for select to authenticated using (true);
-- create policy "shift_form_fields authenticated write"
--   on public.shift_form_fields for all to authenticated using (true);

-- alter table public.shift_field_options enable row level security;
-- create policy "shift_field_options authenticated read"
--   on public.shift_field_options for select to authenticated using (true);
-- create policy "shift_field_options authenticated write"
--   on public.shift_field_options for all to authenticated using (true);

-- alter table public.resv_form_fields enable row level security;
-- create policy "resv_form_fields authenticated read"
--   on public.resv_form_fields for select to authenticated using (true);
-- create policy "resv_form_fields authenticated write"
--   on public.resv_form_fields for all to authenticated using (true);
