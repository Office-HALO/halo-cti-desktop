#!/usr/bin/env node
/**
 * デリスタ CTI 受付履歴 CSV → HALO CTI 予約データ移行スクリプト（バッチ版）
 *
 * 使い方:
 *   node scripts/delista-migration.mjs [--dry-run]
 *
 * --dry-run: Supabase への書き込みをスキップ（確認用）
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_DATA_DIR = resolve(__dirname, 'migration-data');
const BATCH_SIZE = 200; // 一度に挿入するレコード数

const SUPABASE_URL = 'https://dkjfrywfhgdrkumafamj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRramZyeXdmaGdkcmt1bWFmYW1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MDU5ODksImV4cCI6MjA5MDA4MTk4OX0.b2lh8irUBGFNBhupXmajRTCEzdeGRyLMxD0nFXkZFEA';

const DRY_RUN = process.argv.includes('--dry-run');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── カラム定義（0-indexed） ───────────────────────────────────────────────────
const C = {
  NO:         0,   // 受付番号
  STATUS:     2,   // 確定フラグ
  START:      4,   // 開始日時
  END:        5,   // 終了日時
  LADY:       9,   // コンパニオン名
  NOM_TEXT:  13,   // 指名（テキスト）
  HOTEL:     17,   // 場所/ホテル
  ROOM:      18,   // 部屋番号
  PHONE:     19,   // 電話番号
  MEMBER_NO: 20,   // 会員番号
  CUST_NAME: 22,   // 顧客名
  MEDIA:     26,   // 媒体
  COURSE:    28,   // コース（テキスト）
  EXT_TEXT:  30,   // 延長（テキスト）
  OPT_TEXT:  32,   // オプション名
  CARD:      38,   // カード利用
  BASE_PRICE:39,   // 基本料金
  EXT_PRICE: 40,   // 延長料金
  NOM_PRICE: 41,   // 指名料金
  OPT_PRICE: 42,   // オプション料金
  TRANSPORT: 43,   // 交通費
  DISCOUNT:  44,   // 割引
  TOTAL:     45,   // 合計
  BASE_BACK: 50,   // 基本バック
  EXT_BACK:  51,   // 延長バック
  NOM_BACK:  52,   // 指名バック
  OPT_BACK:  53,   // オプションバック
  CAST_PAY:  59,   // 給料計
  SEND:      64,   // 送りドライバー
  RECV:      66,   // 迎えドライバー
  MEMO:      69,   // メモ
};

// ── ユーティリティ ───────────────────────────────────────────────────────────

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
      } else if (c === ',' && !inQuote) {
        row.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
    row.push(current.trim());
    result.push(row);
  }
  return result;
}

function readDelistaCSV(filePath) {
  const utf8 = execSync(`iconv -c -f SHIFT-JIS -t UTF-8 "${filePath}"`, { maxBuffer: 64 * 1024 * 1024 }).toString();
  const rows = parseCsv(utf8);
  return rows.slice(1).filter(r => r.length > 10);
}

function ladyKey(name) {
  return (name || '').replace(/[\s　\d\-（）()]/g, '');
}

function toInt(s) {
  if (!s) return null;
  const n = parseInt(String(s).replace(/,/g, ''), 10);
  return isNaN(n) ? null : n;
}

function parseDuration(course) {
  const m = (course || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** 配列をchunkに分割 */
