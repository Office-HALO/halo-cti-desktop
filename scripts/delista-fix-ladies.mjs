#!/usr/bin/env node
/**
 * DELISTA 予約の lady_id 補完スクリプト
 * - CSV を再読み込みして receipt_no → キャスト名 マップを構築
 * - DB の ladies テーブルと改良マッチング（括弧前後・エイリアス対応）
 * - UPDATE reservations SET lady_id = ... WHERE receipt_no LIKE 'DELISTA-%' AND lady_id IS NULL
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

const C_NO   = 0;
const C_LADY = 9;

// ── CSVパース ──────────────────────────────────────────────────────────────────

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

// ── マッチングキー生成 ─────────────────────────────────────────────────────────
// DB名 "上原歩(樋口まや)" → ["上原歩樋口まや", "上原歩", "樋口まや"]
// DB名 "三上 真珠" → ["三上真珠"]
// CSV名 "上原歩" → ["上原歩"] → "上原歩" でヒット

function makeKeys(name) {
  if (!name) return [];
  const base = name.trim();
  const keys = new Set();

  // 1. 全部スラッシュ: スペース・数字・ハイフン・括弧を除去
  keys.add(base.replace(/[\s　\d\-－（）()【】]/g, ''));

  // 2. 括弧の前だけ
  const beforeParen = base.split(/[（(【]/)[0].trim();
  if (beforeParen) keys.add(beforeParen.replace(/[\s　\d\-－]/g, ''));

  // 3. 括弧の中（エイリアス）
  const m = base.match(/[（(【]([^）)】]+)[）)】]/);
  if (m) keys.add(m[1].replace(/[\s　\d\-－]/g, ''));

  // 4. スペースで分割して最初の単語
  const firstWord = base.split(/[\s　]/)[0];
  if (firstWord && firstWord.length >= 2) keys.add(firstWord.replace(/[\d\-－]/g, ''));

  return [...keys].filter(k => k.length >= 2);
}

// ── メイン ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎭 DELISTA キャスト名 補完スクリプト\n');

  // 1. DB の ladies を取得してマルチキーインデックス
  console.log('📡 キャスト一覧取得中...');
  const { data: ladies } = await supabase.from('ladies').select('id, display_name, name');
  const ladyByKey = new Map(); // key → { id, display_name }
  for (const l of (ladies || [])) {
    for (const k of makeKeys(l.display_name || l.name)) {
      if (!ladyByKey.has(k)) ladyByKey.set(k, l);
    }
  }
  console.log(`   ${ladies?.length ?? 0}名 / ${ladyByKey.size}キーでインデックス済み\n`);

  // 2. CSV 読み込み → receipt_no → キャスト名 マップ
  console.log('📂 CSV 解析中...');
  const csvFiles = readdirSync(MIGRATION_DATA_DIR)
    .filter(f => f.endsWith('.csv') && f.includes('受付履歴'))
    .sort()
    .map(f => resolve(MIGRATION_DATA_DIR, f));

  const castByReceiptNo = new Map(); // "DELISTA-12345" → raw cast name
  const seen = new Set();
  for (const file of csvFiles) {
    const rows = readCSV(file);
    console.log(`   ${file.split('/').pop()}: ${rows.length}行`);
    for (const row of rows) {
      const no = row[C_NO];
      if (!no || seen.has(no)) continue;
      seen.add(no);
      const ladyName = row[C_LADY]?.trim();
      if (ladyName) castByReceiptNo.set(`DELISTA-${no}`, ladyName);
    }
  }
  console.log(`   ${castByReceiptNo.size}件のキャスト名マップ構築完了\n`);

  // 3. DELISTA で lady_id が null のものを取得
  console.log('📡 lady_id=null の DELISTA 予約を取得中...');
  let page = 0;
  const nullLadyResv = [];
  while (true) {
    const { data } = await supabase
      .from('reservations')
      .select('id, receipt_no')
      .like('receipt_no', 'DELISTA-%')
      .is('lady_id', null)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data?.length) break;
    nullLadyResv.push(...data);
    page++;
  }
  console.log(`   ${nullLadyResv.length}件\n`);

  // 4. マッチング & UPDATE
  console.log('🔍 マッチング & UPDATE中...');
  let matched = 0;
  let noMatch = 0;
  const noMatchNames = new Map();
  const updates = []; // { id, lady_id }

  for (const resv of nullLadyResv) {
    const rawName = castByReceiptNo.get(resv.receipt_no);
    if (!rawName) { noMatch++; continue; }

    let foundLady = null;
    for (const k of makeKeys(rawName)) {
      if (ladyByKey.has(k)) { foundLady = ladyByKey.get(k); break; }
    }

    if (foundLady) {
      updates.push({ id: resv.id, lady_id: foundLady.id });
      matched++;
    } else {
      noMatch++;
      noMatchNames.set(rawName, (noMatchNames.get(rawName) || 0) + 1);
    }
  }

  console.log(`   マッチ: ${matched}件 / 未照合: ${noMatch}件\n`);

  // 5. lady_id ごとにグループ化して IN フィルタで UPDATE
  if (updates.length > 0) {
    // lady_id → [id, ...] のグループ化
    const byLady = new Map();
    for (const { id, lady_id } of updates) {
      if (!byLady.has(lady_id)) byLady.set(lady_id, []);
      byLady.get(lady_id).push(id);
    }
    console.log(`📥 UPDATE中... (${byLady.size}キャスト / ${updates.length}件)`);
    let updatedCount = 0;
    let apiCount = 0;
    const CHUNK = 500;
    for (const [ladyId, ids] of byLady) {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { error, count } = await supabase
          .from('reservations')
          .update({ lady_id: ladyId })
          .in('id', chunk)
          .select('id', { count: 'exact', head: true });
        if (error) console.error('  エラー:', error.message);
        else updatedCount += chunk.length;
        apiCount++;
      }
      process.stdout.write(`\r   ${apiCount}API / ${updatedCount}件更新済み`);
    }
    console.log(`\n   完了: ${updatedCount}件更新\n`);
  }

  // 6. 未照合キャスト名トップ20
  if (noMatchNames.size > 0) {
    console.log(`⚠️  未照合キャスト名 TOP20:`);
    [...noMatchNames.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .forEach(([name, cnt]) => console.log(`   ${cnt}件: ${name}`));
  }

  // 7. 最終確認
  const { count: stillNull } = await supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .like('receipt_no', 'DELISTA-%')
    .is('lady_id', null);
  console.log(`\n📊 残 lady_id=null: ${stillNull}件`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ 完了');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
