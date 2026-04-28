-- call_logs: Twilio着信ログ
create table if not exists public.call_logs (
  id              uuid primary key default gen_random_uuid(),
  call_sid        text unique,                          -- Twilio CallSid
  from_number     text not null,                        -- 発信者番号
  to_number       text,                                 -- 着信したTwilio番号
  started_at      timestamptz not null default now(),   -- 着信時刻
  status          text not null default 'ringing',      -- ringing / in-progress / completed / etc
  callback_status text not null default 'none',         -- none / pending / done
  memo            text,
  store_id        uuid references public.stores(id)
);

alter table public.call_logs enable row level security;

-- 認証済みスタッフは全行読み書き可
create policy "staff can read call_logs"
  on public.call_logs for select
  to authenticated using (true);

create policy "staff can update call_logs"
  on public.call_logs for update
  to authenticated using (true);

-- Realtime 有効化
alter publication supabase_realtime add table public.call_logs;
