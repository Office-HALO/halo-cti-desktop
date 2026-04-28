import { useMemo, useState, Fragment } from 'react';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { useAppStore } from '../store/state.js';
import { useShifts } from '../hooks/useShifts.js';
import { localDateStr, formatDateJP } from '../lib/utils.js';
import { supabase } from '../lib/supabase.js';
import { openReservationWindow } from '../lib/reservationWindowBridge.js';

const HOUR_START = 9;
const HOUR_END = 23;
const PX_PER_MIN_BY_DENSITY = { compact: 2.2, standard: 2.8, comfort: 3.4 };

const STATUS = {
  reserved: { bg: 'oklch(0.93 0.06 245)', fg: 'oklch(0.42 0.14 245)', line: 'oklch(0.58 0.15 245)', label: '予約' },
  received: { bg: 'oklch(0.94 0.07 150)', fg: 'oklch(0.40 0.13 150)', line: 'oklch(0.64 0.13 150)', label: '受領済' },
  working: { bg: 'oklch(0.94 0.06 50)', fg: 'oklch(0.42 0.13 50)', line: 'oklch(0.68 0.13 50)', label: '対応中' },
  complete: { bg: 'oklch(0.94 0.02 245)', fg: 'oklch(0.48 0.02 245)', line: 'oklch(0.72 0.02 245)', label: '完了' },
  hold: { bg: 'oklch(0.95 0.04 15)', fg: 'oklch(0.52 0.16 15)', line: 'oklch(0.70 0.15 15)', label: '仮予約' },
  cancelled: { bg: 'oklch(0.94 0.05 25)', fg: 'oklch(0.50 0.18 25)', line: 'oklch(0.64 0.18 25)', label: 'キャンセル' },
};

const CAST_STATUS = {
  active: { label: '待機中', fg: 'var(--ok)', bg: 'var(--ok-50)' },
  working: { label: '対応中', fg: 'oklch(0.52 0.14 50)', bg: 'oklch(0.95 0.06 50)' },
  offwait: { label: '外出', fg: 'var(--muted)', bg: 'var(--bg-subtle)' },
  rest: { label: '休憩', fg: 'oklch(0.50 0.12 280)', bg: 'oklch(0.95 0.04 280)' },
  done: { label: '報酬確定', fg: 'oklch(0.50 0.12 245)', bg: 'var(--halo-50)' },
};

