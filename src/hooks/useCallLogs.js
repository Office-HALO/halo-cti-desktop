import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { normalizePhone } from '../lib/utils.js';

export function useCallLogs(date) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!date) return;
    setLoading(true);

    const dayStart = date + 'T00:00:00+09:00';
    const dayEnd = date + 'T23:59:59+09:00';

    const { data, error } = await supabase
      .from('call_logs')
      .select('*')
      .gte('started_at', dayStart)
      .lte('started_at', dayEnd)
      .order('started_at', { ascending: false });

    if (error || !data) {
      setLoading(false);
      return;
    }

    const phones = [...new Set(data.map((r) => normalizePhone(r.from_number)).filter(Boolean))];
    let customerMap = {};
    if (phones.length > 0) {
      const { data: custs } = await supabase
        .from('customers')
        .select('id, phone_normalized, name, rank, tags, blocked')
        .in('phone_normalized', phones);
      (custs || []).forEach((c) => {
        customerMap[c.phone_normalized] = c;
      });
    }

    setRows(
      data.map((r) => ({
        ...r,
        customer: customerMap[normalizePhone(r.from_number)] || null,
      }))
    );
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, loading, reload: load };
}
