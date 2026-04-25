import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { supabase } from '../lib/supabase.js';

function timeAgo(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}秒前`;
  if (sec < 3600) return `${Math.floor(sec / 60)}分前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}時間前`;
  return `${Math.floor(sec / 86400)}日前`;
}

export default function NotificationsPanel({ onClose, onNavigate }) {
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [recentRsv, setRecentRsv] = useState([]);
  const [recentCalls, setRecentCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: a }, { data: r }, { data: c }] = await Promise.all([
        supabase
          .from('shift_requests')
          .select('id, shift_date, start_time, end_time, ladies(display_name, name), created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('reservations')
          .select('id, customer_id, customers(name), reserved_date, start_time, status, created_at')
          .gte('reserved_date', today)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('call_logs')
          .select('id, from_number, started_at')
          .gte('started_at', today + 'T00:00:00+09:00')
          .order('started_at', { ascending: false })
          .limit(5),
      ]);
      if (cancelled) return;
      setPendingApprovals(a || []);
      setRecentRsv(r || []);
      setRecentCalls(c || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const goto = (tab) => { onNavigate?.(tab); onClose(); };

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 2000, background: 'transparent',
      }} />
      <div style={{
        position: 'fixed', left: 56 + 8, bottom: 24, zIndex: 2010,
        width: 360, maxHeight: '70vh', overflow: 'auto',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <Icon name="bell" size={14} />
          <span style={{ fontSize: 14, fontWeight: 700, marginLeft: 8 }}>通知</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <Icon name="close" size={14} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>読み込み中...</div>
        ) : (
          <>
            <Section title={`承認待ち (${pendingApprovals.length})`} onAll={() => goto('approvals')}>
              {pendingApprovals.length === 0 ? (
                <Empty>承認待ち申請なし</Empty>
              ) : pendingApprovals.map((a) => (
                <Row
                  key={a.id}
                  icon="check"
                  iconColor="oklch(0.65 0.15 60)"
                  primary={`${a.ladies?.display_name || a.ladies?.name || '?'} のシフト申請`}
                  secondary={`${a.shift_date} ${(a.start_time || '').slice(0, 5)}〜${(a.end_time || '').slice(0, 5)}`}
                  meta={timeAgo(a.created_at)}
                  onClick={() => goto('approvals')}
                />
              ))}
            </Section>

            <Section title="最近の予約" onAll={() => goto('schedule')}>
              {recentRsv.length === 0 ? (
                <Empty>本日以降の予約なし</Empty>
              ) : recentRsv.map((r) => (
                <Row
                  key={r.id}
                  icon="calendar"
                  iconColor="oklch(0.55 0.15 245)"
                  primary={`${r.customers?.name || '—'} ${r.status === 'cancelled' ? '(キャンセル)' : ''}`}
                  secondary={`${r.reserved_date} ${(r.start_time || '').slice(0, 5)}`}
                  meta={timeAgo(r.created_at)}
                  onClick={() => goto('schedule')}
                />
              ))}
            </Section>

            <Section title="本日の着信" onAll={() => goto('incoming')}>
              {recentCalls.length === 0 ? (
                <Empty>本日着信なし</Empty>
              ) : recentCalls.map((c) => (
                <Row
                  key={c.id}
                  icon="phoneIn"
                  iconColor="oklch(0.55 0.13 150)"
                  primary={c.from_number || '不明'}
                  secondary=""
                  meta={timeAgo(c.started_at)}
                  onClick={() => goto('incoming')}
                />
              ))}
            </Section>
          </>
        )}
      </div>
    </>
  );
}

function Section({ title, children, onAll }) {
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 14px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.5 }}>{title}</span>
        {onAll && (
          <button onClick={onAll} style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent, oklch(0.55 0.15 245))', background: 'none', border: 'none', cursor: 'pointer' }}>
            全て見る ›
          </button>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Row({ icon, iconColor, primary, secondary, meta, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '8px 14px', cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--row-alt)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
        display: 'grid', placeItems: 'center',
        background: 'var(--row-alt)', color: iconColor,
      }}>
        <Icon name={icon} size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{primary}</div>
        {secondary && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{secondary}</div>}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{meta}</div>
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--muted)' }}>{children}</div>;
}
