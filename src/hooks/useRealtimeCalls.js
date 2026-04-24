import { useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { normalizePhone } from '../lib/utils.js';

export function useRealtimeCalls(onIncoming) {
  useEffect(() => {
    const channel = supabase
      .channel('call_logs_insert')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_logs' },
        async (payload) => {
          const row = payload.new;
          if (!row) return;

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
  }, [onIncoming]);
}
