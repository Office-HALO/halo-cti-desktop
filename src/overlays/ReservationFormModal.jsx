import { useState, useEffect, useMemo, useCallback } from 'react';
import Icon from '../components/Icon.jsx';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { useAppStore } from '../store/state.js';
import { effectivePrice, rewardFor, KIND_ORDER } from '../lib/pricing.js';

const STATUSES = [
  { value: 'reserved',  label: '予約済' },
  { value: 'received',  label: '受領済' },
  { value: 'working',   label: '対応中' },
  { value: 'complete',  label: '完了' },
  { value: 'hold',      label: '仮予約' },
  { value: 'cancelled', label: 'キャンセル' },
];

function toHHMM(d) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function trimSec(t) { return (t || '').slice(0, 5); }
function addMinutes(hhmm, min) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + min;
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function yen(n) {
  if (n == null) return '—';
  const v = Number(n);
  return (v < 0 ? '-¥' : '¥') + Math.abs(v).toLocaleString();
}

export default function ReservationFormModal({ customer, reservation, onClose, onSaved, onDeleted }) {
  const isEdit = !!reservation?.id;
  const cust = customer || reservation?.customer || null;
  const currentStoreId = useAppStore((s) => s.currentStoreId);

  const [masters, setMasters] = useState(null);
  const [ladies, setLadies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isFirstMeet, setIsFirstMeet] = useState(null);
  const [ladyCastRankId, setLadyCastRankId] = useState(null);

  // Basic fields
  const [date, setDate] = useState(reservation?.reserved_date || todayISO());
  const [startTime, setStartTime] = useState(
    reservation?.start_time
      ? trimSec(reservation.start_time)
      : toHHMM(new Date(Date.now() + 30 * 60 * 1000))
  );
  const [ladyId, setLadyId] = useState(reservation?.lady_id || '');
  const [status, setStatus] = useState(reservation?.status || 'reserved');
  const [memo, setMemo] = useState(reservation?.memo || '');
  const [roomNo, setRoomNo] = useState(reservation?.room_no || '');
  const [feeAdj, setFeeAdj] = useState(reservation?.fee_adjustment ?? 0);
  const [rewardAdj, setRewardAdj] = useState(reservation?.reward_adjustment ?? 0);
  const [paymentMethod, setPaymentMethod] = useState(reservation?.payment_method || 'cash');
  const [advanceCash, setAdvanceCash] = useState(reservation?.advance_cash ?? '');
  const [isTriple, setIsTriple] = useState(reservation?.is_triple || false);

  // Selections: { [group_id]: null | item_id (string) | Set<item_id> }
  const [selections, setSelections] = useState({});

  // ── Load masters ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentStoreId) return;
    let cancelled = false;
    (async () => {
      const [{ data: groups }, { data: ranks }] = await Promise.all([
        supabase.from('option_groups').select('*')
          .eq('store_id', currentStoreId).order('display_order'),
        supabase.from('cast_ranks').select('*')
          .eq('store_id', currentStoreId).order('display_order'),
      ]);
      if (cancelled) return;

      const groupIds = (groups || []).map((g) => g.id);
      const { data: allItems } = groupIds.length
        ? await supabase.from('option_items').select('*')
            .in('group_id', groupIds).eq('is_active', true).order('display_order')
        : { data: [] };
      if (cancelled) return;

      const itemIds = (allItems || []).map((i) => i.id);
      const { data: rankPriceRows } = itemIds.length
        ? await supabase.from('option_item_rank_prices').select('*').in('item_id', itemIds)
        : { data: [] };
      if (cancelled) return;

      // Build lookup maps
      const groupById = {};
      const itemsByGroup = {};
      const itemById = {};
      for (const g of (groups || [])) {
        groupById[g.id] = g;
        itemsByGroup[g.id] = [];
      }
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

      // Initialize selections
      const initSel = {};
      for (const g of (groups || [])) {
        initSel[g.id] = g.multi_select ? new Set() : null;
      }
      for (const si of (reservation?.selected_items || [])) {
        const g = groupById[si.group_id];
        if (!g) continue;
        if (g.multi_select) {
          if (!(initSel[g.id] instanceof Set)) initSel[g.id] = new Set();
          initSel[g.id].add(si.item_id);
        } else {
          initSel[g.id] = si.item_id;
        }
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
        .from('ladies').select('id, display_name, name, cast_rank_id')
        .eq('is_active', true).eq('store_id', currentStoreId).order('display_name');
      if (!cancelled) setLadies(data || []);
    })();
    return () => { cancelled = true; };
  }, [currentStoreId]);

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
    const sortedGroups = [...masters.groups].sort(
      (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
    );
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
          basePrice = targetRank
            ? (effectivePrice(masters.ranks, masters.rankPrices[itemId] || {}, targetRank) ?? 0)
            : 0;
        } else if (item.price_mode === 'flat') {
          basePrice = Number(item.price_flat) || 0;
        } else {
          basePrice = 0;
        }
        const tripleMultiplier =
          isTriple && Number(group.triple_multiplier) > 1 ? Number(group.triple_multiplier) : 1;
        const finalPrice = Math.round(basePrice * tripleMultiplier);
        const reward = rewardFor(item, finalPrice, { isFirstMeet: isFirstMeet === true });
        lines.push({
          item_id: itemId, group_id: group.id, kind: group.kind,
          name: item.name, group_label: group.label,
          amount: finalPrice, reward,
        });
      }
    }
    return lines;
  }, [masters, selections, ladyCastRankId, isTriple, isFirstMeet]);

  const totalAmount = useMemo(
    () => lineItems.reduce((s, l) => s + l.amount, 0) + Number(feeAdj || 0),
    [lineItems, feeAdj]
  );
  const totalReward = useMemo(
    () => lineItems.reduce((s, l) => s + l.reward, 0) + Number(rewardAdj || 0),
    [lineItems, rewardAdj]
  );

  // ── Save ──────────────────────────────────────────────────────────────
  const save = async () => {
    if (!cust?.id && !reservation?.customer_id) {
      showToast('error', '顧客情報がありません'); return;
    }
    setLoading(true);

    // Derive course/hotel name for legacy columns
    const courseGroup = masters?.groups.find((g) => g.kind === 'course');
    const courseItemId = courseGroup ? (selections[courseGroup.id] || null) : null;
    const hotelGroup = masters?.groups.find((g) => g.kind === 'hotel');
    const hotelItemId = hotelGroup ? (selections[hotelGroup.id] || null) : null;

    const payload = {
      customer_id: cust?.id || reservation.customer_id,
      store_id: currentStoreId,
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
      selected_items: lineItems.map(({ item_id, group_id, kind, name, amount, reward }) =>
        ({ item_id, group_id, kind, name, amount, reward })
      ),
      cast_reward: totalReward || null,
      fee_adjustment: Number(feeAdj) || 0,
      reward_adjustment: Number(rewardAdj) || 0,
      payment_method: paymentMethod,
      advance_cash: advanceCash !== '' ? Number(advanceCash) : null,
      is_triple: isTriple,
      is_first_meet: isFirstMeet,
    };

    let resp;
    if (isEdit) {
      resp = await supabase.from('reservations').update(payload).eq('id', reservation.id).select().single();
    } else {
      resp = await supabase.from('reservations').insert(payload).select().single();
    }
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

  // ── Group renderer ────────────────────────────────────────────────────
  const renderGroup = (group) => {
    const items = masters.itemsByGroup[group.id] || [];
    if (!items.length) return null;
    const sel = selections[group.id];

    if (group.multi_select) {
      return (
        <div key={group.id} className="nr-field nr-full">
          <span>{group.label}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', paddingTop: 2 }}>
            {items.map((item) => {
              const checked = sel instanceof Set && sel.has(item.id);
              return (
                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox" checked={checked}
                    onChange={() => selectItem(group.id, item.id, true)}
                  />
                  {item.name}
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <label key={group.id} className="nr-field">
        <span>{group.label}</span>
        <select
          value={typeof sel === 'string' ? sel : ''}
          onChange={(e) => {
            const v = e.target.value;
            setSelections((prev) => ({ ...prev, [group.id]: v || null }));
          }}
        >
          <option value="">— なし —</option>
          {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
    );
  };

  // ── Loading state ─────────────────────────────────────────────────────
  if (!masters) {
    return (
      <>
        <div className="modal-overlay" onClick={onClose} />
        <div className="nr-modal" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>読み込み中...</span>
        </div>
      </>
    );
  }

  const groupsByKind = {};
  for (const g of masters.groups) {
    if (!groupsByKind[g.kind]) groupsByKind[g.kind] = [];
    groupsByKind[g.kind].push(g);
  }

  const hotelGroup = masters.groups.find((g) => g.kind === 'hotel');
  const hotelSelected = hotelGroup ? !!selections[hotelGroup.id] : false;

  const hasNominationKind = (masters.groups.find((g) => g.kind === 'nomination') &&
    (masters.itemsByGroup[masters.groups.find((g) => g.kind === 'nomination')?.id] || []).length > 0);

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="nr-modal">
        <div className="nr-head">
          <div>
            <div className="nr-title">{isEdit ? '予約を編集' : '新規予約'}</div>
            <div className="nr-subtitle">
              {cust?.name || '顧客未選択'}{' '}
              {cust?.phone_normalized && <span className="mono">({cust.phone_normalized})</span>}
            </div>
          </div>
          <button className="cp-icon-btn" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>

        <div className="nr-body">
          <div className="nr-grid">

            {/* Status (edit only) */}
            {isEdit && (
              <label className="nr-field nr-full">
                <span>ステータス</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            )}

            {/* Date / Time */}
            <label className="nr-field">
              <span>日付</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="nr-field">
              <span>開始時刻</span>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            {totalDuration > 0 && (
              <>
                <label className="nr-field">
                  <span>プレイ時間</span>
                  <input type="text" value={`${totalDuration}分`} readOnly style={{ background: 'var(--row-alt)' }} />
                </label>
                <label className="nr-field">
                  <span>終了時刻</span>
                  <input type="text" value={endTime} readOnly className="mono" style={{ background: 'var(--row-alt)' }} />
                </label>
              </>
            )}

            {/* Lady */}
            <label className="nr-field nr-full">
              <span>指名女性</span>
              <select value={ladyId} onChange={(e) => setLadyId(e.target.value)}>
                <option value="">— 未指定(フリー)—</option>
                {ladies.map((l) => <option key={l.id} value={l.id}>{l.display_name || l.name}</option>)}
              </select>
            </label>

            {/* 3P */}
            <label className="nr-field nr-full" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" checked={isTriple} onChange={(e) => setIsTriple(e.target.checked)} />
              <span style={{ color: 'var(--fg)', fontSize: 13, fontWeight: 400 }}>3P（料金を倍率換算）</span>
            </label>

            <div className="nr-full" style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />

            {/* All item groups in KIND_ORDER */}
            {KIND_ORDER.flatMap((kind) => (groupsByKind[kind] || []).map(renderGroup)).filter(Boolean)}

            {/* First-meet badge (shown when nomination kind exists and lady is selected) */}
            {hasNominationKind && ladyId && isFirstMeet !== null && (
              <div className="nr-full" style={{
                fontSize: 12, padding: '4px 8px', borderRadius: 6,
                background: isFirstMeet ? 'oklch(0.25 0.04 145)' : 'var(--row-alt)',
                color: isFirstMeet ? 'oklch(0.85 0.12 145)' : 'var(--muted)',
              }}>
                {isFirstMeet ? '✓ 初回（初回報酬が適用されます）' : '再訪（リピート報酬が適用されます）'}
              </div>
            )}

            {/* Room number (only when hotel is selected) */}
            {hotelSelected && (
              <label className="nr-field">
                <span>部屋番号</span>
                <input type="text" value={roomNo} onChange={(e) => setRoomNo(e.target.value)} placeholder="810" />
              </label>
            )}

            {/* Fee summary */}
            {lineItems.length > 0 && (
              <div className="nr-full" style={{
                background: 'var(--row-alt)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 12px',
              }}>
                {lineItems.map((l, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                    <span style={{ color: 'var(--muted)' }}>{l.group_label}：{l.name}</span>
                    <span>{yen(l.amount)}</span>
                  </div>
                ))}
                {Number(feeAdj) !== 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                    <span style={{ color: 'var(--muted)' }}>金額調整</span>
                    <span>{yen(feeAdj)}</span>
                  </div>
                )}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>合計</span>
                  <span>{yen(totalAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  <span>キャスト報酬</span>
                  <span>{yen(totalReward)}</span>
                </div>
              </div>
            )}

            {/* Adjustments / payment */}
            <label className="nr-field">
              <span>金額調整 (¥)</span>
              <input type="number" value={feeAdj} onChange={(e) => setFeeAdj(e.target.value)} placeholder="0" />
            </label>
            <label className="nr-field">
              <span>報酬調整 (¥)</span>
              <input type="number" value={rewardAdj} onChange={(e) => setRewardAdj(e.target.value)} placeholder="0" />
            </label>
            <label className="nr-field">
              <span>支払方法</span>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="cash">現金</option>
                <option value="card">カード</option>
              </select>
            </label>
            <label className="nr-field">
              <span>前渡し現金 (¥)</span>
              <input type="number" value={advanceCash} onChange={(e) => setAdvanceCash(e.target.value)} placeholder="0" />
            </label>

            {/* Memo */}
            <label className="nr-field nr-full">
              <span>メモ</span>
              <textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </label>

          </div>
        </div>

        <div className="nr-actions">
          {isEdit && (
            <button className="cf-btn danger-outline" onClick={handleDelete} disabled={loading}>
              <Icon name="trash" size={13} />{confirmDelete ? '本当に削除する' : '削除'}
            </button>
          )}
          <button className="cf-btn ghost" onClick={onClose} disabled={loading}>キャンセル</button>
          <button className="cf-btn primary" onClick={save} disabled={loading} style={{ marginLeft: 'auto' }}>
            <Icon name="check" size={13} />{loading ? '保存中...' : (isEdit ? '更新する' : '予約を登録')}
          </button>
        </div>
      </div>
    </>
  );
}
