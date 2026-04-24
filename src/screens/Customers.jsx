import { useState, useEffect } from 'react';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { useCustomers, loadCustomerReservations, saveCustomer } from '../hooks/useCustomers.js';
import { useAppStore } from '../store/state.js';
import { showToast } from '../lib/toast.js';
import { formatCallTime } from '../lib/utils.js';

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
          <button className="btn sm primary"><Icon name="plus" size={12} />新規</button>
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
    </div>
  );
}

function CustomerDetail({ c, onSave }) {
  const [tab, setTab] = useState('info');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: c.name || '',
    rank: c.rank || 'C',
    tags: (c.tags || []).join(', '),
    memo: c.memo || '',
    alert_memo: c.alert_memo || '',
    shared_memo: c.shared_memo || '',
  });

  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const handleSave = () => {
    const patch = {
      name: form.name || null,
      rank: form.rank,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      memo: form.memo || null,
      alert_memo: form.alert_memo || null,
      shared_memo: form.shared_memo || null,
    };
    onSave(c.id, patch);
    setEditing(false);
  };

  const tags = c.tags || [];

  return (
    <div className="cd-root">
      {c.alert_memo && (
        <div className="cd-alert-banner">
          <Icon name="bolt" size={13} /> {c.alert_memo}
        </div>
      )}
      <div className="cd-head">
        <div className="cd-head-l">
          <Avatar name={c.name} size={52} hue={245} />
          <div>
            <div className="cd-name-row">
              <span className="cd-name">{c.name || '名前未登録'}</span>
              {tags.map((t) => (
                <span key={t} className={'chip ' + (RANK_CHIP[t] || '')}>{t}</span>
              ))}
            </div>
            <div className="cd-meta">
              {c.phone_normalized && <span className="mono">{c.phone_normalized}</span>}
              {c.first_visit_date && <><span>·</span><span>初回 {c.first_visit_date}</span></>}
            </div>
          </div>
        </div>
        <div className="cd-head-r">
          <button className="btn sm" onClick={() => setEditing(!editing)}>
            <Icon name="edit" size={12} />{editing ? 'キャンセル' : '編集'}
          </button>
          {editing && (
            <button className="btn sm primary" onClick={handleSave}>
              保存
            </button>
          )}
          <button className="btn sm primary"><Icon name="plus" size={12} />新規予約</button>
        </div>
      </div>

      <div className="cd-stats">
        <div className="stat"><div className="stat-lbl">利用回数</div><div className="stat-val mono">{c.total_visits ?? 0}<span className="u">回</span></div></div>
        <div className="stat"><div className="stat-lbl">総額</div><div className="stat-val mono">¥{(c.total_spent ?? 0).toLocaleString()}</div></div>
        <div className="stat"><div className="stat-lbl">客単価</div><div className="stat-val mono">¥{Math.round((c.total_spent ?? 0) / Math.max(c.total_visits ?? 1, 1)).toLocaleString()}</div></div>
        <div className="stat"><div className="stat-lbl">キャンセル</div><div className="stat-val mono" style={{ color: (c.cancel_count ?? 0) > 2 ? 'var(--warn)' : undefined }}>{c.cancel_count ?? 0}<span className="u">回</span></div></div>
        <div className="stat"><div className="stat-lbl">ランク</div><div className="stat-val mono">{c.rank || 'C'}</div></div>
        <div className="stat"><div className="stat-lbl">最終利用</div><div className="stat-val mono" style={{ fontSize: 14 }}>{c.last_visit_date || '—'}</div></div>
      </div>

      <div className="cd-tabs">
        {[['info', '基本情報'], ['memo', 'メモ'], ['history', '利用履歴']].map(([k, lbl]) => (
          <button key={k} className={'cd-tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{lbl}</button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="cd-tab-body">
          {editing ? (
            <div className="cd-edit-form">
              <label>氏名<input value={form.name} onChange={upd('name')} /></label>
              <label>ランク
                <select value={form.rank} onChange={upd('rank')}>
                  {['VIP', 'A', 'B', 'C', 'NG'].map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
              <label>タグ（カンマ区切り）<input value={form.tags} onChange={upd('tags')} placeholder="優良, 常連" /></label>
            </div>
          ) : (
            <div className="kv">
              <div><span className="k">氏名</span><span className="v">{c.name || '—'}</span></div>
              <div><span className="k">電話番号</span><span className="v mono">{c.phone_normalized || '—'}</span></div>
              <div><span className="k">ランク</span><span className="v">{c.rank || 'C'}</span></div>
              <div><span className="k">ステータス</span><span className="v">{tags.map((t) => <span key={t} className={'chip ' + (RANK_CHIP[t] || '')}>{t}</span>)}</span></div>
              <div><span className="k">初来店</span><span className="v">{c.first_visit_date || '—'}</span></div>
            </div>
          )}
        </div>
      )}

      {tab === 'memo' && (
        <div className="cd-tab-body">
          {editing ? (
            <div className="cd-edit-form">
              <label>⚠️ 注意メモ<textarea rows={3} value={form.alert_memo} onChange={upd('alert_memo')} placeholder="着信時に赤バナー表示" /></label>
              <label>🔄 共有メモ<textarea rows={3} value={form.shared_memo} onChange={upd('shared_memo')} placeholder="スタッフ間の申し送り" /></label>
              <label>📝 一般メモ<textarea rows={4} value={form.memo} onChange={upd('memo')} /></label>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {c.alert_memo && <div className="memo-body alert">{c.alert_memo}</div>}
              {c.shared_memo && <div className="memo-body" style={{ borderLeft: '3px solid var(--info)' }}>🔄 {c.shared_memo}</div>}
              {c.memo && <div className="memo-body">{c.memo}</div>}
              {!c.alert_memo && !c.shared_memo && !c.memo && (
                <div style={{ padding: 20, color: 'var(--muted)', textAlign: 'center', fontSize: 12 }}>メモなし</div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && <ReservationHistory customerId={c.id} />}
    </div>
  );
}

function ReservationHistory({ customerId }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    loadCustomerReservations(customerId).then(setRows);
  }, [customerId]);

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
