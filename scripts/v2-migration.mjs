#!/usr/bin/env node
/**
 * V2 CTI → HALO CTI データ移行スクリプト
 *
 * 使い方:
 *   V2_JSESSIONID=<セッションID> node scripts/v2-migration.mjs [オプション]
 *
 * オプション:
 *   --dry-run             Supabase 書き込みをスキップ（動作確認用）
 *   --customers-only      顧客データのみ移行
 *   --reservations-only   予約データのみ移行（顧客移行済み前提）
 *   --from=YYYY-MM-DD     収集開始日 (デフォルト: 2016-01-01)
 *   --to=YYYY-MM-DD       収集終了日 (デフォルト: 今日)
 *
 * 事前準備:
 *   1. ブラウザで https://cti3.fuzoku-fan.jp/ にログイン
 *   2. DevTools > Application > Cookies > JSESSIONID の値をコピー
 *   3. export V2_JSESSIONID=<コピーした値>
 *   4. node scripts/v2-migration.mjs --dry-run  で確認
 *   5. node scripts/v2-migration.mjs            で本番実行
 *
 * 中断・再開:
 *   スクリプトは scripts/migration-data/ にバックアップを保存します。
 *   中断後に再実行すると既存バックアップを再利用して続きから実行します。
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, existsSync, readFileSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 設定 ──────────────────────────────────────────────────────────────────────
const V2_BASE      = 'https://cti3.fuzoku-fan.jp/ajax/office';
const V2_OFFICE_ID = 'dTeRmg';

const SUPABASE_URL = 'https://dkjfrywfhgdrkumafamj.supabase.co';
// service_role キーがあれば優先使用（RLS をバイパス）
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRramZyeXdmaGdkcmt1bWFmYW1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MDU5ODksImV4cCI6MjA5MDA4MTk4OX0.b2lh8irUBGFNBhupXmajRTCEzdeGRyLMxD0nFXkZFEA';

const JSESSIONID  = process.env.V2_JSESSIONID;
const DRY_RUN     = process.argv.includes('--dry-run');
const CUST_ONLY   = process.argv.includes('--customers-only');
const RESV_ONLY   = process.argv.includes('--reservations-only');
const RATE_MS     = 350; // V2 API レート制限対策

const fromArg    = process.argv.find(a => a.startsWith('--from='));
const toArg      = process.argv.find(a => a.startsWith('--to='));
const storeArg   = process.argv.find(a => a.startsWith('--store='));
const FROM_DATE  = fromArg  ? fromArg.split('=')[1]  : '2016-01-01';
const TO_DATE    = toArg    ? toArg.split('=')[1]    : new Date().toISOString().slice(0, 10);
const STORE_CODE = storeArg ? storeArg.split('=')[1] : null;

const BACKUP_DIR = resolve(__dirname, 'migration-data');

// ── バリデーション ──────────────────────────────────────────────────────────
if (!JSESSIONID) {
  console.error('❌ V2_JSESSIONID 環境変数が設定されていません');
  console.error('');
  console.error('   準備手順:');
  console.error('   1. ブラウザで https://cti3.fuzoku-fan.jp/ にログイン');
  console.error('   2. DevTools (F12) > Application > Cookies > cti3.fuzoku-fan.jp');
  console.error('   3. JSESSIONID の値をコピー');
  console.error('   4. export V2_JSESSIONID=<コピーした値>');
  process.exit(1);
}

// ── ユーティリティ ─────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/[^0-9+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+81')) return digits;
  if (digits.startsWith('0')) return '+81' + digits.slice(1);
  return digits;
}

function formatDateCompact(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * V2 の time フィールドをパース
 * V2 は Unix タイムスタンプ（秒）で格納している
 * 例: 1777857300 → { date: "2026-05-01", time: "10:35" }
 */
