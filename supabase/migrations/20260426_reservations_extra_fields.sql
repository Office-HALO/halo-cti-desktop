-- 予約フォーム追加フィールド
alter table public.reservations
  add column if not exists first_media    text,          -- 初回媒体
  add column if not exists cancel_type    text,          -- キャンセル区分
  add column if not exists lady_status    text,          -- 女子状況
  add column if not exists send_driver    text,          -- 送りドライバー名
  add column if not exists receive_driver text,          -- 迎えドライバー名
  add column if not exists receipt_no     text,          -- 受領番号
  add column if not exists updated_by     uuid references public.staff(id);  -- 最終更新者
