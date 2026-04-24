import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const hashHue = (s) => {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

const toHHMM = (t) => (t ? String(t).slice(0, 5) : '');

const mapRsvStatus = (s) => {
  if (s === 'visited') return 'working';
  if (s === 'reserved') return 'reserved';
  return s || 'reserved';
};

async function fetchShiftsData(date) {
  const { data: shifts, error: e1 } = await supabase
    .from('shifts')
    .select('*, ladies(display_name, name, store_code)')
    .eq('shift_date', date)
    .order('start_time');
  if (e1) throw e1;

  const { data: rsv, error: e2 } = await supabase
    .from('reservations')
    .select('id, lady_id, start_time, end_time, status, customers(name)')
    .eq('reserved_date', date)
    .in('status', ['reserved', 'visited']);
  if (e2) throw e2;

  const castRows = (shifts || []).map((s) => {
    const lady = s.ladies || {};
    const name = lady.display_name || lady.name || '—';
    return {
      id: s.lady_id,
      name,
      shift: `${toHHMM(s.start_time)}-${toHHMM(s.end_time)}`,
      status: 'active',
      ng: '',
      memo: '',
      hue: hashHue(name),
      pay: 0,
      count: 0,
    };
  });

  const bookingRows = (rsv || []).map((r) => ({
    id: r.id,
    cast: r.lady_id,
    start: toHHMM(r.start_time),
    end: toHHMM(r.end_time),
    customer: r.customers?.name || '—',
    status: mapRsvStatus(r.status),
    course: '',
    type: '',
    place: '',
  }));

  const workingIds = new Set(
    bookingRows.filter((b) => b.status === 'working').map((b) => b.cast)
  );
  castRows.forEach((c) => {
    if (workingIds.has(c.id)) c.status = 'working';
    c.count = bookingRows.filter((b) => b.cast === c.id).length;
  });

  return { castRows, bookingRows };
}

export function useShifts(date) {
  const [cast, setCast] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchShiftsData(date)
      .then(({ castRows, bookingRows }) => {
        if (cancelled) return;
        setCast(castRows);
        setBookings(bookingRows);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e);
        setLoading(false);
      });

    // Realtime: re-fetch on any shifts or reservations change for this date
    const reload = () => {
      fetchShiftsData(date)
        .then(({ castRows, bookingRows }) => {
          if (cancelled) return;
          setCast(castRows);
          setBookings(bookingRows);
        })
        .catch(() => {});
    };

    const channel = supabase
      .channel(`shifts-realtime-${date}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, reload)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [date]);

  return { cast, bookings, loading, error };
}
