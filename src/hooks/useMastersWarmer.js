/**
 * useMastersWarmer
 *
 * メインウィンドウが起動したとき（currentStoreId が確定したとき）に
 * バックグラウンドでマスタデータをプリロードし localStorage に書き込む。
 *
 * これにより、予約フォームのサブウィンドウが初回から即時表示できる。
 * （localStorage は Tauri の全 WebviewWindow 間で共有される）
 */

import { useEffect } from 'react';
import { useAppStore } from '../store/state.js';
import { fetchMasters, setCachedMasters, getCachedMasters, mastersCacheKey } from '../lib/mastersFetcher.js';

/** キャッシュの有効期間（分）。この時間内なら再フェッチしない */
const CACHE_TTL_MINUTES = 30;

export function useMastersWarmer() {
  const currentStoreId = useAppStore((s) => s.currentStoreId);

  useEffect(() => {
    if (!currentStoreId) return;

    // キャッシュが新鮮なら再フェッチしない
    const cached = getCachedMasters(currentStoreId);
    if (cached?.cachedAt) {
      const ageMinutes = (Date.now() - cached.cachedAt) / 60_000;
      if (ageMinutes < CACHE_TTL_MINUTES) return;
    }

    // バックグラウンドでフェッチ（エラーは無視 — キャッシュ更新に失敗しても動作に影響しない）
    fetchMasters(currentStoreId)
      .then((data) => {
        setCachedMasters(currentStoreId, data);
        console.debug(`[mastersWarmer] cached masters for store ${currentStoreId}`);
      })
      .catch(() => {});
  }, [currentStoreId]);
}
