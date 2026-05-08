-- resv_form_fields: 予約フォームのフィールド表示設定
create table if not exists resv_form_fields (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references stores(id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type text not null default 'toggle',
  is_visible boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now()
);
create unique index if not exists resv_form_fields_store_key on resv_form_fields (store_id, field_key) where store_id is not null;
create unique index if not exists resv_form_fields_global_key on resv_form_fields (field_key) where store_id is null;

-- グローバルデフォルト（store_id = null）
insert into resv_form_fields (store_id, field_key, label, field_type, is_visible, sort_order) values
  (null, 'show_drivers',       '送り / 迎えドライバー', 'toggle', true,  1),
  (null, 'show_meeting_place', '集合場所',              'toggle', true,  2),
  (null, 'show_receipt_no',   '受付番号',              'toggle', true,  3)
on conflict do nothing;
