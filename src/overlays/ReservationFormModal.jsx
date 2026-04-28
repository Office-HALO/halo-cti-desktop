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

const NOMINATION_TYPES = [
  { value: 'free',   label: 'フリー' },
  { value: 'panel',  label: 'パネル指名' },
  { value: 'net',    label: 'ネット指名' },
  { value: 'honshi', label: '本指名' },
];

const MOCK_FIRST_MEDIA = ['HP', '口コミ・紹介', '看板・ポスター', 'チラシ', 'SNS/Instagram', 'X(Twitter)', 'ホットペッパー', '店頭', 'その他'];
const COURSE_KIND_ORDER = ['course', 'nomination', 'extension', 'event', 'option', 'discount', 'media', 'other'];
const AVATAR_HUES = [245, 30, 150, 300, 200, 90, 350, 180];

const DEFAULT_FIELD_SETTINGS = {
  showContactRow:  true,
  showAddressRow:  true,
  showMapUrl:      false,
  showIdRows:      false,
  showBirthdayRow: false,
  showPointsRow:   true,
  showAutoCall:    false,
  showDrivers:     true,
  showMeetingPlace: true,
  histCols: {
    extension: true, nomination: true, hotel: true, memo: true,
    roomNo: false, option: false, card: true, transport: false,
    discount: false, castReward: true, total: true, shopKeep: false,
  },
};

