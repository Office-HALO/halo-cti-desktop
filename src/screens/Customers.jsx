import { useState, useEffect } from 'react';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { useCustomers, loadCustomerReservations, saveCustomer, loadCustomerCallLogs } from '../hooks/useCustomers.js';
import { useAppStore } from '../store/state.js';
import { showToast } from '../lib/toast.js';
import { formatCallTime } from '../lib/utils.js';
import { supabase } from '../lib/supabase.js';
import NewReservationModal from '../overlays/NewReservationModal.jsx';
import NewCustomerModal from '../overlays/NewCustomerModal.jsx';
import { exportRowsAsCsv } from '../lib/csv.js';

const RANK_CHIP = {
  VIP: 'gold', A: 'green', B: 'blue', C: '', NG: 'red',
};

export default function Customers() {
  const { customers, loading, reload } = useCustomers();
  const setAllCustomers = useAppStore((s) => s.setAllCustomers);
  const allCustomers = useAppStore((s) => s.allCustomers);

  const [q, setQ] = useState('');
  const [rankFilter, setRankFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [showNewCust, setShowNewCust] = useState(false);

  const filtered = customers.filter((c) => {
    const kw = q.toLowerCase();
    if (kw && !((c.name || '').toLowerCase().includes(kw) ||
      (c.phone_normalized || '').includes(kw) ||
      (c.memo || '').toLowerCase().includes(kw))) return false;
    if (rankFilter && c.rank !== rankFilter) return false;
    return true;
  });

  const selected = customers.find((c) => c.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [customers]);

  const handleSave = async (id, patch) => {
    const { data, error } = await saveCustomer(id, patch);
    if (error) { showToast('error', '保存失敗: ' + error.message); return; }
    const updated = allCustomers.map((c) => (c.id === id ? { ...c, ...data } : c));
    setAllCustomers(updated);
    showToast('success', '顧客情報を保存しました');
  };

  return (
    <div className="cust-root">
      <aside className="cust-list-pane">
        <div className="cust-list-head">
          <div className="search-big">
            <Icon name="search" size={14} />
            <input
              placeholder="顧客名 / 電話番号"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button className="btn sm ghost" title="CSV出力" onClick={() => {
            exportRowsAsCsv(
              `customers_${new Date().toISOString().slice(0, 10)}.csv`,
              filtered,
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
        <div className="cust-filters">
          {['', 'VIP', 'A', 'B', 'C', 'NG'].map((r) => (
            <button
              key={r}
              className={'chip' + (r ? ' ' + (RANK_CHIP[r] || '') : ' blue') + (rankFilter === r ? ' active' : '')}
              onClick={() => setRankFilter(r)}
              style={{ cursor: 'pointer', border: '1px solid var(--line)' }}
            >
              {r || `全て ${customers.length}`}
            </button>
          ))}
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>読み込み中...</div>
        ) : (
          <div className="cust-list">
            {filtered.map((c) => (
              <div
                key={c.id}
                className={'cl-item' + (c.id === (selected?.id) ? ' sel' : '')}
                onClick={() => setSelectedId(c.id)}
              >
                <div className="cl-top">
                  <span className="cl-name">{c.name || '名前未登録'}</span>
                  {c.rank && c.rank !== 'C' && (
                    <span className={'chip ' + (RANK_CHIP[c.rank] || '')} style={{ height: 16, fontSize: 9, padding: '0 5px' }}>{c.rank}</span>
                  )}
                </div>
                <div className="cl-mid mono">{c.phone_normalized || '—'}</div>
                <div className="cl-bot">
                  <span className="cl-count">利用 {c.total_visits ?? 0}回</span>
                  <span className="cl-sum mono">¥{(c.total_spent ?? 0).toLocaleString()}</span>
                  {(c.tags || []).map((t) => (
                    <span key={t} className={'chip ' + (RANK_CHIP[t] || '')} style={{ height: 16, padding: '0 5px', fontSize: 9 }}>{t}</span>
                  ))}
                </div>
              </div>
            ))}
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
            setAllCustomers([newC, ...allCustomers]);
            setSelectedId(newC.id);
          }}
        />
      )}
    </div>
  );
}

