import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { supabase } from '../lib/supabase.js';

const RANK_CHIP = { VIP: 'gold', A: 'green', B: 'blue', NG: 'red', 優良: 'green', CB決済: 'blue' };

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

function fmtDate(d) {
  if (!d) return '—';
  return d.replace(/-/g, '/');
}

export default function IncomingCallPopup({ call, onClose, onOpenCustomer }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [todayRsv, setTodayRsv] = useState(null);
  const [nominations, setNominations] = useState([]);
  const startRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Load today's reservation + cast nomination history
  useEffect(() => {
    const c = call.customer;
    if (!c?.id) { setTodayRsv(null); setNominations([]); return; }
    let cancelled = false;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: rsv } = await supabase
        .from('reservations')
        .select('*, ladies(display_name)')
        .eq('customer_id', c.id)
        .eq('reserved_date', today)
        .in('status', ['reserved', 'visited'])
        .order('start_time', { ascending: true })
        .limit(1);
      if (cancelled) return;
      setTodayRsv(rsv?.[0] || null);

      const { data: hist } = await supabase
        .from('reservations')
        .select('lady_id, ladies(display_name)')
        .eq('customer_id', c.id)
        .eq('status', 'visited')
        .order('reserved_date', { ascending: false })
        .limit(30);
      if (cancelled) return;
      const seen = new Map();
      (hist || []).forEach((r) => {
        const n = r.ladies?.display_name;
        if (n && !seen.has(n)) seen.set(n, (seen.get(n) || 0) + 1);
      });
      setNominations(Array.from(seen.keys()).slice(0, 6));
    })();
    return () => { cancelled = true; };
  }, [call.customer?.id]);

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

  const { phone, customer } = call;
  const c = customer;
  const tags = c?.tags || [];
  const isBlocked = c?.blocked === true;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <>
      <div className="call-scrim" />
      <div
        className={'call-popup' + (dragging ? ' dragging' : '') + (minimized ? ' minimized' : '')}
        style={{ transform: `translate(calc(-50% + ${pos.x}px), ${pos.y}px)` }}
      >
        <div className="cp-handle" onMouseDown={onDragStart}>
          <div className="cp-handle-l">
            <div className="ring">
              <span className="pulse" />
              <Icon name="phoneIn" size={16} />
            </div>
            <div>
              <div className="cp-title">
                着信中
                <span className="cp-time mono">{mm}:{ss}</span>
              </div>
              <div className="cp-sub">外線 1 · 自動判定済</div>
            </div>
          </div>
          <div className="cp-handle-r">
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
            <div className="cp-body">
              {isBlocked && (
                <div className="cp-alert" style={{ background: 'oklch(0.94 0.06 25)', color: 'var(--danger)', marginBottom: 10 }}>
                  <Icon name="bolt" size={12} />
                  <span><b>出禁・ブロック対象</b>のお客様です</span>
                </div>
              )}
              {c?.alert_memo && (
                <div className="cp-alert warn" style={{ marginBottom: 10 }}>
                  <Icon name="bolt" size={12} />
                  <span><b>注意:</b> {c.alert_memo}</span>
                </div>
              )}

              {c ? (
                <>
                  <div className="cp-identity">
                    <Avatar name={c.name} size={56} hue={hashHue(c.name || '')} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="cp-cust-name">
                        {c.name || '名前未登録'}
                        {tags.map((t) => (
                          <span key={t} className={'chip ' + (RANK_CHIP[t] || '')}>{t}</span>
                        ))}
                      </div>
                      <div className="cp-cust-sub">
                        <span className="mono">{c.phone_normalized || phone}</span>
                        {c.member_no && <><span className="dot-sep">·</span><span className="mono">{c.member_no}</span></>}
                        <span className="dot-sep">·</span>
                        <span>{c.total_visits ?? 0}回利用</span>
                      </div>
                      <div className="cp-cust-meta">
                        <span>総額 <b className="mono">¥{(c.total_spent ?? 0).toLocaleString()}</b></span>
                        <span>最終 <b className="mono">{fmtDate(c.last_visit_date)}</b></span>
                        {(c.cancel_count ?? 0) > 0 && (
                          <span>キャンセル <b className="mono" style={{ color: (c.cancel_count ?? 0) > 2 ? 'var(--danger)' : undefined }}>{c.cancel_count}回</b></span>
                        )}
                      </div>
                    </div>
                  </div>

                  {todayRsv && (
                    <div className="cp-today-rsv">
                      <Icon name="calendar" size={12} />
                      <span>
                        <b>本日 {todayRsv.start_time?.slice(0, 5)} 予約あり</b>
                        （{todayRsv.ladies?.display_name || '未定'}
                        {todayRsv.duration_min ? ` / ${todayRsv.duration_min}分` : ''}
                        {todayRsv.hotel ? ` / ${todayRsv.hotel}` : ''}）
                      </span>
                    </div>
                  )}

                  {nominations.length > 0 && (
                    <div className="cp-section">
                      <div className="cp-section-lbl">指名履歴</div>
                      <div className="cp-noms">
                        {nominations.map((n) => (
                          <span key={n} className="cp-nom">
                            <span className="cp-nom-dot" style={{ background: `oklch(0.78 0.12 ${hashHue(n)})` }}>{n.slice(0, 1)}</span>
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {c.shared_memo && (
                    <div className="cp-section">
                      <div className="cp-section-lbl">共有メモ</div>
                      <p className="cp-memo-p">
                        {c.shared_memo.slice(0, 160)}{c.shared_memo.length > 160 ? '…' : ''}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="cp-unknown">
                  <div className="cp-unknown-ring">
                    <Icon name="user" size={28} />
                  </div>
                  <div className="cp-cust-name" style={{ justifyContent: 'center' }}>新規または未登録</div>
                  <div className="cp-cust-sub mono" style={{ justifyContent: 'center' }}>{phone || '—'}</div>
                  <button className="btn sm" style={{ marginTop: 10 }}>
                    <Icon name="plus" size={12} />新規顧客として登録
                  </button>
                </div>
              )}
            </div>

            <div className="cp-actions">
              <button className="cp-btn danger-outline" onClick={onClose}>
                <Icon name="phoneIn" size={13} style={{ transform: 'rotate(135deg)' }} />切断
              </button>
              <button className="cp-btn ghost">
                <Icon name="phoneIn" size={13} />保留
              </button>
              {c && (
                <button className="cp-btn ghost" onClick={() => onOpenCustomer?.(c.id)}>
                  <Icon name="external" size={13} />顧客詳細
                </button>
              )}
              <button className="cp-btn success" onClick={onClose} style={{ marginLeft: 'auto' }}>
                <Icon name="phoneIn" size={14} />応答する
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
