import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAppStore } from '../store/state.js';
import { normalizePhone } from '../lib/utils.js';

export function useCustomers() {
  const allCustomers = useAppStore((s) => s.allCustomers);
  const setAllCustomers = useAppStore((s) => s.setAllCustomers);
  const [loading, setLoading] = useState(!allCustomers.length);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('customers')
      .select('*')
      .order('total_visits', { ascending: false });
    if (data) setAllCustomers(data);
    setLoading(false);
  }, [setAllCustomers]);

  useEffect(() => {
    if (!allCustomers.length) load();
  }, [allCustomers.length, load]);

  useEffect(() => {
    const channel = supabase
      .channel('customers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { customers: allCustomers, loading, reload: load };
}

export async function loadCustomerReservations(customerId) {
  const { data } = await supabase
    .from('reservations')
    .select('*, ladies(display_name)')
    .eq('customer_id', customerId)
    .order('reserved_date', { ascending: false })
    .limit(50);
  return data || [];
}

// phone_normalized (+819037...) から末尾10桁でilike検索 → from_number フォーマットを問わず一致
export async function loadCustomerCallLogs(rawPhone, limit = 10) {
  if (!rawPhone) return [];
  const phone = normalizePhone(rawPhone);
  if (!phone) return [];
  const digits = phone.replace(/\D/g, ''); // +を除いた数字のみ (例: 819037217943)

  // eq で + が URL エンコードされない問題を回避 → like で数字部分だけマッチ
  const { data, error } = await supabase
    .from('call_logs')
    .select('*')
    .like('from_number', `%${digits}`)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) console.error('[loadCustomerCallLogs]', error.message);
  return data || [];
}

export async function saveCustomer(id, patch) {
  const { data, error } = await supabase
    .from('customers')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}
