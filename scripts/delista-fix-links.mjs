#!/usr/bin/env node
/**
 * デリスタ移行補完: customer_id が null の予約に顧客IDを紐付ける
 * 顧客IDごとにINでまとめてUPDATE → API呼び出しを最小化
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_DATA_DIR = resolve(__dirname, 'migration-data');

const SUPABASE_URL = 'https://dkjfrywfhgdrkumafamj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRramZyeXdmaGdkcmt1bWFmYW1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MDU5ODksImV4cCI6MjA5MDA4MTk4OX0.b2lh8irUBGFNBhupXmajRTCEzdeGRyLMxD0nFXkZFEA';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const C_NO    = 0;
const C_PHONE = 19;

function normalizePhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9+]/g, '');
  if (digits.startsWith('+81')) return digits;
  if (digits.startsWith('0')) return '+81' + digits.slice(1);
  return digits;
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let inQuote = false, current = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = !inQuote;
      } else if (c === ',' && !inQuote) { row.push(current.trim()); current = ''; }
      else current += c;
    }
    row.push(current.trim());
    result.push(row);
  }
  return result;
}

function readCSV(filePath) {
  const utf8 = execSync(`iconv -c -f SHIFT-JIS -t UTF-8 "${filePath}"`, { maxBuffer: 64 * 1024 * 1024 }).toString();
  return parseCsv(utf8).slice(1).filter(r => r.length > 10);
}

async function main() {
  console.log('\n🔗 デリスタ予約 customer_id 紐付け補完\n');

  // 1. 全顧客をphone_normalizedでインデックス化（ページネーションで全件取得）
  console.log('📡 顧客データ取得中...');
  const custByPhone = new Map();
  let page = 0;
  while (true) {
    const { data: chunk } = await supabase
      .from('customers')
      .select('id, phone_normalized')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!chunk?.length) break;
    for (const c of chunk) {
      if (c.phone_normalized) custByPhone.set(c.phone_normalized, c.id);
    }
    page++;
  }
  console.log(`   ${custByPhone.size}件ロード（${page}ページ）\n`);

  // 2. CSVから customer_id → [receipt_no...] のマップを構築
  console.log('📂 CSVを解析中...');
  const csvFiles = readdirSync(MIGRATION_DATA_DIR)
    .filter(f => f.endsWith('.csv') && f.includes('受付履歴'))
    .sort()
    .map(f => resolve(MIGRATION_DATA_DIR, f));

  // customer_id → receipt_nos のグループ化
  const byCustomer = new Map(); // customer_id → Set<receipt_no>
  const seen = new Set();

  for (const file of csvFiles) {
    const rows = readCSV(file);
    console.log(`   ${file.split('/').pop()}: ${rows.length}行`);
    for (const row of rows) {
      const no = row[C_NO];
      if (!no || seen.has(no)) continue;
      seen.add(no);
      const phone = normalizePhone(row[C_PHONE]);
      if (!phone || !custByPhone.has(phone)) continue;
      const custId = custByPhone.get(phone);
      const receiptNo = `DELISTA-${no}`;
      if (!byCustomer.has(custId)) byCustomer.set(custId, []);
      byCustomer.get(custId).push(receiptNo);
    }
  }

  const totalLinks = [...byCustomer.values()].reduce((s, a) => s + a.length, 0);
  console.log(`\n   ユニーク顧客: ${byCustomer.size}件`);
  console.log(`   紐付け対象予約: ${totalLinks}件\n`);

  // 3. 顧客ごとにINフィルタでまとめてUPDATE
  console.log(`📥 UPDATE中... (${byCustomer.size}回のAPI呼び出し)`);
  let updatedResv = 0;
  let apiCount = 0;
  const errors = [];

  for (const [custId, receiptNos] of byCustomer) {
    // receipt_nosが多い場合は500件ずつに分割
    for (let i = 0; i < receiptNos.length; i += 500) {
      const chunk = receiptNos.slice(i, i + 500);
      const { error, count } = await supabase
        .from('reservations')
        .update({ customer_id: custId })
        .in('receipt_no', chunk)
        .is('customer_id', null)
        .select('id', { count: 'exact', head: true });
      if (error) errors.push(error.message);
      else updatedResv += count ?? 0;
      apiCount++;
    }
    if (apiCount % 100 === 0) {
      process.stdout.write(`\r   ${apiCount}/${byCustomer.size}件処理... (予約${updatedResv}件更新済み)`);
    }
  }

  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ 完了`);
  console.log(`   予約 customer_id 更新: ${updatedResv}件`);
  console.log(`   API呼び出し: ${apiCount}回`);
  if (errors.length) {
    console.log(`❌ エラー: ${errors.length}件`);
    errors.slice(0, 5).forEach(e => console.log('  ', e));
  }

  // 最終確認
  const { count: stillNull } = await supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .like('receipt_no', 'DELISTA-%')
    .is('customer_id', null);
  console.log(`\n📊 残null件数: ${stillNull}件`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
