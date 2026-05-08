#!/usr/bin/env node
/**
 * 削除済みキャスト名を復元して予約のlady_idを更新するスクリプト
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://dkjfrywfhgdrkumafamj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRramZyeXdmaGdkcmt1bWFmYW1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MDU5ODksImV4cCI6MjA5MDA4MTk4OX0.b2lh8irUBGFNBhupXmajRTCEzdeGRyLMxD0nFXkZFEA';

const STORE_ID   = '550e9df3-11fd-4d69-9e35-dc705a77bcab';
const STORE_CODE = 'KRO';
const DATA_DIR   = resolve(__dirname, 'migration-data');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function parseV2Time(timeVal) {
  const n = Number(timeVal);
  if (!n) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms + 9 * 60 * 60 * 1000); // JST
  const year  = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day   = String(d.getUTCDate()).padStart(2, '0');
  const hh    = String(d.getUTCHours()).padStart(2, '0');
  const mm    = String(d.getUTCMinutes()).padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hh}:${mm}:00`,
  };
}

function randomToken(n = 24) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({length: n}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function main() {
  console.log('📂 データ読み込み中...');

  const schedule   = JSON.parse(readFileSync(`${DATA_DIR}/v2-schedule-2016-01-01-2026-05-04.json`, 'utf8'));
  const idMap      = JSON.parse(readFileSync(`${DATA_DIR}/v2-id-map.json`, 'utf8'));
  const himeList   = JSON.parse(readFileSync(`${DATA_DIR}/v2-himelist.json`, 'utf8'));
  const deletedRaw = JSON.parse(readFileSync(`${DATA_DIR}/v2-deleted-himes.json`, 'utf8'));

  // 既知himeIdセット
  const knownHimeIds = new Set(himeList.map(h => h.id));

  // deletedItem: himeId → name
  const deletedMap = {};
  deletedRaw.forEach(item => {
    if (item.id.startsWith('2+')) deletedMap[item.id.slice(2)] = item.name;
  });

  // V2 userId → HALO customer UUID
  const v2ToHalo = idMap; // { "v2userId": "halo-uuid" }

  // 解決対象: 不明hime1 かつ deletedMapに存在する予約
  const targets = schedule.resvList.filter(r =>
    r.hime1 && !knownHimeIds.has(r.hime1) && deletedMap[r.hime1]
  );
  console.log(`✅ 復元対象予約: ${targets.length}件`);

  // ユニークなhimeIdセット
  const uniqueDeletedHimes = [...new Set(targets.map(r => r.hime1))];
  console.log(`💃 挿入するキャスト: ${uniqueDeletedHimes.length}名`);

  // ── Step 1: HALO ladiesに削除済みキャストを挿入 ──────────────────────
  console.log('\n👗 Step 1: 削除済みキャストをHALOに挿入...');

  // 既にinsert済みかチェック (V2-deleted- プレフィックスで管理)
  const { data: existingLadies } = await supabase
    .from('ladies')
    .select('id, name, login_token')
    .eq('store_code', STORE_CODE)
    .eq('is_active', false)
    .like('login_token', 'V2DEL-%');

  const existingByName = {};
  (existingLadies || []).forEach(l => { existingByName[l.name] = l.id; });

  const himeIdToLadyId = {};
  const toInsert = [];

  for (const himeId of uniqueDeletedHimes) {
    const name = deletedMap[himeId];
    if (existingByName[name]) {
      himeIdToLadyId[himeId] = existingByName[name];
    } else {
      toInsert.push({
        name,
        display_name: name,
        store_code:   STORE_CODE,
        store_id:     STORE_ID,
        is_active:    false,
        login_token:  `V2DEL-${himeId}`,
      });
    }
  }

  console.log(`  既存: ${Object.keys(existingByName).length}件, 新規挿入: ${toInsert.length}件`);

  if (toInsert.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const { data, error } = await supabase
        .from('ladies')
        .insert(batch)
        .select('id, name, login_token');
      if (error) {
        console.error('挿入エラー:', error.message);
        continue;
      }
      data.forEach(l => {
        const himeId = l.login_token.replace('V2DEL-', '');
        himeIdToLadyId[himeId] = l.id;
      });
      process.stdout.write(`\r  挿入済み: ${Math.min(i + BATCH, toInsert.length)}/${toInsert.length}`);
    }
    console.log('\n  ✅ キャスト挿入完了');
  }

  // 既存分もhimeIdToLadyIdに追加
  (existingLadies || []).forEach(l => {
    const himeId = l.login_token.replace('V2DEL-', '');
    himeIdToLadyId[himeId] = l.id;
  });

  // ── Step 2: 予約のlady_idを更新 ────────────────────────────────────────
  console.log('\n📋 Step 2: 予約のlady_idを更新...');

  // (halo_customer_id, date, time) → lady_id のマッピングを構築
  // ただしHALOにはV2のresv IDがないので、日時+顧客で照合する
  // 同一日時・同一顧客の予約が複数ある場合は最初にヒットしたものを使う

  let updated = 0;
  let notFound = 0;
  let noCustomer = 0;

  // HALO reservations (lady_id IS NULL) を全件取得（ページネーション）
  console.log('  HALOの未解決予約を取得中...');
  const nullResvs = [];
  const PAGE = 1000;
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('reservations')
      .select('id, customer_id, reserved_date, start_time, duration_min')
      .is('lady_id', null)
      .order('reserved_date')
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    nullResvs.push(...data);
    process.stdout.write(`\r  取得済み: ${nullResvs.length}件`);
    if (data.length < PAGE) break;
    page++;
  }
  console.log(`\n  未解決予約合計: ${nullResvs.length}件`);

  // HALO (customer_id, date, time) → HALO resv id のルックアップ
  const haloLookup = {};
  for (const r of nullResvs) {
    const key = `${r.customer_id}|${r.reserved_date}|${r.start_time?.slice(0,5)}`;
    if (!haloLookup[key]) haloLookup[key] = [];
    haloLookup[key].push(r.id);
  }

  // V2予約から (halo_customer_id, date, time) → lady_id を構築
  const updates = {}; // halo_resv_id → lady_id

  for (const v2r of targets) {
    const haloCustomerId = v2ToHalo[`V2-${v2r.userId}`];
    if (!haloCustomerId) { noCustomer++; continue; }

    const dt = parseV2Time(v2r.time);
    if (!dt) continue;

    const ladyId = himeIdToLadyId[v2r.hime1];
    if (!ladyId) continue;

    const key = `${haloCustomerId}|${dt.date}|${dt.time?.slice(0,5)}`;
    const haloIds = haloLookup[key];
    if (!haloIds || haloIds.length === 0) { notFound++; continue; }

    // 最初の未割当予約に割り当て
    const haloResvId = haloIds.shift();
    updates[haloResvId] = ladyId;
  }

  console.log(`  マッチ成功: ${Object.keys(updates).length}件, 顧客不明: ${noCustomer}件, 日時不一致: ${notFound}件`);

  // バッチ更新
  const updateEntries = Object.entries(updates);
  const UPDATE_BATCH = 200;

  for (let i = 0; i < updateEntries.length; i += UPDATE_BATCH) {
    const batch = updateEntries.slice(i, i + UPDATE_BATCH);

    // 個別update（Supabaseは一括updateをサポートしないため）
    await Promise.all(batch.map(([id, lady_id]) =>
      supabase.from('reservations').update({ lady_id }).eq('id', id)
    ));

    updated += batch.length;
    process.stdout.write(`\r  更新済み: ${updated}/${updateEntries.length}`);
  }

  console.log('\n\n✅ 完了！');
  console.log(`  キャスト挿入: ${uniqueDeletedHimes.length}名`);
  console.log(`  予約更新:     ${updated}件`);
  console.log(`  未解決残り:   ${notFound + noCustomer}件`);
}

main().catch(console.error);