function parseV2DateTime(timeVal) {
  if (!timeVal) return null;
  const n = Number(timeVal);
  if (!isNaN(n) && n > 0) {
    // 13桁以上 → ms、10桁 → 秒として扱う
    const ms = n > 1e12 ? n : n * 1000;
    // JST (UTC+9)
    const d   = new Date(ms + 9 * 60 * 60 * 1000);
    const year  = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day   = String(d.getUTCDate()).padStart(2, '0');
    const hh    = String(d.getUTCHours()).padStart(2, '0');
    const mm    = String(d.getUTCMinutes()).padStart(2, '0');
    return { date: `${year}-${month}-${day}`, time: `${hh}:${mm}` };
  }
  // フォールバック: "YYYYMMDD HHmm" 文字列形式
  const s = String(timeVal).replace(/\s+/, ' ').trim();
  if (!s.includes(' ') || s.length < 8) return null;
  const [datePart, timePart] = s.split(' ');
  if (datePart.length < 8) return null;
  const year  = datePart.slice(0, 4);
  const month = datePart.slice(4, 6);
  const day   = datePart.slice(6, 8);
  const hh    = String(timePart ?? '').padStart(4, '0').slice(0, 2);
  const mm    = String(timePart ?? '').padStart(4, '0').slice(2, 4);
  return { date: `${year}-${month}-${day}`, time: `${hh}:${mm}` };
}

