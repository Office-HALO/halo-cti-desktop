-- ============================================================
-- call_logs: 着信claim/ack フィールド追加
-- stores: Twilio番号カラム追加（店舗判別用）
-- ============================================================

-- stores: 店舗ごとのTwilio受信番号（to_numberとのマッチングに使う）
alter table public.stores
  add column if not exists twilio_number text;  -- 例: +819012345678

-- call_logs: 対応状態フィールド
alter table public.call_logs
  add column if not exists ui_status         text not null default 'ringing',
  -- ui_status 値: ringing / claimed / answered / hold / ended / missed
  add column if not exists assigned_staff_id uuid references public.staff(id),
  add column if not exists acknowledged_by   uuid references public.staff(id),
  add column if not exists acknowledged_at   timestamptz,
  add column if not exists ended_by          uuid references public.staff(id),
  add column if not exists ended_at          timestamptz;

-- Realtime でのUPDATE通知も受け取れるように（INSERTは既存）
-- 既存ポリシーは 20260502_rls_policies.sql で all になっているため追加不要
