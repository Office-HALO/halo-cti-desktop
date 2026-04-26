import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Icon from '../components/Icon.jsx';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { useAppStore } from '../store/state.js';
import { effectivePrice, rewardFor, KIND_ORDER } from '../lib/pricing.js';
import { loadCustomerReservations } from '../hooks/useCustomers.js';

const STATUSES = [
  { value: 'reserved',  label: '予約' },
  { value: 'received',  label: '受領済' },
  { value: 'working',   label: '対応中' },
  { value: 'complete',  label: '完了' },
  { value: 'hold',      label: '仮予約' },
  { value: 'cancelled', label: 'キャンセル' },
];

const QUICK_OFFSETS = [0, 15, 30, 45, 60, 90, 120];

function toHHMM(d) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function trimSec(t) { return (t || '').slice(0, 5); }
function addMinutes(hhmm, min) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + min;
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}
function nowPlusMinutes(min) {
  return toHHMM(new Date(Date.now() + min * 60 * 1000));
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function yen(n) {
  if (n == null || n === '') return '—';
  const v = Number(n);
  return (v < 0 ? '-¥' : '¥') + Math.abs(v).toLocaleString();
}
function fmtDate(s) {
  if (!s) return '';
  const d = s.slice(2).replace(/-/g, '/');
  return d;
}

export default function ReservationFormModal({ customer, reservation, onClose, onSaved, onDeleted }) {
  const isEdit = !!reservation?.id;
  const cust = customer || reservation?.customer || null;
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const stores = useAppStore((s) => s.stores);

  // Drag state
  const rootRef = useRef(null);
  const dragRef = useRef(null);
  const [pos, setPos] = useState({ x: null, y: null });

  // Data
  const [masters, setMasters] = useState(null);
  const [ladies, setLadies] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isFirstMeet, setIsFirstMeet] = useState(null);
  const [ladyCastRankId, setLadyCastRankId] = useState(null);
  const [quickActive, setQuickActive] = useState(null);

  // Basic fields
  const [date, setDate] = useState(reservation?.reserved_date || todayISO());
  const [startTime, setStartTime] = useState(
    reservation?.start_time
      ? trimSec(reservation.start_time)
      : toHHMM(new Date(Date.now() + 30 * 60 * 1000))
  );
  const [ladyId, setLadyId] = useState(reservation?.lady_id || '');
  const [onShiftOnly, setOnShiftOnly] = useState(true);
  const [status, setStatus] = useState(reservation?.status || 'reserved');
  const [memo, setMemo] = useState(reservation?.memo || '');
  const [roomNo, setRoomNo] = useState(reservation?.room_no || '');
  const [feeAdj, setFeeAdj] = useState(reservation?.fee_adjustment ?? 0);
  const [rewardAdj, setRewardAdj] = useState(reservation?.reward_adjustment ?? 0);
  const [paymentMethod, setPaymentMethod] = useState(reservation?.payment_method || 'cash');
  const [advanceCash, setAdvanceCash] = useState(reservation?.advance_cash ?? '');
  const [isTriple, setIsTriple] = useState(reservation?.is_triple || false);
  const [storeId, setStoreId] = useState(reservation?.store_id || currentStoreId || '');

  // Selections: { [group_id]: null | item_id | Set<item_id> }
  const [selections, setSelections] = useState({});

  // ── Drag ─────────────────────────────────────────────────────────────
  const onDragStart = useCallback((e) => {
    if (e.target.closest('button,input,select,textarea')) return;
    const rect = rootRef.current.getBoundingClientRect();
    dragRef.current = { mx: e.clientX, my: e.clientY, x: rect.left, y: rect.top };
  }, []);

  useEffect(() => {
    const move = (e) => {
      if (!dragRef.current) return;
      setPos({
        x: dragRef.current.x + e.clientX - dragRef.current.mx,
        y: Math.max(0, dragRef.current.y + e.clientY - dragRef.current.my),
      });
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  // ── Load masters ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentStoreId) return;
    let cancelled = false;
    (async () => {
      const [{ data: groups }, { data: ranks }] = await Promise.all([
        supabase.from('option_groups').select('*').eq('store_id', currentStoreId).order('display_order'),
        supabase.from('cast_ranks').select('*').eq('store_id', currentStoreId).order('display_order'),
      ]);
      if (cancelled) return;
      const groupIds = (groups || []).map((g) => g.id);
      const { data: allItems } = groupIds.length
        ? await supabase.from('option_items').select('*').in('group_id', groupIds).eq('is_active', true).order('display_order')
        : { data: [] };
      if (cancelled) return;
      const itemIds = (allItems || []).map((i) => i.id);
      const { data: rankPriceRows } = itemIds.length
        ? await supabase.from('option_item_rank_prices').select('*').in('item_id', itemIds)
        : { data: [] };
      if (cancelled) return;

      const groupById = {}, itemsByGroup = {}, itemById = {};
      for (const g of (groups || [])) { groupById[g.id] = g; itemsByGroup[g.id] = []; }
      for (const item of (allItems || [])) {
        itemById[item.id] = item;
        if (itemsByGroup[item.group_id]) itemsByGroup[item.group_id].push(item);
      }
      const rankPrices = {};
      for (const rp of (rankPriceRows || [])) {
        if (!rankPrices[rp.item_id]) rankPrices[rp.item_id] = {};
        rankPrices[rp.item_id][rp.cast_rank_id] = rp.price;
      }

      const mastersData = { groups: groups || [], groupById, itemsByGroup, itemById, rankPrices, ranks: ranks || [] };
      setMasters(mastersData);

      const initSel = {};
      for (const g of (groups || [])) initSel[g.id] = g.multi_select ? new Set() : null;
      for (const si of (reservation?.selected_items || [])) {
        const g = groupById[si.group_id];
        if (!g) continue;
        if (g.multi_select) { if (!(initSel[g.id] instanceof Set)) initSel[g.id] = new Set(); initSel[g.id].add(si.item_id); }
        else initSel[g.id] = si.item_id;
      }
      setSelections(initSel);
    })();
    return () => { cancelled = true; };
  }, [currentStoreId]);

  // ── Load ladies ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentStoreId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('ladies').select('id, display_name, name, cast_rank_id, is_on_shift')
        .eq('is_active', true).eq('store_id', currentStoreId).order('display_name');
      if (!cancelled) setLadies(data || []);
    })();
    return () => { cancelled = true; };
  }, [currentStoreId]);

  // ── Load customer history ─────────────────────────────────────────────
  useEffect(() => {
    const cid = cust?.id || reservation?.customer_id;
    if (!cid) return;
    loadCustomerReservations(cid).then(setHistory);
  }, [cust?.id, reservation?.customer_id]);

  // ── Escape key ────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // ── Lady → cast rank ──────────────────────────────────────────────────
  useEffect(() => {
    const lady = ladies.find((l) => l.id === ladyId);
    setLadyCastRankId(lady?.cast_rank_id || null);
  }, [ladyId, ladies]);

  // ── First-meet detection ──────────────────────────────────────────────
  const customerId = cust?.id || reservation?.customer_id;
  const checkFirstMeet = useCallback(async (cid, lid) => {
    if (!cid || !lid) { setIsFirstMeet(null); return; }
    const { count } = await supabase.from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', cid).eq('lady_id', lid).eq('status', 'complete')
      .neq('id', reservation?.id || '00000000-0000-0000-0000-000000000000');
    setIsFirstMeet(count === 0);
  }, [reservation?.id]);

  useEffect(() => { checkFirstMeet(customerId, ladyId || null); }, [ladyId, customerId]);

  // ── Selection helpers ─────────────────────────────────────────────────
  const selectItem = useCallback((groupId, itemId, multi) => {
    setSelections((prev) => {
      if (multi) {
        const s = new Set(prev[groupId] instanceof Set ? prev[groupId] : []);
        s.has(itemId) ? s.delete(itemId) : s.add(itemId);
        return { ...prev, [groupId]: s };
      }
      return { ...prev, [groupId]: prev[groupId] === itemId ? null : itemId };
    });
  }, []);

  // ── Duration ──────────────────────────────────────────────────────────
  const { totalDuration, endTime } = useMemo(() => {
    if (!masters) return { totalDuration: 0, endTime: startTime };
    let dur = 0;
    for (const [gid, sel] of Object.entries(selections)) {
      const g = masters.groupById[gid];
      if (!g || !['course', 'extension'].includes(g.kind) || !sel || sel instanceof Set) continue;
      dur += masters.itemById[sel]?.duration_min || 0;
    }
    return { totalDuration: dur, endTime: dur > 0 ? addMinutes(startTime, dur) : startTime };
  }, [masters, selections, startTime]);

  // ── Line items & fee ──────────────────────────────────────────────────
  const lineItems = useMemo(() => {
    if (!masters) return [];
    const lines = [];
    const sortedGroups = [...masters.groups].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    for (const group of sortedGroups) {
      const sel = selections[group.id];
      if (!sel || (sel instanceof Set && sel.size === 0)) continue;
      const itemIds = sel instanceof Set ? [...sel] : [sel];
      for (const itemId of itemIds) {
        const item = masters.itemById[itemId];
        if (!item) continue;
        let basePrice;
        if (item.price_mode === 'per_rank') {
          const targetRank = ladyCastRankId || (masters.ranks[0]?.id ?? null);
          basePrice = targetRank ? (effectivePrice(masters.ranks, masters.rankPrices[itemId] || {}, targetRank) ?? 0) : 0;
        } else if (item.price_mode === 'flat') {
          basePrice = Number(item.price_flat) || 0;
        } else {
          basePrice = 0;
        }
        const mult = isTriple && Number(group.triple_multiplier) > 1 ? Number(group.triple_multiplier) : 1;
        const finalPrice = Math.round(basePrice * mult);
        const reward = rewardFor(item, finalPrice, { isFirstMeet: isFirstMeet === true });
        lines.push({ item_id: itemId, group_id: group.id, kind: group.kind, name: item.name, group_label: group.label, amount: finalPrice, reward });
      }
    }
    return lines;
  }, [masters, selections, ladyCastRankId, isTriple, isFirstMeet]);

  const totalAmount = useMemo(() => lineItems.reduce((s, l) => s + l.amount, 0) + Number(feeAdj || 0), [lineItems, feeAdj]);
  const totalReward = useMemo(() => lineItems.reduce((s, l) => s + l.reward, 0) + Number(rewardAdj || 0), [lineItems, rewardAdj]);

  // ── Save ──────────────────────────────────────────────────────────────
  const save = async () => {
    if (!cust?.id && !reservation?.customer_id) { showToast('error', '顧客情報がありません'); return; }
    setLoading(true);
    const courseGroup = masters?.groups.find((g) => g.kind === 'course');
    const courseItemId = courseGroup ? (selections[courseGroup.id] || null) : null;
    const hotelGroup = masters?.groups.find((g) => g.kind === 'hotel');
    const hotelItemId = hotelGroup ? (selections[hotelGroup.id] || null) : null;
    const payload = {
      customer_id: cust?.id || reservation.customer_id,
      store_id: storeId || currentStoreId,
      lady_id: ladyId || null,
      reserved_date: date,
      start_time: startTime + ':00',
      end_time: endTime + ':00',
      duration_min: totalDuration || null,
      status,
      room_no: roomNo || null,
      memo: memo || null,
      amount: totalAmount || null,
      course: courseItemId ? (masters.itemById[courseItemId]?.name ?? null) : null,
      hotel: hotelItemId ? (masters.itemById[hotelItemId]?.name ?? null) : null,
      selected_items: lineItems.map(({ item_id, group_id, kind, name, amount, reward }) => ({ item_id, group_id, kind, name, amount, reward })),
      cast_reward: totalReward || null,
      fee_adjustment: Number(feeAdj) || 0,
      reward_adjustment: Number(rewardAdj) || 0,
      payment_method: paymentMethod,
      advance_cash: advanceCash !== '' ? Number(advanceCash) : null,
      is_triple: isTriple,
      is_first_meet: isFirstMeet,
    };
    let resp;
    if (isEdit) resp = await supabase.from('reservations').update(payload).eq('id', reservation.id).select().single();
    else resp = await supabase.from('reservations').insert(payload).select().single();
    setLoading(false);
    if (resp.error) { showToast('error', '保存失敗: ' + resp.error.message); return; }
    showToast('success', isEdit ? '予約を更新しました' : '予約を登録しました');
    onSaved?.(resp.data);
    onClose();
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setLoading(true);
    const { error } = await supabase.from('reservations').delete().eq('id', reservation.id);
    setLoading(false);
    if (error) { showToast('error', '削除失敗: ' + error.message); return; }
    showToast('success', '予約を削除しました');
    onDeleted?.(reservation.id);
    onClose();
  };

  // ── Render helpers ────────────────────────────────────────────────────
  const renderGroup = (group) => {
    const items = (masters?.itemsByGroup[group.id] || []);
    if (!items.length) return null;
    const sel = selections[group.id];

    if (group.multi_select) {
      return (
        <div key={group.id} style={{ gridColumn: 'span 12' }} className="fw-field">
          <label>{group.label}</label>
          <div className="fw-checks">
            {items.map((item) => {
              const checked = sel instanceof Set && sel.has(item.id);
              const priceLabel = item.price_mode === 'flat' && item.price_flat
                ? (Number(item.price_flat) >= 0 ? `+¥${Number(item.price_flat).toLocaleString()}` : `−¥${Math.abs(Number(item.price_flat)).toLocaleString()}`)
                : null;
              const isNeg = item.price_flat < 0;
              return (
                <label key={item.id} className="fw-chk">
                  <input type="checkbox" checked={checked} onChange={() => selectItem(group.id, item.id, true)} />
                  {item.name}
                  {priceLabel && <span className={`price${isNeg ? ' neg' : ''}`}>{priceLabel}</span>}
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    // single-select: span based on kind
    const spanMap = { course: 4, nomination: 3, extension: 3, transport: 2, hotel: 7, media: 4, driver: 3 };
    const span = spanMap[group.kind] || 4;

    return (
      <div key={group.id} style={{ gridColumn: `span ${span}` }} className="fw-field">
        <label>{group.label}</label>
        <select
          className="fw-ctrl"
          value={typeof sel === 'string' ? sel : ''}
          onChange={(e) => setSelections((prev) => ({ ...prev, [group.id]: e.target.value || null }))}
        >
          <option value="">— なし —</option>
          {items.map((item) => {
            const price = item.price_mode === 'flat' && item.price_flat != null
              ? `  ¥${Number(item.price_flat).toLocaleString()}` : '';
            return <option key={item.id} value={item.id}>{item.name}{price}</option>;
          })}
        </select>
      </div>
    );
  };

  // ── Position style ────────────────────────────────────────────────────
  const posStyle = pos.x !== null
    ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto' }
    : {};

  const displayedLadies = onShiftOnly
    ? ladies.filter((l) => l.is_on_shift !== false)
    : ladies;

  const hotelGroup = masters?.groups.find((g) => g.kind === 'hotel');
  const hotelSelected = hotelGroup ? !!selections[hotelGroup.id] : false;

  const groupsByKind = {};
  if (masters) for (const g of masters.groups) { if (!groupsByKind[g.kind]) groupsByKind[g.kind] = []; groupsByKind[g.kind].push(g); }

  // Right panel: breakdown by kind
  const courseAmt = lineItems.filter(l => l.kind === 'course').reduce((s, l) => s + l.amount, 0);
  const extensionAmt = lineItems.filter(l => l.kind === 'extension').reduce((s, l) => s + l.amount, 0);
  const nominationAmt = lineItems.filter(l => l.kind === 'nomination').reduce((s, l) => s + l.amount, 0);
  const optionAmt = lineItems.filter(l => ['option', 'other'].includes(l.kind)).reduce((s, l) => s + l.amount, 0);
  const eventAmt = lineItems.filter(l => l.kind === 'event').reduce((s, l) => s + l.amount, 0);
  const transportAmt = lineItems.filter(l => l.kind === 'transport').reduce((s, l) => s + l.amount, 0);
  const discountAmt = lineItems.filter(l => l.kind === 'discount').reduce((s, l) => s + l.amount, 0);

  const shopKeep = totalAmount - totalReward;

  return (
    <>
      <div className="modal-overlay" style={{ background: 'transparent' }} onClick={onClose} />
      <div ref={rootRef} className="fw-root" style={posStyle}>

        {/* ── Head ── */}
        <div className="fw-head" onMouseDown={onDragStart}>
          <span className="fw-grip"><span/><span/><span/></span>
          <span className="fw-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            予約データ
          </span>
          <span className="fw-sep">·</span>
          <span className="fw-cust-name">{cust?.name || '顧客未選択'}</span>
          {cust?.kana && <span className="fw-kana">{cust.kana}</span>}
          {cust?.id && <span className="fw-mid-badge">{cust.id.slice(0, 6).toUpperCase()}</span>}
          <div className="fw-head-actions">
            <button className="fw-head-btn close" onClick={onClose} title="閉じる">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="fw-body">

          {/* LEFT: customer */}
          <aside className="fw-left">
            <div className="fw-sect">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0 1 16 0"/></svg>
              顧客データ
            </div>
            {cust ? (
              <div className="fw-cust-card">
                <div className="fw-cust-main">{cust.name}</div>
                <div className="fw-cust-sub">{cust.kana || ''}</div>
                {cust.phone_normalized && (
                  <div className="fw-cust-phone">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    {cust.phone_normalized}
                  </div>
                )}
                <div className="fw-cust-stats">
                  <div><span>利用</span><b>{history.filter(r => r.status === 'complete').length}回</b></div>
                  <div><span>累計</span><b style={{ fontFamily: 'monospace', fontSize: 11 }}>¥{(history.filter(r => r.status === 'complete').reduce((s, r) => s + (r.amount || 0), 0) / 1000).toFixed(0)}k</b></div>
                  <div><span>キャンセル</span><b>{history.filter(r => r.status === 'cancelled').length}回</b></div>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 12, padding: '8px 0' }}>顧客未選択</div>
            )}

            {cust?.shared_memo && (
              <>
                <div className="fw-sect" style={{ marginTop: 10 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                  メモ
                </div>
                <div className="fw-memo-box">{cust.shared_memo}</div>
              </>
            )}

            {history.length > 0 && (
              <>
                <div className="fw-sect" style={{ marginTop: 10 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg>
                  利用履歴
                  <span style={{ marginLeft: 'auto', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{history.length}件</span>
                </div>
                <div className="fw-hist">
                  <div className="fw-hist-head"><div>日付</div><div>女性 / 場所</div><div>時間</div><div style={{ textAlign: 'right' }}>料金</div></div>
                  {history.slice(0, 8).map((r) => (
                    <div key={r.id} className="fw-hist-row">
                      <div className="d">{fmtDate(r.reserved_date)}</div>
                      <div>
                        <div className="nm">{r.ladies?.display_name || '—'}</div>
                        <div className="pl">{r.hotel || ''}</div>
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--muted)' }}>{r.duration_min ? `${r.duration_min}分` : '—'}</div>
                      <div className="num">{r.amount ? `¥${(r.amount/1000).toFixed(0)}k` : '—'}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>

          {/* MIDDLE: form */}
          <section className="fw-form">
            <div className="fw-sect">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              予約入力
            </div>

            <div className="fw-grid12">

              {/* Store */}
              {stores && stores.length > 1 && (
                <div style={{ gridColumn: 'span 5' }} className="fw-field">
                  <label>店舗</label>
                  <select className="fw-ctrl" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                    {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {/* Status */}
              <div style={{ gridColumn: 'span 4' }} className="fw-field">
                <label>予約状況</label>
                <select className="fw-ctrl" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              {/* Payment */}
              <div style={{ gridColumn: 'span 3' }} className="fw-field">
                <label>支払方法</label>
                <select className="fw-ctrl" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="cash">現金</option>
                  <option value="card">カード</option>
                </select>
              </div>

              {/* Date / Time */}
              <div style={{ gridColumn: 'span 5' }} className="fw-field">
                <label>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  日時
                </label>
                <div className="fw-time-row">
                  <input className="fw-ctrl" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ flex: 1 }} />
                  <input className="fw-ctrl" type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); setQuickActive(null); }} style={{ width: 84 }} />
                </div>
              </div>
              <div style={{ gridColumn: 'span 7' }} className="fw-field">
                <label>クイック設定</label>
                <div className="fw-quick">
                  {QUICK_OFFSETS.map((m) => (
                    <button
                      key={m}
                      className={quickActive === m ? 'active' : ''}
                      onClick={() => { setStartTime(nowPlusMinutes(m)); setQuickActive(m); }}
                    >{m}分後</button>
                  ))}
                </div>
              </div>

              {/* Lady */}
              <div style={{ gridColumn: 'span 7' }} className="fw-field">
                <label>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0 1 16 0"/></svg>
                  指名女性
                </label>
                <select className="fw-ctrl" value={ladyId} onChange={(e) => setLadyId(e.target.value)}>
                  <option value="">— 未指定(フリー)—</option>
                  {displayedLadies.map((l) => <option key={l.id} value={l.id}>{l.display_name || l.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 5', display: 'flex', gap: 14, alignItems: 'flex-end', paddingBottom: 4 }}>
                <label className="fw-chk">
                  <input type="checkbox" checked={onShiftOnly} onChange={(e) => setOnShiftOnly(e.target.checked)} />
                  出勤のみ表示
                </label>
                <label className="fw-chk">
                  <input type="checkbox" checked={isTriple} onChange={(e) => setIsTriple(e.target.checked)} />
                  3P
                </label>
              </div>

              {/* First-meet badge */}
              {ladyId && isFirstMeet !== null && (
                <div style={{ gridColumn: 'span 12' }}>
                  <span className={isFirstMeet ? 'fw-first-badge' : 'fw-repeat-badge'}>
                    {isFirstMeet ? '✓ 初回（初回報酬が適用されます）' : '再訪（リピート報酬）'}
                  </span>
                </div>
              )}

              {/* All item groups */}
              {masters && KIND_ORDER.flatMap((kind) => (groupsByKind[kind] || []).map(renderGroup)).filter(Boolean)}

              {/* Room number (when hotel selected) */}
              {hotelSelected && (
                <div style={{ gridColumn: 'span 2' }} className="fw-field">
                  <label>部屋番号</label>
                  <input className="fw-ctrl" value={roomNo} onChange={(e) => setRoomNo(e.target.value)} placeholder="—" />
                </div>
              )}

              {/* Duration / end time */}
              {totalDuration > 0 && (
                <div style={{ gridColumn: 'span 4', display: 'flex', gap: 8 }}>
                  <div className="fw-field" style={{ flex: 1 }}>
                    <label>プレイ時間</label>
                    <input className="fw-ctrl" value={`${totalDuration}分`} readOnly />
                  </div>
                  <div className="fw-field" style={{ flex: 1 }}>
                    <label>終了時刻</label>
                    <input className="fw-ctrl" value={endTime} readOnly style={{ fontFamily: 'monospace' }} />
                  </div>
                </div>
              )}

              {/* Memo */}
              <div style={{ gridColumn: 'span 12' }} className="fw-field">
                <label>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
                  メモ
                </label>
                <textarea className="fw-ctrl" value={memo} onChange={(e) => setMemo(e.target.value)} />
              </div>

            </div>
          </section>

          {/* RIGHT: calc */}
          <aside className="fw-right">
            <div className="fw-sect">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
              金額計算
            </div>

            <div className="fw-field">
              <label>釣銭用前渡し現金</label>
              <div className="fw-yen-wrap">
                <input className="fw-ctrl" value={advanceCash} onChange={(e) => setAdvanceCash(e.target.value)} placeholder="0" type="number" />
              </div>
            </div>

            {lineItems.length > 0 && (
              <div className="fw-calc-list">
                {courseAmt > 0 && <div className="fw-kv"><span className="k">コース</span><span className="v">{yen(courseAmt)}</span></div>}
                {extensionAmt > 0 && <div className="fw-kv"><span className="k">延長</span><span className="v">{yen(extensionAmt)}</span></div>}
                {nominationAmt > 0 && <div className="fw-kv"><span className="k">指名</span><span className="v">{yen(nominationAmt)}</span></div>}
                {optionAmt > 0 && <div className="fw-kv"><span className="k">OP合計</span><span className="v">{yen(optionAmt)}</span></div>}
                {transportAmt > 0 && <div className="fw-kv"><span className="k">交通費</span><span className="v">{yen(transportAmt)}</span></div>}
                {eventAmt !== 0 && <div className="fw-kv"><span className="k">イベント</span><span className={`v${eventAmt < 0 ? ' neg' : ''}`}>{eventAmt < 0 ? `−¥${Math.abs(eventAmt).toLocaleString()}` : yen(eventAmt)}</span></div>}
                {discountAmt !== 0 && <div className="fw-kv"><span className="k">割引</span><span className="v neg">−¥{Math.abs(discountAmt).toLocaleString()}</span></div>}
              </div>
            )}

            <div className="fw-field">
              <label>料金補正</label>
              <input className="fw-ctrl" type="number" value={feeAdj} onChange={(e) => setFeeAdj(e.target.value)} style={{ textAlign: 'right', fontFamily: 'monospace' }} />
            </div>

            <div className="fw-total-card fee">
              <div className="lbl">料金合計</div>
              <div className="num">{yen(totalAmount)}</div>
            </div>

            <div className="fw-field">
              <label>報酬補正</label>
              <input className="fw-ctrl" type="number" value={rewardAdj} onChange={(e) => setRewardAdj(e.target.value)} style={{ textAlign: 'right', fontFamily: 'monospace' }} />
            </div>

            <div className="fw-total-card reward">
              <div className="lbl">報酬合計</div>
              <div className="num">{yen(totalReward)}</div>
              {shopKeep > 0 && <div className="sub">店売 {yen(shopKeep)}</div>}
            </div>
          </aside>
        </div>

        {/* ── Footer ── */}
        <div className="fw-foot">
          {isEdit && (
            <button className="fw-btn danger" onClick={handleDelete} disabled={loading}>
              <Icon name="trash" size={12} />{confirmDelete ? '本当に削除する' : '削除'}
            </button>
          )}
          <button className="fw-btn" onClick={onClose} disabled={loading}>キャンセル</button>
          <span className="fw-meta">{isEdit ? `予約ID: ${reservation.id.slice(0, 8)}` : '新規予約'}</span>
          <button className="fw-btn primary" onClick={save} disabled={loading}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            {loading ? '保存中...' : (isEdit ? '更新する' : '予約を確定')}
          </button>
        </div>
      </div>
    </>
  );
}