function chunks(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

/** バッチ挿入（エラーを収集して続行） */
async function batchInsert(table, rows, errors) {
  let inserted = 0;
  for (const chunk of chunks(rows, BATCH_SIZE)) {
    const { data, error } = await supabase.from(table).insert(chunk).select('id');
    if (error) {
      errors.push(`${table} batch insert error: ${error.message}`);
    } else {
      inserted += data?.length ?? 0;
    }
  }
  return inserted;
}

// ── メイン ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 デリスタ → HALO 移行スクリプト（バッチ版）${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  // 1. CSVファイル収集
  const csvFiles = readdirSync(MIGRATION_DATA_DIR)
    .filter(f => f.endsWith('.csv') && f.includes('受付履歴'))
    .sort()
    .map(f => resolve(MIGRATION_DATA_DIR, f));

  if (csvFiles.length === 0) {
    console.error('❌ migration-data/ に 受付履歴*.csv が見つかりません');
    process.exit(1);
  }

  let allRows = [];
  for (const file of csvFiles) {
    const rows = readDelistaCSV(file);
    console.log(`📂 ${file.split('/').pop()}: ${rows.length}行`);
    allRows.push(...rows);
  }

  // 受付番号で重複除去
  const seenNos = new Set();
  allRows = allRows.filter(r => {
    const no = r[C.NO];
    if (!no || seenNos.has(no)) return false;
    seenNos.add(no);
    return true;
  });
  // 確定済みのみ
  allRows = allRows.filter(r => r[C.STATUS] === '確定' && r[C.START]);
  console.log(`📊 重複除去・確定済み絞り込み後: ${allRows.length}件\n`);

  // 2. Supabase マスターデータ取得
  console.log('📡 Supabase からデータ取得中...');
  const [
    { data: storeRow },
    { data: customers },
    { data: ladies },
    { data: existingResv },
  ] = await Promise.all([
    supabase.from('stores').select('id').eq('code', 'KRO').single(),
    supabase.from('customers').select('id, phone_normalized, name, member_no'),
    supabase.from('ladies').select('id, display_name, name'),
    supabase.from('reservations').select('receipt_no').like('receipt_no', 'DELISTA-%'),
  ]);

  if (!storeRow) { console.error('❌ KROストアが見つかりません'); process.exit(1); }
  const storeId = storeRow.id;

  const custByPhone = new Map();
  for (const c of (customers || [])) {
    if (c.phone_normalized) custByPhone.set(c.phone_normalized, c);
  }
  const ladyByKey = new Map();
  for (const l of (ladies || [])) {
    const k = ladyKey(l.display_name || l.name);
    if (k) ladyByKey.set(k, l);
  }
  const existingNos = new Set((existingResv || []).map(r => r.receipt_no));

  console.log(`   既存顧客: ${customers?.length ?? 0}件`);
  console.log(`   キャスト: ${ladies?.length ?? 0}件`);
  console.log(`   既存デリスタ予約: ${existingNos.size}件`);

  // 3. 対象行の絞り込み
  const targetRows = allRows.filter(r => !existingNos.has(`DELISTA-${r[C.NO]}`));
  console.log(`\n📋 新規挿入対象: ${targetRows.length}件\n`);

  const errors = [];

  // 4. 新規顧客の一括作成（ユニーク電話番号ごとに1件）
  console.log('👤 新規顧客を収集中...');
  const newCustMap = new Map(); // phone_normalized → { phone, name, member_no }
  for (const row of targetRows) {
    const rawPhone  = row[C.PHONE];
    const phoneNorm = normalizePhone(rawPhone);
    if (!phoneNorm) continue;
    if (custByPhone.has(phoneNorm)) continue;
    if (newCustMap.has(phoneNorm)) continue;
    newCustMap.set(phoneNorm, {
      phone:     rawPhone,
      name:      row[C.CUST_NAME]?.trim() || '不明',
      member_no: row[C.MEMBER_NO] || null,
    });
  }

  console.log(`   新規顧客: ${newCustMap.size}件`);
  if (!DRY_RUN && newCustMap.size > 0) {
    console.log('   Supabase に一括登録中...');
    const newCustRows = [...newCustMap.values()];
    let totalCustInserted = 0;
    const custChunks = chunks(newCustRows, BATCH_SIZE);
    for (let i = 0; i < custChunks.length; i++) {
      const { data, error } = await supabase
        .from('customers')
        .insert(custChunks[i])
        .select('id, phone_normalized');
      if (error) {
        errors.push(`顧客バッチ挿入エラー: ${error.message}`);
      } else if (data) {
        for (const c of data) {
          custByPhone.set(c.phone_normalized, c);
          totalCustInserted++;
        }
      }
      process.stdout.write(`\r   顧客登録: ${Math.min((i + 1) * BATCH_SIZE, newCustRows.length)} / ${newCustRows.length}件`);
    }
    console.log(`\n   完了: ${totalCustInserted}件登録\n`);
  }

  // 5. 予約レコード構築
  console.log('📝 予約レコードを構築中...');
  const resvRows = [];
  const noMatchLadies = new Map();

  for (const row of targetRows) {
    const receiptNo = `DELISTA-${row[C.NO]}`;

    const [datePart, timePart] = row[C.START].split(' ');
    const reservedDate = datePart.replace(/\//g, '-');
    const startTime   = (timePart || '00:00').slice(0, 5);
    const endRaw      = row[C.END];
    const endTime     = endRaw ? endRaw.split(' ')[1]?.slice(0, 5) : null;

    const phoneNorm = normalizePhone(row[C.PHONE]);
    const customerId = phoneNorm && custByPhone.has(phoneNorm)
      ? custByPhone.get(phoneNorm).id : null;

    const lKey   = ladyKey(row[C.LADY]?.trim() || '');
    const ladyId = lKey && ladyByKey.has(lKey) ? ladyByKey.get(lKey).id : null;
    if (lKey && !ladyId) noMatchLadies.set(row[C.LADY], (noMatchLadies.get(row[C.LADY]) || 0) + 1);

    // selected_items
    const items = [];
    if (row[C.COURSE]) items.push({
      item_id: null, group_id: null, kind: 'course',
      name: row[C.COURSE], amount: toInt(row[C.BASE_PRICE]) ?? 0, reward: toInt(row[C.BASE_BACK]) ?? 0,
    });
    if (row[C.EXT_TEXT]) items.push({
      item_id: null, group_id: null, kind: 'extension',
      name: row[C.EXT_TEXT], amount: toInt(row[C.EXT_PRICE]) ?? 0, reward: toInt(row[C.EXT_BACK]) ?? 0,
    });
    if (row[C.NOM_TEXT]) items.push({
      item_id: null, group_id: null, kind: 'nomination',
      name: row[C.NOM_TEXT], amount: toInt(row[C.NOM_PRICE]) ?? 0, reward: toInt(row[C.NOM_BACK]) ?? 0,
    });
    if (row[C.OPT_TEXT] && toInt(row[C.OPT_PRICE])) items.push({
      item_id: null, group_id: null, kind: 'option',
      name: row[C.OPT_TEXT], amount: toInt(row[C.OPT_PRICE]) ?? 0, reward: toInt(row[C.OPT_BACK]) ?? 0,
    });

    const cardFlag = row[C.CARD]?.trim();
    const paymentMethod = (cardFlag === 'Y' || cardFlag === 'カード') ? 'card' : 'cash';

    const totalFromCol = toInt(row[C.TOTAL]);
    const amount = totalFromCol !== null ? totalFromCol
      : (toInt(row[C.BASE_PRICE]) || 0) + (toInt(row[C.EXT_PRICE]) || 0)
        + (toInt(row[C.NOM_PRICE]) || 0) + (toInt(row[C.OPT_PRICE]) || 0)
        + (toInt(row[C.TRANSPORT]) || 0);

    resvRows.push({
      store_id:       storeId,
      customer_id:    customerId,
      lady_id:        ladyId,
      reserved_date:  reservedDate,
      start_time:     startTime,
      end_time:       endTime,
      duration_min:   parseDuration(row[C.COURSE]),
      status:         'confirmed',
      course:         row[C.COURSE]  || null,
      hotel:          row[C.HOTEL]   || null,
      room_no:        row[C.ROOM]    || null,
      amount:         amount || null,
      cast_reward:    toInt(row[C.CAST_PAY]),
      payment_method: paymentMethod,
      send_driver:    row[C.SEND]?.trim().replace(/^-+$/, '') || null,
      receive_driver: row[C.RECV]?.trim().replace(/^-+$/, '') || null,
      memo:           row[C.MEMO]    || null,
      selected_items: items,
      receipt_no:     receiptNo,
      first_media:    row[C.MEDIA]   || null,
    });
  }
  console.log(`   構築完了: ${resvRows.length}件\n`);

  // 6. 予約の一括挿入
  if (DRY_RUN) {
    console.log('SAMPLE RECORD:', JSON.stringify(resvRows[0], null, 2));
  } else {
    console.log(`📥 予約を一括挿入中... (${Math.ceil(resvRows.length / BATCH_SIZE)}バッチ)`);
    let inserted = 0;
    const resvChunks = chunks(resvRows, BATCH_SIZE);
    for (let i = 0; i < resvChunks.length; i++) {
      const { data, error } = await supabase.from('reservations').insert(resvChunks[i]).select('id');
      if (error) {
        errors.push(`予約バッチ ${i + 1} エラー: ${error.message}`);
      } else {
        inserted += data?.length ?? 0;
      }
      const pct = Math.round(((i + 1) / resvChunks.length) * 100);
      process.stdout.write(`\r   進捗: ${pct}% (${inserted}件完了)`);
    }
    console.log(`\n   挿入完了: ${inserted}件\n`);
  }

  // 7. 結果サマリー
  console.log('━'.repeat(50));
  console.log(`✅ ${DRY_RUN ? '(dry-run) ' : ''}完了`);
  console.log(`   予約: ${resvRows.length}件 処理`);
  console.log(`   新規顧客: ${newCustMap.size}件`);
  console.log(`   スキップ: ${existingNos.size}件（既存）`);

  if (noMatchLadies.size > 0) {
    console.log(`\n⚠️  キャスト未照合: ${noMatchLadies.size}名（退店済み等）`);
  }
  if (errors.length > 0) {
    console.log(`\n❌ エラー (${errors.length}件):`);
    errors.forEach(e => console.log('  ', e));
  }

  // 8. 顧客統計を更新（total_visits / first_visit_date / last_visit_date）
  if (!DRY_RUN && resvRows.length > 0) {
    console.log('\n🔄 顧客統計を更新中...');
    const { error: statErr } = await supabase.rpc('exec_sql', {
      sql: `
        UPDATE customers c SET
          total_visits     = sub.cnt,
          total_spent      = sub.spent,
          first_visit_date = sub.first_date,
          last_visit_date  = sub.last_date
        FROM (
          SELECT customer_id,
            COUNT(*)                  AS cnt,
            COALESCE(SUM(amount), 0)  AS spent,
            MIN(reserved_date)        AS first_date,
            MAX(reserved_date)        AS last_date
          FROM reservations
          WHERE customer_id IS NOT NULL AND status = 'confirmed'
          GROUP BY customer_id
        ) sub
        WHERE c.id = sub.customer_id;
      `
    });
    if (statErr) console.log('   (統計更新スキップ — 顧客画面でリロードしてください)');
    else console.log('   完了');
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
