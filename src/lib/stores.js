import { useEffect } from 'react';
import { supabase } from './supabase.js';
import { useAppStore } from '../store/state.js';

export async function loadStores() {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('is_active', true)
    .order('display_order');
  if (error) {
    console.error('[stores] load failed', error);
    return [];
  }
  return data || [];
}

/**
 * Mount-once hook: loads stores into the global store, subscribes to realtime
 * changes, and ensures `currentStoreId` is set to a valid value.
 */
export function useStoresBoot() {
  const setStores = useAppStore((s) => s.setStores);
  const setCurrentStoreId = useAppStore((s) => s.setCurrentStoreId);
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const currentStaff = useAppStore((s) => s.currentStaff);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const rows = await loadStores();
      if (cancelled) return;
      setStores(rows);

      // Ensure currentStoreId is valid
      const ids = rows.map((r) => r.id);
      if (!currentStoreId || !ids.includes(currentStoreId)) {
        const fallback =
          (currentStaff?.default_store_id && ids.includes(currentStaff.default_store_id))
            ? currentStaff.default_store_id
            : rows[0]?.id || null;
        setCurrentStoreId(fallback);
      }
    };
    refresh();

    const channel = supabase
      .channel('stores-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, refresh)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentStaff?.id]);
}
