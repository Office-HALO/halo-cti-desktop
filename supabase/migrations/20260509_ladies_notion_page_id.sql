-- ladies テーブルに Notion カルテページIDを追加
ALTER TABLE ladies ADD COLUMN IF NOT EXISTS notion_page_id TEXT;
