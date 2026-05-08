import { useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { normalizePhone } from '../lib/utils.js';

/**
 * Realtime で call_logs の INSERT を購読し、ポップアップを起動する。
 *
 * @param {function} onIncoming - { callLogId, phone, customer } を受け取るコールバック
 * @param {string|null} currentStoreId - 現在の店舗ID。stores.twilio_number が設定されていれば
 *   自店舗宛の着信だけを受信する。null の場合は全着信を受信（初期状態の後退動作）。
 */
export function useRealtimeCalls(onIncoming, currentStoreId) {
  useEffect(() => {
    // store_id が確定していれば Realtime RowFilter で絞る。
    // stores.twilio_number 未設定（storeId=null な行）は filterなしチャンネルで受け取る。
    const filter = currentStoreId ? `store_id=eq.${currentStoreId}` : undefined;

    const channel = supabase
      .channel(`call_logs_insert_${currentStoreId ?? 'all'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_logs',
          ...(filter ? { filter } : {}),
        },
        async (payload) => {
          const row = payload.new;
          if (!row) return;

          // 他スタッフが既にclaim済みの着信はポップアップしない
          // （ui_statusがringing以外 = INSERT時点で既にclaim中の再upsert）
          if (row.ui_status && row.ui_status !== 'ringing') return;

          const fromNumber = row.from_number || '';
          const normalized = normalizePhone(fromNumber);

          let customer = null;
          if (normalized) {
            const { data } = await supabase
              .from('customers')
              .select('*')
              .eq('phone_normalized', normalized)
              .maybeSingle();
            customer = data || null;
          }

          onIncoming({ callLogId: row.id, phone: fromNumber, customer });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onIncoming, currentStoreId]);
}