const toMin = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export default function Schedule({ density = 'compact' }) {
  const todayDate = useAppStore((s) => s.todayDate);
  const setTodayDate = useAppStore((s) => s.setTodayDate);
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const { cast, bookings, loading, refresh } = useShifts(todayDate, currentStoreId);
  const [hover, setHover] = useState(null);

  const openBooking = async (id) => {
    const { data, error } = await supabase
      .from('reservations')
      .select('*, customers(*)')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return;
    openReservationWindow({
      customer: data.customers,
      reservation: data,
      onSaved: () => refresh(),
      onDeleted: () => refresh(),
    });
  };

  const newBooking = () => {
    openReservationWindow({
      onSaved: () => refresh(),
    });
  };

  const pxPerMin = PX_PER_MIN_BY_DENSITY[density] || PX_PER_MIN_BY_DENSITY.standard;
  const totalMin = (HOUR_END - HOUR_START) * 60;
  const totalW = totalMin * pxPerMin;
  const rowH = density === 'compact' ? 54 : density === 'comfort' ? 78 : 64;
  const SIDE_W = 260;
  const HEAD_H = 36;

  const hours = useMemo(() => {
    const arr = [];
    for (let h = HOUR_START; h <= HOUR_END; h++) arr.push(h);
    return arr;
  }, []);

  const isToday = todayDate === localDateStr();
  const now = new Date();
  const nowMinOfDay = now.getHours() * 60 + now.getMinutes();
  const nowX = isToday ? (nowMinOfDay - HOUR_START * 60) * pxPerMin : -1;
  const nowLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const totalBookings = bookings.length;
  const totalCast = cast.length;
  const workingCast = cast.filter((c) => c.status === 'working').length;

  const shiftDate = (offset) => {
    const d = new Date(todayDate + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    setTodayDate(localDateStr(d));
  };

  return (
    <div className="sched-root">
      <div className="sched-datebar">
        <span className="sched-datestr">{formatDateJP(todayDate)}</span>
        <button className="btn sm ghost icon" title="日付選択"><Icon name="calendar" size={14} /></button>
        <div className="btn-group">
          <button className="btn sm" onClick={() => shiftDate(-1)}><Icon name="chevronL" size={12} />前日</button>
          <button className="btn sm primary" onClick={() => setTodayDate(localDateStr())}><Icon name="refresh" size={12} />今日</button>
          <button className="btn sm" onClick={() => shiftDate(1)}>次日<Icon name="chevronR" size={12} /></button>
        </div>
        <div className="sched-datebar-stats">
          予約数:<strong>{totalBookings}本</strong>
          <span className="sched-datebar-sep">／</span>
          出勤数:<strong>{totalCast}人</strong>
          {workingCast > 0 && (
            <>
              <span className="sched-datebar-sep">／</span>
              対応中:<strong style={{ color: 'oklch(0.52 0.14 50)' }}>{workingCast}人</strong>
            </>
          )}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn sm" onClick={newBooking}><Icon name="plus" size={12} />新規予約</button>
        </div>
      </div>

      <div className="gantt-v2">
        <div className="gv2-scroll">
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>読み込み中...</div>
          ) : cast.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>
              {todayDate} の出勤データがありません
            </div>
          ) : (
            <div
              className="gv2-grid"
              style={{
                gridTemplateColumns: `${SIDE_W}px ${totalW}px`,
                gridTemplateRows: `${HEAD_H}px repeat(${cast.length}, ${rowH}px)`,
              }}
            >
              <div className="gv2-corner">
                <div className="gh-main">
                  女性 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({cast.length})</span>
                </div>
                <span className="search-mini">
                  <Icon name="search" size={12} />
                  <input placeholder="絞り込み" />
                </span>
              </div>

              <div className="gv2-header">
                {hours.map((h) => (
                  <div key={h} className="gh-hour" style={{ width: 60 * pxPerMin }}>
                    <span className="hr-num">{h}</span>
                    <span className="hr-suffix">時</span>
                  </div>
                ))}
              </div>

              {cast.map((c, i) => (
                <Fragment key={c.id}>
                  <div className="gv2-side-cell" style={{ gridRow: i + 2 }}>
                    <CastRow cast={c} rowH={rowH} />
                  </div>
                  <div
                    className="gv2-body-cell"
                    style={{
                      gridRow: i + 2,
                      background: i % 2 === 1 ? 'oklch(0.99 0.005 245)' : 'var(--surface)',
                    }}
                  >
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="grid-hour"
                        style={{ left: (h - HOUR_START) * 60 * pxPerMin }}
                      />
                    ))}
                    <ShiftBand cast={c} pxPerMin={pxPerMin} />
                    {bookings
                      .filter((b) => b.cast === c.id)
                      .map((b) => (
                        <BookingBlock
                          key={b.id}
                          b={b}
                          pxPerMin={pxPerMin}
                          onEnter={() => setHover(b.id)}
                          onLeave={() => setHover(null)}
                          hovered={hover === b.id}
                          onClick={() => openBooking(b.id)}
                        />
                      ))}
                  </div>
                </Fragment>
              ))}

              {nowX >= 0 && (
                <div
                  className="now-line-wrap"
                  style={{
                    gridColumn: 2,
                    gridRow: `2 / ${cast.length + 2}`,
                    position: 'relative',
                    pointerEvents: 'none',
                  }}
                >
                  <div className="now-line" style={{ left: nowX }}>
                    <span className="now-flag">{nowLabel} 現在</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CastRow({ cast, rowH }) {
  const st = CAST_STATUS[cast.status] || CAST_STATUS.active;
  return (
    <div className="cast-row" style={{ height: rowH }}>
      <div className="cr-l">
        <Avatar name={cast.name} size={30} hue={cast.hue} />
        <div className="cr-body">
          <div className="cr-top">
            <span className="cr-name">{cast.name}</span>
            <span className="cr-status" style={{ color: st.fg, background: st.bg }}>{st.label}</span>
          </div>
          <div className="cr-mid">
            <span className="cr-shift mono">{cast.shift}</span>
            {cast.count > 0 && <span className="cr-count">{cast.count}本</span>}
          </div>
          {cast.memo && <div className="cr-memo">{cast.memo}</div>}
        </div>
      </div>
    </div>
  );
}

function ShiftBand({ cast, pxPerMin }) {
  if (!cast.shift) return null;
  const m = cast.shift.match(/(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const sH = +m[1], sM = +m[2];
  let eH = +m[3], eM = +m[4];
  if (cast.shift.includes('翌')) eH = 23;
  const s = (sH - HOUR_START) * 60 + sM;
  const e = Math.min((eH - HOUR_START) * 60 + eM, (HOUR_END - HOUR_START) * 60);
  if (e <= s) return null;
  return (
    <div
      className="shift-band"
      style={{ left: Math.max(0, s * pxPerMin), width: (e - s) * pxPerMin }}
    />
  );
}

function BookingBlock({ b, pxPerMin, onEnter, onLeave, hovered, onClick }) {
  const s = toMin(b.start) - HOUR_START * 60;
  const e = toMin(b.end) - HOUR_START * 60;
  const w = (e - s) * pxPerMin;
  const st = STATUS[b.status] || STATUS.reserved;

  return (
    <div
      className="book-block"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{
        left: s * pxPerMin,
        width: w,
        background: st.bg,
        borderLeft: `3px solid ${st.line}`,
        color: st.fg,
        zIndex: hovered ? 5 : 2,
        cursor: 'pointer',
      }}
    >
      <div className="bb-head">
        <span className="bb-status">{st.label}</span>
        <span className="bb-time mono">{b.start}-{b.end}</span>
      </div>
      {w > 70 && (
        <div className="bb-body">
          <span className="bb-cust">{b.customer}</span>
        </div>
      )}
    </div>
  );
}
