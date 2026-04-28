import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import Toast from '../components/Toast.jsx';
import { useAppStore } from '../store/state.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { effectivePrice, rewardFor, KIND_ORDER, getRankBrand, calculateGranReward, calculateLaReineReward } from '../lib/pricing.js';
import { extractRewardRates } from '../screens/settings/RewardRateSettings.jsx';
import { loadCustomerReservations } from '../hooks/useCustomers.js';
import '../styles.css';

const STATUSES = [
  { value: 'reserved',  label: '予約' },
  { value: 'received',  label: '受領済' },
  { value: 'working',   label: '対応中' },
  { value: 'complete',  label: '完了' },
  { value: 'hold',      label: '仮予約' },
  { value: 'cancelled', label: 'キャンセル' },
];
/** アイテム名から nominationType コードに変換 */
function itemNameToNomType(name = '') {
  if (name.includes('本指名') || /honshi/i.test(name)) return 'honshi';
  if (name.includes('パネル') || /panel/i.test(name))  return 'panel';
  if (name.includes('ネット') || /net/i.test(name))    return 'net';
  return 'free';
}
const FIRST_MEDIA_OPTIONS = [
  'HP', '口コミ・紹介', '看板・ポスター', 'チラシ', 'SNS/Instagram',
  'X(Twitter)', 'ホットペッパー', '店頭', 'その他',
];
const COURSE_KIND_ORDER = ['course', 'nomination', 'extension', 'event', 'option', 'discount', 'media', 'other'];
const AVATAR_HUES = [245, 30, 150, 300, 200, 90, 350, 180];

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
function fmtDate(iso) {
  if (!iso) return '—';
  const [, mm, dd] = iso.split('-');
  return `${mm}/${dd}`;
}

