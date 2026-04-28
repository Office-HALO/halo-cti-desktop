import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '../components/Icon.jsx';
import { supabase } from '../lib/supabase.js';
import { saveCustomer, loadCustomerReservations, loadCustomerCallLogs } from '../hooks/useCustomers.js';
import { formatCallTime } from '../lib/utils.js';
import { showToast } from '../lib/toast.js';
import { openReservationWindow } from '../lib/reservationWindowBridge.js';

const RANK_CHIP = { VIP: 'gold', A: 'green', B: 'blue', NG: 'red', 優良: 'green', CB決済: 'blue' };

function todayDateStr() {
  const d = new Date();
  const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}（${w}）`;
}
function todayTimeStr() {
  const d = new Date();
  return `${d.getHours()}時${String(d.getMinutes()).padStart(2, '0')}分`;
}

export default function CustomerFloat({ customerId, phone, onClose }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [c, setC] = useState(null);
  const [history, setHistory] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingMemo, setEditingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState('');
  const [showMemoAdd, setShowMemoAdd] = useState(false);
  const [newMemo, setNewMemo] = useState('');
  const startRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('customers').select('*').eq('id', customerId).maybeSingle();
      if (cancelled) return;
      setC(data || null);
      setMemoDraft(data?.shared_memo || data?.alert_memo || '');
      const [rows, logs] = await Promise.all([
        loadCustomerReservations(customerId),
        loadCustomerCallLogs(data?.phone_normalized || phone, 10),
      ]);
      if (cancelled) return;
      setHistory(rows);
      setCallLogs(logs);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  // call_logs のリアルタイム更新
  useEffect(() => {
    const ch = supabase
      .channel(`call_logs_float_${customerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_logs' }, () => {
        loadCustomerCallLogs(phone, 10).then(setCallLogs);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [customerId, phone]);

  const onDragStart = useCallback((e) => {
    if (e.target.closest('button')) return;
    setDragging(true);
    startRef.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y };
  }, [pos]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e) => {
      if (!startRef.current) return;
      setPos({
        x: startRef.current.x + e.clientX - startRef.current.mx,
        y: startRef.current.y + e.clientY - startRef.current.my,
      });
    };
    const up = () => { setDragging(false); startRef.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [dragging]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const saveMemo = async () => {
    const { data, error } = await saveCustomer(customerId, { alert_memo: memoDraft || null });
    if (error) { showToast('error', '保存失敗'); return; }
    setC((prev) => ({ ...prev, ...(data || { alert_memo: memoDraft }) }));
    setEditingMemo(false);
    showToast('success', 'メモを保存しました');
  };

  const addMemo = async () => {
    if (!newMemo.trim()) return;
    const d = new Date();
    const dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    const entry = `${dateStr} ${newMemo.trim()}`;
    const updatedMemo = c?.memo ? `${entry}\n${c.memo}` : entry;
    const { data, error } = await saveCustomer(customerId, { memo: updatedMemo });
    if (error) { showToast('error', '保存失敗'); return; }
    setC((prev) => ({ ...prev, ...(data || { memo: updatedMemo }) }));
    setNewMemo('');
    setShowMemoAdd(false);
    showToast('success', 'メモを追加しました');
  };

  const tags = c?.tags || [];
  const avg = c && (c.total_visits ?? 0) > 0
    ? Math.round((c.total_spent || 0) / c.total_visits)
    : 0;
  const pastMemos = (() => {
    if (!c?.memo) return [];
    return c.memo
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^(\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2})\s+(.+)$/);
        return m ? { date: m[1], text: m[2] } : { date: '', text: line };
      })
      .slice(0, 6);
  })();

  return (
    <>
      <div className="cf-scrim" onClick={onClose} />
      <div
        className={'cf-float' + (dragging ? ' dragging' : '') + (minimized ? ' minimized' : '')}
        style={{ transform: `translate(calc(-50% + ${pos.x}px), ${pos.y}px)` }}
      >
        <div className="cf-handle" onMouseDown={onDragStart}>
          <div className="cf-handle-l">
            <Icon name="user" size={15} />
            <span className="cf-title">顧客詳細</span>
            {c && (
              <>
                <span className="cf-title-name">{c.name || '名前未登録'}</span>
                {c.name_kana && <span className="cf-title-kana">{c.name_kana}</span>}
                {c.member_no && <span className="chip blue" style={{ height: 18 }}>{c.member_no}</span>}
              </>
            )}
          </div>
          <div className="cf-handle-r">
            <button className="cp-icon-btn" onClick={() => setMinimized((v) => !v)}>
              <Icon name="chevronD" size={14} style={{ transform: minimized ? 'rotate(180deg)' : 'none' }} />
            </button>
            <button className="cp-icon-btn" onClick={onClose}>
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>

        {!minimized && (
          <>
            {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>読み込み中...</div>}
            {!loading && !c && <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>顧客情報が取得できませんでした</div>}
            {!loading && c && (
              <div className="cf-body">
                {/* 上段: 顧客データ ｜ 顧客メモ */}
                <div className="cf-grid">
                  <div className="cf-col">
                    <div className="cf-card">
                      <div className="cf-card-head">
                        <Icon name="users" size={13} />
                        <span className="cf-section-title">顧客データ</span>
                        <button className="cf-edit-btn"><Icon name="edit" size={12} /></button>
                      </div>
                      <div className="cf-customer-box">
                        <div className="cf-cust-name-big">{c.name || '名前未登録'}</div>
                        <div className="cf-cust-id-row">
                          <span>会員／{c.member_no || '—'}</span>
                        </div>
                        <div className="cf-cust-phone-row">
                          <Icon name="phoneIn" size={12} />
                          <span className="mono">{c.phone_normalized || phone}</span>
                        </div>
                        <div className="cf-sub-meta" style={{ marginTop: 4 }}>
                          <span>店舗 <b>{c.store_name || '—'}</b></span>
                          <span>種別 <b>{c.last_source || '予約'}</b></span>
                        </div>
                        <div className="cf-stat-grid">
                          <div><div className="cf-stat-lbl">利用</div><div className="cf-stat-val"><b>{c.total_visits ?? 0}</b>回</div></div>
                          <div><div className="cf-stat-lbl">総額</div><div className="cf-stat-val mono">¥{(c.total_spent ?? 0).toLocaleString()}</div></div>
                          <div><div className="cf-stat-lbl">客単価</div><div className="cf-stat-val mono">¥{avg.toLocaleString()}</div></div>
                          <div><div className="cf-stat-lbl">キャンセル</div><div className="cf-stat-val"><b style={{ color: (c.cancel_count ?? 0) > 2 ? 'var(--danger)' : undefined }}>{c.cancel_count ?? 0}</b>回</div></div>
                        </div>
                        {tags.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                            {tags.map((t) => (
                              <span key={t} className={'chip ' + (RANK_CHIP[t] || 'blue')}>{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="cf-col">
                    <div className={'cf-card' + (editingMemo ? ' editing' : '')} style={{ flex: 1 }}>
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
                <div className="cf-grid" style={{ marginTop: 8 }}>
                  <div className="cf-col">
                    <div className="cf-card" style={{ flex: 1 }}>
                      <div className="cf-card-head">
                        <Icon name="phoneIn" size={13} />
                        <span className="cf-section-title">着信履歴</span>
                      </div>
                      {callLogs.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>着信記録なし</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {callLogs.map((r) => (
                            <div key={r.id} style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'center' }}>
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
                        <button className="cf-edit-btn"><Icon name="edit" size={12} /></button>
                      </div>
                      <p className="cf-lady-memo">{c.shared_memo || c.lady_memo || 'なし'}</p>
                    </div>
                    <div className={'cf-card cf-alert-card' + (editingMemo ? ' editing' : '')} style={{ flex: 1 }}>
                      <div className="cf-card-head">
                        <Icon name="bolt" size={13} style={{ color: 'var(--danger)' }} />
                        <span className="cf-section-title">要注意事項</span>
                        <button className="cf-edit-btn" onClick={() => setEditingMemo((v) => !v)}>
                          <Icon name="edit" size={12} />
                        </button>
                      </div>
                      {editingMemo ? (
                        <>
                          <textarea
                            className="cf-memo-input"
                            rows={4}
                            value={memoDraft}
                            onChange={(e) => setMemoDraft(e.target.value)}
                          />
                          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <button className="btn sm primary" onClick={saveMemo}>保存</button>
                            <button className="btn sm" onClick={() => { setEditingMemo(false); setMemoDraft(c.alert_memo || ''); }}>キャンセル</button>
                          </div>
                        </>
                      ) : (
                        <p className="cf-alert-text">{c.alert_memo || 'なし'}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* History table */}
                <div className="cf-history">
                  <div className="cf-history-head">
                    <Icon name="history" size={13} />
                    <span className="cf-section-title">利用履歴</span>
                    <span className="cf-history-count">全{history.length}件</span>
                  </div>
                  {history.length === 0 ? (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>利用履歴なし</div>
                  ) : (
                    <div className="cf-hist-table-wrap">
                      <table className="cf-hist-table">
                        <thead>
                          <tr>
                            <th>開始日時</th>
                            <th>終了時刻</th>
                            <th>オペ</th>
                            <th>電話番号</th>
                            <th>顧客名</th>
                            <th>基本</th>
                            <th>指名</th>
                            <th>場所/ホテル</th>
                            <th>メモ</th>
                            <th>部屋NO</th>
                            <th>合計</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((r) => (
                            <tr key={r.id} onClick={() => setEditRsv(r)} style={{ cursor: 'pointer' }} title="クリックで編集">
                              <td className="mono">{r.reserved_date} {r.start_time?.slice(0, 5)}</td>
                              <td className="mono">{r.end_time?.slice(0, 5) || '—'}</td>
                              <td>{r.operator || '—'}</td>
                              <td className="mono">{(c.phone_normalized || '').replace(/-/g, '')}</td>
                              <td>{c.name || '—'}</td>
                              <td>{r.course || '—'}</td>
                              <td>{r.ladies?.display_name || '—'}</td>
                              <td>{r.hotel || '—'}</td>
                              <td>{r.memo ? '●' : '—'}</td>
                              <td className="mono">{r.room_no || '—'}</td>
                              <td className="mono">{r.amount ? '¥' + r.amount.toLocaleString() : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="cf-actions">
              <button className="cf-btn ghost"><Icon name="phoneIn" size={13} />発信</button>
              <button className="cf-btn ghost" onClick={() => setShowMemoAdd(true)}><Icon name="edit" size={13} />メモ追加</button>
              <button className="cf-btn ghost"><Icon name="history" size={13} />履歴フル表示</button>
              <button className="cf-btn ghost" style={{ marginLeft: 'auto' }}>編集</button>
              <button
                className="cf-btn primary"
                onClick={() => c && openReservationWindow({
                  customer: c,
                  onSaved: async () => { const rows = await loadCustomerReservations(customerId); setHistory(rows); },
                })}
              ><Icon name="plus" size={13} />新規予約</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
