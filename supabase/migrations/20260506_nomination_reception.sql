-- 指名区分・受付方法フィールドを予約テーブルに追加
alter table public.reservations
  add column if not exists nomination_type  text,   -- 指名区分 (free / honshi / type_nom / etc.)
  add column if not exists reception_method text;   -- 受付方法 (phone / walk_in / web / etc.)
