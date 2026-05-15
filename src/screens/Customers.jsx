import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { loadCustomerReservations, saveCustomer, loadCustomerCallLogs, RESV_PAGE_SIZE } from '../hooks/useCustomers.js';
import { showToast } from '../lib/toast.js';
import { formatCallTime } from '../lib/utils.js';
import { supabase } from '../lib/supabase.js';
import NewReservationModal from '../overlays/NewReservationModal.jsx';
import { openReservationWindow } from '../lib/reservationWindowBridge.js';
import NewCustomerModal from '../overlays/NewCustomerModal.jsx';
import { exportRowsAsCsv } from '../lib/csv.js';

const RANK_CHIP = {
  VIP: 'gold', A: 'green', B: 'blue', C: '', NG: 'red',
};

const SEARCH_MODES = [
  { value: 'phone',     label: '電話番号', placeholder: '電話番号（部分一致）' },
  { value: 'name',      label: '名前',     placeholder: '顧客名を入力' },
  { value: 'kana',      label: 'フリガナ', placeholder: 'フリガナを入力' },
  { value: 'member_no', label: '会員番号', placeholder: '会員番号を入力' },
  { value: 'address',   label: '住所',     placeholder: '住所を入力' },
  { value: 'memo',      label: 'メモ',     placeholder: 'メモを検索（要注意・共有含む）' },
  { value: 'all',       label: '全体検索', placeholder: 'すべての項目を横断検索' },
];

const PAGE = 50;

function formatPhone(p) {
  if (!p) return '—';
  if (p.startsWith('+81') && p.length >= 12) return '0' + p.slice(3);
  return p;
}

function buildSupabaseQuery(params, from) {
  const kw = params.q.trim();
  let q = supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, from + PAGE - 1);

  if (kw) {
    switch (params.mode) {
      case 'phone': {
        // 国内形式（09012...）も国際形式（+8190...）も統一して末尾桁でマッチ
        const digits = kw.replace(/\D/g, '').replace(/^81/, '').replace(/^0/, '');
        const pat = digits || kw;
        q = q.or(`phone_normalized.ilike.%${pat}%,phone.ilike.%${pat}%`);
        break;
      }
      case 'name':      q = q.ilike('name', `%${kw}%`); break;
      case 'kana':      q = q.ilike('kana', `%${kw}%`); break;
      case 'member_no': q = q.ilike('member_no', `%${kw}%`); break;
      case 'address':   q = q.ilike('address', `%${kw}%`); break;
      case 'memo':      q = q.or(`memo.ilike.%${kw}%,alert_memo.ilike.%${kw}%,shared_memo.ilike.%${kw}%`); break;
      case 'all':
        q = q.or(`name.ilike.%${kw}%,kana.ilike.%${kw}%,phone_normalized.ilike.%${kw}%,phone.ilike.%${kw}%,member_no.ilike.%${kw}%,address.ilike.%${kw}%,memo.ilike.%${kw}%,alert_memo.ilike.%${kw}%`);
        break;
      default: break;
    }
  }

  if (params.rank) q = q.eq('rank', params.rank);
  return q;
}

