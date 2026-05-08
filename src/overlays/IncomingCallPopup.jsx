import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '../components/Icon.jsx';
import { supabase } from '../lib/supabase.js';
import { saveCustomer, loadCustomerReservations, loadCustomerCallLogs } from '../hooks/useCustomers.js';
import { formatCallTime, normalizePhone } from '../lib/utils.js';
import { useHistoryCols } from '../lib/historyCols.js';
import { showToast } from '../lib/toast.js';
import { startRingtone, stopRingtone } from '../lib/ringtone.js';
import { openReservationWindow } from '../lib/reservationWindowBridge.js';
import NewCustomerModal from './NewCustomerModal.jsx';
import { useAppStore } from '../store/state.js';

const RANK_CHIP = { VIP: 'gold', A: 'green', B: 'blue', NG: 'red', 優良: 'green', CB決済: 'blue' };

const STATUS_LABEL = { reserved: '予約中', cancelled: 'キャンセル', received: '受領済', キャンセル: 'キャンセル', 予約中: '予約中', 受領済: '受領済' };
function statusBg(s)    { return s === 'cancelled' || s === 'キャンセル' ? '#fca5a5' : s === 'reserved' || s === '予約中' ? '#fde68a' : undefined; }
function statusColor(s) { return s === 'cancelled' || s === 'キャンセル' ? '#991b1b' : s === 'reserved' || s === '予約中' ? '#92400e' : s === 'received' || s === '受領済' ? '#1e40af' : 'var(--muted)'; }