function avatarHue(name) {
  if (!name) return 245;
  return AVATAR_HUES[name.charCodeAt(0) % AVATAR_HUES.length];
}
function toHHMM(d) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function trimSec(t) { return (t || '').slice(0, 5); }
function addMinutes(hhmm, min) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + min;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2,'0')}:${String(wrapped % 60).padStart(2,'0')}`;
}
function nowPlusMinutes(min) { return toHHMM(new Date(Date.now() + min * 60 * 1000)); }
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function ReservationFormModal({ customer, reservation, onClose, onSaved, onDeleted, standalone = false }) {
  const isEdit = !!reservation?.id;
  const cust = customer || reservation?.customer || null;
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const stores = useAppStore((s) => s.stores);
  const currentStaff = useAppStore((s) => s.currentStaff);

  const rootRef = useRef(null);
  const dragRef = useRef(null);
  const saveRef = useRef(null);
  const [pos, setPos] = useState({ x: null, y: null });

  const [masters, setMasters] = useState(null);
  const [ladies, setLadies] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isFirstMeet, setIsFirstMeet] = useState(null);
  const [ladyCastRankId, setLadyCastRankId] = useState(null);
  const [quickActive, setQuickActive] = useState(null);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [savedDialogVisible, setSavedDialogVisible] = useState(false);
  const [selections, setSelections] = useState({});
  const [showSettings, setShowSettings] = useState(false);

  const [fieldSettings, setFieldSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('rfm_field_settings') || 'null');
      if (!saved) return DEFAULT_FIELD_SETTINGS;
      return { ...DEFAULT_FIELD_SETTINGS, ...saved, histCols: { ...DEFAULT_FIELD_SETTINGS.histCols, ...(saved.histCols || {}) } };
    } catch { return DEFAULT_FIELD_SETTINGS; }
  });

  const [date,            setDate]            = useState(reservation?.reserved_date || todayISO());
  const [startTime,       setStartTime]       = useState(reservation?.start_time ? trimSec(reservation.start_time) : toHHMM(new Date(Date.now() + 30 * 60 * 1000)));
  const [ladyId,          setLadyId]          = useState(reservation?.lady_id || '');
  const [isTriple,        setIsTriple]        = useState(reservation?.is_triple || false);
  const [status,          setStatus]          = useState(reservation?.status || 'reserved');
  const [memo,            setMemo]            = useState(reservation?.memo || '');
  const [roomNo,          setRoomNo]          = useState(reservation?.room_no || '');
  const [feeAdj,          setFeeAdj]          = useState(reservation?.fee_adjustment ?? 0);
  const [rewardAdj,       setRewardAdj]       = useState(reservation?.reward_adjustment ?? 0);
  const [paymentMethod,   setPaymentMethod]   = useState(reservation?.payment_method || 'cash');
  const [storeId,         setStoreId]         = useState(reservation?.store_id || currentStoreId || '');
  const [nominationType,  setNominationType]  = useState(reservation?.nomination_type || 'honshi');
  const [receptionMethod, setReceptionMethod] = useState(reservation?.reception_method || '');
  const [firstMedia,      setFirstMedia]      = useState(reservation?.first_media || '');
  const [ladyStatus,      setLadyStatus]      = useState(reservation?.lady_status || '');
  const [sendDriver,      setSendDriver]      = useState(reservation?.send_driver || '');
  const [receiveDriver,   setReceiveDriver]   = useState(reservation?.receive_driver || '');
  const [receiptNo,       setReceiptNo]       = useState(reservation?.receipt_no || '');

  useEffect(() => {
    localStorage.setItem('rfm_field_settings', JSON.stringify(fieldSettings));
  }, [fieldSettings]);

  const updateSetting = useCallback((key, value) => {
    setFieldSettings(prev => ({ ...prev, [key]: value }));
  }, []);
  const updateHistCol = useCallback((col, value) => {
    setFieldSettings(prev => ({ ...prev, histCols: { ...prev.histCols, [col]: value } }));
  }, []);

  // ── Drag ──────────────────────────────────────────────────────────────
  const onDragStart = useCallback((e) => {
    if (e.target.closest('button,input,select,textarea')) return;
    const rect = rootRef.current.getBoundingClientRect();
    dragRef.current = { mx: e.clientX, my: e.clientY, x: rect.left, y: rect.top };
  }, []);
  useEffect(() => {
    const move = (e) => {
      if (!dragRef.current) return;
      setPos({ x: dragRef.current.x + e.clientX - dragRef.current.mx, y: Math.max(0, dragRef.current.y + e.clientY - dragRef.current.my) });
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
      for (const item of (allItems || [])) { itemById[item.id] = item; if (itemsByGroup[item.group_id]) itemsByGroup[item.group_id].push(item); }
      const rankPrices = {};
      for (const rp of (rankPriceRows || [])) { if (!rankPrices[rp.item_id]) rankPrices[rp.item_id] = {}; rankPrices[rp.item_id][rp.cast_rank_id] = rp.price; }
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
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('ladies').select('*').eq('is_active', true).order('display_name');
      const rows = (data || []).filter((l) => !currentStoreId || !l.store_id || l.store_id === currentStoreId);
      if (!cancelled) setLadies(rows);
    })();
    return () => { cancelled = true; };
  }, [currentStoreId]);

  // ── Load history ──────────────────────────────────────────────────────
  useEffect(() => {
    const cid = cust?.id || reservation?.customer_id;
    if (!cid) return;
    loadCustomerReservations(cid).then(setHistory);
  }, [cust?.id, reservation?.customer_id]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) { e.preventDefault(); saveRef.current?.(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // ── Lady → cast rank ──────────────────────────────────────────────────
  useEffect(() => {
    const lady = ladies.find((l) => l.id === ladyId);
    setLadyCastRankId(lady?.cast_rank_id || null);
  }, [ladyId, ladies]);

  // ── First-meet ────────────────────────────────────────────────────────
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

  // ── Duration / endTime ────────────────────────────────────────────────
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

  // ── Line items ────────────────────────────────────────────────────────
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
        } else { basePrice = 0; }
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
  const save = useCallback(async () => {
    setLoading(true);
    const courseGroup = masters?.groups.find((g) => g.kind === 'course');
    const courseItemId = courseGroup ? (selections[courseGroup.id] || null) : null;
    const hotelGroup = masters?.groups.find((g) => g.kind === 'hotel');
    const hotelItemId = hotelGroup ? (selections[hotelGroup.id] || null) : null;
    const payload = {
      customer_id:    cust?.id || reservation?.customer_id || null,
      store_id:       storeId || currentStoreId,
      lady_id:        ladyId || null,
      reserved_date:  date,
      start_time:     startTime + ':00',
      end_time:       endTime + ':00',
      duration_min:   totalDuration || null,
      status,
      room_no:        roomNo || null,
      memo:           memo || null,
      amount:         totalAmount || null,
      course:         courseItemId ? (masters.itemById[courseItemId]?.name ?? null) : null,
      hotel:          hotelItemId  ? (masters.itemById[hotelItemId]?.name  ?? null) : null,
      selected_items: lineItems.map(({ item_id, group_id, kind, name, amount, reward }) => ({ item_id, group_id, kind, name, amount, reward })),
      cast_reward:    totalReward || null,
      fee_adjustment:    Number(feeAdj)    || 0,
      reward_adjustment: Number(rewardAdj) || 0,
      payment_method: paymentMethod,
      is_triple:      isTriple,
      is_first_meet:  isFirstMeet,
      first_media:    firstMedia    || null,
      lady_status:    ladyStatus    || null,
      send_driver:    sendDriver    || null,
      receive_driver: receiveDriver || null,
      receipt_no:     receiptNo     || null,
      updated_by:     currentStaff?.id || null,
    };
    let resp;
    if (isEdit) resp = await supabase.from('reservations').update(payload).eq('id', reservation.id).select().single();
    else resp = await supabase.from('reservations').insert(payload).select().single();
    setLoading(false);
    if (resp.error) { showToast('error', '保存失敗: ' + resp.error.message); return; }
    setLastSavedAt(new Date());
    onSaved?.(resp.data);
    setSavedDialogVisible(true);
  }, [masters, selections, cust, reservation, storeId, currentStoreId, ladyId, date, startTime, endTime, totalDuration, status, roomNo, memo, totalAmount, totalReward, lineItems, feeAdj, rewardAdj, paymentMethod, isTriple, isFirstMeet, firstMedia, ladyStatus, sendDriver, receiveDriver, receiptNo, currentStaff, isEdit]);

  useEffect(() => { saveRef.current = save; }, [save]);

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

  // ── Computed values ───────────────────────────────────────────────────
  const groupsByKind = {};
  if (masters) for (const g of masters.groups) { if (!groupsByKind[g.kind]) groupsByKind[g.kind] = []; groupsByKind[g.kind].push(g); }

  const courseAmt    = lineItems.filter(l => l.kind === 'course').reduce((s, l) => s + l.amount, 0);
  const extAmt       = lineItems.filter(l => l.kind === 'extension').reduce((s, l) => s + l.amount, 0);
  const extReward    = lineItems.filter(l => l.kind === 'extension').reduce((s, l) => s + l.reward, 0);
  const nomAmt       = lineItems.filter(l => l.kind === 'nomination').reduce((s, l) => s + l.amount, 0);
  const nomReward    = lineItems.filter(l => l.kind === 'nomination').reduce((s, l) => s + l.reward, 0);
  const optAmt       = lineItems.filter(l => ['option','other'].includes(l.kind)).reduce((s, l) => s + l.amount, 0);
  const optReward    = lineItems.filter(l => ['option','other'].includes(l.kind)).reduce((s, l) => s + l.reward, 0);
  const transportAmt = lineItems.filter(l => l.kind === 'transport').reduce((s, l) => s + l.amount, 0);
  const discountAmt  = lineItems.filter(l => l.kind === 'discount').reduce((s, l) => s + l.amount, 0);
  const courseReward = lineItems.filter(l => l.kind === 'course').reduce((s, l) => s + l.reward, 0);
  const shopKeep     = totalAmount - totalReward;

  const courseGroup = masters?.groups.find((g) => g.kind === 'course');
  const courseItem  = courseGroup ? masters?.itemById[selections[courseGroup?.id]] : null;

  const completedHistory = history.filter(r => r.status === 'complete');
  const ltv = completedHistory.reduce((s, r) => s + (r.amount || 0), 0);

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'honshimei') return history.filter(r => ladyId && r.lady_id === ladyId);
    if (historyFilter === 'samecourse') return history.filter(r => courseItem && r.course === courseItem.name);
    if (historyFilter === 'samehotel') {
      const hg = masters?.groups.find(g => g.kind === 'hotel');
      const hi = hg ? masters?.itemById[selections[hg?.id]] : null;
      return history.filter(r => hi && r.hotel === hi.name);
    }
    return history;
  }, [history, historyFilter, ladyId, courseItem, masters, selections]);

  const thirtyMinBefore = totalDuration > 0 ? addMinutes(endTime, -30) : null;
  const lastSavedStr = lastSavedAt
    ? `${String(lastSavedAt.getHours()).padStart(2,'0')}:${String(lastSavedAt.getMinutes()).padStart(2,'0')}`
    : null;

  const posStyle = standalone
    ? { position: 'relative', width: '100%', height: '100vh', borderRadius: 0, top: 'auto', right: 'auto', maxHeight: '100vh' }
    : pos.x !== null ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto' } : {};

  // ── Helper: render a select for a masters group ───────────────────────
  const GroupSelect = ({ kind, placeholder, className }) => {
    const groups = groupsByKind[kind] || [];
    if (!masters || !groups.length) return <select className={`rf-sel ${className || 'rf-flex1'}`}><option value="">{ placeholder || '—'}</option></select>;
    return groups.map(g => {
      const items = masters.itemsByGroup[g.id] || [];
      const sel = selections[g.id];
      return (
        <select key={g.id} className={`rf-sel ${className || 'rf-flex1'}`}
          value={typeof sel === 'string' ? sel : ''}
          onChange={e => setSelections(prev => ({ ...prev, [g.id]: e.target.value || null }))}>
          <option value="">{placeholder || '— なし —'}</option>
          {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      );
    });
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      {!standalone && <div className="modal-overlay" style={{ background: 'transparent' }} onClick={onClose} />}
      <div ref={rootRef} className="rf-root" style={posStyle}>

        {/* ── Header ── */}
        <div className="rf-head" onMouseDown={onDragStart}>
          <div className="rf-head-left">
            <span className="rf-grip">⠿</span>
            <span className="rf-title">■ 受付入力</span>
            {isEdit && <span className="rf-edit-badge">編集</span>}
          </div>
          <div className="rf-head-right">
            <button className="rf-hbtn" onClick={() => setShowSettings(s => !s)}>⚙ 表示設定</button>
            {currentStaff && (
              <span className="rf-head-staff">
                <span className="rf-head-av" style={{ background: `oklch(0.55 0.16 ${avatarHue(currentStaff.name)})` }}>
                  {currentStaff.name?.[0] || 'S'}
                </span>
                {currentStaff.name}
              </span>
            )}
            {lastSavedStr && <span className="rf-head-saved">最終 {lastSavedStr}</span>}
            <button className="rf-hbtn close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── Settings panel ── */}
        {showSettings && (
          <div className="rf-settings">
            <div className="rf-settings-title">表示フィールド設定</div>
            <div className="rf-settings-body">
              <div className="rf-settings-section">
                <div className="rf-settings-section-title">フォーム</div>
                {[
                  ['showDrivers', '送り / 迎えドライバー'],
                ].map(([key, label]) => (
                  <label key={key} className="rf-settings-chk">
                    <input type="checkbox" checked={fieldSettings[key]} onChange={e => updateSetting(key, e.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Main 3-column layout ── */}
        <div className="rf-cols">

          {/* ── Left: Customer panel ── */}
          <div className="rf-left">
            <div className="rf-cust-av" style={{ background: `oklch(0.55 0.16 ${avatarHue(cust?.name)})` }}>
              {cust?.name?.[0] || '?'}
            </div>
            <div className="rf-cust-nm">{cust?.name || '顧客未選択'}</div>
            {cust?.kana && <div className="rf-cust-kn">{cust.kana}</div>}
            <span className={`rf-member-no${!cust?.customer_no ? ' empty' : ''}`} style={{ margin: '4px 0', alignSelf: 'center' }}>
              {cust?.customer_no ? `V${String(cust.customer_no).padStart(5, '0')}` : '—'}
            </span>

            <div className="rf-left-rows">
              <div className="rf-left-row">
                <span className="rf-lbl">TEL</span>
                <span className="rf-left-val mono">{cust?.phone_normalized || '—'}</span>
              </div>
              <div className="rf-left-row">
                <span className="rf-lbl">来店</span>
                <span className="rf-left-val">{history.length}回</span>
                {isFirstMeet !== null && (
                  <span className={`rf-meet-badge ${isFirstMeet ? 'first' : 'repeat'}`} style={{ marginLeft: 4, padding: '0 5px', fontSize: 10 }}>
                    {isFirstMeet ? '初回' : 'リピ'}
                  </span>
                )}
              </div>
              <div className="rf-left-row">
                <span className="rf-lbl">累計</span>
                <span className="rf-left-val rf-ltv">¥{ltv.toLocaleString()}</span>
              </div>
              {cust?.email && (
                <div className="rf-left-row">
                  <span className="rf-lbl">Mail</span>
                  <span className="rf-left-val rf-left-sm">{cust.email}</span>
                </div>
              )}
              {cust?.address && (
                <div className="rf-left-row">
                  <span className="rf-lbl">住所</span>
                  <span className="rf-left-val rf-left-sm">{cust.address}</span>
                </div>
              )}
            </div>

            {cust?.shared_memo && (
              <div className="rf-cust-note shared">
                <div className="rf-cust-note-lbl">共有メモ</div>
                <div className="rf-cust-note-body">{cust.shared_memo}</div>
              </div>
            )}
            {cust?.alert_memo && (
              <div className="rf-cust-note alert">
                <div className="rf-cust-note-lbl">⚠ 要注意</div>
                <div className="rf-cust-note-body">{cust.alert_memo}</div>
              </div>
            )}
          </div>

          {/* ── Center: Form sections ── */}
          <div className="rf-center">

            {/* Section ① 受付情報 */}
            <div className="rf-sect">
              <div className="rf-sect-hd">
                <span className="rf-sect-num">①</span>受付情報
              </div>

              <div className="rf-fr">
                <span className="rf-lbl">店舗</span>
                {stores?.length > 0 ? (
                  <select className="rf-sel rf-flex1" value={storeId} onChange={e => setStoreId(e.target.value)}>
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                ) : (
                  <input className="rf-inp rf-flex1" readOnly placeholder="—" />
                )}
              </div>

              <div className="rf-fr">
                <span className="rf-lbl">開始日時</span>
                <input className="rf-inp rf-w-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
                <input className="rf-inp rf-w-time" type="time" value={startTime} onChange={e => { setStartTime(e.target.value); setQuickActive(null); }} />
                <div className="rf-quick-btns">
                  {[0, 15, 30, 60].map(m => (
                    <button key={m} className={`rf-qbtn${quickActive === m ? ' active' : ''}`}
                      onClick={() => { setStartTime(nowPlusMinutes(m)); setQuickActive(m); }}>
                      {m === 0 ? '今' : `+${m}`}
                    </button>
                  ))}
                </div>
              </div>

              {totalDuration > 0 && (
                <div className="rf-fr rf-time-row">
                  {thirtyMinBefore && (
                    <>
                      <span className="rf-lbl">30分前</span>
                      <span className="rf-time-chip pre">{thirtyMinBefore.replace(':', '時')}分</span>
                    </>
                  )}
                  <span className="rf-lbl" style={{ marginLeft: thirtyMinBefore ? 6 : 0 }}>終了</span>
                  <span className="rf-time-chip end">{endTime.replace(':', '時')}分</span>
                </div>
              )}

              <div className="rf-fr">
                <span className="rf-lbl">指名</span>
                <select className="rf-sel rf-flex1" value={nominationType} onChange={e => setNominationType(e.target.value)}>
                  {NOMINATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div className="rf-fr">
                <span className="rf-lbl">受付</span>
                <select className="rf-sel rf-flex1" value={receptionMethod} onChange={e => setReceptionMethod(e.target.value)}>
                  <option value="">—</option>
                  <option value="online">オンライン</option>
                  <option value="phone">電話</option>
                  <option value="walk_in">飛び込み</option>
                </select>
                <span className="rf-lbl sm">初回媒体</span>
                <select className="rf-sel rf-flex1" value={firstMedia} onChange={e => setFirstMedia(e.target.value)}>
                  <option value="">—</option>
                  {MOCK_FIRST_MEDIA.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="rf-fr">
                <span className="rf-lbl">予約状況</span>
                <select className="rf-sel rf-flex1" value={status} onChange={e => setStatus(e.target.value)}>
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <span className="rf-lbl sm">女子状況</span>
                <input className="rf-inp rf-flex1" value={ladyStatus} onChange={e => setLadyStatus(e.target.value)} placeholder="—" />
              </div>

              <div className="rf-fr">
                <span className="rf-lbl">号室</span>
                <input className="rf-inp rf-w-room" value={roomNo} onChange={e => setRoomNo(e.target.value)} placeholder="—" />
                <span className="rf-lbl sm">受付番号</span>
                <input className="rf-inp rf-w-num" value={receiptNo} onChange={e => setReceiptNo(e.target.value)} placeholder="—" />
              </div>

              {fieldSettings.showDrivers && (
                <div className="rf-fr">
                  <span className="rf-lbl">送りD</span>
                  <select className="rf-sel rf-flex1" value={sendDriver} onChange={e => setSendDriver(e.target.value)}>
                    <option value="">—</option>
                    {['田中', '山田', '佐藤'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <span className="rf-lbl sm">迎えD</span>
                  <select className="rf-sel rf-flex1" value={receiveDriver} onChange={e => setReceiveDriver(e.target.value)}>
                    <option value="">—</option>
                    {['田中', '山田', '佐藤'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Section ② 女子・コース選択 */}
            <div className="rf-sect">
              <div className="rf-sect-hd">
                <span className="rf-sect-num">②</span>女子・コース選択
              </div>

              <div className="rf-fr">
                <span className="rf-lbl">コンパニオン</span>
                <select className="rf-sel rf-flex1" value={ladyId} onChange={e => setLadyId(e.target.value)}>
                  <option value="">— 未指定（フリー）—</option>
                  {ladies.map(l => <option key={l.id} value={l.id}>{l.display_name || l.name}</option>)}
                </select>
                {isFirstMeet !== null && (
                  <span className={`rf-meet-badge ${isFirstMeet ? 'first' : 'repeat'}`} style={{ marginLeft: 4 }}>
                    {isFirstMeet ? '初回' : 'リピーター'}
                  </span>
                )}
              </div>

              <div className="rf-fr">
                <span className="rf-lbl">場所/ホテル</span>
                <GroupSelect kind="hotel" placeholder="— なし —" />
              </div>

              <div className="rf-fr">
                <span className="rf-lbl">基本コース</span>
                <GroupSelect kind="course" placeholder="— コースなし —" />
              </div>

              <div className="rf-fr">
                <span className="rf-lbl">延長</span>
                <GroupSelect kind="extension" placeholder="— 延長なし —" />
                <button className="rf-sbtn" onClick={() => setStartTime(toHHMM(new Date()))}>今から開始</button>
              </div>

              {masters && COURSE_KIND_ORDER
                .filter(k => ['event', 'discount', 'option'].includes(k))
                .flatMap(kind => groupsByKind[kind] || [])
                .map(g => {
                  const items = masters.itemsByGroup[g.id] || [];
                  if (!items.length) return null;
                  const sel = selections[g.id];
                  return (
                    <div key={g.id} className="rf-fr rf-chips-row">
                      <span className="rf-lbl">{g.label}</span>
                      <div className="rf-chips">
                        {items.map(item => {
                          const checked = g.multi_select
                            ? (sel instanceof Set && sel.has(item.id))
                            : sel === item.id;
                          return (
                            <label key={item.id} className={`rf-chip${checked ? ' on' : ''}`}>
                              <input type="checkbox" checked={checked}
                                onChange={() => selectItem(g.id, item.id, g.multi_select)} />
                              {item.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              }

              <div className="rf-fr">
                <span className="rf-lbl">メモ</span>
                <textarea className="rf-opt-memo rf-flex1" value={memo} onChange={e => setMemo(e.target.value)} rows={2} />
              </div>
            </div>

          </div>

          {/* ── Right: Pricing ── */}
          <div className="rf-right">
            <div className="rf-price-hd">客払い</div>
            <div className="rf-price-big">¥{totalAmount.toLocaleString()}</div>

            <label className="rf-chklbl" style={{ marginBottom: 8 }}>
              <input type="checkbox" checked={paymentMethod === 'card'} onChange={e => setPaymentMethod(e.target.checked ? 'card' : 'cash')} />
              カード利用
            </label>

            <div className="rf-col-hd">費払い合計</div>
            <table className="rf-ptable">
              <tbody>
                {courseAmt > 0 && <tr><td className="pklbl">コース</td><td className="pkval">{courseAmt.toLocaleString()}</td></tr>}
                {extAmt > 0 && <tr><td className="pklbl">延長</td><td className="pkval">{extAmt.toLocaleString()}</td></tr>}
                {nomAmt > 0 && <tr><td className="pklbl">指名</td><td className="pkval">{nomAmt.toLocaleString()}</td></tr>}
                {optAmt > 0 && <tr><td className="pklbl">オプション</td><td className="pkval">{optAmt.toLocaleString()}</td></tr>}
                {transportAmt > 0 && <tr><td className="pklbl">交通費</td><td className="pkval">{transportAmt.toLocaleString()}</td></tr>}
                {discountAmt !== 0 && <tr><td className="pklbl discount">割引</td><td className="pkval discount">△{Math.abs(discountAmt).toLocaleString()}</td></tr>}
                {Number(feeAdj) !== 0 && <tr><td className="pklbl">料金補正</td><td className="pkval">{Number(feeAdj) > 0 ? '+' : ''}{Number(feeAdj).toLocaleString()}</td></tr>}
                <tr className="rf-ptable-total">
                  <td className="pklbl total">合計</td>
                  <td className="pkval total">{totalAmount.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>

            <div className="rf-price-adj" style={{ marginTop: 2 }}>
              <span className="rf-lbl sm">料金補正</span>
              <input className="rf-inp rf-flex1 rf-text-right" type="number" value={feeAdj} onChange={e => setFeeAdj(e.target.value)} />
            </div>

            <div className="rf-col-hd" style={{ marginTop: 8 }}>報酬合計</div>
            <table className="rf-ptable">
              <tbody>
                {courseReward > 0 && <tr><td className="pklbl back">コース</td><td className="pkval back">{courseReward.toLocaleString()}</td></tr>}
                {extReward > 0 && <tr><td className="pklbl back">延長</td><td className="pkval back">{extReward.toLocaleString()}</td></tr>}
                {nomReward > 0 && <tr><td className="pklbl back">指名</td><td className="pkval back">{nomReward.toLocaleString()}</td></tr>}
                {optReward > 0 && <tr><td className="pklbl back">オプション</td><td className="pkval back">{optReward.toLocaleString()}</td></tr>}
                {Number(rewardAdj) !== 0 && <tr><td className="pklbl back">補正</td><td className="pkval back">{Number(rewardAdj) > 0 ? '+' : ''}{Number(rewardAdj).toLocaleString()}</td></tr>}
                <tr className="rf-ptable-total">
                  <td className="pklbl back reward">報酬合計</td>
                  <td className="pkval back reward">{totalReward.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="pklbl back shop">店売</td>
                  <td className="pkval back shop">{shopKeep > 0 ? shopKeep.toLocaleString() : '—'}</td>
                </tr>
              </tbody>
            </table>

            <div className="rf-price-adj">
              <span className="rf-lbl sm">報酬補正</span>
              <input className="rf-inp rf-flex1 rf-text-right" type="number" value={rewardAdj} onChange={e => setRewardAdj(e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── History: list ── */}
        <div className="rf-hist-sect">
          <div className="rf-hist-bar">
            <span className="rf-hist-ttl">利用履歴 ({filteredHistory.length}件)</span>
            <div className="rf-hist-tabs">
              {[['すべて', 'all'], ['本指名のみ', 'honshimei'], ['同コース', 'samecourse'], ['同ホテル', 'samehotel']].map(([lbl, val]) => (
                <button key={val} className={`rf-htab${historyFilter === val ? ' active' : ''}`}
                  onClick={() => setHistoryFilter(val)}>{lbl}</button>
              ))}
            </div>
            <span className="rf-hist-ltv">累計 ¥{ltv.toLocaleString()}</span>
          </div>
          <div className="rf-hlist">
            {filteredHistory.length === 0 ? (
              <div className="rf-hlist-empty">履歴なし</div>
            ) : filteredHistory.map((r, i) => {
              const ext = r.selected_items?.find(si => si.kind === 'extension');
              const lady = ladies.find(l => l.id === r.lady_id);
              const statusObj = STATUSES.find(s => s.value === r.status);
              return (
                <div key={r.id} className={`rf-hlist-row${i % 2 ? ' alt' : ''}${r.status === 'cancelled' ? ' cancelled' : ''}`}>
                  <span className="rf-hlist-date">{r.reserved_date?.slice(5).replace('-', '/')}</span>
                  <span className="rf-hlist-course">{r.course || '—'}</span>
                  <span className="rf-hlist-ext">{ext ? `+${ext.name}` : ''}</span>
                  <span className="rf-hlist-lady">{lady?.display_name || lady?.name || '—'}</span>
                  <span className="rf-hlist-hotel">{r.hotel || '—'}</span>
                  <span className="rf-hlist-memo">{r.memo || ''}</span>
                  <span className="rf-hlist-spacer" />
                  <span className="rf-hlist-amt">¥{r.amount?.toLocaleString() || '—'}</span>
                  <span className={`rf-hlist-stat s-${r.status}`}>{statusObj?.label || r.status}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="rf-footer">
          <button className="rf-fbtn">📞 発信</button>
          <button className="rf-fbtn">SMS送信</button>
          <button className="rf-fbtn">複製</button>
          <button className="rf-fbtn">下書き保存</button>
          <span className="rf-foot-spacer" />
          {isEdit && (
            <button className="rf-fbtn danger" onClick={handleDelete} disabled={loading}>
              {confirmDelete ? '本当に削除' : '削除'}
            </button>
          )}
          <div className="rf-foot-radios">
            <label className="rf-radio-lbl"><input type="radio" name="rf-stat" checked={status === 'received'} onChange={() => setStatus('received')} /> 確定</label>
            <label className="rf-radio-lbl"><input type="radio" name="rf-stat" checked={status === 'reserved'} onChange={() => setStatus('reserved')} /> 予約</label>
            <label className="rf-radio-lbl"><input type="radio" name="rf-stat" checked={status === 'cancelled'} onChange={() => setStatus('cancelled')} /> キャンセル</label>
          </div>
          <button className="rf-fbtn" onClick={onClose}>キャンセル <kbd className="rf-kbd">esc</kbd></button>
          <button className="rf-fbtn primary" onClick={save} disabled={loading}>
            ✓ {loading ? '保存中...' : '予約を確定する'} <kbd className="rf-kbd">⌘↵</kbd>
          </button>
        </div>
      </div>

      {savedDialogVisible && (
        <div className="fw-saved-overlay">
          <div className="fw-saved-dialog">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.55 0.18 145)" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-5" />
            </svg>
            <span>予約を保存しました。</span>
            <button className="fw-btn primary" onClick={onClose}>閉じる</button>
          </div>
        </div>
      )}
    </>
  );
}