export default function Customers() {
  const [inputQ, setInputQ] = useState('');
  const [searchMode, setSearchMode] = useState('phone');
  const [rankFilter, setRankFilter] = useState('');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [showNewCust, setShowNewCust] = useState(false);
  const committedRef = useRef({ q: '', mode: 'phone', rank: '' });

  const doFetch = useCallback(async (params, from, append) => {
    setLoading(true);
    const { data } = await buildSupabaseQuery(params, from);
    const rows = data || [];
    if (append) {
      setCustomers((prev) => [...prev, ...rows]);
    } else {
      setCustomers(rows);
      setSelectedId(rows[0]?.id || null);
    }
    setNextOffset(from + rows.length);
    setHasMore(rows.length === PAGE);
    setLoading(false);
  }, []);

  useEffect(() => {
    doFetch({ q: '', mode: 'phone', rank: '' }, 0, false);
  }, [doFetch]);

  const handleSearch = () => {
    const params = { q: inputQ, mode: searchMode, rank: rankFilter };
    committedRef.current = params;
    doFetch(params, 0, false);
  };

  const handleRankChange = (r) => {
    setRankFilter(r);
    const params = { ...committedRef.current, rank: r };
    committedRef.current = params;
    doFetch(params, 0, false);
  };

  const selected = customers.find((c) => c.id === selectedId) || customers[0] || null;

  const handleSave = async (id, patch) => {
    const { data, error } = await saveCustomer(id, patch);
    if (error) { showToast('error', '保存失敗: ' + error.message); return; }
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
    showToast('success', '顧客情報を保存しました');
  };

  return (
    <div className="cust-root">
      <aside className="cust-list-pane">
        <div className="cust-list-head">
          <div className="search-big">
            <div className="search-big-row1">
              <select
                value={searchMode}
                onChange={(e) => setSearchMode(e.target.value)}
              >
                {SEARCH_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="search-big-row2">
              <Icon name="search" size={14} style={{ flexShrink: 0, color: 'var(--muted)' }} />
              <input
                placeholder={SEARCH_MODES.find((m) => m.value === searchMode)?.placeholder || ''}
                value={inputQ}
                onChange={(e) => setInputQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              />
            </div>
          </div>
          <div className="cust-list-head-actions">
            <button
              onClick={handleSearch}
              className="btn sm primary"
              style={{ flex: 1 }}
            >
              <Icon name="search" size={12} />検索
            </button>
            <button className="btn sm ghost" title="CSV出力" onClick={() => {
            exportRowsAsCsv(
              `customers_${new Date().toISOString().slice(0, 10)}.csv`,
              customers,
              [
                { label: '名前', key: 'name' },
                { label: '電話', key: 'phone_normalized' },
                { label: '会員番号', key: 'member_no' },
                { label: 'ランク', key: 'rank' },
                { label: 'タグ', value: (c) => (c.tags || []).join('|') },
                { label: '利用回数', key: 'total_visits' },
                { label: '総額', key: 'total_spent' },
                { label: '最終来店', key: 'last_visit_date' },
                { label: '初回', key: 'first_visit_date' },
                { label: 'メモ', key: 'memo' },
                { label: '要注意メモ', key: 'alert_memo' },
              ]
            );
          }}><Icon name="download" size={12} />CSV</button>
            <button className="btn sm primary" onClick={() => setShowNewCust(true)}><Icon name="plus" size={12} />新規</button>
          </div>
        </div>
        <div className="cust-filters">
          {['', 'VIP', 'A', 'B', 'C', 'NG'].map((r) => (
            <button
              key={r}
              className={'chip' + (r ? ' ' + (RANK_CHIP[r] || '') : ' blue') + (rankFilter === r ? ' active' : '')}
              onClick={() => handleRankChange(r)}
              style={{ cursor: 'pointer', border: '1px solid var(--line)' }}
            >
              {r || '全て'}
            </button>
          ))}
        </div>
        {loading && customers.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>読み込み中...</div>
        ) : (
          <div className="cust-list">
            {customers.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>該当する顧客が見つかりませんでした</div>
            ) : customers.map((c) => (
              <div
                key={c.id}
                className={'cl-item' + (c.id === selected?.id ? ' sel' : '')}
                onClick={() => setSelectedId(c.id)}
              >
                <div className="cl-top">
                  <span className="cl-name">{c.name || '名前未登録'}</span>
                  {c.rank && c.rank !== 'C' && (
                    <span className={'chip ' + (RANK_CHIP[c.rank] || '')} style={{ height: 16, fontSize: 9, padding: '0 5px' }}>{c.rank}</span>
                  )}
                </div>
                <div className="cl-mid mono">{formatPhone(c.phone_normalized || c.phone)}</div>
                <div className="cl-bot">
                  <span className="cl-count">利用 {c.total_visits ?? 0}回</span>
                  <span className="cl-sum mono">¥{(c.total_spent ?? 0).toLocaleString()}</span>
                  {(c.tags || []).map((t) => (
                    <span key={t} className={'chip ' + (RANK_CHIP[t] || '')} style={{ height: 16, padding: '0 5px', fontSize: 9 }}>{t}</span>
                  ))}
                </div>
              </div>
            ))}
            {hasMore && (
              <div style={{ padding: '10px 8px' }}>
                <button
                  onClick={() => doFetch(committedRef.current, nextOffset, true)}
                  disabled={loading}
                  style={{
                    width: '100%', padding: '8px 0', fontSize: 12,
                    border: '1px solid var(--line)', borderRadius: 6,
                    background: 'var(--bg-subtle)', color: 'var(--muted)',
                    cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {loading ? '読み込み中...' : '以降を表示する'}
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      <div className="cust-detail">
        {selected ? (
          <CustomerDetail key={selected.id} c={selected} onSave={handleSave} />
        ) : (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>顧客を選択してください</div>
        )}
      </div>
      {showNewCust && (
        <NewCustomerModal
          onClose={() => setShowNewCust(false)}
          onCreated={(newC) => {
            setCustomers((prev) => [newC, ...prev]);
            setSelectedId(newC.id);
          }}
        />
      )}
    </div>
  );
}

function ResvSummaryPanel({ resv, customer, onEdited }) {
  const STATUS = { reserved: '予約中', received: '受領済', working: '対応中', complete: '完了', hold: '仮予約', cancelled: 'キャンセル' };
  const ext      = resv.selected_items?.find(s => s.kind === 'extension');
  const nom      = resv.selected_items?.find(s => s.kind === 'nomination');
  const opts     = resv.selected_items?.filter(s => s.kind === 'option').map(s => s.name).join(', ');
  const transport = resv.selected_items?.find(s => s.kind === 'transport');
  const discount  = resv.selected_items?.find(s => s.kind === 'discount');
  const handleEdit = () => openReservationWindow({ customer, reservation: resv, onSaved: onEdited, onDeleted: onEdited });
  const Row = ({ label, value }) => value ? (
    <div style={{ display: 'flex', gap: 6, padding: '3px 0', borderBottom: '1px solid var(--line-2, #f0f0f0)' }}>
      <span style={{ fontSize: 11, color: 'var(--muted)', width: 52, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>{value}</span>
    </div>
  ) : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{resv.reserved_date} {resv.start_time?.slice(0, 5)}</span>
        <button className="btn sm primary" style={{ padding: '2px 10px', fontSize: 11 }} onClick={handleEdit}>編集</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <Row label="キャスト" value={resv.ladies?.display_name} />
        <Row label="コース"   value={resv.course || resv.selected_items?.find(i => i.kind === 'course')?.name} />
        <Row label="延長"     value={ext?.name} />
        <Row label="指名"     value={nom?.name} />
        <Row label="ホテル"   value={resv.hotel} />
        <Row label="部屋番"   value={resv.room_no} />
        <Row label="オプション" value={opts || undefined} />
        <Row label="交通費"   value={transport?.name} />
        <Row label="割引"     value={discount?.name} />
        <Row label="合計"     value={resv.amount ? `¥${resv.amount.toLocaleString()}` : undefined} />
        <Row label="状態"     value={STATUS[resv.status] || resv.status} />
        <Row label="支払"     value={resv.payment_method === 'card' ? 'カード' : resv.payment_method || undefined} />
        <Row label="メモ"     value={resv.memo || undefined} />
      </div>
    </div>
  );
}

function CustomerDetail({ c, onSave }) {
  const [editing, setEditing] = useState(null); // null | 'info' | 'alert' | 'shared' | 'memo'
  const [showNewRsv, setShowNewRsv] = useState(false);
  const [memoVal, setMemoVal] = useState(c.memo || '');
  const [form, setForm] = useState({
    name: c.name || '',
    rank: c.rank || 'C',
    tags: (c.tags || []).join(', '),
    alert_memo: c.alert_memo || '',
    shared_memo: c.shared_memo || '',
  });
  const [history,       setHistory]       = useState(null);
  const [historyTotal,  setHistoryTotal]  = useState(0);
  const [callLogs,      setCallLogs]      = useState(null);
  const [editingCallId, setEditingCallId] = useState(null);
  const [callMemoVal,   setCallMemoVal]   = useState('');
  const [histTab,       setHistTab]       = useState('usage');
  const [selectedResv,  setSelectedResv]  = useState(null);
  const callMemoRef = useRef(null);
  const historyReloadRef = useRef(null);

  useEffect(() => {
    setHistory(null);
    setHistoryTotal(0);
    setMemoVal(c.memo || '');
    setSelectedResv(null);
    loadCustomerReservations(c.id).then(({ data, count }) => {
      setHistory(data);
      setHistoryTotal(count);
    });
  }, [c.id]);

  useEffect(() => {
    const phone = c.phone_normalized || c.phone;
    const fetch = () => loadCustomerCallLogs(phone, 200).then(setCallLogs);
    fetch();
    const ch = supabase
      .channel(`call_logs_detail_${c.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_logs' }, fetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [c.id, c.phone_normalized, c.phone]);

  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const saveField = (patch) => { onSave(c.id, patch); setEditing(null); };

  const startEditCallMemo = (id, current) => {
    setEditingCallId(id);
    setCallMemoVal(current || '');
    setTimeout(() => callMemoRef.current?.focus(), 30);
  };

  const saveCallMemo = useCallback(async (id, val) => {
    setEditingCallId(null);
    const trimmed = val.trim();
    const row = callLogs?.find(r => r.id === id);
    if (trimmed === (row?.memo || '')) return;
    const { error } = await supabase
      .from('call_logs')
      .update({ memo: trimmed || null })
      .eq('id', id);
    if (error) showToast('error', '保存失敗');
  }, [callLogs]);

  const saveMemo = () => { onSave(c.id, { memo: memoVal.trim() || null }); setEditing(null); };

  const tags = c.tags || [];
  const avg = (c.total_visits ?? 0) > 0 ? Math.round((c.total_spent || 0) / c.total_visits) : 0;

  return (
    <div className="cd-root">
      {c.alert_memo && (
        <div className="cd-alert-banner"><Icon name="bolt" size={13} /> {c.alert_memo}</div>
      )}

      {/* ヘッダー */}
      <div className="cd-head">
        <div className="cd-head-l">
          <Avatar name={c.name} size={44} hue={245} />
          <div>
            <div className="cd-name-row">
              <span className="cd-name">{c.name || '名前未登録'}</span>
              <span className={'chip ' + (RANK_CHIP[c.rank] || '')} style={{ fontSize: 10 }}>{c.rank || 'C'}</span>
              {tags.map((t) => <span key={t} className={'chip ' + (RANK_CHIP[t] || '')}>{t}</span>)}
            </div>
            <div className="cd-meta">
              {(c.phone_normalized || c.phone) && <span className="mono">{formatPhone(c.phone_normalized || c.phone)}</span>}
              {c.member_no && <><span>·</span><span>会員 {c.member_no}</span></>}
              {c.first_visit_date && <><span>·</span><span>初回 {c.first_visit_date}</span></>}
            </div>
          </div>
        </div>
        <div className="cd-head-r">
          <button className="btn sm primary" onClick={() => setShowNewRsv(true)}><Icon name="plus" size={12} />新規予約</button>
        </div>
      </div>

      {showNewRsv && <NewReservationModal customer={c} onClose={() => setShowNewRsv(false)} />}

      {/* 上段: 顧客データ ｜ 顧客メモ */}
      <div className="cf-grid" style={{ margin: '10px 0 8px' }}>
        <div className="cf-col">
          <div className="cf-card" style={editing === 'info' ? { minHeight: 240, boxSizing: 'border-box' } : { height: 240, boxSizing: 'border-box', overflow: 'hidden' }}>
            <div className="cf-card-head">
              <Icon name="users" size={13} />
              <span className="cf-section-title">顧客データ</span>
              <button className="cf-edit-btn" onClick={() => setEditing(editing === 'info' ? null : 'info')}>
                <Icon name="edit" size={12} />
              </button>
            </div>
            {editing === 'info' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>氏名
                  <input style={{ display: 'block', width: '100%', marginTop: 3, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} value={form.name} onChange={upd('name')} />
                </label>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>ランク
                  <select style={{ display: 'block', width: '100%', marginTop: 3, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} value={form.rank} onChange={upd('rank')}>
                    {['VIP', 'A', 'B', 'C', 'NG'].map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>タグ（カンマ区切り）
                  <input style={{ display: 'block', width: '100%', marginTop: 3, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} value={form.tags} onChange={upd('tags')} placeholder="優良, 常連" />
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn sm primary" onClick={() => saveField({ name: form.name || null, rank: form.rank, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) })}>保存</button>
                  <button className="btn sm" onClick={() => setEditing(null)}>キャンセル</button>
                </div>
              </div>
            ) : (
              <div className="cf-customer-box">
                <div className="cf-cust-name-big">{c.name || '名前未登録'}</div>
                <div className="cf-cust-phone-row"><Icon name="phoneIn" size={12} /><span className="mono">{formatPhone(c.phone_normalized || c.phone)}</span></div>
                <div className="cf-stat-grid">
                  <div><div className="cf-stat-lbl">利用</div><div className="cf-stat-val"><b>{c.total_visits ?? 0}</b>回</div></div>
                  <div><div className="cf-stat-lbl">総額</div><div className="cf-stat-val mono">¥{(c.total_spent ?? 0).toLocaleString()}</div></div>
                  <div><div className="cf-stat-lbl">客単価</div><div className="cf-stat-val mono">¥{avg.toLocaleString()}</div></div>
                  <div><div className="cf-stat-lbl">キャンセル</div><div className="cf-stat-val"><b style={{ color: (c.cancel_count ?? 0) > 2 ? 'var(--danger)' : undefined }}>{c.cancel_count ?? 0}</b>回</div></div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>最終 {c.last_visit_date || '—'}</div>
              </div>
            )}
          </div>
        </div>

        <div className="cf-col">
          <div className="cf-card" style={{ height: 240, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
            {selectedResv ? (
              <>
                <div className="cf-card-head" style={{ flexShrink: 0 }}>
                  <Icon name="calendar" size={13} />
                  <span className="cf-section-title">予約概要</span>
                  <button className="cf-edit-btn" onClick={() => setSelectedResv(null)} title="閉じる">
                    <Icon name="close" size={12} />
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '4px 0' }}>
                  <ResvSummaryPanel
                    resv={selectedResv}
                    customer={c}
                    onEdited={() => { setSelectedResv(null); historyReloadRef.current?.(); }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="cf-card-head" style={{ flexShrink: 0 }}>
                  <Icon name="edit" size={13} />
                  <span className="cf-section-title">顧客メモ</span>
                  {editing === 'memo' ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn sm primary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={saveMemo}>保存</button>
                      <button className="btn sm" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => { setEditing(null); setMemoVal(c.memo || ''); }}>取消</button>
                    </div>
                  ) : (
                    <button className="cf-edit-btn" onClick={() => setEditing('memo')} title="メモを編集">
                      <Icon name="edit" size={12} />
                    </button>
                  )}
                </div>
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                  {editing === 'memo' ? (
                    <textarea
                      className="cf-memo-input"
                      style={{ height: '100%', resize: 'none', boxSizing: 'border-box' }}
                      value={memoVal}
                      onChange={(e) => setMemoVal(e.target.value)}
                      placeholder="顧客メモを入力..."
                      autoFocus
                    />
                  ) : memoVal ? (
                    <p style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{memoVal}</p>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 0' }}>メモなし</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 下段: 着信メモ ｜ 女子への連絡事項 ｜ 要注意事項 — 3カラム */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 10 }}>

        {/* 着信メモ */}
        <div className="cf-card" style={{ minHeight: 180 }}>
          <div className="cf-card-head">
            <Icon name="phoneIn" size={13} />
            <span className="cf-section-title">着信メモ</span>
            {callLogs && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{callLogs.length}件</span>}
          </div>
          {!callLogs ? (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>読み込み中...</div>
          ) : callLogs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>着信記録なし</div>
          ) : (
            <div style={{ height: 150, overflowY: 'auto', borderRadius: 6, border: '1px solid var(--line)' }}>
              {callLogs.map((r, i) => (
                <div key={r.id} style={{
                  display: 'grid', gridTemplateColumns: '90px 1fr',
                  alignItems: 'center', gap: 6,
                  padding: '5px 8px', flexShrink: 0,
                  background: i % 2 === 0 ? 'var(--bg-subtle, #f8f9fa)' : 'transparent',
                  borderBottom: i < callLogs.length - 1 ? '1px solid var(--line-2, #f0f0f0)' : 'none',
                }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                    {formatCallTime(r.started_at)}
                  </span>
                  {editingCallId === r.id ? (
                    <textarea
                      ref={callMemoRef}
                      value={callMemoVal}
                      rows={2}
                      onChange={(e) => setCallMemoVal(e.target.value)}
                      onBlur={() => saveCallMemo(r.id, callMemoVal)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveCallMemo(r.id, callMemoVal); }
                        if (e.key === 'Escape') { e.preventDefault(); setEditingCallId(null); }
                      }}
                      style={{
                        width: '100%', fontSize: 11, padding: '2px 4px',
                        border: '1px solid var(--halo-400, #60a5fa)', borderRadius: 3,
                        background: 'var(--bg)', color: 'var(--text)',
                        fontFamily: 'inherit', outline: 'none', resize: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => startEditCallMemo(r.id, r.memo)}
                      title={r.memo || 'クリックでメモ入力'}
                      style={{
                        fontSize: 11, cursor: 'text', display: 'block',
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                        color: r.memo ? 'var(--text)' : 'var(--muted)',
                        minHeight: 16,
                      }}
                    >
                      {r.memo ? r.memo.replace(/\n/g, ' ↵ ') : '— メモなし'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 女子への連絡事項 */}
        <div className="cf-card">
          <div className="cf-card-head">
            <Icon name="bolt" size={13} />
            <span className="cf-section-title">女子への連絡事項</span>
            <button className="cf-edit-btn" onClick={() => setEditing(editing === 'shared' ? null : 'shared')}>
              <Icon name="edit" size={12} />
            </button>
          </div>
          {editing === 'shared' ? (
            <>
              <textarea className="cf-memo-input" rows={4} value={form.shared_memo} onChange={upd('shared_memo')} />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="btn sm primary" onClick={() => saveField({ shared_memo: form.shared_memo || null })}>保存</button>
                <button className="btn sm" onClick={() => setEditing(null)}>キャンセル</button>
              </div>
            </>
          ) : (
            <p className="cf-lady-memo">{c.shared_memo || 'なし'}</p>
          )}
        </div>

        {/* 要注意事項 */}
        <div className="cf-card cf-alert-card">
          <div className="cf-card-head">
            <Icon name="bolt" size={13} style={{ color: 'var(--danger)' }} />
            <span className="cf-section-title">要注意事項</span>
            <button className="cf-edit-btn" onClick={() => setEditing(editing === 'alert' ? null : 'alert')}>
              <Icon name="edit" size={12} />
            </button>
          </div>
          {editing === 'alert' ? (
            <>
              <textarea className="cf-memo-input" rows={4} value={form.alert_memo} onChange={upd('alert_memo')} />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="btn sm primary" onClick={() => saveField({ alert_memo: form.alert_memo || null })}>保存</button>
                <button className="btn sm" onClick={() => setEditing(null)}>キャンセル</button>
              </div>
            </>
          ) : (
            <p className="cf-alert-text">{c.alert_memo || 'なし'}</p>
          )}
        </div>

      </div>

      {/* タブ: 利用履歴 ｜ 着信メモ */}
      <div style={{ borderRadius: 8, border: '1px solid var(--line)', overflow: 'hidden' }}>
        {/* タブバー */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', background: 'var(--bg-subtle)' }}>
          {[
            { key: 'usage',   label: '利用履歴', count: historyTotal || history?.length, icon: 'calendar' },
            { key: 'calllog', label: '着信履歴',  count: callLogs?.length,  icon: 'phoneIn'  },
          ].map(({ key, label, count, icon }) => (
            <button
              key={key}
              onClick={() => setHistTab(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13, fontWeight: histTab === key ? 700 : 400,
                color: histTab === key ? 'var(--halo-600)' : 'var(--muted)',
                background: histTab === key ? 'var(--surface)' : 'transparent',
                borderBottom: histTab === key ? '2px solid var(--halo-500)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              <Icon name={icon} size={13} />
              {label}
              {count != null && (
                <span style={{
                  fontSize: 10, background: histTab === key ? 'var(--halo-100)' : 'var(--line)',
                  color: histTab === key ? 'var(--halo-700)' : 'var(--muted)',
                  borderRadius: 10, padding: '1px 6px', fontWeight: 600,
                }}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* タブコンテンツ */}
        {histTab === 'usage' ? (
          <ReservationHistory customerId={c.id} history={history} totalCount={historyTotal} customer={c} onSelect={setSelectedResv} reloadRef={historyReloadRef} />
        ) : (
          <div>
            {!callLogs ? (
              <div style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>読み込み中...</div>
            ) : callLogs.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>着信記録なし</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {[['日時','130px'],['発信番号','140px'],['着信先番号','140px'],['通話時間','80px'],['メモ','']].map(([h, w]) => (
                        <th key={h} style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', borderBottom: '2px solid var(--line)', background: 'var(--bg-subtle)', position: 'sticky', top: 0, textAlign: 'left', width: w || 'auto', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {callLogs.map((r, i) => {
                      const dur = r.duration != null ? `${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, '0')}` : '—';
                      return (
                        <tr key={r.id} style={{ background: i % 2 === 0 ? 'var(--bg-subtle)' : 'transparent', borderBottom: '1px solid var(--line-2)' }}>
                          <td className="mono" style={{ padding: '7px 10px', fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatCallTime(r.started_at)}</td>
                          <td className="mono" style={{ padding: '7px 10px', fontSize: 11, whiteSpace: 'nowrap' }}>{r.from_number || '—'}</td>
                          <td className="mono" style={{ padding: '7px 10px', fontSize: 11, whiteSpace: 'nowrap', color: 'var(--muted)' }}>{r.to_number || '—'}</td>
                          <td className="mono" style={{ padding: '7px 10px', fontSize: 11, whiteSpace: 'nowrap' }}>{dur}</td>
                          <td style={{ padding: '7px 10px' }}>
                            {editingCallId === r.id ? (
                              <textarea
                                ref={callMemoRef}
                                value={callMemoVal}
                                rows={2}
                                onChange={(e) => setCallMemoVal(e.target.value)}
                                onBlur={() => saveCallMemo(r.id, callMemoVal)}
                                onKeyDown={(e) => {
                                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveCallMemo(r.id, callMemoVal); }
                                  if (e.key === 'Escape') { e.preventDefault(); setEditingCallId(null); }
                                }}
                                style={{
                                  width: '100%', fontSize: 12, padding: '3px 6px',
                                  border: '1px solid var(--halo-400)', borderRadius: 4,
                                  background: 'var(--bg)', color: 'var(--text)',
                                  fontFamily: 'inherit', outline: 'none', resize: 'none',
                                  boxSizing: 'border-box',
                                }}
                              />
                            ) : (
                              <span
                                onClick={() => startEditCallMemo(r.id, r.memo)}
                                title={r.memo || 'クリックでメモ入力'}
                                style={{ fontSize: 12, cursor: 'text', color: r.memo ? 'var(--text)' : 'var(--muted)' }}
                              >
                                {r.memo || '— クリックでメモ入力'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReservationHistory({ customerId, history: historyProp, totalCount, customer, onSelect, reloadRef }) {
  const [rows,    setRows]    = useState(historyProp ?? null);
  const [total,   setTotal]   = useState(totalCount ?? 0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (historyProp !== undefined) {
      setRows(historyProp);
      setTotal(totalCount ?? historyProp?.length ?? 0);
      return;
    }
    loadCustomerReservations(customerId).then(({ data, count }) => {
      setRows(data);
      setTotal(count);
    });
  }, [customerId, historyProp, totalCount]);

  const reload = useCallback(() => loadCustomerReservations(customerId).then(({ data, count }) => {
    setRows(data);
    setTotal(count);
  }), [customerId]);

  useEffect(() => {
    if (reloadRef) reloadRef.current = reload;
  }, [reload, reloadRef]);

  const loadMore = async () => {
    if (!rows || loading) return;
    setLoading(true);
    const { data } = await loadCustomerReservations(customerId, rows.length);
    setRows(prev => [...prev, ...data]);
    setLoading(false);
  };

  const handleEdit = (r) => {
    openReservationWindow({
      customer: customer || { id: r.customer_id },
      reservation: r,
      onSaved: reload,
      onDeleted: reload,
    });
  };

  if (!rows) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>読み込み中...</div>;
  if (rows.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>予約・来店記録なし</div>;

  const STATUS       = { reserved: '予約中', received: '受領済', working: '対応中', complete: '完了', hold: '仮予約', cancelled: 'ｷｬﾝｾﾙ' };
  const STATUS_COLOR = { reserved: 'var(--warn)', received: '#0ea5e9', working: '#8b5cf6', complete: 'var(--ok)', hold: 'var(--muted)', cancelled: 'var(--muted)' };

  const rowBg = (status, i) => {
    if (status === 'reserved' || status === 'hold') return '#fef08a'; // 黄
    if (status === 'cancelled')                     return '#fecaca'; // 赤
    return i % 2 === 0 ? 'transparent' : 'var(--bg-subtle)';         // デフォルト交互
  };

  const TH = { padding: '6px 8px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap', borderBottom: '2px solid var(--line)', background: 'var(--bg-subtle)', position: 'sticky', top: 0, zIndex: 1, textAlign: 'left' };
  const TD = { padding: '6px 8px', fontSize: 12, borderBottom: '1px solid var(--line-2)', verticalAlign: 'middle', whiteSpace: 'nowrap' };

  // selected_items からアイテムを種別で取り出すヘルパー
  const itemOf  = (r, kind)  => r.selected_items?.find(i => i.kind === kind)?.name || '—';
  const itemsOf = (r, kinds) => r.selected_items?.filter(i => kinds.includes(i.kind)).map(i => i.name).join(', ') || '—';

  const remaining = total - (rows?.length ?? 0);

  return (
    <div>
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={TH}>日付</th>
            <th style={TH}>開始時刻</th>
            <th style={TH}>キャスト</th>
            <th style={TH}>コース</th>
            <th style={TH}>延長</th>
            <th style={TH}>指名</th>
            <th style={TH}>ホテル</th>
            <th style={TH}>部屋番</th>
            <th style={{ ...TH, textAlign: 'right' }}>料金</th>
            <th style={TH}>メモ</th>
            <th style={TH}>オプション</th>
            <th style={TH}>カード</th>
            <th style={TH}>交通費</th>
            <th style={TH}>割引</th>
            <th style={TH}>状態</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const ext      = r.selected_items?.find(s => s.kind === 'extension');
            const nom      = r.selected_items?.find(s => s.kind === 'nomination');
            const opts     = r.selected_items?.filter(s => s.kind === 'option').map(s => s.name).join(', ');
            const transport = r.selected_items?.find(s => s.kind === 'transport');
            const discount  = r.selected_items?.find(s => s.kind === 'discount');
            return (
              <tr
                key={r.id}
                onClick={() => onSelect ? onSelect(r) : handleEdit(r)}
                style={{
                  background: rowBg(r.status, i),
                  cursor: 'pointer',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--halo-50, #eff6ff)'}
                onMouseLeave={e => e.currentTarget.style.background = rowBg(r.status, i)}
              >
                <td style={{ ...TD, fontWeight: 600 }} className="mono">{r.reserved_date}</td>
                <td style={TD} className="mono">{r.start_time?.slice(0,5) || '—'}</td>
                <td style={{ ...TD, fontWeight: 600 }}>{r.ladies?.display_name || '—'}</td>
                <td style={TD}>{r.course || r.selected_items?.find(i => i.kind === 'course')?.name || '—'}</td>
                <td style={TD}>{ext ? ext.name : '—'}</td>
                <td style={TD}>{nom ? nom.name : '—'}</td>
                <td style={TD}>{r.hotel || r.selected_items?.find(i => i.kind === 'hotel')?.name || '—'}</td>
                <td style={TD}>{r.room_no || '—'}</td>
                <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: r.amount ? 600 : 400 }}>
                  {r.amount ? `¥${r.amount.toLocaleString()}` : '—'}
                </td>
                <td style={{ ...TD, maxWidth: 140 }}>
                  {r.memo ? (
                    <span className="htip">
                      {r.memo.replace(/\n/g, ' ↵ ')}
                      <span className="htip-body">{r.memo}</span>
                    </span>
                  ) : '—'}
                </td>
                <td style={{ ...TD, maxWidth: 110 }}>
                  {opts ? (
                    <span className="htip">
                      {opts}
                      <span className="htip-body">{opts}</span>
                    </span>
                  ) : '—'}
                </td>
                <td style={TD}>
                  {r.payment_method === 'card'
                    ? <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#dbeafe', color: '#1d4ed8', fontWeight: 700 }}>CARD</span>
                    : <span style={{ fontSize: 10, color: 'var(--muted)' }}>—</span>
                  }
                </td>
                <td style={TD}>{transport ? transport.name : '—'}</td>
                <td style={TD}>{discount ? discount.name : '—'}</td>
                <td style={TD}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[r.status] || 'var(--muted)' }}>
                    {STATUS[r.status] || r.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {remaining > 0 && (
      <div style={{ textAlign: 'center', padding: '10px 0 12px' }}>
        <button
          onClick={loadMore}
          disabled={loading}
          style={{
            padding: '6px 20px', fontSize: 12, borderRadius: 6,
            border: '1px solid var(--line)', background: 'var(--bg-subtle)',
            color: 'var(--muted)', cursor: loading ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {loading ? '読み込み中...' : `さらに読み込む（残 ${remaining} 件）`}
        </button>
      </div>
    )}
    </div>
  );
}
