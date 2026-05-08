-- ============================================================
-- RLS Phase 2: 店舗スコープ + ロール制御
-- 前提: 20260502_rls_policies.sql 適用済み
--       staff テーブルに email / default_store_id / is_active が存在すること
-- ============================================================

-- ------------------------------------------------------------
-- 0. staff.role カラム追加（まだなければ）
--    一般スタッフ: 'staff'  / 店舗管理者: 'manager' / システム管理: 'admin'
-- ------------------------------------------------------------
alter table public.staff
  add column if not exists role text not null default 'staff';

-- ------------------------------------------------------------
-- 1. Security definer ヘルパー関数
--    ポリシー内で staff テーブルを直接参照すると再帰RLSのリスクがあるため
--    security definer + search_path 固定で安全に取得する。
-- ------------------------------------------------------------

-- 現在ログインユーザーの default_store_id を返す
create or replace function public.my_store_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select default_store_id
    from public.staff
   where email      = auth.jwt() ->> 'email'
     and is_active  = true
   limit 1;
$$;

-- 現在ログインユーザーのロールを返す
create or replace function public.my_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce(role, 'staff')
    from public.staff
   where email     = auth.jwt() ->> 'email'
     and is_active = true
   limit 1;
$$;

-- ------------------------------------------------------------
-- 2. reservations: 店舗スコープ
-- ------------------------------------------------------------
drop policy if exists "reservations authenticated read"  on public.reservations;
drop policy if exists "reservations authenticated write" on public.reservations;

-- 読み取り: 自店舗の予約のみ
create policy "reservations store read"
  on public.reservations for select
  to authenticated
  using (store_id = my_store_id());

-- 書き込み: 自店舗の予約のみ（manager / admin なら全店舗）
create policy "reservations store write"
  on public.reservations for all
  to authenticated
  using (
    store_id = my_store_id()
    or my_role() in ('manager', 'admin')
  )
  with check (
    store_id = my_store_id()
    or my_role() in ('manager', 'admin')
  );

-- ------------------------------------------------------------
-- 3. call_logs: 店舗スコープ
-- ------------------------------------------------------------
drop policy if exists "call_logs authenticated read"  on public.call_logs;
drop policy if exists "call_logs authenticated write" on public.call_logs;

-- 読み取り: 自店舗 or store_id が null（twilio_number 未設定時の後退動作）
create policy "call_logs store read"
  on public.call_logs for select
  to authenticated
  using (
    store_id = my_store_id()
    or store_id is null
    or my_role() in ('manager', 'admin')
  );

-- 書き込み: 同上
create policy "call_logs store write"
  on public.call_logs for all
  to authenticated
  using (
    store_id = my_store_id()
    or store_id is null
    or my_role() in ('manager', 'admin')
  )
  with check (
    store_id = my_store_id()
    or store_id is null
    or my_role() in ('manager', 'admin')
  );

-- ------------------------------------------------------------
-- 4. ladies: 店舗スコープ
-- ------------------------------------------------------------
drop policy if exists "ladies authenticated read"  on public.ladies;
drop policy if exists "ladies authenticated write" on public.ladies;

-- 読み取り: 自店舗のキャストのみ
create policy "ladies store read"
  on public.ladies for select
  to authenticated
  using (store_id = my_store_id() or my_role() in ('manager', 'admin'));

-- 書き込み: manager / admin のみキャスト本体を変更可（一般スタッフは読み取りのみ）
create policy "ladies manager write"
  on public.ladies for all
  to authenticated
  using  (my_role() in ('manager', 'admin'))
  with check (my_role() in ('manager', 'admin'));

-- ------------------------------------------------------------
-- 5. shifts: 店舗スコープ（ladies.store_id 経由）
--    shifts テーブルに store_id がなければ lady_id → ladies.store_id で判断
-- ------------------------------------------------------------
-- shifts の RLS が未設定の場合は有効化する
do $$
begin
  -- テーブルが存在する場合のみ実行
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'shifts') then
    execute 'alter table public.shifts enable row level security';
    -- 既存ポリシーをリセット
    execute 'drop policy if exists "shifts authenticated read"  on public.shifts';
    execute 'drop policy if exists "shifts authenticated write" on public.shifts';
    execute 'create policy "shifts store read" on public.shifts for select to authenticated
      using (
        exists (
          select 1 from public.ladies l
           where l.id = shifts.lady_id
             and (l.store_id = my_store_id() or my_role() in (''manager'', ''admin''))
        )
      )';
    execute 'create policy "shifts manager write" on public.shifts for all to authenticated
      using  (my_role() in (''manager'', ''admin''))
      with check (my_role() in (''manager'', ''admin''))';
  end if;
end $$;

-- ------------------------------------------------------------
-- 6. マスタ系: manager / admin のみ書き込み可
--    (cast_ranks / option_groups / option_items / option_item_rank_prices)
-- ------------------------------------------------------------
drop policy if exists "cast_ranks authenticated write"          on public.cast_ranks;
drop policy if exists "option_groups authenticated write"       on public.option_groups;
drop policy if exists "option_items authenticated write"        on public.option_items;
drop policy if exists "option_item_rank_prices authenticated write" on public.option_item_rank_prices;

create policy "cast_ranks manager write"
  on public.cast_ranks for all
  to authenticated
  using  (my_role() in ('manager', 'admin'))
  with check (my_role() in ('manager', 'admin'));

create policy "option_groups manager write"
  on public.option_groups for all
  to authenticated
  using  (my_role() in ('manager', 'admin'))
  with check (my_role() in ('manager', 'admin'));

create policy "option_items manager write"
  on public.option_items for all
  to authenticated
  using  (my_role() in ('manager', 'admin'))
  with check (my_role() in ('manager', 'admin'));

create policy "option_item_rank_prices manager write"
  on public.option_item_rank_prices for all
  to authenticated
  using  (my_role() in ('manager', 'admin'))
  with check (my_role() in ('manager', 'admin'));

-- ------------------------------------------------------------
-- 7. customers: 店舗間共有（全スタッフ読み取り可）
--    更新 / 削除は全スタッフ可（要注意メモ等を書ける必要がある）
--    削除のみ manager 以上に制限する
-- ------------------------------------------------------------
drop policy if exists "customers authenticated read"  on public.customers;
drop policy if exists "customers authenticated write" on public.customers;

create policy "customers read"
  on public.customers for select
  to authenticated
  using (true);

create policy "customers insert update"
  on public.customers for insert
  to authenticated
  with check (true);

create policy "customers update patch"
  on public.customers for update
  to authenticated
  using (true)
  with check (true);

-- 削除は manager 以上のみ
create policy "customers manager delete"
  on public.customers for delete
  to authenticated
  using (my_role() in ('manager', 'admin'));

-- ------------------------------------------------------------
-- 8. staff: 自分の行のみ読める（管理者は全員見える）
-- ------------------------------------------------------------
drop policy if exists "staff authenticated read" on public.staff;

create policy "staff self or admin read"
  on public.staff for select
  to authenticated
  using (
    email = auth.jwt() ->> 'email'
    or my_role() in ('manager', 'admin')
  );

-- ------------------------------------------------------------
-- 9. stores: 全員読み取り可 / admin のみ変更可
-- ------------------------------------------------------------
drop policy if exists "stores authenticated read" on public.stores;

create policy "stores read"
  on public.stores for select
  to authenticated
  using (true);

create policy "stores admin write"
  on public.stores for all
  to authenticated
  using  (my_role() = 'admin')
  with check (my_role() = 'admin');
