/**
 * mastersFetcher.js
 *
 * マスタデータ（オプショングループ・アイテム・キャストランク等）の
 * 取得・localStorage キャッシュ管理ユーティリティ。
 *
 * localStorage を使う理由:
 *   Tauri では WebviewWindow ごとに sessionStorage が独立するため、
 *   サブウィンドウからアクセスできる共有ストレージは localStorage のみ。
 *   メインウィンドウが起動時にプリロードしておくことで、
 *   予約フォームのサブウィンドウが初回から即時表示できる。
 */

import { supabase } from './supabase.js';
import { extractRewardRates } from '../screens/settings/RewardRateSettings.jsx';

/** localStorage のキャッシュキー（バージョン付き — 破壊的変更時は v2 等に上げる） */
export const mastersCacheKey = (storeId) => `halo_masters_v2_${storeId}`;

/**
 * 指定店舗のマスタデータを Supabase から取得する。
 * 取得順は固定（option_groups → option_items → rank_prices の依存関係）。
 */
export async function fetchMasters(storeId) {
  const [{ data: groups }, { data: ranks }, { data: storeRow }] = await Promise.all([
    supabase.from('option_groups').select('*').eq('store_id', storeId).order('display_order'),
    supabase.from('cast_ranks').select('*').eq('store_id', storeId).order('display_order'),
    supabase.from('stores').select('settings').eq('id', storeId).single(),
  ]);

  const groupIds = (groups || []).map((g) => g.id);
  const { data: allItems } = groupIds.length
    ? await supabase.from('option_items').select('*').in('group_id', groupIds).eq('is_active', true).order('display_order')
    : { data: [] };

  const itemIds = (allItems || []).map((i) => i.id);
  const { data: rankPriceRows } = itemIds.length
    ? await supabase.from('option_item_rank_prices').select('item_id, cast_rank_id, price, reward_override').in('item_id', itemIds)
    : { data: [] };

  const groupById = {}, itemsByGroup = {}, itemById = {};
  for (const g of (groups || [])) { groupById[g.id] = g; itemsByGroup[g.id] = []; }
  for (const item of (allItems || [])) {
    itemById[item.id] = item;
    if (itemsByGroup[item.group_id]) itemsByGroup[item.group_id].push(item);
  }
  const rankPrices = {}, rankRewardOverrides = {};
  for (const rp of (rankPriceRows || [])) {
    if (!rankPrices[rp.item_id]) rankPrices[rp.item_id] = {};
    rankPrices[rp.item_id][rp.cast_rank_id] = rp.price;
    if (rp.reward_override != null) {
      if (!rankRewardOverrides[rp.item_id]) rankRewardOverrides[rp.item_id] = {};
      rankRewardOverrides[rp.item_id][rp.cast_rank_id] = rp.reward_override;
    }
  }

  return {
    groups: groups || [],
    groupById,
    itemsByGroup,
    itemById,
    rankPrices,
    rankRewardOverrides,
    ranks: ranks || [],
    storeSettings: storeRow?.settings || {},
    cachedAt: Date.now(),
  };
}

/** localStorage からキャッシュを同期的に読み込む（なければ null） */
export function getCachedMasters(storeId) {
  try {
    const raw = localStorage.getItem(mastersCacheKey(storeId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** マスタデータを localStorage へ保存する */
export function setCachedMasters(storeId, mastersData) {
  try {
    localStorage.setItem(mastersCacheKey(storeId), JSON.stringify(mastersData));
  } catch {
    // ストレージ容量超過等は無視
  }
}