export default function ReservationStandaloneApp({ rsvKey }) {
  const setStores = useAppStore((s) => s.setStores);
  const setCurrentStoreId = useAppStore((s) => s.setCurrentStoreId);
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const stores = useAppStore((s) => s.stores);
  const currentStaff = useAppStore((s) => s.currentStaff);

  const [ready, setReady] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [reservation, setReservation] = useState(null);

  const isEdit = !!reservation?.id;
  const cust = customer || reservation?.customer || null;

  const saveRef = useRef(null);
  const prevBrandRef = useRef(null);
  const [masters, setMasters] = useState(null);
  const [ladies, setLadies] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isFirstMeet, setIsFirstMeet] = useState(null);
  const [ladyCastRankId,  setLadyCastRankId]  = useState(null);
  const [ladyCourseRate,  setLadyCourseRate]  = useState(null); // profile.course_rate (% or null)
  const [ladyNomRate,     setLadyNomRate]     = useState(null); // profile.nom_rate (% or null)
  const [ladyExtRate,     setLadyExtRate]     = useState(null); // profile.ext_rate (% or null)
  const [storeRates,      setStoreRates]      = useState(() => extractRewardRates({}));
  const [quickActive, setQuickActive] = useState(null);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [savedDone, setSavedDone] = useState(null);
  const [selections, setSelections] = useState({});

  const [date,            setDate]            = useState(todayISO());
  const [startTime,       setStartTime]       = useState(() => toHHMM(new Date(Date.now() + 30 * 60 * 1000)));
  const [ladyId,          setLadyId]          = useState('');
  const [isTriple,        setIsTriple]        = useState(false);
  const [onDutyOnly,      setOnDutyOnly]      = useState(false);
  const [status,          setStatus]          = useState('reserved');
  const [memo,            setMemo]            = useState('');
  const [roomNo,          setRoomNo]          = useState('');
  const [feeAdj,          setFeeAdj]          = useState(0);
  const [rewardAdj,       setRewardAdj]       = useState(0);
  const [paymentMethod,   setPaymentMethod]   = useState('cash');
  const [storeId,         setStoreId]         = useState('');
  const [nominationType,  setNominationType]  = useState('free');
  const [receptionMethod, setReceptionMethod] = useState('');
  const [firstMedia,      setFirstMedia]      = useState('');
  const [ladyStatus,      setLadyStatus]      = useState('');
  const [sendDriver,      setSendDriver]      = useState('');
  const [receiveDriver,   setReceiveDriver]   = useState('');
  const [receiptNo,       setReceiptNo]       = useState('');

  // ── Bootstrap ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('stores').select('*').eq('is_active', true).order('display_order')
      .then(({ data: rows }) => {
        if (rows?.length) {
          setStores(rows);
          const saved = localStorage.getItem('halo.cti.currentStoreId');
          const valid = saved && rows.find((s) => s.id === saved);
          setCurrentStoreId(valid ? saved : rows[0].id);
        }
      });

    const raw = localStorage.getItem(`rsv_in_${rsvKey}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setCustomer(parsed.customer || null);
        setReservation(parsed.reservation || null);
        if (parsed.reservation) {
          const r = parsed.reservation;
          if (r.reserved_date) setDate(r.reserved_date);
          if (r.start_time)    setStartTime(trimSec(r.start_time));
          if (r.lady_id)       setLadyId(r.lady_id);
          if (r.is_triple)     setIsTriple(r.is_triple);
          if (r.status)        setStatus(r.status);
          if (r.memo)          setMemo(r.memo);
          if (r.room_no)       setRoomNo(r.room_no);
          if (r.fee_adjustment != null)    setFeeAdj(r.fee_adjustment);
          if (r.reward_adjustment != null) setRewardAdj(r.reward_adjustment);
          if (r.payment_method)  setPaymentMethod(r.payment_method);
          if (r.store_id)        setStoreId(r.store_id);
          if (r.nomination_type) setNominationType(r.nomination_type);
          if (r.reception_method) setReceptionMethod(r.reception_method);
          if (r.first_media)    setFirstMedia(r.first_media);
          if (r.lady_status)    setLadyStatus(r.lady_status);
          if (r.send_driver)    setSendDriver(r.send_driver);
          if (r.receive_driver) setReceiveDriver(r.receive_driver);
          if (r.receipt_no)     setReceiptNo(r.receipt_no);
        }
      } catch { /* ignore */ }
    }
    setReady(true);
  }, [rsvKey]);

  // storeId fallback once stores load
  useEffect(() => {
    if (!storeId && currentStoreId) setStoreId(currentStoreId);
  }, [currentStoreId]);

  // ── Load masters ──────────────────────────────────────────────────────
  useEffect(() => {
    const sid = storeId || currentStoreId;
    if (!sid) return;
    let cancelled = false;
    (async () => {
      const [{ data: groups }, { data: ranks }, { data: storeRow }] = await Promise.all([
        supabase.from('option_groups').select('*').eq('store_id', sid).order('display_order'),
        supabase.from('cast_ranks').select('*').eq('store_id', sid).order('display_order'),
        supabase.from('stores').select('settings').eq('id', sid).single(),
      ]);
      if (!cancelled) setStoreRates(extractRewardRates(storeRow?.settings || {}));
      if (cancelled) return;
      const groupIds = (groups || []).map((g) => g.id);
      const { data: allItems } = groupIds.length
        ? await supabase.from('option_items').select('*').in('group_id', groupIds).eq('is_active', true).order('display_order')
        : { data: [] };
      if (cancelled) return;
      const itemIds = (allItems || []).map((i) => i.id);
      const { data: rankPriceRows } = itemIds.length
        ? await supabase.from('option_item_rank_prices').select('item_id, cast_rank_id, price, reward_override').in('item_id', itemIds)
        : { data: [] };
      if (cancelled) return;
      const groupById = {}, itemsByGroup = {}, itemById = {};
      for (const g of (groups || [])) { groupById[g.id] = g; itemsByGroup[g.id] = []; }
      for (const item of (allItems || [])) { itemById[item.id] = item; if (itemsByGroup[item.group_id]) itemsByGroup[item.group_id].push(item); }
      const rankPrices = {}, rankRewardOverrides = {};
      for (const rp of (rankPriceRows || [])) {
        if (!rankPrices[rp.item_id]) rankPrices[rp.item_id] = {};
        rankPrices[rp.item_id][rp.cast_rank_id] = rp.price;
        if (rp.reward_override != null) {
          if (!rankRewardOverrides[rp.item_id]) rankRewardOverrides[rp.item_id] = {};
          rankRewardOverrides[rp.item_id][rp.cast_rank_id] = rp.reward_override;
        }
      }
      const mastersData = { groups: groups || [], groupById, itemsByGroup, itemById, rankPrices, rankRewardOverrides, ranks: ranks || [] };
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
  }, [storeId, currentStoreId]);

  // ── Load ladies ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const sid = storeId || currentStoreId;
    (async () => {
      const { data } = await supabase.from('ladies').select('*').eq('is_active', true).order('display_name');
      const rows = (data || []).filter((l) => !sid || !l.store_id || l.store_id === sid);
      if (!cancelled) setLadies(rows);
    })();
    return () => { cancelled = true; };
  }, [storeId, currentStoreId]);

  // ── Load history ──────────────────────────────────────────────────────
  useEffect(() => {
    const cid = cust?.id || reservation?.customer_id;
    if (!cid) return;
    loadCustomerReservations(cid).then(setHistory);
  }, [cust?.id, reservation?.customer_id]);

  // ── Lady → cast rank / reward rate ───────────────────────────────────
  useEffect(() => {
    const lady = ladies.find((l) => l.id === ladyId);
    setLadyCastRankId(lady?.cast_rank_id || null);
    // 各種別のカスタムレート（null = ブランドデフォルト）
    // course_rate がなければ旧 reward_rate にフォールバック（後方互換）
    setLadyCourseRate(lady?.profile?.course_rate ?? lady?.profile?.reward_rate ?? null);
    setLadyNomRate(lady?.profile?.nom_rate    ?? null);
    setLadyExtRate(lady?.profile?.ext_rate    ?? null);
  }, [ladyId, ladies]);

  // ── キャストブランドが変わったらコース/延長/指名選択をリセット ────────────
  useEffect(() => {
    if (!masters) return;
    const rankCode = masters.ranks.find(r => r.id === ladyCastRankId)?.code || '';
    const newBrand = getRankBrand(rankCode);
    if (prevBrandRef.current !== null && prevBrandRef.current !== newBrand) {
      setSelections(prev => {
        const next = { ...prev };
        for (const g of masters.groups) {
          if (['course', 'extension', 'nomination'].includes(g.kind)) {
            next[g.id] = g.multi_select ? new Set() : null;
          }
        }
        return next;
      });
    }
    prevBrandRef.current = newBrand;
  }, [ladyCastRankId, masters]);

  // ── 指名アイテム選択 → nominationType 自動導出 ──────────────────────────
  useEffect(() => {
    if (!masters) return;
    const nomGroups = masters.groups.filter(g => g.kind === 'nomination');
    let selectedItemId = null;
    for (const g of nomGroups) {
      const sel = selections[g.id];
      if (sel && typeof sel === 'string') { selectedItemId = sel; break; }
    }
    if (!selectedItemId) {
      setNominationType('free');
      return;
    }
    const itemName = masters.itemById[selectedItemId]?.name || '';
    setNominationType(itemNameToNomType(itemName));
  }, [masters, selections]);

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

  // ── Keyboard ──────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') handleClose();
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) { e.preventDefault(); saveRef.current?.(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

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

    // キャストランクコードからブランド判定（gran / lareine / null）
    const rankCode = masters.ranks.find(r => r.id === ladyCastRankId)?.code || '';
    const brand = getRankBrand(rankCode);

    // ブランド一致するランクのみ（クロスブランド価格フォールバック防止）
    const brandRanks = brand
      ? masters.ranks.filter(r => getRankBrand(r.code) === brand)
      : masters.ranks;

    // La Reine: コース報酬計算に指名料が必要なため事前取得
    let laNomFee = 0;
    if (brand === 'lareine') {
      for (const g of masters.groups) {
        if (g.kind !== 'nomination') continue;
        const sel = selections[g.id];
        if (!sel || sel instanceof Set) continue;
        const targetRank = ladyCastRankId || (brandRanks[0]?.id ?? null);
        laNomFee = targetRank
          ? (effectivePrice(brandRanks, masters.rankPrices[sel] || {}, targetRank) ?? 0)
          : 0;
        break;
      }
    }

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
          const targetRank = ladyCastRankId || (brandRanks[0]?.id ?? null);
          // brandRanks でフォールバック → クロスブランド価格汚染を防ぐ
          basePrice = targetRank ? (effectivePrice(brandRanks, masters.rankPrices[itemId] || {}, targetRank) ?? 0) : 0;
        } else if (item.price_mode === 'flat') {
          basePrice = Number(item.price_flat) || 0;
        } else { basePrice = 0; }
        const mult = isTriple && Number(group.triple_multiplier) > 1 ? Number(group.triple_multiplier) : 1;
        const finalPrice = Math.round(basePrice * mult);

        let reward = 0;

        // キャスト個別バック率（null = ブランドデフォルト / storeRates）
        const customCourse = ladyCourseRate != null ? ladyCourseRate / 100 : null;
        const customNom    = ladyNomRate    != null ? ladyNomRate    / 100 : null;
        const customExt    = ladyExtRate    != null ? ladyExtRate    / 100 : null;

        // Gran
        const granCourseRate = customCourse ?? 0.5;
        const granExtRate    = customExt    ?? 0.5;
        const granNomNet     = customNom ?? (storeRates.gran_nom_rate_net    / 100);
        const granNomHonshi  = storeRates.gran_nom_rate_honshi / 100; // 本指名は常に店舗設定値

        // La Reine
        const lrRateNet    = customCourse ?? (storeRates.lr_rate_net    / 100);
        const lrRateHonshi = customCourse != null ? customCourse + 0.05 : (storeRates.lr_rate_honshi / 100);
        const lrRateOver   = customExt ?? (storeRates.lr_rate_over / 100);

        if (brand === 'gran') {
          if (group.kind === 'course') {
            // Gran コース: デフォルト50%（カスタム course_rate で上書き可）
            reward = Math.round(finalPrice * granCourseRate);
          } else if (group.kind === 'extension') {
            // Gran 延長: デフォルト50%（カスタム ext_rate で上書き可）
            reward = Math.round(finalPrice * granExtRate);
          } else if (group.kind === 'nomination') {
            // Gran 指名: ネット/パネル=50%、本指名=100%（カスタムレートはコースのみ適用）
            ({ nomBack: reward } = calculateGranReward({
              coursePrice: 0, nominationFee: finalPrice, nominationType,
              nomRateNet:    granNomNet,
              nomRateHonshi: granNomHonshi,
            }));
          } else {
            const ro = masters.rankRewardOverrides?.[itemId]?.[ladyCastRankId] ?? null;
            reward = rewardFor(item, finalPrice, { isFirstMeet: isFirstMeet === true, rewardOverride: ro });
          }
        } else if (brand === 'lareine') {
          if (group.kind === 'course') {
            // La Reine コース: 120分の壁 + 指名料合算（カスタムレートで上書き可）
            ({ total: reward } = calculateLaReineReward({
              coursePrice:   finalPrice,
              nominationFee: laNomFee,
              nominationType,
              durationMin:   item.duration_min || 70,
              rateNet:       lrRateNet,
              rateHonshi:    lrRateHonshi,
              rateOver:      lrRateOver,
            }));
          } else if (group.kind === 'nomination') {
            // La Reine 指名バックはコースバックに含まれるため0
            reward = 0;
          } else if (group.kind === 'extension') {
            // La Reine 延長: デフォルト50%（カスタム ext_rate で上書き可）
            reward = Math.round(finalPrice * lrRateOver);
          } else {
            const ro = masters.rankRewardOverrides?.[itemId]?.[ladyCastRankId] ?? null;
            reward = rewardFor(item, finalPrice, { isFirstMeet: isFirstMeet === true, rewardOverride: ro });
          }
        } else {
          // ブランド不明: 汎用フォールバック
          const ro = masters.rankRewardOverrides?.[itemId]?.[ladyCastRankId] ?? null;
          reward = rewardFor(item, finalPrice, { isFirstMeet: isFirstMeet === true, rewardOverride: ro });
        }

        lines.push({ item_id: itemId, group_id: group.id, kind: group.kind, name: item.name, group_label: group.label, amount: finalPrice, reward });
      }
    }
    return lines;
  }, [masters, selections, ladyCastRankId, ladyCourseRate, ladyNomRate, ladyExtRate, storeRates, isTriple, isFirstMeet, nominationType]);

  const totalAmount = useMemo(() => lineItems.reduce((s, l) => s + l.amount, 0) + Number(feeAdj || 0), [lineItems, feeAdj]);
  const totalReward = useMemo(() => lineItems.reduce((s, l) => s + l.reward, 0) + Number(rewardAdj || 0), [lineItems, rewardAdj]);

  // ── IPC ──────────────────────────────────────────────────────────────────
  const handleClose = useCallback(async () => {
    // Rust コマンドで確実にウィンドウを閉じる（最も信頼性が高い）
    try {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const label = getCurrentWebviewWindow().label;
      await invoke('close_window', { label });
    } catch (e) {
      // フォールバック: 親ウィンドウのイベントリスナー経由
      emit(`rsv_close_${rsvKey}`, null).catch(() => {});
    }
  }, [rsvKey]);
  const handleSaved   = (savedData) => emit(`rsv_saved_${rsvKey}`,   savedData).catch(() => {});
  const handleDeleted = (id)        => emit(`rsv_deleted_${rsvKey}`, id).catch(() => {});

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
    handleSaved(resp.data);  // 親ウィンドウに保存データを通知
    setSavedDone(resp.data); // ダイアログ表示
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
    handleDeleted(reservation.id);
  };

  // ── Computed ──────────────────────────────────────────────────────────
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
  const thirtyMinBefore = totalDuration > 0 ? addMinutes(endTime, -30) : null;

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

  const lastSavedStr = lastSavedAt
    ? `${String(lastSavedAt.getHours()).padStart(2,'0')}:${String(lastSavedAt.getMinutes()).padStart(2,'0')}`
    : null;

  const GroupSelect = ({ kind, placeholder, cls, firstOnly = false }) => {
    const allGroups = groupsByKind[kind] || [];
    const castBrand = getRankBrand(masters?.ranks.find(r => r.id === ladyCastRankId)?.code || '');
    let groups;
    if (firstOnly) {
      if (castBrand) {
        // キャストブランドに合うグループを優先。なければ先頭にフォールバック
        const matched = allGroups.filter(g => {
          const gb = getGroupBrand(g.label);
          return !gb || gb === castBrand;
        });
        groups = matched.length ? matched.slice(0, 1) : allGroups.slice(0, 1);
      } else {
        groups = allGroups.slice(0, 1);
      }
    } else {
      groups = allGroups;
    }
    const ctrl = cls || 'fw-ctrl';
    if (!masters || !groups.length) return (
      <select className={ctrl}><option value="">{placeholder || '—'}</option></select>
    );
    return groups.map(g => {
      const items = masters.itemsByGroup[g.id] || [];
      const sel = selections[g.id];
      return (
        <select key={g.id} className={ctrl}
          value={typeof sel === 'string' ? sel : ''}
          onChange={e => setSelections(prev => ({ ...prev, [g.id]: e.target.value || null }))}>
          <option value="">{placeholder || '— なし —'}</option>
          {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      );
    });
  };

  if (!ready) return null;

  const hue = avatarHue(cust?.name);

  return (
    <div className="fw-wrap">
      <div className="fw">

        {/* ── Header ── */}
        <div className="fw-head">
          <div className="fw-grip" aria-hidden="true">
            {[...Array(6)].map((_, i) => <span key={i} />)}
          </div>
          <span className="fw-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
            <span className="fw-title-jp">予約データ入力</span>
          </span>
          {isEdit && <span className="fw-badge">EDIT MODE</span>}

          {cust && (
            <span className="fw-cust-inline">
              <b>{cust.name}</b>
              {cust.kana && <span className="fw-kana">{cust.kana}</span>}
              {cust.customer_no && (
                <span className="fw-custid">V{String(cust.customer_no).padStart(5,'0')}</span>
              )}
            </span>
          )}

          <div className="fw-head-actions">
            {lastSavedStr && <span className="fw-ks">最終 {lastSavedStr}</span>}
            <span className="fw-ks">⌘+S 保存</span>
            <button className="fw-hbtn fw-hbtn-close" onClick={handleClose} title="閉じる">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Main 3-column ── */}
        <div className="fw-main">

          {/* ── LEFT: Customer ── */}
          <aside className="fw-left">
            <div className="fw-cust-hero">
              <div className="fw-portrait" style={{ background: `linear-gradient(135deg, oklch(0.55 0.16 ${hue}), oklch(0.40 0.20 ${hue}))` }}>
                {cust?.name?.[0] || '?'}
              </div>
              <div className="fw-cust-meta">
                <div className="fw-cust-tier">MEMBER</div>
                <div className="fw-cust-name">{cust?.name || '顧客未選択'}</div>
                {cust?.kana && <div className="fw-cust-kana">{cust.kana}</div>}
                {cust?.customer_no && (
                  <div className="fw-cust-id">V{String(cust.customer_no).padStart(5,'0')}</div>
                )}
              </div>
            </div>

            {(cust?.phone_normalized || cust?.email || cust?.address) && (
              <div className="fw-contact">
                {cust.phone_normalized && (
                  <div className="fw-contact-row">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>
                    </svg>
                    <span className="fw-contact-v mono">{cust.phone_normalized}</span>
                  </div>
                )}
                {cust.email && (
                  <div className="fw-contact-row">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/>
                    </svg>
                    <span className="fw-contact-v fw-contact-sm">{cust.email}</span>
                  </div>
                )}
                {cust.address && (
                  <div className="fw-contact-row">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                    <span className="fw-contact-v fw-contact-sm">{cust.address}</span>
                  </div>
                )}
              </div>
            )}

            {/* LTV card */}
            <div className="fw-total-card">
              <div className="fw-total-lbl">累計利用額 LTV</div>
              <div className="fw-total-fig">
                <span className="fw-total-yen">¥</span>
                {ltv.toLocaleString()}
              </div>
              <div className="fw-total-bd">
                <div><span className="fw-tbd-k">来店</span><span className="fw-tbd-v">{completedHistory.length}回</span></div>
                <div><span className="fw-tbd-k">平均単価</span><span className="fw-tbd-v mono">
                  {completedHistory.length ? `¥${Math.round(ltv / completedHistory.length / 1000)}k` : '—'}
                </span></div>
              </div>
            </div>

            {/* Stats */}
            <div className="fw-stat-row">
              <div>
                <div className="fw-stat-k">来店</div>
                <div className="fw-stat-v">{history.length}<span className="fw-stat-unit">回</span></div>
              </div>
              <div>
                <div className="fw-stat-k">指名</div>
                <div className="fw-stat-v">
                  {isFirstMeet === true ? <span className="fw-stat-first">初回</span>
                   : isFirstMeet === false ? <span className="fw-stat-repeat">リピ</span>
                   : '—'}
                </div>
              </div>
              <div>
                <div className="fw-stat-k">支払</div>
                <div className="fw-stat-v fw-stat-pay">{paymentMethod === 'card' ? 'CARD' : 'CASH'}</div>
              </div>
            </div>

            {cust?.alert_memo && (
              <div className="fw-alert-card">
                <b>⚠ 要注意</b>
                {cust.alert_memo}
              </div>
            )}

            {cust?.shared_memo && (
              <div className="fw-memo-card">
                <h4><span className="fw-memo-dot" />共有メモ</h4>
                <p>{cust.shared_memo}</p>
              </div>
            )}
          </aside>

          {/* ── CENTER: Form ── */}
          <section className="ff-form">
            <div className="ff-cols">

              {/* ── Col MAIN: 2-column sub-grid ── */}
              <div className="ff-col ff-col-main">

                {/* 店舗 | 新規媒体 */}
                <div className="ff-row2">
                  <div className="ff-field">
                    <label className="ff-label">店舗 <span className="ff-req">※</span></label>
                    {stores?.length > 0 ? (
                      <select className="ff-ctrl" value={storeId} onChange={e => setStoreId(e.target.value)}>
                        {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    ) : <input className="ff-ctrl" readOnly placeholder="—" />}
                  </div>
                  <div className="ff-field">
                    <label className="ff-label">新規 媒体</label>
                    <select className="ff-ctrl" value={firstMedia} onChange={e => setFirstMedia(e.target.value)}>
                      <option value="">—</option>
                      {FIRST_MEDIA_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                {/* 日時 (full width) */}
                <div className="ff-field">
                  <label className="ff-label">日時 <span className="ff-req">※</span></label>
                  <div className="ff-dt-row">
                    <input className="ff-ctrl ff-ctrl-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
                    <select className="ff-ctrl ff-ctrl-hh" value={startTime.slice(0, 2)}
                      onChange={e => { setStartTime(`${e.target.value}:${startTime.slice(3, 5)}`); setQuickActive(null); }}>
                      {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h =>
                        <option key={h} value={h}>{parseInt(h, 10)}時</option>
                      )}
                    </select>
                    <select className="ff-ctrl ff-ctrl-mm" value={startTime.slice(3, 5)}
                      onChange={e => { setStartTime(`${startTime.slice(0, 2)}:${e.target.value}`); setQuickActive(null); }}>
                      {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map(m =>
                        <option key={m} value={m}>{parseInt(m, 10)}分</option>
                      )}
                    </select>
                    <button type="button" className="ff-clock-btn" title="現在時刻にセット"
                      onClick={() => { setStartTime(toHHMM(new Date())); setQuickActive(null); }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                      </svg>
                    </button>
                  </div>
                  {totalDuration > 0 && (
                    <div className="ff-endtime-row">
                      終了 <b>{endTime}</b>
                      {thirtyMinBefore && <span className="ff-pre30">（30分前 {thirtyMinBefore}）</span>}
                    </div>
                  )}
                  <div className="ff-quick-row">
                    {[15, 30, 60].map(m => (
                      <button key={m} type="button" className={`ff-qbtn${quickActive === m ? ' on' : ''}`}
                        onClick={() => { setStartTime(nowPlusMinutes(m)); setQuickActive(m); }}>
                        +{m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 女子 | 指名 */}
                <div className="ff-row2">
                  <div className="ff-field">
                    <div className="ff-label-row">
                      <label className="ff-label">女子 <span className="ff-req">※</span></label>
                      <label className="ff-chk-sm">
                        <input type="checkbox" checked={onDutyOnly} onChange={e => setOnDutyOnly(e.target.checked)} />
                        出勤のみ
                      </label>
                    </div>
                    <select className="ff-ctrl" value={ladyId} onChange={e => setLadyId(e.target.value)}>
                      <option value="">— フリー —</option>
                      {(onDutyOnly ? ladies.filter(l => l.is_on_duty) : ladies).map(l =>
                        <option key={l.id} value={l.id}>{l.display_name || l.name}</option>
                      )}
                    </select>
                    {isFirstMeet !== null && (
                      <span className={`ff-meet ${isFirstMeet ? 'first' : 'repeat'}`}>
                        {isFirstMeet ? '初回' : 'リピーター'}
                      </span>
                    )}
                  </div>
                  <div className="ff-field">
                    <label className="ff-label">指名 <span className="ff-req">※</span></label>
                    <NominationSelect
                      masters={masters}
                      selections={selections}
                      setSelections={setSelections}
                      brand={getRankBrand(masters?.ranks.find(r => r.id === ladyCastRankId)?.code || '')}
                    />
                  </div>
                </div>

                {/* コース | 延長 */}
                <div className="ff-row2">
                  <div className="ff-field">
                    <label className="ff-label">コース <span className="ff-req">※</span></label>
                    <GroupSelect kind="course" placeholder="— なし —" cls="ff-ctrl" firstOnly />
                  </div>
                  <div className="ff-field">
                    <label className="ff-label">延長</label>
                    <GroupSelect kind="extension" placeholder="— なし —" cls="ff-ctrl" firstOnly />
                  </div>
                </div>

                {/* 交通費 | ホテル */}
                <div className="ff-row2">
                  <div className="ff-field">
                    <label className="ff-label">交通費 <span className="ff-req">※</span></label>
                    <GroupSelect kind="transport" placeholder="— なし —" cls="ff-ctrl" />
                  </div>
                  <div className="ff-field">
                    <label className="ff-label">ホテル / 場所 <span className="ff-req">※</span></label>
                    <GroupSelect kind="hotel" placeholder="— なし —" cls="ff-ctrl" />
                  </div>
                </div>

                {/* 部屋番号 */}
                <div className="ff-field">
                  <label className="ff-label">部屋番号</label>
                  <input className="ff-ctrl ff-mono" placeholder="—" value={roomNo} onChange={e => setRoomNo(e.target.value)} />
                </div>

              </div>

              {/* ── Col C: イベント / オプション / 割引 ── */}
              <div className="ff-col ff-col-c">

                <div className="ff-field">
                  <label className="ff-label">イベント</label>
                  <div className="ff-inline-checks">
                    {masters && (groupsByKind['event'] || []).flatMap(g => {
                      const items = masters.itemsByGroup[g.id] || [];
                      const sel = selections[g.id];
                      return items.map(item => {
                        const checked = g.multi_select ? (sel instanceof Set && sel.has(item.id)) : sel === item.id;
                        return (
                          <label key={item.id} className={`ff-chk${checked ? ' on' : ''}`}>
                            <input type="checkbox" checked={checked} onChange={() => selectItem(g.id, item.id, g.multi_select)} />
                            {item.name}
                          </label>
                        );
                      });
                    })}
                  </div>
                </div>

                <div className="ff-field">
                  <label className="ff-label">オプション</label>
                  <div className="ff-inline-checks">
                    {masters && (groupsByKind['option'] || []).flatMap(g => {
                      const items = masters.itemsByGroup[g.id] || [];
                      const sel = selections[g.id];
                      return items.map(item => {
                        const checked = g.multi_select ? (sel instanceof Set && sel.has(item.id)) : sel === item.id;
                        return (
                          <label key={item.id} className={`ff-chk${checked ? ' on' : ''}`}>
                            <input type="checkbox" checked={checked} onChange={() => selectItem(g.id, item.id, g.multi_select)} />
                            {item.name}
                          </label>
                        );
                      });
                    })}
                  </div>
                </div>

                <div className="ff-field">
                  <label className="ff-label">割引</label>
                  <div className="ff-inline-checks">
                    {masters && (groupsByKind['discount'] || []).flatMap(g => {
                      const items = masters.itemsByGroup[g.id] || [];
                      const sel = selections[g.id];
                      return items.map(item => {
                        const checked = g.multi_select ? (sel instanceof Set && sel.has(item.id)) : sel === item.id;
                        return (
                          <label key={item.id} className={`ff-chk${checked ? ' on' : ''}`}>
                            <input type="checkbox" checked={checked} onChange={() => selectItem(g.id, item.id, g.multi_select)} />
                            {item.name}
                          </label>
                        );
                      });
                    })}
                  </div>
                </div>

                <div className="ff-field">
                  <label className="ff-label ff-label-ghost">3P</label>
                  <label className="ff-chk-lg">
                    <input type="checkbox" checked={isTriple} onChange={e => setIsTriple(e.target.checked)} />
                    3P対応
                  </label>
                </div>

              </div>

              {/* ── Col D: 受付方法 / 支払い方法 / 備考 ── */}
              <div className="ff-col ff-col-d">

                <div className="ff-field">
                  <label className="ff-label">受付方法</label>
                  <select className="ff-ctrl" value={receptionMethod} onChange={e => setReceptionMethod(e.target.value)}>
                    <option value="">—</option>
                    <option value="phone">電話受付</option>
                    <option value="online">オンライン</option>
                    <option value="walk_in">飛び込み</option>
                  </select>
                </div>

                <div className="ff-field">
                  <label className="ff-label">支払い方法</label>
                  <div className="ff-pay-row">
                    <label className={`ff-pay-opt${paymentMethod === 'cash' ? ' on' : ''}`}>
                      <input type="radio" name="ff-pay" value="cash" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} />
                      CASH
                    </label>
                    <label className={`ff-pay-opt${paymentMethod === 'card' ? ' on' : ''}`}>
                      <input type="radio" name="ff-pay" value="card" checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} />
                      CARD
                    </label>
                  </div>
                </div>

                <div className="ff-field ff-field-grow">
                  <label className="ff-label">備考</label>
                  <textarea className="ff-ctrl ff-textarea ff-textarea-grow" value={memo} onChange={e => setMemo(e.target.value)}
                    placeholder="申し送り / フロント注意事項…" />
                </div>

              </div>

            </div>
          </section>

          {/* ── RIGHT: Charge ── */}
          <aside className="fw-right">
            <div className="fw-charge-hd">
              <span className="fw-charge-num">¥</span>
              <span className="fw-charge-ttl">客払い計算</span>
            </div>

            <div className="fw-charge-list">
              {courseAmt > 0 && <div className="fw-kv"><span className="fw-kv-k">コース</span><span className="fw-kv-v">¥{courseAmt.toLocaleString()}</span></div>}
              {extAmt > 0    && <div className="fw-kv"><span className="fw-kv-k">延長</span><span className="fw-kv-v">¥{extAmt.toLocaleString()}</span></div>}
              {nomAmt > 0    && <div className="fw-kv"><span className="fw-kv-k">指名</span><span className="fw-kv-v">¥{nomAmt.toLocaleString()}</span></div>}
              {optAmt > 0    && <div className="fw-kv"><span className="fw-kv-k">オプション</span><span className="fw-kv-v">¥{optAmt.toLocaleString()}</span></div>}
              {transportAmt > 0 && <div className="fw-kv"><span className="fw-kv-k">交通費</span><span className="fw-kv-v">¥{transportAmt.toLocaleString()}</span></div>}
              {discountAmt !== 0 && <div className="fw-kv"><span className="fw-kv-k">割引</span><span className="fw-kv-v fw-kv-minus">△{Math.abs(discountAmt).toLocaleString()}</span></div>}
              {Number(feeAdj) !== 0 && <div className="fw-kv"><span className="fw-kv-k">料金補正</span><span className="fw-kv-v">{Number(feeAdj) > 0 ? '+' : ''}{Number(feeAdj).toLocaleString()}</span></div>}
              {courseAmt === 0 && extAmt === 0 && nomAmt === 0 && optAmt === 0 && transportAmt === 0 && (
                <div className="fw-kv fw-kv-empty"><span className="fw-kv-k">コース未選択</span><span className="fw-kv-v fw-kv-dim">—</span></div>
              )}
            </div>

            <div className="fw-field">
              <label className="fw-label">料金補正 (手動)</label>
              <div className="fw-yen-input">
                <input className="fw-ctrl fw-ctrl-yen" type="number" value={feeAdj} onChange={e => setFeeAdj(e.target.value)} />
              </div>
            </div>

            {/* Big total */}
            <div className="fw-pay-total">
              <div className="fw-pay-lbl">客払い合計</div>
              <div className="fw-pay-num">
                <span className="fw-pay-yen">¥</span>
                {totalAmount.toLocaleString()}
              </div>
              <div className="fw-pay-change">
                <span>
                  <label className="fw-chk-inline">
                    <input type="checkbox" checked={paymentMethod === 'card'} onChange={e => setPaymentMethod(e.target.checked ? 'card' : 'cash')} />
                    カード決済
                  </label>
                </span>
                <b className="mono">{paymentMethod === 'card' ? 'CARD' : 'CASH'}</b>
              </div>
            </div>

            {/* Reward — quiet */}
            <div className="fw-reward">
              <div><span className="fw-reward-k">コース報酬</span><span className="fw-reward-v mono">{courseReward > 0 ? `¥${courseReward.toLocaleString()}` : '—'}</span></div>
              <div><span className="fw-reward-k">延長報酬</span><span className="fw-reward-v mono">{extReward > 0 ? `¥${extReward.toLocaleString()}` : '—'}</span></div>
              <div><span className="fw-reward-k">指名報酬</span><span className="fw-reward-v mono">{nomReward > 0 ? `¥${nomReward.toLocaleString()}` : '—'}</span></div>
              <div><span className="fw-reward-k">OP報酬</span><span className="fw-reward-v mono">{optReward > 0 ? `¥${optReward.toLocaleString()}` : '—'}</span></div>
              <div style={{ gridColumn: 'span 2', borderTop: '1px dashed var(--fw-ink-200)', paddingTop: 6, marginTop: 2 }}>
                <span className="fw-reward-k" style={{ fontWeight: 700 }}>報酬合計</span>
                <span className="fw-reward-v mono" style={{ fontWeight: 700 }}>¥{totalReward.toLocaleString()}</span>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span className="fw-reward-k">店売</span>
                <span className="fw-reward-v mono">{shopKeep > 0 ? `¥${shopKeep.toLocaleString()}` : '—'}</span>
              </div>
            </div>

            <div className="fw-field">
              <label className="fw-label">報酬補正</label>
              <div className="fw-yen-input">
                <input className="fw-ctrl fw-ctrl-yen" type="number" value={rewardAdj} onChange={e => setRewardAdj(e.target.value)} />
              </div>
            </div>

            <div className="fw-meta-quiet">
              {currentStaff && <div><span className="fw-meta-k">作成</span><span className="fw-meta-v">{currentStaff.name}</span></div>}
              {lastSavedStr && <div><span className="fw-meta-k">最終保存</span><span className="fw-meta-v mono">{lastSavedStr}</span></div>}
            </div>
          </aside>
        </div>

        {/* ── History strip ── */}
        <div className="fw-history">
          <div className="fw-hist-h">
            <span className="fw-hist-ttl">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>
              </svg>
              利用履歴
            </span>
            <span className="fw-hist-count">{filteredHistory.length}件 · LTV ¥{ltv.toLocaleString()}</span>
            <div className="fw-hist-filters">
              {[['すべて', 'all'], ['本指名のみ', 'honshimei'], ['同コース', 'samecourse'], ['同ホテル', 'samehotel']].map(([lbl, val]) => (
                <button key={val} className={`fw-hist-filt${historyFilter === val ? ' on' : ''}`}
                  onClick={() => setHistoryFilter(val)}>{lbl}</button>
              ))}
            </div>
          </div>

          <div className="fw-hlist">
            {filteredHistory.length === 0 ? (
              <div className="fw-hist-empty">履歴なし</div>
            ) : filteredHistory.map((r, i) => {
              const ext = r.selected_items?.find(si => si.kind === 'extension');
              const lady = ladies.find(l => l.id === r.lady_id);
              const statusObj = STATUSES.find(s => s.value === r.status);
              const lhue = avatarHue(lady?.name);
              const optCnt = r.selected_items?.filter(si => si.kind === 'option').length || 0;
              return (
                <div key={r.id} className={`fw-hlist-row${i % 2 ? ' alt' : ''}${r.status === 'cancelled' ? ' cancelled' : ''}`}>
                  <span className="fw-hl-date mono">{fmtDate(r.reserved_date)}</span>
                  <div className="fw-hl-av" style={{ '--h': lhue }}>
                    {(lady?.display_name || lady?.name || '?')[0]}
                  </div>
                  <span className="fw-hl-lady">{lady?.display_name || lady?.name || '—'}</span>
                  <span className="fw-hl-course">{r.course || '—'}</span>
                  <span className="fw-hl-ext">{ext ? `+${ext.name}` : ''}</span>
                  <span className="fw-hl-hotel">{r.hotel || ''}{r.room_no ? ` ${r.room_no}` : ''}</span>
                  {optCnt > 0
                    ? <span className="fw-hl-opt">OP {optCnt}点</span>
                    : <span className="fw-hl-opt" />
                  }
                  <span className="fw-hl-spacer" />
                  <span className={`fw-hl-pay ${r.payment_method === 'card' ? 'card' : 'cash'}`}>
                    {r.payment_method === 'card' ? 'CARD' : 'CASH'}
                  </span>
                  <span className="fw-hl-amt mono">¥{r.amount?.toLocaleString() || '—'}</span>
                  <span className={`fw-hl-stat s-${r.status}`}>{statusObj?.label || r.status}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="fw-foot">
          <button className="fw-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>
            </svg>
            発信
          </button>
          <button className="fw-btn">SMS送信</button>
          <button className="fw-btn">複製</button>
          <button className="fw-btn">下書き保存</button>

          <div className="fw-foot-radio">
            {[['received','確定'],['reserved','予約'],['cancelled','ｷｬﾝｾﾙ']].map(([v, l]) => (
              <label key={v} className="fw-radio-lbl">
                <input type="radio" name="fw-status" checked={status === v} onChange={() => setStatus(v)} />
                {l}
              </label>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {isEdit && (
            <button className="fw-btn fw-btn-danger" onClick={handleDelete} disabled={loading}>
              {confirmDelete ? '本当に削除' : '削除'}
            </button>
          )}
          <button className="fw-btn fw-btn-ghost" onClick={handleClose}>
            キャンセル <kbd className="fw-kbd">esc</kbd>
          </button>
          <button className="fw-btn fw-btn-primary" onClick={save} disabled={loading}>
            {loading ? '保存中...' : '✓ 予約を確定する'}
            <kbd className="fw-kbd">⌘↵</kbd>
          </button>
        </div>

        {/* ── 保存完了オーバーレイ ── */}
        {savedDone && (
          <div className="fw-saved-overlay">
            <div className="fw-saved-dialog">
              <div className="fw-saved-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M8 12l3 3 5-5"/>
                </svg>
              </div>
              <div className="fw-saved-ttl">保存しました</div>
              <button className="fw-saved-ok" onClick={handleClose}>OK</button>
            </div>
          </div>
        )}

      </div>
      <Toast />
    </div>
  );
}

/**
 * グループラベルからブランドを判定（Gran指名 → gran, La Reine指名 → lareine）
 * ブランド情報がないグループ（ラベルに含まれない）は null → 全ブランドで表示
 */
function getGroupBrand(label = '') {
  const l = label.toLowerCase();
  if (l.includes('gran') || l.includes('グラン')) return 'gran';
  if (l.includes('reine') || l.includes('ラレーヌ') || l.includes('la ')) return 'lareine';
  return null;
}

/**
 * NominationSelect
 * DB の nomination グループのアイテムを1つの <select> に表示。
 * キャストのブランド（gran/lareine）に合致するグループのみ表示する。
 * 何も選ばなければ「フリー（指名なし）」扱い。
 */
function NominationSelect({ masters, selections, setSelections, brand }) {
  // キャストブランドに合うグループだけ絞り込む
  const nomGroups = (masters?.groups || [])
    .filter(g => g.kind === 'nomination')
    .filter(g => {
      const gb = getGroupBrand(g.label);
      if (!gb) return true;      // ブランド不明グループは常に表示
      if (!brand) return true;   // キャスト未選択は全部表示
      return gb === brand;       // ブランド一致のみ
    });

  // 現在の選択値 = "groupId__itemId" の複合キー
  const currentVal = (() => {
    for (const g of nomGroups) {
      const sel = selections[g.id];
      if (sel && typeof sel === 'string') return `${g.id}__${sel}`;
    }
    return '';
  })();

  const handleChange = (e) => {
    const val = e.target.value;
    setSelections(prev => {
      const next = { ...prev };
      // 全 nomination グループの選択をリセット
      for (const g of nomGroups) next[g.id] = null;
      if (val) {
        const sep = val.indexOf('__');
        const gid = val.slice(0, sep);
        const iid = val.slice(sep + 2);
        next[gid] = iid;
      }
      return next;
    });
  };

  // masters 未ロード時もフォールバック表示
  if (!masters || !nomGroups.length) {
    return <select className="ff-ctrl"><option value="">— フリー —</option></select>;
  }

  const hasItems = nomGroups.some(g => (masters.itemsByGroup[g.id] || []).length > 0);
  if (!hasItems) {
    return (
      <select className="ff-ctrl" disabled>
        <option value="">設定 → 指名 でアイテムを追加してください</option>
      </select>
    );
  }

  return (
    <select className="ff-ctrl" value={currentVal} onChange={handleChange}>
      <option value="">— フリー（指名なし）—</option>
      {nomGroups.map(g => {
        const items = masters.itemsByGroup[g.id] || [];
        if (!items.length) return null;
        // グループが1つだけなら optgroup ヘッダーを出さない
        if (nomGroups.filter(ng => (masters.itemsByGroup[ng.id] || []).length > 0).length === 1) {
          return items.map(item => (
            <option key={item.id} value={`${g.id}__${item.id}`}>{item.name}</option>
          ));
        }
        return (
          <optgroup key={g.id} label={g.label}>
            {items.map(item => (
              <option key={item.id} value={`${g.id}__${item.id}`}>{item.name}</option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
