import { useState } from 'react';
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
  const [busy, setBusy] = useState(null);

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

  const editMemo = async (id, current) => {
    const val = prompt('メモを入力してください:', current || '');
    if (val === null) return;
    const { error } = await supabase
      .from('call_logs')
      .update({ memo: val.trim() || null })
      .eq('id', id);
    if (error) showToast('error', '保存失敗');
    else reload();
  };

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
              const blocked = cust?.blocked;
              return (
                <div
                  key={r.id}
                  className={'ht-row' + (blocked ? ' ht-row-blocked' : '')}
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
                        {blocked && <span className="chip red">出禁</span>}
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
                  <div
                    className="ht-memo"
                    onClick={() => editMemo(r.id, r.memo)}
                    title="クリックで編集"
                  >
                    {r.memo || <span className="ht-memo-empty">クリックで入力</span>}
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
