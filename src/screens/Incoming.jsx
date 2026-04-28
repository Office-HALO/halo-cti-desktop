import { useState, useRef, useCallback } from 'react';
import Icon from '../components/Icon.jsx';
import { useAppStore } from '../store/state.js';
import { useCallLogs } from '../hooks/useCallLogs.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { localDateStr, formatDateJP, formatCallTime, normalizePhone } from '../lib/utils.js';

const CB_NEXT = { none: 'pending', pending: 'done', done: 'none' };
const CB_LABEL = { none: '未対応', pending: '対応中', done: '完了' };
const CB_CLASS = { none: 'cb-none', pending: 'cb-pending', done: 'cb-done' };

export default function Incoming() {
  const callsDate = useAppStore((s) => s.callsDate);
  const setCallsDate = useAppStore((s) => s.setCallsDate);
  const { rows, loading, reload } = useCallLogs(callsDate);
  const [busy,        setBusy]        = useState(null);
  const [editingMemo, setEditingMemo] = useState(null); // row id being edited
  const [memoVal,     setMemoVal]     = useState('');
  const memoInputRef = useRef(null);

  const shiftDate = (offset) => {
    if (offset === 0) {
      setCallsDate(localDateStr());
      return;
    }
    const d = new Date(callsDate + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    setCallsDate(localDateStr(d));
  };

  const cycleCallback = async (id, current) => {
    const next = CB_NEXT[current] || 'none';
    setBusy(id);
    const { error } = await supabase
      .from('call_logs')
      .update({ callback_status: next })
      .eq('id', id);
    setBusy(null);
    if (error) showToast('error', '更新失敗: ' + error.message);
    else reload();
  };

  const startEditMemo = (id, current) => {
    setEditingMemo(id);
    setMemoVal(current || '');
    // 次のフレームでフォーカス
    setTimeout(() => memoInputRef.current?.focus(), 30);
  };

  const saveMemo = useCallback(async (id, val) => {
    setEditingMemo(null);
    const trimmed = val.trim();
    const row = rows.find(r => r.id === id);
    if (trimmed === (row?.memo || '')) return; // 変更なし
    const { error } = await supabase
      .from('call_logs')
      .update({ memo: trimmed || null })
      .eq('id', id);
    if (error) showToast('error', '保存失敗');
    else reload();
  }, [rows, reload]);

  const total = rows.length;
  const unanswered = rows.filter((r) => r.callback_status === 'none').length;
  const done = rows.filter((r) => r.callback_status === 'done').length;

  const COLS = '70px 140px 150px 80px 80px 1fr 110px 80px';

  return (
    <div className="inc-root">
      {/* Date bar */}
      <div className="sched-datebar">
        <span className="sched-datestr">{formatDateJP(callsDate)}</span>
        <div className="btn-group">
          <button className="btn sm" onClick={() => shiftDate(-1)}><Icon name="chevronL" size={12} />前日</button>
          <button className="btn sm primary" onClick={() => shiftDate(0)}><Icon name="refresh" size={12} />今日</button>
          <button className="btn sm" onClick={() => shiftDate(1)}>次日<Icon name="chevronR" size={12} /></button>
        </div>
        <div className="sched-datebar-stats">
          着信:<strong>{total}件</strong>
          <span className="sched-datebar-sep">／</span>
          未対応:<strong style={{ color: unanswered > 0 ? 'var(--danger)' : 'var(--ok)' }}>{unanswered}件</strong>
          <span className="sched-datebar-sep">／</span>
          対応済:<strong>{done}件</strong>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn sm ghost" onClick={reload}><Icon name="refresh" size={12} />更新</button>
        </div>
      </div>

      {/* Table */}
      <div className="inc-scroll">
        {loading ? (
          <div className="inc-empty">読み込み中...</div>
        ) : rows.length === 0 ? (
          <div className="inc-empty">この日の着信記録はありません</div>
        ) : (
          <div className="ht-wrap">
            <div className="ht-head" style={{ gridTemplateColumns: COLS }}>
              <div>時刻</div>
              <div>顧客名</div>
              <div>電話番号</div>
              <div>通話時間</div>
              <div>種別</div>
              <div>メモ</div>
              <div>折り返し</div>
              <div></div>
            </div>
            {rows.map((r) => {
              const cust = r.customer;
              return (
                <div
                  key={r.id}
                  className="ht-row"
                  style={{ gridTemplateColumns: COLS }}
                >
                  <div className="mono">{formatCallTime(r.started_at)}</div>
                  <div className="ht-cust">
                    {cust ? (
                      <>
                        <span className="ht-cust-name">{cust.name}</span>
                        {cust.rank && cust.rank !== 'C' && (
                          <span className={'chip ht-rank ' + (cust.rank === 'VIP' ? 'blue' : cust.rank === 'A' ? 'green' : cust.rank === 'NG' ? 'red' : '')}>{cust.rank}</span>
                        )}
                      </>
                    ) : (
                      <span className="ht-cust-new">新規</span>
                    )}
                  </div>
                  <div className="mono ht-phone">{r.from_number || '—'}</div>
                  <div className="mono">{r.duration ? `${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, '0')}` : '—'}</div>
                  <div>
                    <span className={'chip ' + (r.source === 'twilio' ? 'blue' : '')}>
                      {r.source === 'twilio' ? 'Twilio' : '手動'}
                    </span>
                  </div>
                  <div className="ht-memo">
                    {editingMemo === r.id ? (
                      <input
                        ref={memoInputRef}
                        type="text"
                        value={memoVal}
                        onChange={(e) => setMemoVal(e.target.value)}
                        onBlur={() => saveMemo(r.id, memoVal)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); saveMemo(r.id, memoVal); }
                          if (e.key === 'Escape') { setEditingMemo(null); }
                        }}
                        style={{
                          width: '100%', padding: '3px 6px',
                          border: '1px solid var(--halo-400, #60a5fa)',
                          borderRadius: 4, fontSize: 12,
                          background: 'var(--bg)', color: 'var(--text)',
                          fontFamily: 'inherit', outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      <span
                        onClick={() => startEditMemo(r.id, r.memo)}
                        title="クリックで編集"
                        style={{ cursor: 'text', display: 'block', minHeight: 22 }}
                      >
                        {r.memo || <span className="ht-memo-empty">クリックで入力</span>}
                      </span>
                    )}
                  </div>
                  <div>
                    <button
                      className={'btn sm cb-btn ' + CB_CLASS[r.callback_status || 'none']}
                      disabled={busy === r.id}
                      onClick={() => cycleCallback(r.id, r.callback_status || 'none')}
                    >
                      {CB_LABEL[r.callback_status || 'none']}
                    </button>
                  </div>
                  <div className="ht-actions">
                    <button className="btn sm ghost icon" title="電話"><Icon name="phone" size={12} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
