import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { normalizePhone } from '../lib/utils.js';

/**
 * Realtime で call_logs の INSERT を購読し、ポップアップを起動する。
 *
 * DB レベルのフィルターは使わず JS 側で store_id を照合する。
 * → store_id=null（twilio_number 未設定）でも確実に受信できる。
 *
 * @param {function} onIncoming - { callLogId, phone, customer } を受け取るコールバック
 * @param {string|null} currentStoreId - 現在の店舗ID
 */
export function useRealtimeCalls(onIncoming, currentStoreId) {
  // 最新の currentStoreId を ref で保持（依存変化でチャンネルを再作成しない）
  const storeIdRef = useRef(currentStoreId);
  useEffect(() => { storeIdRef.current = currentStoreId; }, [currentStoreId]);

  useEffect(() => {
    const channel = supabase
      .channel('call_logs_insert')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_logs' },
        async (payload) => {
          const row = payload.new;
          if (!row) return;

          // 他スタッフが既にclaim済みの着信はポップアップしない
          if (row.ui_status && row.ui_status !== 'ringing') return;

          // store_id が設定されている場合は自店舗のみ受け取る
          // store_id=null（twilio_number 未設定）は全スタッフに通知
          const sid = storeIdRef.current;
          if (row.store_id && sid && row.store_id !== sid) return;

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