const DOW = ['日','月','火','水','木','金','土'];
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${y}/${String(m).padStart(2,'0')}/${String(d).padStart(2,'0')}(${DOW[dow]})`;
}

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

export default function IncomingCallPopup({ call, onClose, onAnswer, onOpenCustomer }) {
  const currentStaff = useAppStore((s) => s.currentStaff);
  const [pos,          setPos]          = useState({ x: 0, y: 0 });
  const [dragging,     setDragging]     = useState(false);
  const [minimized,    setMinimized]    = useState(false);
  const [elapsed,      setElapsed]      = useState(0);
  const [answered,     setAnswered]     = useState(false);
  const [callEnded,    setCallEnded]    = useState(false); // 通話終了ボタン押下後（画面は開いたまま）
  const [claimedBy,    setClaimedBy]    = useState(null); // 他スタッフがclaimした場合の名前
  const [customer,     setCustomer]     = useState(call.customer || null);
  const [history,      setHistory]      = useState([]);
  const [callLogs,     setCallLogs]     = useState([]);
  const [loading,      setLoading]      = useState(!!call.customer?.id);
  const [showMemoAdd,  setShowMemoAdd]  = useState(false);
  const [newMemo,      setNewMemo]      = useState('');
  const [editingMemo,  setEditingMemo]  = useState(false);
  const [memoDraft,    setMemoDraft]    = useState('');
  const [editingBikou,    setEditingBikou]    = useState(false);
  const [bikouDraft,      setBikouDraft]      = useState('');
  const [editingCustData, setEditingCustData] = useState(false);
  const [custForm,        setCustForm]        = useState({});
  const [showNewCust,     setShowNewCust]     = useState(false);
  const [selectedRsv,     setSelectedRsv]     = useState(null);
  const [ngLadies,        setNgLadies]        = useState([]);
  const [showNgInput,     setShowNgInput]     = useState(false);
  const [ngInput,         setNgInput]         = useState('');
  const [ngDropOpen,      setNgDropOpen]      = useState(false);
  const [allLadies,       setAllLadies]       = useState([]);
  const { visibleDefs, getColWidth, setColWidth } = useHistoryCols();
  const startRef    = useRef(null);
  const resizeState = useRef(null);
  const timerRef    = useRef(null);

  const startColResize = useCallback((id, e) => {
    e.preventDefault(); e.stopPropagation();
    resizeState.current = { id, startX: e.clientX, startW: getColWidth(id) };
    function onMove(me) {
      if (!resizeState.current) return;
      const { id, startX, startW } = resizeState.current;
      setColWidth(id, startW + me.clientX - startX);
    }
    function onUp() {
      resizeState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [getColWidth, setColWidth]);

  // Load all ladies once
  useEffect(() => {
    supabase.from('ladies').select('id, display_name').eq('is_active', true).order('display_name')
      .then(({ data }) => { if (data) setAllLadies(data); });
  }, []);

  // Timer + ringtone
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    startRingtone();
    return () => { clearInterval(timerRef.current); stopRingtone(); };
  }, []);

  // 通話終了時にタイマーを止める
  useEffect(() => {
    if (!callEnded) return;
    clearInterval(timerRef.current);
    timerRef.current = null;
  }, [callEnded]);

  // 応答したらコール音を止める
  useEffect(() => {
    if (answered) stopRingtone();
  }, [answered]);

  // 他スタッフが同じ着信をclaimしたら「他対応中」表示してポップアップを閉じる
  useEffect(() => {
    const callLogId = call.callLogId;
    if (!callLogId || callLogId === 'demo') return; // デモ着信はスキップ

    const channel = supabase
      .channel(`call_claim_${callLogId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'call_logs', filter: `id=eq.${callLogId}` },
        (payload) => {
          const row = payload.new;
          if (!row) return;
          // 自分以外がclaimした場合、3秒後に閉じる
          if (
            row.ui_status === 'claimed' &&
            row.handled_by &&
            row.handled_by !== currentStaff?.id
          ) {
            setClaimedBy(row.assigned_staff_id);
            setTimeout(() => onClose(), 3000);
          }
          // ended なら即閉じる（自分がclaimしていた場合はhandleEndで閉じているので問題なし）
          if (row.ui_status === 'ended' && !answered) {
            onClose();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [call.callLogId, currentStaff?.id, answered, onClose]);

  // ── claim: 「対応開始」ボタンハンドラ ────────────────────────────────────
  const handleClaim = useCallback(async () => {
    setAnswered(true);
    onAnswer?.();
    const callLogId = call.callLogId;
    if (!callLogId || callLogId === 'demo' || !currentStaff?.id) return;
    await supabase.from('call_logs').update({
      ui_status:       'claimed',
      handled_by:      currentStaff.id,   // 実DB列名（assigned_staff_id相当）
      acknowledged_by: currentStaff.id,
      acknowledged_at: new Date().toISOString(),
    }).eq('id', callLogId);
  }, [call.callLogId, currentStaff, onAnswer]);

  // ── end: 「通話終了」ボタンハンドラ ──────────────────────────────────────
  // DB に ended を書くだけでポップアップは閉じない。
  // 終話後も顧客情報を見たり予約入力したりできるよう、閉じるのはユーザーが明示的に行う。
  const handleEnd = useCallback(async () => {
    setCallEnded(true);
    const callLogId = call.callLogId;
    if (callLogId && callLogId !== 'demo' && currentStaff?.id) {
      await supabase.from('call_logs').update({
        ui_status: 'ended',
        ended_by:  currentStaff.id,
        ended_at:  new Date().toISOString(),
      }).eq('id', callLogId);
    }
  }, [call.callLogId, currentStaff]);

  // 利用履歴エリア外クリックで選択解除
  useEffect(() => {
    if (!selectedRsv) return;
    const handle = () => setSelectedRsv(null);
    window.addEventListener('click', handle);
    return () => window.removeEventListener('click', handle);
  }, [selectedRsv]);

  // Load full customer data, history, callLogs
  useEffect(() => {
    const c = call.customer;
    if (!c?.id) { setLoading(false); return; }
    setLoading(true);
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('customers').select('*').eq('id', c.id).maybeSingle();
      if (cancelled) return;
      const full = data || c;
      setCustomer(full);
      setMemoDraft(full.alert_memo || '');
      const [{ data: rows }, logs, ngRows] = await Promise.all([
        loadCustomerReservations(c.id),
        loadCustomerCallLogs(full.phone_normalized || call.phone, 30),
        supabase.from('customer_ng_ladies').select('id, lady_name').eq('customer_id', c.id).then(({ data }) => data || []),
      ]);
      if (cancelled) return;
      setHistory(rows);
      setCallLogs(logs);
      setNgLadies(ngRows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [call.customer?.id]);

  // Drag
  const onDragStart = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('textarea') || e.target.closest('input')) return;
    setDragging(true);
    startRef.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y };
  }, [pos]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e) => {
      if (!startRef.current) return;
      setPos({ x: startRef.current.x + e.clientX - startRef.current.mx, y: startRef.current.y + e.clientY - startRef.current.my });
    };
    const up = () => { setDragging(false); startRef.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [dragging]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const addMemo = async () => {
    if (!newMemo.trim() || !customer?.id) return;
    const d = new Date();
    const entry = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${newMemo.trim()}`;
    const updated = customer.memo ? `${entry}\n${customer.memo}` : entry;
    await saveCustomer(customer.id, { memo: updated });
    setCustomer((prev) => ({ ...prev, memo: updated }));
    setNewMemo(''); setShowMemoAdd(false);
    showToast('success', 'メモを追加しました');
  };

  const saveMemo = async () => {
    if (!customer?.id) return;
    await saveCustomer(customer.id, { alert_memo: memoDraft || null });
    setCustomer((prev) => ({ ...prev, alert_memo: memoDraft }));
    setEditingMemo(false);
    showToast('success', '保存しました');
  };

  const saveBikou = async () => {
    if (!customer?.id) return;
    await saveCustomer(customer.id, { memo: bikouDraft || null });
    setCustomer((prev) => ({ ...prev, memo: bikouDraft }));
    setEditingBikou(false);
    showToast('success', '保存しました');
  };

  const refreshHistory = useCallback(async () => {
    if (!customer?.id) return;
    const { data: rows } = await loadCustomerReservations(customer.id);
    setHistory(rows);
  }, [customer?.id]);

  const addNgLady = async (lady) => {
    if (!lady || !customer?.id) return;
    if (ngLadies.some((r) => r.lady_name === lady.display_name)) return;
    const { data, error } = await supabase
      .from('customer_ng_ladies')
      .insert({ customer_id: customer.id, lady_name: lady.display_name })
      .select('id, lady_name')
      .single();
    if (error) { showToast('error', `追加失敗: ${error.message}`); return; }
    setNgLadies((prev) => [...prev, data]);
    setNgInput('');
    setShowNgInput(false);
    setNgDropOpen(false);
    showToast('success', `${lady.display_name} をNG女子に追加しました`);
  };

  const removeNgLady = async (id, name) => {
    const { error } = await supabase.from('customer_ng_ladies').delete().eq('id', id);
    if (error) { showToast('error', `削除失敗: ${error.message}`); return; }
    setNgLadies((prev) => prev.filter((r) => r.id !== id));
    showToast('success', `${name} をNG女子から削除しました`);
  };

  const openCustEdit = () => {
    setCustForm({
      name:       customer?.name || '',
      kana:       customer?.kana || '',
      phone:      customer?.phone_normalized || customer?.phone || call.phone || '',
      email:      customer?.email || '',
      address:    customer?.address || '',
      line:       customer?.line || '',
      rank:       customer?.rank || 'C',
      member_no:  customer?.member_no || '',
      tags:       (customer?.tags || []).join(', '),
      alert_memo: customer?.alert_memo || '',
      ops_memo:   customer?.ops_memo   || '',
    });
    setEditingCustData(true);
  };

  const saveCustomerData = async () => {
    if (!customer?.id) return;
    const s = (v) => (v ?? '').trim();
    const rawPhone = s(custForm.phone);
    const patch = {
      name:       s(custForm.name)      || null,
      kana:       s(custForm.kana)      || null,
      phone:      rawPhone              || null,
      email:      s(custForm.email)     || null,
      address:    s(custForm.address)   || null,
      rank:       custForm.rank         || 'C',
      member_no:  s(custForm.member_no) || null,
      line:       s(custForm.line)      || null,
      tags:       s(custForm.tags).split(',').map((t) => t.trim()).filter(Boolean),
      alert_memo: s(custForm.alert_memo)|| null,
      ops_memo:   s(custForm.ops_memo)  || null,
    };
    const { error } = await saveCustomer(customer.id, patch);
    if (error) {
      console.error('[saveCustomerData]', error);
      showToast('error', `保存失敗: ${error.message || JSON.stringify(error)}`);
      return;
    }
    setCustomer((prev) => ({ ...prev, ...patch }));
    setEditingCustData(false);
    showToast('success', '顧客データを保存しました');
  };

  const mm  = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss  = String(elapsed % 60).padStart(2, '0');
  const c   = customer;
  const tags = c?.tags || [];
  const hue  = hashHue(c?.name || '');

  return (
    <>
      <div className="call-scrim" />
      <div
        className={'cf-float' + (dragging ? ' dragging' : '') + (minimized ? ' minimized' : '')}
        style={{ transform: `translate(calc(-50% + ${pos.x}px), ${pos.y}px)` }}
      >
        {/* ── Header ── */}
        <div className="cf-handle" onMouseDown={onDragStart} style={callEnded ? { borderBottom: '2px solid var(--muted)' } : answered ? { borderBottom: '2px solid var(--ok, #16a34a)' } : {}}>
          <div className="cf-handle-l">
            <div className="ring" style={{ width: 24, height: 24, flexShrink: 0, background: callEnded ? 'var(--bg-subtle)' : answered ? '#16a34a22' : undefined, borderColor: callEnded ? 'var(--border)' : answered ? '#16a34a' : undefined }}>
              {!answered && !callEnded && <span className="pulse" />}
              <Icon name="phoneIn" size={13} style={{ color: callEnded ? 'var(--muted)' : answered ? '#16a34a' : undefined }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: callEnded ? 'var(--muted)' : answered ? 'var(--ok, #16a34a)' : 'var(--text)' }}>
                {callEnded ? '通話終了' : answered ? '通話中' : '着信中'}
                <span className="mono" style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>{mm}:{ss}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>外線 1 · 自動判定済</div>
            </div>
          </div>
          <div className="cf-handle-r">
            <button className="cp-icon-btn" onClick={() => setMinimized((v) => !v)} title={minimized ? '展開' : '最小化'}>
              <Icon name="chevronD" size={14} style={{ transform: minimized ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            </button>
            <button className="cp-icon-btn" onClick={onClose} title="閉じる (Esc)">
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>

        {!minimized && (
          <>
            {/* ── Known customer ── */}
            {c ? (
              <>
                {/* ── 2-column banner: 顧客情報 ｜ 顧客備考 ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--line)', height: 224, overflow: 'hidden' }}>

                  {/* LEFT: 顧客情報 or 編集フォーム */}
                  <div style={{ position: 'relative', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    {/* 左コンテンツ — 右側absoluteパネル(160px)分だけpaddingRightを確保 */}
                    <div style={{ padding: '12px 14px', paddingRight: editingCustData ? 14 : 174, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto' }}>

                    {editingCustData ? (
                      /* ── 編集フォーム ── */
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>顧客データ編集</span>
                          <button className="cf-edit-btn" onClick={() => setEditingCustData(false)} title="キャンセル">
                            <Icon name="close" size={12} />
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 200, fontSize: 12 }}>
                          {[
                            { label: '名前',     key: 'name',      type: 'text' },
                            { label: 'フリガナ', key: 'kana',      type: 'text' },
                            { label: '電話番号', key: 'phone',     type: 'tel'  },
                            { label: 'メール',   key: 'email',     type: 'email'},
                            { label: '住所',     key: 'address',   type: 'text' },
                            { label: 'LINE ID',  key: 'line',      type: 'text' },
                            { label: '会員番号', key: 'member_no', type: 'text' },
                            { label: 'タグ（カンマ区切り）', key: 'tags', type: 'text' },
                          ].map(({ label, key, type }) => (
                            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
                              <input
                                type={type}
                                value={custForm[key] || ''}
                                onChange={(e) => setCustForm((f) => ({ ...f, [key]: e.target.value }))}
                                style={{ padding: '4px 7px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', width: '100%' }}
                              />
                            </label>
                          ))}
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>ランク</span>
                            <select
                              value={custForm.rank || 'C'}
                              onChange={(e) => setCustForm((f) => ({ ...f, rank: e.target.value }))}
                              style={{ padding: '4px 7px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' }}
                            >
                              {['VIP','A','B','C','NG'].map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>要注意事項</span>
                            <textarea
                              value={custForm.alert_memo || ''}
                              onChange={(e) => setCustForm((f) => ({ ...f, alert_memo: e.target.value }))}
                              rows={2}
                              style={{ padding: '4px 7px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box', width: '100%' }}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 10, color: '#b45309', fontWeight: 600 }}>オペレーション上の注意</span>
                            <textarea
                              value={custForm.ops_memo || ''}
                              onChange={(e) => setCustForm((f) => ({ ...f, ops_memo: e.target.value }))}
                              rows={2}
                              style={{ padding: '4px 7px', border: '1px solid #fcd34d', borderRadius: 5, fontSize: 12, background: '#fffbeb', color: 'var(--text)', fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box', width: '100%' }}
                            />
                          </label>
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                          <button className="btn sm primary" onClick={saveCustomerData}>保存</button>
                          <button className="btn sm" onClick={() => setEditingCustData(false)}>キャンセル</button>
                        </div>
                      </>
                    ) : (
                      /* ── 表示モード ── */
                      <>
                        {/* アバター + 名前/タグ/統計 */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{
                            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                            background: `linear-gradient(135deg, oklch(0.55 0.16 ${hue}), oklch(0.40 0.20 ${hue}))`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontWeight: 800, fontSize: 17,
                          }}>
                            {c.name?.[0] || '?'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 14, fontWeight: 700 }}>{c.name || '名前未登録'}</span>
                              <button className="cf-edit-btn" onClick={openCustEdit} title="顧客データ編集">
                                <Icon name="edit" size={11} />
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 2 }}>
                              {tags.map((t) => <span key={t} className={'chip ' + (RANK_CHIP[t] || '')}>{t}</span>)}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                              <span className="mono">{c.phone_normalized || call.phone}</span>
                              <span style={{ margin: '0 5px' }}>·</span>
                              <span>{c.total_visits ?? 0}回</span>
                            </div>
                            <div style={{ fontSize: 11, marginTop: 1 }}>
                              総額 <b className="mono">¥{(c.total_spent ?? 0).toLocaleString()}</b>
                              <span style={{ color: 'var(--muted)', marginLeft: 6 }}>最終 {c.last_visit_date || '—'}</span>
                            </div>
                          </div>
                        </div>

                        {/* 住所・メール */}
                        {(c.address || c.email || c.line) && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--muted)' }}>
                            {c.address && <div><span style={{ fontWeight: 600 }}>住所 </span>{c.address}</div>}
                            {c.email   && <div><span style={{ fontWeight: 600 }}>メール </span><span className="mono">{c.email}</span></div>}
                            {c.line    && <div><span style={{ fontWeight: 600 }}>LINE </span>{c.line}</div>}
                          </div>
                        )}

                        {/* 対応開始 / 通話終了 / 閉じる */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 4 }}>
                          {claimedBy ? (
                            <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>他スタッフ対応中</div>
                          ) : callEnded ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--muted)', display: 'inline-block' }} />
                              通話終了済
                            </div>
                          ) : answered ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ok, #16a34a)', fontWeight: 600 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok, #16a34a)', display: 'inline-block' }} />
                              対応中
                            </div>
                          ) : (
                            <button className="cp-btn success" onClick={handleClaim}>
                              <Icon name="phoneIn" size={12} />対応開始
                            </button>
                          )}
                          {callEnded ? (
                            <button className="cp-btn ghost" onClick={onClose}>閉じる</button>
                          ) : (
                            <button className="cp-btn danger-outline" onClick={answered ? handleEnd : onClose}>
                              {answered ? '通話終了' : '閉じる'}
                            </button>
                          )}
                        </div>

                        {/* ── 利用女子/NG女子: position absolute で完全独立 ── */}
                        {(() => {
                          const ladyMap = {};
                          history.forEach((r) => {
                            const n = r.ladies?.display_name;
                            if (n) ladyMap[n] = (ladyMap[n] || 0) + 1;
                          });
                          const usedLadies = Object.entries(ladyMap).sort((a, b) => b[1] - a[1]);
                          return (
                            <div style={{
                              position: 'absolute', right: 0, top: 0, bottom: 0, width: 160,
                              borderLeft: '1px solid var(--line)',
                              display: 'flex', flexDirection: 'column',
                              background: 'var(--surface)',
                            }}>
                              {/* 利用女子 */}
                              <div style={{ flex: 1, padding: '8px 10px', borderBottom: '1px solid var(--line)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.4 }}>
                                  利用女子 {usedLadies.length > 0 && <span style={{ fontWeight: 400 }}>({usedLadies.length})</span>}
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                  {usedLadies.length === 0 ? (
                                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>なし</span>
                                  ) : usedLadies.map(([name, cnt]) => (
                                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--halo-50, #f5f3ff)', border: '1px solid var(--halo-200, #ddd6fe)' }}>
                                      <span style={{ fontWeight: 600, color: 'var(--halo-700, #6d28d9)' }}>{name}</span>
                                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{cnt}回</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* NG女子 */}
                              <div style={{ flex: 1, padding: '8px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#b91c1c', letterSpacing: 0.4 }}>
                                    NG女子 {ngLadies.length > 0 && <span style={{ fontWeight: 400 }}>({ngLadies.length})</span>}
                                  </span>
                                  {customer?.id && (
                                    <button
                                      onClick={() => { setShowNgInput((v) => !v); setNgInput(''); }}
                                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: '#fca5a5', border: 'none', cursor: 'pointer', color: '#b91c1c', flexShrink: 0, padding: 0 }}
                                      title="NG女子を追加"
                                    >
                                      <Icon name="plus" size={9} />
                                    </button>
                                  )}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                  {ngLadies.length === 0 && !showNgInput && (
                                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>なし</span>
                                  )}
                                  {ngLadies.map((row) => (
                                    <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, padding: '2px 4px 2px 6px', borderRadius: 4, background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', fontWeight: 600 }}>
                                      {row.lady_name}
                                      <button onClick={() => removeNgLady(row.id, row.lady_name)} style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', padding: 0, lineHeight: 1 }}>
                                        <Icon name="close" size={9} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                {showNgInput && (
                                  <div style={{ position: 'relative', marginTop: 2 }}>
                                    <input
                                      autoFocus
                                      value={ngInput}
                                      onChange={(e) => { setNgInput(e.target.value); setNgDropOpen(true); }}
                                      onFocus={() => setNgDropOpen(true)}
                                      onBlur={() => setTimeout(() => { setNgDropOpen(false); }, 160)}
                                      onKeyDown={(e) => { if (e.key === 'Escape') { setShowNgInput(false); setNgInput(''); } }}
                                      placeholder="女子名で検索..."
                                      style={{ width: '100%', boxSizing: 'border-box', fontSize: 11, padding: '4px 8px', border: '1px solid #fca5a5', borderRadius: 5, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none' }}
                                    />
                                    {ngDropOpen && (() => {
                                      const ngNames = new Set(ngLadies.map((r) => r.lady_name));
                                      const filtered = allLadies.filter((l) =>
                                        !ngNames.has(l.display_name) &&
                                        (!ngInput.trim() || l.display_name.includes(ngInput.trim()))
                                      );
                                      return filtered.length > 0 ? (
                                        <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 6px 18px rgba(0,0,0,0.15)', maxHeight: 150, overflowY: 'auto' }}>
                                          {filtered.map((l) => (
                                            <div key={l.id} onMouseDown={() => addNgLady(l)}
                                              style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text)' }}
                                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--halo-50, #f5f3ff)'}
                                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                            >
                                              {l.display_name}
                                            </div>
                                          ))}
                                        </div>
                                      ) : null;
                                    })()}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>{/* /inner padding wrapper */}
                  </div>{/* /outer position:relative */}

                  {/* RIGHT: 予約概要 or 顧客備考 */}
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
                    {selectedRsv ? (() => {
                      const rv = selectedRsv;
                      const PAY = { cash: '現金', card: 'カード', transfer: '振込' };
                      const NOM = { free: 'フリー', net: 'ネット指名', direct: '本指名' };
                      const Row2 = ({ l1, v1, l2, v2 }) => (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 4px', borderBottom: '1px solid var(--line)' }}>
                          <div style={{ display: 'flex', gap: 4, padding: '3px 6px' }}>
                            <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0, minWidth: 36 }}>{l1}</span>
                            <span style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v1 || '—'}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 4, padding: '3px 6px', borderLeft: '1px solid var(--line)' }}>
                            <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0, minWidth: 36 }}>{l2}</span>
                            <span style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v2 || '—'}</span>
                          </div>
                        </div>
                      );
                      const Row1 = ({ label, value, accent }) => (
                        <div style={{ display: 'flex', gap: 6, padding: '3px 6px', borderBottom: '1px solid var(--line)' }}>
                          <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0, minWidth: 36 }}>{label}</span>
                          <span style={{ fontSize: 11, fontWeight: 500, color: accent, flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{value || '—'}</span>
                        </div>
                      );
                      return (
                        <>
                          {/* ヘッダー */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid var(--line)', flexShrink: 0, background: 'var(--surface)' }}>
                            <span style={{ fontSize: 11, fontWeight: 700 }}>予約概要</span>
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                              {!answered && !claimedBy && (
                                <button className="cp-btn success" style={{ padding: '3px 10px', fontSize: 11 }} onClick={handleClaim}>
                                  <Icon name="phoneIn" size={11} />対応開始
                                </button>
                              )}
                              <button className="btn sm primary" style={{ padding: '3px 10px', fontSize: 11 }}
                                onClick={() => openReservationWindow({ customer: c, reservation: rv, onSaved: refreshHistory, onDeleted: () => { refreshHistory(); setSelectedRsv(null); } })}>
                                編集
                              </button>
                              <button className="cp-icon-btn" onClick={() => setSelectedRsv(null)}><Icon name="close" size={11} /></button>
                            </div>
                          </div>
                          {/* 内容 */}
                          <div style={{ overflowY: 'auto', flex: 1 }}>
                            <Row1 label="日時" value={`${fmtDate(rv.reserved_date)} ${rv.start_time?.slice(0,5) || ''}〜${rv.end_time?.slice(0,5) || ''}`} />
                            <Row1 label="キャスト" value={rv.ladies?.display_name} />
                            <Row2 l1="コース" v1={rv.course ? rv.course.replace(/分.*$/,'')+'分' : '—'} l2="延長" v2={rv.extension ? (rv.extension.match(/(\d+)/)?.[1]||rv.extension)+'分' : '—'} />
                            <Row2 l1="指名" v1={NOM[rv.nomination_type] || rv.nomination_type} l2="交通費" v2={rv.transport} />
                            <Row2 l1="ホテル" v1={rv.hotel} l2="部屋番" v2={rv.room_no} />
                            <Row2 l1="合計" v1={rv.amount ? '¥'+rv.amount.toLocaleString() : '—'} l2="状態" v2={STATUS_LABEL[rv.status] || rv.status} />
                            <Row2 l1="受付" v1={rv.reception_method} l2="支払" v2={PAY[rv.payment_method] || rv.payment_method} />
                            <Row2 l1="送りD" v1={rv.send_driver} l2="迎えD" v2={rv.receive_driver} />
                            <Row2 l1="女子状況" v1={rv.lady_status} l2="オペ" v2={rv.operator} />
                            {rv.memo && <Row1 label="メモ" value={rv.memo} />}
                          </div>
                        </>
                      );
                    })() : (
                      /* 通常: 顧客備考 */
                      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>顧客備考</span>
                            <button className="cf-edit-btn" onClick={() => { setBikouDraft(c.memo || ''); setEditingBikou((v) => !v); }} title="編集">
                              <Icon name="edit" size={12} />
                            </button>
                          </div>
                          {!answered && !claimedBy && (
                            <button className="cp-btn success" style={{ padding: '4px 12px', fontSize: 12 }} onClick={handleClaim}>
                              <Icon name="phoneIn" size={12} />対応開始
                            </button>
                          )}
                        </div>
                        {editingBikou ? (
                          <>
                            <textarea value={bikouDraft} onChange={(e) => setBikouDraft(e.target.value)} rows={4} autoFocus
                              style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid var(--halo-400)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 }} />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn sm primary" onClick={saveBikou}>保存</button>
                              <button className="btn sm" onClick={() => setEditingBikou(false)}>キャンセル</button>
                            </div>
                          </>
                        ) : (
                          <div style={{ overflowY: 'auto', flex: 1, fontSize: 12, color: c.memo ? 'var(--text)' : 'var(--muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                            {c.memo || 'なし'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {c.ops_memo && (
                  <div className="cp-alert warn" style={{ margin: '8px 12px 0', borderRadius: 6, fontSize: 12 }}>
                    <Icon name="bolt" size={12} />
                    <span><b>オペレーション上の注意:</b> {c.ops_memo}</span>
                  </div>
                )}

                {/* Body */}
                <div className="cf-body" style={{ overflowY: 'auto', flex: 1 }}>
                  {loading ? (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>読み込み中...</div>
                  ) : (
                    <>
                      {/* 3-col section — 高さ固定でコンテンツ量によらずレイアウト安定 */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10, alignItems: 'stretch' }}>
                        {/* 着信メモ */}
                        <div className="cf-card" style={{ height: 152, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          <div className="cf-card-head">
                            <Icon name="phoneIn" size={13} />
                            <span className="cf-section-title">着信メモ</span>
                            {callLogs.length > 0 && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{callLogs.length}件</span>}
                          </div>
                          <div style={{ flex: 1, overflowY: 'auto' }}>
                            {callLogs.length === 0 ? (
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>着信記録なし</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {callLogs.map((r) => (
                                  <div key={r.id} className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                                    {formatCallTime(r.started_at)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 女子への連絡事項 */}
                        <div className="cf-card" style={{ height: 152, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          <div className="cf-card-head">
                            <Icon name="bolt" size={13} />
                            <span className="cf-section-title">女子への連絡事項</span>
                            <button className="cf-edit-btn"><Icon name="edit" size={12} /></button>
                          </div>
                          <div style={{ flex: 1, overflowY: 'auto' }}>
                            <p className="cf-lady-memo">{c.shared_memo || 'なし'}</p>
                          </div>
                        </div>

                        {/* 要注意事項 — 編集中のみ高さ auto（textarea + ボタン分を確保） */}
                        <div className={'cf-card cf-alert-card' + (editingMemo ? ' editing' : '')}
                          style={{ height: editingMemo ? 'auto' : 152, minHeight: 152, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          <div className="cf-card-head">
                            <Icon name="bolt" size={13} style={{ color: 'var(--danger)' }} />
                            <span className="cf-section-title">要注意事項</span>
                            <button className="cf-edit-btn" onClick={() => setEditingMemo((v) => !v)}>
                              <Icon name="edit" size={12} />
                            </button>
                          </div>
                          {editingMemo ? (
                            <>
                              <textarea className="cf-memo-input" rows={4} value={memoDraft} onChange={(e) => setMemoDraft(e.target.value)} />
                              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                <button className="btn sm primary" onClick={saveMemo}>保存</button>
                                <button className="btn sm" onClick={() => { setEditingMemo(false); setMemoDraft(c.alert_memo || ''); }}>キャンセル</button>
                              </div>
                            </>
                          ) : (
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                              <p className="cf-alert-text">{c.alert_memo || 'なし'}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 利用履歴 */}
                      <div className="cf-history">
                        <div className="cf-history-head">
                          <Icon name="history" size={13} />
                          <span className="cf-section-title">利用履歴</span>
                          <span className="cf-history-count">全{history.length}件</span>
                        </div>
                        {history.length === 0 ? (
                          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>利用履歴なし</div>
                        ) : (
                          <div className="cf-hist-table-wrap">
                            <table style={{ tableLayout: 'fixed', borderCollapse: 'collapse', minWidth: 'max-content' }}>
                              <thead>
                                <tr>
                                  {visibleDefs.map((col) => (
                                    <th key={col.id} style={{ position: 'relative', width: getColWidth(col.id), padding: '3px 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11, fontWeight: 700, border: '1px solid var(--line)', background: 'var(--surface)', userSelect: 'none' }}>
                                      {col.label}
                                      <div onMouseDown={(e) => startColResize(col.id, e)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 1 }} />
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {history.map((r) => (
                                  <tr key={r.id} onClick={(e) => { e.stopPropagation(); setSelectedRsv(r); }} style={{ cursor: 'pointer' }} title="クリックで概要を表示">
                                    {visibleDefs.map((col) => {
                                      const mono  = ['date','start','end','phone','room_no','amount','course','extension'].includes(col.id);
                                      const isSelected = selectedRsv?.id === r.id;
                                      const tdBg  = isSelected ? '#c4b5fd' : statusBg(r.status);
                                      let cell;
                                      switch (col.id) {
                                        case 'date':     cell = fmtDate(r.reserved_date); break;
                                        case 'start':    cell = r.start_time?.slice(0, 5) || '—'; break;
                                        case 'end':      cell = r.end_time?.slice(0, 5) || '—'; break;
                                        case 'operator': cell = r.operator || '—'; break;
                                        case 'phone':    cell = c.phone_normalized || ''; break;
                                        case 'customer': cell = c.name || '—'; break;
                                        case 'course':   { const v = r.course || ''; cell = v ? v.replace(/分.*$/, '') : '—'; break; }
                                        case 'lady':       cell = r.ladies?.display_name || '—'; break;
                                        case 'nomination': cell = r.nomination_type || '—'; break;
                                        case 'extension':  { const v = r.extension || ''; const m = v.match(/(\d+)/); cell = m ? m[1] : '—'; break; }
                                        case 'option':     cell = r.option_label || '—'; break;
                                        case 'discount':   cell = r.discount_amount ? '-¥' + r.discount_amount.toLocaleString() : '—'; break;
                                        case 'transport':  cell = r.transport_price ? '¥' + r.transport_price.toLocaleString() : '—'; break;
                                        case 'status': {
                                          const s = r.status || '';
                                          const label = STATUS_LABEL[s] || s || '—';
                                          cell = <span style={{ color: statusColor(s), fontWeight: 700, fontSize: 11 }}>{label}</span>;
                                          break;
                                        }
                                        case 'hotel':    cell = r.hotel || '—'; break;
                                        case 'memo':     cell = r.memo ? '●' : '—'; break;
                                        case 'room_no':  cell = r.room_no || '—'; break;
                                        case 'amount':   cell = r.amount ? '¥' + r.amount.toLocaleString() : '—'; break;
                                        default:         cell = '—';
                                      }
                                      return <td key={col.id} style={{ padding: '2px 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11, border: '1px solid var(--line)', ...(mono ? { fontFamily: 'monospace' } : {}), ...(tdBg ? { background: tdBg } : {}) }}>{cell}</td>;
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              /* ── Unknown caller ── */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px', gap: 14 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg-subtle)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="user" size={26} style={{ color: 'var(--muted)' }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>新規または未登録</div>
                  <div className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>{call.phone || '—'}</div>
                </div>
                <div className="cp-actions" style={{ width: '100%', justifyContent: 'center', gap: 8 }}>
                  {callEnded ? (
                    <button className="cp-btn ghost" onClick={onClose}>閉じる</button>
                  ) : (
                    <button className="cp-btn danger-outline" onClick={answered ? handleEnd : onClose}>
                      <Icon name="phoneIn" size={12} style={{ transform: 'rotate(135deg)' }} />
                      {answered ? '通話終了' : '閉じる'}
                    </button>
                  )}
                  {claimedBy ? (
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>他スタッフ対応中</div>
                  ) : callEnded ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--muted)', display: 'inline-block' }} />
                      通話終了済
                    </div>
                  ) : answered ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ok, #16a34a)', fontWeight: 600 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok, #16a34a)', display: 'inline-block' }} />
                      対応中
                    </div>
                  ) : (
                    <button className="cp-btn success" onClick={handleClaim}>
                      <Icon name="phoneIn" size={13} />対応開始
                    </button>
                  )}
                </div>
                <button className="btn sm" onClick={() => setShowNewCust(true)}>
                  <Icon name="plus" size={12} />新規顧客として登録
                </button>
              </div>
            )}

            {/* ── Footer ── */}
            <div className="cf-actions">
              <button className="cf-btn ghost" onClick={() => setShowMemoAdd((v) => !v)}>
                <Icon name="edit" size={13} />メモ追加
              </button>
              {c && (
                <button
                  className="cf-btn primary"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => openReservationWindow({ customer: c })}
                >
                  <Icon name="plus" size={13} />新規予約
                </button>
              )}
            </div>

            {showMemoAdd && c && (
              <div style={{ padding: '0 12px 12px' }}>
                <textarea
                  className="cf-memo-input"
                  rows={2}
                  placeholder="会話メモを入力..."
                  value={newMemo}
                  onChange={(e) => setNewMemo(e.target.value)}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button className="btn sm primary" onClick={addMemo}>追加</button>
                  <button className="btn sm" onClick={() => { setShowMemoAdd(false); setNewMemo(''); }}>キャンセル</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showNewCust && (
        <NewCustomerModal
          initialPhone={call.phone}
          onClose={() => setShowNewCust(false)}
          onCreated={(newC) => { onOpenCustomer?.(newC.id, newC.phone_normalized); onClose(); }}
        />
      )}
    </>
  );
}