function calcEndTime(startTime, durationMin) {
  if (!startTime || !durationMin) return null;
  const [hh, mm] = startTime.split(':').map(Number);
  const totalMin = hh * 60 + mm + Number(durationMin);
  const eh = Math.floor(totalMin / 60) % 24;
  const em = totalMin % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

function mapV2Rank(cls) {
  if (!cls) return 'C';
  const c = String(cls).toUpperCase();
  if (c === 'VIP' || c === '0') return 'VIP';
  if (c === 'A'   || c === '1') return 'A';
  if (c === 'B'   || c === '2') return 'B';
  if (c === 'NG'  || c === '4') return 'NG';
  return 'C';
}

function mapV2Status(v2Status) {
  const statusNum = Number(v2Status);
  const map = {
    0: 'reserved',
    1: 'dispatched',
    2: 'completed',
    3: 'cancelled',
    4: 'ng',
    5: 'no_show',
    9: 'cancelled',
  };
  return map[statusNum] ?? 'reserved';
}

// ── V2 API クライアント ────────────────────────────────────────────────────
// officeId はボディではなく fcti_office_id ヘッダーで送る（実ブラウザのリクエストから判明）
async function v2Post(endpoint, params) {
  const body = new URLSearchParams(params); // officeId は body に含めない
  const res = await fetch(`${V2_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type':    'application/x-www-form-urlencoded',
      'Accept':          'application/json, text/plain, */*',
      'Cookie':          `JSESSIONID=${JSESSIONID}`,
      'fcti_office_id':  V2_OFFICE_ID,
      'Origin':          'https://cti3.fuzoku-fan.jp',
      'Referer':         'https://cti3.fuzoku-fan.jp/office/',
      'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`V2 ${endpoint}: HTTP ${res.status}`);
  const json = await res.json();
  if (json?.result === 'NG' || json?.status === 257) {
    throw new Error('V2 セッション切れ or 認証エラー (status=257)。JSESSIONID を再取得してください。');
  }
  return json;
}

// ── Phase 1: 全スケジュールを日次収集 ─────────────────────────────────────
async function collectSchedules(backupPath) {
  if (existsSync(backupPath)) {
    console.log(`📂 既存スケジュールバックアップを使用: ${backupPath}`);
    return JSON.parse(readFileSync(backupPath, 'utf-8'));
  }

  console.log(`\n📅 スケジュール収集 (${FROM_DATE} → ${TO_DATE})`);
  console.log('   ※ 10年分で約3,600回のAPIコール（約20分）かかります\n');

  const userIdSet   = new Set();
  const allResvList = [];

  // セッション確認: 今日の日付でデータ取得できるか事前チェック
  console.log('  🔑 セッション確認中...');
  const todayStr  = formatDateCompact(new Date());
  const checkData = await v2Post('schedule', {
    method: 'getData',
    dateListResv: todayStr,
    dateListHd:   todayStr,
    dateListSdm:  todayStr,
    timeMsg:      String(Date.now()),
  });
  const checkList = checkData?.resvList;
  const checkDate = todayStr;
  if (checkList === undefined || checkList === null) {
    console.error('\n❌ V2 API がデータを返しません。JSESSIONID が切れている可能性があります。');
    console.error('   再ログインして新しい JSESSIONID を取得してください。');
    process.exit(1);
  }
  console.log(`  ✅ セッション有効 (${TO_DATE}: ${checkList.length}件)\n`);

  const start = new Date(FROM_DATE + 'T00:00:00Z');
  const end   = new Date(TO_DATE   + 'T00:00:00Z');

  let current     = new Date(start);
  let dayCount    = 0;
  let emptyStreak = 0;
  const totalDays = Math.round((end - start) / 86400000) + 1;
  // チェック日のデータを先に追加
  for (const r of checkList) {
    if (r.userId) userIdSet.add(String(r.userId));
    allResvList.push(r);
  }

  while (current <= end) {
    const dateStr = formatDateCompact(current);
    // 最終日は既にチェック済みなのでスキップ
    if (dateStr === checkDate) {
      dayCount++;
      current.setUTCDate(current.getUTCDate() + 1);
      continue;
    }
    try {
      const data     = await v2Post('schedule', {
        method:       'getData',
        dateListResv: dateStr,
        dateListHd:   dateStr,
        dateListSdm:  dateStr,
        timeMsg:      String(Date.now()),
      });
      const resvList = data?.resvList ?? [];
      for (const r of resvList) {
        if (r.userId) userIdSet.add(String(r.userId));
        allResvList.push(r);
      }
      // 連続空レスポンスでセッション切れを検出（平日100日連続は異常）
      if (resvList.length > 0) {
        emptyStreak = 0;
      } else {
        emptyStreak++;
        if (emptyStreak >= 100) {
          console.warn(`\n⚠️  ${emptyStreak}日連続で予約0件。セッションが切れた可能性があります。`);
          console.warn('   現在の進捗はバックアップに保存されません。再ログイン後に再実行してください。');
          // ただし月曜〜金曜の平日に連続空なら警告、土日祝が続く場合は無視
        }
      }
    } catch (e) {
      if (e.message.includes('セッション切れ')) throw e;
      if (dayCount % 30 === 0) process.stdout.write(`\n⚠️  ${dateStr}: ${e.message}`);
    }

    dayCount++;
    if (dayCount % 50 === 0 || dayCount === totalDays) {
      process.stdout.write(
        `\r  ${current.toISOString().slice(0, 10)} — ${dayCount}/${totalDays}日, ` +
        `${userIdSet.size}ユーザー, ${allResvList.length}予約   `
      );
    }

    await sleep(RATE_MS);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  console.log(`\n\n✅ 収集完了: ${userIdSet.size}ユニークユーザー, ${allResvList.length}予約`);

  const result = { userIds: [...userIdSet], resvList: allResvList, collectedAt: new Date().toISOString() };
  writeFileSync(backupPath, JSON.stringify(result, null, 2));
  console.log(`💾 バックアップ保存: ${backupPath}`);
  return result;
}

// ── Phase 2: ユーザー詳細を一括取得 ───────────────────────────────────────
async function fetchUserDetails(userIds, backupPath) {
  if (existsSync(backupPath)) {
    console.log(`\n📂 既存ユーザーバックアップを使用: ${backupPath}`);
    return JSON.parse(readFileSync(backupPath, 'utf-8'));
  }

  console.log(`\n👥 ユーザー詳細取得: ${userIds.length}件`);

  const BATCH_SIZE = 50;
  const allUsers   = [];
  const allUo      = [];

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);
    try {
      const data = await v2Post('user', { method: 'getList', idList: batch.join(',') });
      if (Array.isArray(data?.userList)) allUsers.push(...data.userList);
      if (Array.isArray(data?.uoList))   allUo.push(...data.uoList);
    } catch (e) {
      if (e.message.includes('セッション切れ')) throw e;
      console.warn(`\n⚠️  バッチ ${i}–${i + BATCH_SIZE}: ${e.message}`);
    }

    process.stdout.write(`\r  ${Math.min(i + BATCH_SIZE, userIds.length)}/${userIds.length}件   `);
    await sleep(RATE_MS);
  }

  console.log(`\n✅ ユーザー詳細取得完了: ${allUsers.length}件`);

  const result = { userList: allUsers, uoList: allUo, fetchedAt: new Date().toISOString() };
  writeFileSync(backupPath, JSON.stringify(result, null, 2));
  console.log(`💾 バックアップ保存: ${backupPath}`);
  return result;
}

// ── Phase 3: 顧客を Supabase へ投入 ───────────────────────────────────────
async function migrateCustomers(userData, supabase, storeId) {
  const { userList, uoList } = userData;
  const uoMap = new Map((uoList ?? []).map(uo => [String(uo.userId), uo]));

  console.log(`\n📥 顧客移行: ${userList.length}件`);

  // 既存 V2 顧客を確認（再実行時の重複防止）
  const { data: existing } = await supabase
    .from('customers')
    .select('id, member_no')
    .like('member_no', 'V2-%');
  const existingV2Ids = new Set((existing ?? []).map(r => r.member_no));
  const existingMap   = Object.fromEntries((existing ?? []).map(r => [r.member_no, r.id]));
  console.log(`   既存 V2 顧客: ${existingV2Ids.size}件 (スキップ対象)`);

  const toInsert = userList.filter(u => !existingV2Ids.has(`V2-${u.id}`));
  console.log(`   新規挿入対象: ${toInsert.length}件`);

  const BATCH_SIZE = 100;
  let success = 0, failed = 0;
  const v2IdToHaloId = { ...existingMap };

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const rows  = batch.map(u => {
      const uo      = uoMap.get(String(u.id)) ?? {};
      const phones  = [].concat(u.phoneList ?? []).filter(Boolean);
      const primary = phones[0] ? String(phones[0]) : null;

      if (!primary) return null;
      return {
        name:             u.name     ?? null,
        kana:             u.nameRead ?? null,
        phone:            primary,
        email:            u.ext4     ?? null,
        address:          u.addr1    ?? null,
        rank:             mapV2Rank(u.cls),
        total_visits:     Number(uo.cntNormal  ?? 0),
        cancel_count:     Number(uo.cntCancel  ?? 0),
        total_spent:      Number(uo.price      ?? 0),
        shared_memo:      u.shMemo   ?? null,
        ops_memo:         uo.memo    ?? null,
        alert_memo:       uo.ngMemo  ?? null,
        member_no:        `V2-${u.id}`,
        tags:             [],
      };
    }).filter(Boolean); // phone なしはスキップ

    if (DRY_RUN) {
      console.log(`  [DRY-RUN] ${i + 1}〜${Math.min(i + BATCH_SIZE, toInsert.length)} 件をスキップ`);
      success += rows.length;
      continue;
    }

    const { data: inserted, error } = await supabase
      .from('customers')
      .insert(rows)
      .select('id, member_no');

    if (error) {
      console.warn(`\n  ⚠️ バッチ ${i}–${i + BATCH_SIZE}: ${error.message}`);
      failed += batch.length;
    } else {
      for (const row of (inserted ?? [])) {
        if (row.member_no) v2IdToHaloId[row.member_no] = row.id;
      }
      success += batch.length;
    }

    process.stdout.write(
      `\r  ${success + failed}/${toInsert.length}件 (成功: ${success}, 失敗: ${failed})   `
    );
  }

  console.log(`\n✅ 顧客移行完了: 成功 ${success}件, 失敗 ${failed}件`);
  return v2IdToHaloId;
}

// ── Phase 4: 予約を Supabase へ投入 ───────────────────────────────────────
async function migrateReservations(resvList, v2IdToHaloId, ladyMap, supabase, storeId) {
  console.log(`\n📋 予約移行: ${resvList.length}件`);

  // 重複防止: 既に移行済みの V2 予約 ID を確認
  // (reservations に v2_id カラムがないため memo の先頭タグで管理)
  // → 初回移行なら全件挿入。再実行時は件数を見て判断してください。

  const BATCH_SIZE = 200;
  let success = 0, failed = 0, skipped = 0;
  const errors = [];

  for (let i = 0; i < resvList.length; i += BATCH_SIZE) {
    const batch = resvList.slice(i, i + BATCH_SIZE);
    const rows  = [];

    for (const r of batch) {
      const v2CustomerId = r.userId ? String(r.userId) : null;
      const haloCustomerId = v2CustomerId
        ? (v2IdToHaloId[`V2-${v2CustomerId}`] ?? null)
        : null;

      // 顧客不明かつ userId があれば警告してスキップ
      if (v2CustomerId && !haloCustomerId) {
        skipped++;
        continue;
      }

      const dt = parseV2DateTime(r.time);
      if (!dt) { skipped++; continue; }

      const durationMin = Number(r.duration ?? 0) || null;
      const endTime     = durationMin ? calcEndTime(dt.time, durationMin) : null;
      const ladyId      = r.hime1 ? (ladyMap.get(String(r.hime1).trim()) ?? null) : null;

      rows.push({
        store_id:       storeId,
        customer_id:    haloCustomerId,
        lady_id:        ladyId,
        reserved_date:  dt.date,
        start_time:     dt.time,
        end_time:       endTime,
        duration_min:   durationMin,
        status:         mapV2Status(r.status),
        course:         r.data6        ?? null,
        hotel:          r.data7        ?? null,
        room_no:        r.data8        ?? null,
        amount:         Number(r.priceTotal ?? 0) || null,
        memo:           r.memo         ?? null,
        first_media:    r.firstMedia   ?? null,
        send_driver:    r.driver1      ?? null,
        receive_driver: r.driver2      ?? null,
        selected_items: [],
      });
    }

    if (!rows.length) {
      skipped += batch.length;
      continue;
    }

    if (DRY_RUN) {
      success += rows.length;
      process.stdout.write(
        `\r  [DRY-RUN] ${i + rows.length + skipped}/${resvList.length}件   `
      );
      continue;
    }

    const { error } = await supabase.from('reservations').insert(rows);
    if (error) {
      errors.push(`バッチ ${i}: ${error.message}`);
      failed += rows.length;
    } else {
      success += rows.length;
    }

    process.stdout.write(
      `\r  ${success + failed + skipped}/${resvList.length}件` +
      ` (成功: ${success}, 失敗: ${failed}, スキップ: ${skipped})   `
    );
  }

  console.log(`\n✅ 予約移行完了: 成功 ${success}件, 失敗 ${failed}件, スキップ ${skipped}件`);
  if (errors.length) {
    console.log('\n  エラー詳細:');
    errors.slice(0, 10).forEach(e => console.log(`    ${e}`));
    if (errors.length > 10) console.log(`    ... 他 ${errors.length - 10}件`);
  }
}

// ── エントリーポイント ─────────────────────────────────────────────────────
async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  V2 CTI → HALO CTI データ移行スクリプト');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  期間    : ${FROM_DATE} → ${TO_DATE}`);
  console.log(`  モード  : ${DRY_RUN ? '🔍 DRY-RUN（書き込みなし）' : '🚀 本番実行'}${
    CUST_ONLY  ? ' [顧客のみ]' :
    RESV_ONLY  ? ' [予約のみ]' : ''
  }`);
  console.log('════════════════════════════════════════════════════════════\n');

  mkdirSync(BACKUP_DIR, { recursive: true });

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 接続テスト & 店舗一覧取得
  const { data: allStores, error: storeListErr } = await supabase
    .from('stores').select('id, code, name').order('name');
  if (storeListErr || !allStores?.length) {
    console.error('❌ stores テーブルの取得に失敗:', storeListErr?.message);
    process.exit(1);
  }

  let storeRow;
  if (STORE_CODE) {
    storeRow = allStores.find(s => s.code === STORE_CODE);
    if (!storeRow) {
      console.error(`❌ 店舗コード "${STORE_CODE}" が見つかりません`);
      console.error('   利用可能な店舗:');
      allStores.forEach(s => console.error(`     --store=${s.code}  (${s.name})`));
      process.exit(1);
    }
  } else if (allStores.length === 1) {
    storeRow = allStores[0];
  } else {
    console.error('❌ --store=<コード> で店舗を指定してください');
    console.error('   利用可能な店舗:');
    allStores.forEach(s => console.error(`     --store=${s.code}  (${s.name})`));
    process.exit(1);
  }

  const storeId = storeRow.id;
  console.log(`🏪 店舗: ${storeRow.name} (${storeRow.code} / ${storeId})`);

  // V2 キャスト ID → HALO lady_id マップを構築
  // Step1: HALO ladies テーブルから表示名→UUIDマップ
  const { data: ladies } = await supabase.from('ladies').select('id, display_name');
  const haloLadyByName = new Map((ladies ?? []).map(l => [String(l.display_name).trim(), l.id]));

  // Step2: V2 init エンドポイントから himeList (V2 ID → 名前)を取得
  const himeBackupPath = resolve(BACKUP_DIR, 'v2-himelist.json');
  let v2HimeMap = new Map(); // V2 内部ID → HALO lady_id
  try {
    let himeList;
    if (existsSync(himeBackupPath)) {
      himeList = JSON.parse(readFileSync(himeBackupPath, 'utf-8'));
      console.log(`📂 V2キャストリスト読み込み: ${himeList.length}件`);
    } else {
      const initData = await v2Post('init', { method: 'init', timeMsg: String(Date.now()) });
      himeList = initData?.himeList ?? [];
      writeFileSync(himeBackupPath, JSON.stringify(himeList, null, 2));
      console.log(`💃 V2キャストリスト取得: ${himeList.length}件`);
    }
    for (const h of himeList) {
      const name    = String(h.name ?? h.displayName ?? h.nickName ?? '').trim();
      const haloId  = name ? haloLadyByName.get(name) ?? null : null;
      if (h.id) v2HimeMap.set(String(h.id), haloId);
    }
    const matched = [...v2HimeMap.values()].filter(Boolean).length;
    console.log(`🔗 キャスト紐付け: ${matched}/${v2HimeMap.size}件マッチ`);
  } catch (e) {
    console.warn(`⚠️  V2キャストリスト取得失敗: ${e.message} (キャスト紐付けなしで続行)`);
  }

  // V2 hime1 ID → HALO lady_id の変換に使う（名前マッチも併用）
  const ladyMap = {
    get: (v2Id) => v2HimeMap.get(String(v2Id ?? '')) ?? haloLadyByName.get(String(v2Id ?? '')) ?? null,
  };
  console.log(`💃 HALO キャスト: ${haloLadyByName.size}件ロード済み`);

  // ── Phase 1: スケジュール収集 ────────────────────────────────────────
  const schedulePath = resolve(BACKUP_DIR, `v2-schedule-${FROM_DATE}-${TO_DATE}.json`);
  let resvList = [], userIds = [];

  if (RESV_ONLY) {
    // 既存バックアップを探す
    const files = readdirSync(BACKUP_DIR).filter(f => f.startsWith('v2-schedule')).sort();
    if (!files.length) {
      console.error('❌ スケジュールバックアップが見つかりません。先に通常モードで実行してください。');
      process.exit(1);
    }
    const latestFile = files[files.length - 1];
    console.log(`\n📂 スケジュールバックアップ読み込み: ${latestFile}`);
    const cached = JSON.parse(readFileSync(resolve(BACKUP_DIR, latestFile), 'utf-8'));
    resvList = cached.resvList;
    userIds  = cached.userIds;
    console.log(`   予約: ${resvList.length}件, ユーザー: ${userIds.length}件`);
  } else {
    const cached = await collectSchedules(schedulePath);
    resvList = cached.resvList;
    userIds  = cached.userIds;
  }

  // ── Phase 2 & 3: 顧客取得・移行 ─────────────────────────────────────
  let v2IdToHaloId = {};

  if (!RESV_ONLY) {
    const userPath = resolve(BACKUP_DIR, 'v2-users.json');
    const userData = await fetchUserDetails(userIds, userPath);

    v2IdToHaloId = await migrateCustomers(userData, supabase, storeId);

    // ID マップを保存（予約移行の再実行に備えて）
    const mapPath = resolve(BACKUP_DIR, 'v2-id-map.json');
    writeFileSync(mapPath, JSON.stringify(v2IdToHaloId, null, 2));
    console.log(`🗺  ID マップ保存: ${mapPath} (${Object.keys(v2IdToHaloId).length}件)`);
  } else {
    // 既存 ID マップを読み込み
    const mapPath = resolve(BACKUP_DIR, 'v2-id-map.json');
    if (existsSync(mapPath)) {
      v2IdToHaloId = JSON.parse(readFileSync(mapPath, 'utf-8'));
      console.log(`\n🗺  ID マップ読み込み: ${Object.keys(v2IdToHaloId).length}件`);
    } else {
      console.warn('⚠️  v2-id-map.json が見つかりません。顧客紐付きなしで予約を移行します。');
    }
  }

  // ── Phase 4: 予約移行 ────────────────────────────────────────────────
  if (!CUST_ONLY) {
    await migrateReservations(resvList, v2IdToHaloId, ladyMap, supabase, storeId);
  }

  console.log('\n🎉 移行完了！');
  console.log(`   バックアップ: ${BACKUP_DIR}/`);
}

main().catch(e => {
  console.error('\n❌ 致命的エラー:', e.message);
  process.exit(1);
});