function CustomerDetail({ c, onSave }) {
  const [editing, setEditing] = useState(null); // null | 'info' | 'alert' | 'shared' | 'memo'
  const [showNewRsv, setShowNewRsv] = useState(false);
  const [showMemoAdd, setShowMemoAdd] = useState(false);
  const [newMemo, setNewMemo] = useState('');
  const [form, setForm] = useState({
    name: c.name || '',
    rank: c.rank || 'C',
    tags: (c.tags || []).join(', '),
    alert_memo: c.alert_memo || '',
    shared_memo: c.shared_memo || '',
  });
  const [history, setHistory] = useState(null);
  const [callLogs, setCallLogs] = useState(null);

  useEffect(() => {
    loadCustomerReservations(c.id).then(setHistory);
  }, [c.id]);

  useEffect(() => {
    const phone = c.phone_normalized || c.phone;
    const fetch = () => loadCustomerCallLogs(phone, 6).then(setCallLogs);
    fetch();
    const ch = supabase
      .channel(`call_logs_detail_${c.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_logs' }, fetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [c.id, c.phone_normalized, c.phone]);

  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const saveField = (patch) => { onSave(c.id, patch); setEditing(null); };

  const addMemo = async () => {
    if (!newMemo.trim()) return;
    const d = new Date();
    const entry = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${newMemo.trim()}`;
    const updated = c.memo ? `${entry}\n${c.memo}` : entry;
    onSave(c.id, { memo: updated });
    setNewMemo(''); setShowMemoAdd(false);
  };

  const pastMemos = (() => {
    if (!c.memo) return [];
    return c.memo.split(/\n+/).map((s) => s.trim()).filter(Boolean).map((line) => {
      const m = line.match(/^(\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2})\s+(.+)$/);
      return m ? { date: m[1], text: m[2] } : { date: '', text: line };
    }).slice(0, 8);
  })();

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
              {c.phone_normalized && <span className="mono">{c.phone_normalized}</span>}
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
          <div className="cf-card">
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
                <div className="cf-cust-phone-row"><Icon name="phoneIn" size={12} /><span className="mono">{c.phone_normalized || '—'}</span></div>
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
          <div className="cf-card" style={{ flex: 1 }}>
            <div className="cf-card-head">
              <Icon name="edit" size={13} />
              <span className="cf-section-title">顧客メモ</span>
              <button className="cf-edit-btn" onClick={() => setShowMemoAdd((v) => !v)} title="メモを追加">
                <Icon name="plus" size={12} />
              </button>
            </div>
            {showMemoAdd && (
              <div style={{ marginBottom: 10 }}>
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
            {pastMemos.length > 0 ? (
              <div className="cf-past-memos">
                {pastMemos.map((m, i) => (
                  <div key={i} className="cf-past-memo">
                    {m.date && <span className="cf-past-date mono">{m.date}</span>}
                    <span className="cf-past-text">{m.text}</span>
                  </div>
                ))}
              </div>
            ) : !showMemoAdd && (
              <div style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 0' }}>メモなし</div>
            )}
          </div>
        </div>
      </div>

      {/* 下段: 着信履歴 ｜ 女子への連絡事項 + 要注意事項 */}
      <div className="cf-grid" style={{ marginBottom: 10 }}>
        <div className="cf-col">
          <div className="cf-card" style={{ flex: 1 }}>
            <div className="cf-card-head">
              <Icon name="phoneIn" size={13} />
              <span className="cf-section-title">着信履歴</span>
            </div>
            {!callLogs ? (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>読み込み中...</div>
            ) : callLogs.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>着信記録なし</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {callLogs.map((r) => (
                  <div key={r.id} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' }}>
                    <span className="mono" style={{ color: 'var(--muted)', flexShrink: 0 }}>{formatCallTime(r.started_at)}</span>
                    {r.duration != null && (
                      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{r.duration}秒</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="cf-col" style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
          <div className="cf-card" style={{ flex: 1 }}>
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
          <div className="cf-card cf-alert-card" style={{ flex: 1 }}>
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
      </div>

      {/* 利用履歴テーブル（全幅） */}
      <ReservationHistory customerId={c.id} history={history} />
    </div>
  );
}

function ReservationHistory({ customerId, history: historyProp }) {
  const [rows, setRows] = useState(historyProp ?? null);

  useEffect(() => {
    if (historyProp !== undefined) { setRows(historyProp); return; }
    loadCustomerReservations(customerId).then(setRows);
  }, [customerId, historyProp]);

  if (!rows) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>読み込み中...</div>;
  if (rows.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>予約・来店記録なし</div>;

  const STATUS = { reserved: '予約中', visited: '来店済', cancelled: 'キャンセル', no_show: '無断キャンセル' };
  const STATUS_COLOR = { reserved: 'var(--warn)', visited: 'var(--ok)', cancelled: 'var(--muted)', no_show: 'var(--danger)' };

  return (
    <div className="cd-tab-body">
      <div className="rsv-history-list">
        {rows.map((r) => (
          <div key={r.id} className="rsv-row">
            <div className="rsv-row-left">
              <span className="mono rsv-date">{r.reserved_date}</span>
              <span className="mono rsv-time">{r.start_time?.slice(0, 5) || '—'}</span>
              <span className="rsv-lady">{r.ladies?.display_name || '—'}</span>
              {r.course && <span className="chip" style={{ fontSize: 10, height: 18 }}>{r.course}</span>}
            </div>
            <div className="rsv-row-right">
              {r.amount ? <span className="mono rsv-price">¥{r.amount.toLocaleString()}</span> : null}
              <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[r.status] || 'var(--muted)' }}>
                {STATUS[r.status] || r.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
