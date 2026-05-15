import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const hashHue = (s) => {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

const toHHMM = (t) => (t ? String(t).slice(0, 5) : '');

const mapRsvStatus = (s) => {
  // 現行ステータス
  if (s === 'visited')    return 'working';
  if (s === 'reserved')   return 'reserved';
  if (s === 'received')   return 'received';
  if (s === 'working')    return 'working';
  if (s === 'complete')   return 'complete';
  if (s === 'hold')       return 'hold';
  if (s === 'cancelled')  return 'cancelled';
  // 旧ステータス（デリスタ/V2時代）
  if (s === 'confirmed')  return 'received';   // 確定済み → 受領済
  if (s === 'completed')  return 'complete';   // 完了
  if (s === 'dispatched') return 'received';   // 出発（デリバリー完了）→ 受領済
  if (s === 'ng')         return 'cancelled';  // NG → キャンセル
  if (s === 'no_show')    return 'cancelled';  // 来店なし → キャンセル
  return 'received'; // その他の旧ステータスはデフォルト受領済
};

async function fetchShiftsData(date, storeId) {
  // シフトと予約を並列取得
  let shiftsQ = supabase
    .from('shifts')
    .select('*, ladies!inner(display_name, name, store_code, store_id, notion_page_id)')
    .eq('shift_date', date)
    .order('start_time');
  if (storeId) shiftsQ = shiftsQ.eq('ladies.store_id', storeId);

  // 予約は hold/ng/no_show 以外全ステータス取得（過去データのconfirmed/completed等も含む）
  let rsvQ = supabase
    .from('reservations')
    .select([
      'id, lady_id, customer_id, store_id, start_time, end_time, duration_min, status',
      'course, hotel, room_no, amount, fee_adjustment, payment_method',
      'advance_cash, first_media, send_driver, receive_driver',
      'nomination_type, memo, selected_items',
      'customers(name, member_no, phone, address)',
    ].join(', '))
    .eq('reserved_date', date)
    .not('status', 'in', '(hold,ng,no_show)');
  if (storeId) rsvQ = rsvQ.eq('store_id', storeId);

  const [{ data: shifts, error: e1 }, { data: rsv, error: e2 }] = await Promise.all([shiftsQ, rsvQ]);
  if (e1) throw e1;
  if (e2) throw e2;

  // シフトがあるキャストの行を作成
  const castRows = (shifts || []).map((s) => {
    const lady = s.ladies || {};
    const name = lady.display_name || lady.name || '—';
    return {
      id: s.lady_id,
      name,
      shift: `${toHHMM(s.actual_start_time || s.start_time)}-${toHHMM(s.actual_end_time || s.end_time)}`,
      status: 'active',
      ng: '',
      memo: '',
      hue: hashHue(name),
      pay: 0,
      count: 0,
      endBadge: s.end_badge || 'agari',
      attendanceStatus: s.attendance_status || 'none',
      attendanceMemo: s.attendance_memo || '',
      shiftId: s.id,
      notionPageId: lady.notion_page_id || null,
    };
  });

  const bookingRows = (rsv || []).map((r) => ({
    id: r.id,
    cast: r.lady_id,
    store_id: r.store_id,
    start: toHHMM(r.start_time),
    end: toHHMM(r.end_time),
    duration_min: r.duration_min,
    customer_id: r.customer_id || null,
    customer: r.customers?.name || '—',
    member_no: r.customers?.member_no || '',
    cust_phone: r.customers?.phone || '',
    phone_last4: (r.customers?.phone || '').replace(/\D/g, '').slice(-4),
    cust_address: r.customers?.address || '',
    status: mapRsvStatus(r.status),
    course: r.course || '',
    hotel: r.hotel || '',
    room_no: r.room_no || '',
    amount: r.amount,
    fee_adj: r.fee_adjustment,
    payment: r.payment_method || '',
    advance_cash: r.advance_cash,
    first_media: r.first_media || '',
    send_driver: r.send_driver || '',
    recv_driver: r.receive_driver || '',
    nomination: r.nomination_type || '',
    memo: r.memo || '',
    items: r.selected_items || [],
  }));

  // シフト未登録でも予約があるキャストを追加（過去データ対応）
  const shiftLadyIds = new Set(castRows.map((c) => c.id));
  const extraLadyIds = [
    ...new Set(
      (rsv || [])
        .filter((r) => r.lady_id && !shiftLadyIds.has(r.lady_id))
        .map((r) => r.lady_id)
    ),
  ];

  if (extraLadyIds.length > 0) {
    // 予約の store_id で既に絞り込み済みなので lady の store_id は再フィルタ不要
    const { data: extraLadies } = await supabase
      .from('ladies')
      .select('id, display_name, name, store_id, notion_page_id')
      .in('id', extraLadyIds);
    for (const lady of (extraLadies || [])) {
      const name = lady.display_name || lady.name || '—';
      castRows.push({
        id: lady.id,
        name,
        shift: '',       // シフトバンドなし
        status: 'active',
        ng: '',
        memo: '',
        hue: hashHue(name),
        pay: 0,
        notionPageId: lady.notion_page_id || null,
        count: 0,
        endBadge: 'agari',
        attendanceStatus: 'none',
        shiftId: null,   // シフトなし
      });
    }
    // 最初の予約時刻順でソート
    castRows.sort((a, b) => {
      const aFirst = bookingRows.filter(r => r.cast === a.id)[0]?.start || '99:99';
      const bFirst = bookingRows.filter(r => r.cast === b.id)[0]?.start || '99:99';
      // シフトあり行を上に、シフトなし行は予約時刻順
      if (a.shiftId && !b.shiftId) return -1;
      if (!a.shiftId && b.shiftId) return 1;
      return aFirst.localeCompare(bFirst);
    });
  }

  const workingIds = new Set(
    bookingRows.filter((b) => b.status === 'working').map((b) => b.cast)
  );
  castRows.forEach((c) => {
    if (workingIds.has(c.id)) c.status = 'working';
    c.count = bookingRows.filter((b) => b.cast === c.id).length;
  });

  return { castRows, bookingRows };
}

export function useShifts(date, storeId) {
  const [cast, setCast] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const reloadRef = useRef(null);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchShiftsData(date, storeId)
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

    const reload = () => {
      fetchShiftsData(date, storeId)
        .then(({ castRows, bookingRows }) => {
          if (cancelled) return;
          setCast(castRows);
          setBookings(bookingRows);
        })
        .catch(() => {});
    };
    reloadRef.current = reload;

    const channel = supabase
      .channel(`shifts-realtime-${date}-${storeId || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, reload)
      .subscribe();

    return () => {
      cancelled = true;
      reloadRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [date, storeId]);

  const refresh = useCallback(() => { reloadRef.current?.(); }, []);

  return { cast, bookings, loading, error, refresh };
}
