import { useMemo, useState, useRef, useEffect, Fragment } from 'react';
import QuickEditMenu from '../overlays/QuickEditMenu.jsx';
import CastContextMenu from '../overlays/CastContextMenu.jsx';
import ShiftInfoModal from '../overlays/ShiftInfoModal.jsx';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { useAppStore } from '../store/state.js';
import { useShifts } from '../hooks/useShifts.js';
import { localDateStr, formatDateJP } from '../lib/utils.js';
import { supabase } from '../lib/supabase.js';
import { openReservationWindow } from '../lib/reservationWindowBridge.js';
import KarteDetailPopup from '../overlays/KarteDetailPopup.jsx';
import BookingQuickView from '../overlays/BookingQuickView.jsx';
import CustomerFloat from '../overlays/CustomerFloat.jsx';
import { getGanttBodyFields, resolveBlockField } from '../lib/displaySettings.js';
import { BOOKING_STATUS } from '../lib/bookingStatus.js';

const PX_PER_MIN_BY_DENSITY = { compact: 2.2, standard: 2.8, comfort: 3.4 };

const STATUS = Object.fromEntries(
  Object.entries(BOOKING_STATUS).map(([k, v]) => [k, { ...v, fg: 'var(--text)' }])
);

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
  const stores = useAppStore((s) => s.stores);
  const currentStore = stores.find((s) => s.id === currentStoreId);
  const HOUR_START = currentStore?.gantt_start ?? 9;
  const HOUR_END = currentStore?.gantt_end ?? 23;
  const { cast, bookings, loading, refresh } = useShifts(todayDate, currentStoreId);
  const [ganttBodyFields] = useState(getGanttBodyFields);
  const [attendanceStatuses, setAttendanceStatuses] = useState([]);

  useEffect(() => {
    supabase.from('shift_attendance_statuses').select('*').order('sort_order').then(({ data }) => {
      setAttendanceStatuses(data || []);
    });
  }, []);
  const [hover, setHover] = useState(null);
  const [hoverX, setHoverX] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, id }
  const [castCtxMenu, setCastCtxMenu] = useState(null); // { x, y, cast }
  const [shiftInfoModal, setShiftInfoModal] = useState(null); // { cast }
  const [castFilter, setCastFilter] = useState('');
  const [selectedKarteLadyId, setSelectedKarteLadyId] = useState(null);
  const [quickView, setQuickView] = useState(null); // { booking, castName }
  const [customerFloat, setCustomerFloat] = useState(null); // { customerId, phone }

  const handleContextMenu = (e, bookingId) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, id: bookingId });
  };

  const closeCtxMenu = () => setCtxMenu(null);

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

  const [winW, setWinW] = useState(() => window.innerWidth);
  useEffect(() => {
    const handler = () => setWinW(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const totalMin = (HOUR_END - HOUR_START) * 60;
  const SIDE_W = 260;
  const HEAD_H = 36;
  const REF_MIN = 14 * 60; // 9〜23時基準（840分）でスケール固定
  const pxPerMin = (winW - SIDE_W) / REF_MIN;
  const totalW = totalMin * pxPerMin;
  const rowH = density === 'compact' ? 54 : density === 'comfort' ? 78 : 64;

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

  // キャンセル除外した予約数
  const totalBookings = bookings.filter((b) => b.status !== 'cancelled').length;
  // 出勤数 = シフト登録がある人（shiftId != null）
  const totalCast = cast.filter((c) => c.shiftId !== null).length;
  // 対応中 = 実際に対応中ステータスのキャスト
  const workingCast = cast.filter((c) => c.status === 'working').length;
  // 絞り込み後のキャストリスト（退勤・欠勤は下部に）
  const filteredCast = useMemo(() => {
    const base = castFilter
      ? cast.filter((c) => (c.name || '').toLowerCase().includes(castFilter.toLowerCase()))
      : cast;
    const getBehavior = (c) => {
      const st = attendanceStatuses.find((s) => s.code === c.attendanceStatus);
      return st?.behavior || 'none';
    };
    return [...base].sort((a, b) => {
      const bA = getBehavior(a), bB = getBehavior(b);
      const isBottomA = bA === 'returning' || bA === 'absent' || bA === 'same_day_absent' ? 1 : 0;
      const isBottomB = bB === 'returning' || bB === 'absent' || bB === 'same_day_absent' ? 1 : 0;
      return isBottomA - isBottomB;
    });
  }, [cast, castFilter, attendanceStatuses]);

  const shiftDate = (offset) => {
    const d = new Date(todayDate + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    setTodayDate(localDateStr(d));
  };

  return (
    <div className="sched-root">
      <div className="sched-datebar">
        <span className="sched-datestr" style={{ color: !isToday && todayDate < localDateStr() ? 'var(--muted)' : undefined }}>
          {formatDateJP(todayDate)}
          {!isToday && todayDate < localDateStr() && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--muted)', borderRadius: 4, padding: '1px 5px', verticalAlign: 'middle' }}>過去</span>
          )}
          {!isToday && todayDate > localDateStr() && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#fff', background: 'oklch(0.52 0.14 245)', borderRadius: 4, padding: '1px 5px', verticalAlign: 'middle' }}>未来</span>
          )}
        </span>
        <label className="btn sm ghost icon" title="日付を選択" style={{ cursor: 'pointer', position: 'relative' }}>
          <Icon name="calendar" size={14} />
          <input
            type="date"
            value={todayDate}
            onChange={(e) => { if (e.target.value) setTodayDate(e.target.value); }}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
          />
        </label>
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

      <div className="gantt-v2" onClick={quickView ? () => setQuickView(null) : undefined}>
        {quickView && (
          <BookingQuickView
            booking={quickView.booking}
            castName={quickView.castName}
            onClose={() => setQuickView(null)}
            onEdit={() => { setQuickView(null); openBooking(quickView.booking.id); }}
          />
        )}
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
                gridTemplateRows: `${HEAD_H}px repeat(${filteredCast.length}, ${rowH}px)`,
              }}
            >
              <div className="gv2-corner">
                <div className="gh-main">
                  女性 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({cast.filter(c => c.shiftId !== null).length})</span>
                </div>
                <span className="search-mini">
                  <Icon name="search" size={12} />
                  <input
                    placeholder="絞り込み"
                    value={castFilter}
                    onChange={(e) => setCastFilter(e.target.value)}
                  />
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

              {filteredCast.map((c, i) => {
                const attSt = attendanceStatuses.find((s) => s.code === c.attendanceStatus);
                const behavior = attSt?.behavior || 'none';
                const isAbsent    = behavior === 'absent' || behavior === 'same_day_absent';
                const isReturning = behavior === 'returning';
                return (
                <Fragment key={c.id}>
                  <div
                    className="gv2-side-cell"
                    style={{
                      gridRow: i + 2,
                      background: isReturning ? 'oklch(0.94 0 0)' : undefined,
                    }}
                    onContextMenu={(e) => { e.preventDefault(); setCastCtxMenu({ x: e.clientX, y: e.clientY, cast: c }); }}
                  >
                    <CastRow cast={c} rowH={rowH} onOpenKarte={setSelectedKarteLadyId} attendanceStatuses={attendanceStatuses} isAbsent={isAbsent} onShiftClick={() => setShiftInfoModal({ cast: c })} />
                  </div>
                  <div
                    className="gv2-body-cell"
                    onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHoverX(e.clientX - r.left); }}
                    onMouseLeave={() => setHoverX(null)}
                    style={{
                      gridRow: i + 2,
                      opacity: isAbsent ? 0.4 : 1,
                      filter:  isAbsent ? 'grayscale(1)' : 'none',
                      background: (() => {
                        const base = isReturning
                          ? (i % 2 === 1 ? 'oklch(0.94 0 0)' : 'oklch(0.96 0 0)')
                          : (i % 2 === 1 ? 'oklch(0.991 0.002 245)' : '#ffffff');
                        const shiftColor = isReturning
                          ? (i % 2 === 1 ? 'oklch(0.88 0 0)' : 'oklch(0.90 0 0)')
                          : (i % 2 === 1 ? 'oklch(0.940 0.028 10)' : 'oklch(0.955 0.025 10)');
                        if (!c.shift) return base;
                        const m = c.shift.match(/(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})/);
                        if (!m) return base;
                        const sH = +m[1], sM = +m[2];
                        let eH = +m[3], eM = +m[4];
                        if (c.shift.includes('翌')) eH = HOUR_END;
                        const sx = Math.max(0, (sH - HOUR_START) * 60 + sM) * pxPerMin;
                        const ex = Math.min((eH - HOUR_START) * 60 + eM, totalMin) * pxPerMin;
                        return `linear-gradient(to right, ${base} ${sx}px, ${shiftColor} ${sx}px, ${shiftColor} ${ex}px, ${base} ${ex}px)`;
                      })(),
                    }}
                  >
                    {Array.from({ length: totalMin / 5 + 1 }, (_, i) => {
                      const min = i * 5;
                      if (min > totalMin) return null;
                      return (
                        <div
                          key={min}
                          className={min % 60 === 0 ? 'grid-hour' : 'grid-5min'}
                          style={{ left: min * pxPerMin }}
                        />
                      );
                    })}
                    {hoverX !== null && (
                      <div style={{
                        position: 'absolute',
                        left: Math.floor(hoverX / (5 * pxPerMin)) * 5 * pxPerMin,
                        width: 5 * pxPerMin,
                        top: 0, bottom: 0,
                        background: 'rgba(80, 80, 80, 0.13)',
                        zIndex: 1,
                        pointerEvents: 'none',
                      }} />
                    )}
                    <ShiftBand cast={c} pxPerMin={pxPerMin} hourStart={HOUR_START} />
                    <ShiftEndBadge cast={c} pxPerMin={pxPerMin} hourStart={HOUR_START} hourEnd={HOUR_END} />
                    {bookings
                      .filter((b) => b.cast === c.id)
                      .map((b) => (
                        <BookingBlock
                          key={b.id}
                          b={b}
                          pxPerMin={pxPerMin}
                          hourStart={HOUR_START}
                          bodyFields={ganttBodyFields}
                          storeName={currentStore?.name || ''}
                          onEnter={() => setHover(b.id)}
                          onLeave={() => setHover(null)}
                          hovered={hover === b.id}
                          selected={quickView?.booking.id === b.id}
                          onSingleClick={() => {
                            if (quickView?.booking.id === b.id) {
                              setQuickView(null);
                              if (b.customer_id) setCustomerFloat({ customerId: b.customer_id, phone: b.cust_phone });
                              else openBooking(b.id);
                            } else {
                              setQuickView({ booking: b, castName: c.name });
                            }
                          }}
                          onDoubleClick={() => { setQuickView(null); openBooking(b.id); }}
                          onContextMenu={(e) => handleContextMenu(e, b.id)}
                        />
                      ))}
                  </div>
                </Fragment>
                );
              })}

              {nowX >= 0 && (
                <div
                  className="now-line-wrap"
                  style={{
                    gridColumn: 2,
                    gridRow: `2 / ${filteredCast.length + 2}`,
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

      {shiftInfoModal && (
        <ShiftInfoModal
          shiftId={shiftInfoModal.cast.shiftId}
          cast={shiftInfoModal.cast}
          date={todayDate}
          onClose={() => setShiftInfoModal(null)}
          onSaved={() => refresh()}
        />
      )}

      {castCtxMenu && (
        <CastContextMenu
          cast={castCtxMenu.cast}
          x={castCtxMenu.x}
          y={castCtxMenu.y}
          onClose={() => setCastCtxMenu(null)}
          onSaved={() => refresh()}
        />
      )}

      {ctxMenu && (
        <QuickEditMenu
          reservationId={ctxMenu.id}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={closeCtxMenu}
          onSaved={() => { closeCtxMenu(); refresh(); }}
        />
      )}

      {selectedKarteLadyId && (
        <KarteDetailPopup
          ladyId={selectedKarteLadyId}
          onClose={() => setSelectedKarteLadyId(null)}
        />
      )}

      {customerFloat && (
        <CustomerFloat
          customerId={customerFloat.customerId}
          phone={customerFloat.phone}
          onClose={() => setCustomerFloat(null)}
        />
      )}
    </div>
  );
}

function CastRow({ cast, rowH, onOpenKarte, attendanceStatuses = [], isAbsent = false, onShiftClick }) {
  const karteMap = useAppStore((s) => s.karteMap);
  const [memoOpen, setMemoOpen] = useState(false);
  const tagRef = useRef(null);

  const attSt = attendanceStatuses.find((s) => s.code === cast.attendanceStatus);
  const behavior = attSt?.behavior || 'none';
  const st = behavior !== 'none' && attSt
    ? { label: attSt.tag_label || attSt.label, fg: attSt.color, bg: attSt.color + '22' }
    : CAST_STATUS[cast.status] || CAST_STATUS.active;
  const showTag = behavior !== 'none';
  const hasMemo = !!cast.attendanceMemo;
  const dim = isAbsent ? { opacity: 0.35, filter: 'grayscale(1)' } : {};

  // karte テーブルのマップから写真URLを取得（lady_id で紐付け）
  const karteEntry = karteMap[cast.id];
  const coverUrl = karteEntry?.photo_url || null;

  const handleNameClick = (e) => {
    if (!karteEntry) return;
    e.stopPropagation();
    onOpenKarte?.(cast.id);
  };

  return (
    <div className="cast-row" style={{ height: rowH }}>
      <div className="cr-l">
        <div style={dim}>
          <Avatar name={cast.name} size={30} hue={cast.hue} src={coverUrl || undefined} />
        </div>
        <div className="cr-body">
          <div className="cr-top">
            <span
              className="cr-name"
              style={{ ...(karteEntry ? { cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' } : {}), ...dim }}
              onClick={handleNameClick}
              title={karteEntry ? 'カルテを開く' : undefined}
            >
              {cast.name}
            </span>
            {showTag && (
              <span style={{ position: 'relative' }}>
                <span
                  ref={tagRef}
                  className="cr-status"
                  style={{ color: st.fg, background: st.bg, cursor: hasMemo ? 'pointer' : undefined }}
                  title={hasMemo ? 'メモを開く' : undefined}
                  onClick={hasMemo ? (e) => { e.stopPropagation(); setMemoOpen((v) => !v); } : undefined}
                >{st.label}{hasMemo && ' 📝'}</span>
                {memoOpen && hasMemo && (
                  <MemoPopup memo={cast.attendanceMemo} onClose={() => setMemoOpen(false)} anchorRef={tagRef} />
                )}
              </span>
            )}
          </div>
          <div className="cr-mid" style={dim}>
            <span
              className="cr-shift mono"
              style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
              onClick={(e) => { e.stopPropagation(); onShiftClick?.(); }}
              title="出勤情報を編集"
            >{cast.shift}</span>
            {cast.count > 0 && <span className="cr-count">{cast.count}本</span>}
          </div>
          {cast.memo && <div className="cr-memo" style={dim}>{cast.memo}</div>}
        </div>
      </div>
    </div>
  );
}

function ShiftBand({ cast, pxPerMin, hourStart }) {
  if (!cast.shift) return null;
  const m = cast.shift.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const sH = +m[1], sM = +m[2];
  const sx = Math.max(0, (sH - hourStart) * 60 + sM) * pxPerMin;
  return (
    <div style={{
      position: 'absolute', left: sx + 4, top: 3, zIndex: 5,
      pointerEvents: 'none', fontSize: 9, fontWeight: 700,
      fontFamily: "'JetBrains Mono', monospace",
      color: 'oklch(0.45 0.10 10)', lineHeight: 1,
    }}>
      {`${sH}:${String(sM).padStart(2, '0')}`}
    </div>
  );
}

const END_BADGE = {
  agari:     { bg: 'oklch(0.90 0.06 15)',  fg: 'oklch(0.40 0.14 15)',  label: 'Up' },
  reception: { bg: 'oklch(0.88 0.06 220)', fg: 'oklch(0.32 0.12 220)', label: '受' },
};

function ShiftEndBadge({ cast, pxPerMin, hourStart, hourEnd }) {
  if (!cast.shift) return null;
  const m = cast.shift.match(/(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let eH = +m[3], eM = +m[4];
  if (cast.shift.includes('翌')) eH = hourEnd;
  const min = (eH - hourStart) * 60 + eM;
  if (min <= 0 || min > (hourEnd - hourStart) * 60) return null;
  const x = min * pxPerMin;
  const bs = END_BADGE[cast.endBadge] || END_BADGE.agari;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - 13,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 26, height: 26,
        borderRadius: '50%',
        background: bs.bg,
        color: bs.fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 800,
        zIndex: 4,
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
        pointerEvents: 'none',
      }}
      title={bs.label === 'Up' ? '上がり' : '受付'}
    >
      {bs.label}
    </div>
  );
}

function BookingBlock({ b, pxPerMin, hourStart, bodyFields = [], storeName = '', onEnter, onLeave, hovered, selected, onSingleClick, onDoubleClick, onContextMenu }) {
  const s = toMin(b.start) - hourStart * 60;
  let e = toMin(b.end) - hourStart * 60;
  if (e <= s) e += 24 * 60;
  const w = Math.max((e - s) * pxPerMin, 4);
  const durMin = e - s;
  const st = STATUS[b.status] || STATUS.reserved;
  const clickTimer = useRef(null);

  const visibleBody = bodyFields.filter(f => f.visible);

  const handleClick = (e) => {
    e.stopPropagation();
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onDoubleClick?.();
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      onSingleClick?.();
    }, 220);
  };

  return (
    <div
      className="book-block"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      style={{
        left: s * pxPerMin,
        width: w,
        background: st.bg,
        borderLeft: `3px solid ${st.line}`,
        color: st.fg,
        zIndex: selected ? 6 : hovered ? 5 : 2,
        cursor: 'pointer',
        outline: selected ? '2px solid oklch(0.55 0.18 245)' : 'none',
        outlineOffset: 1,
      }}
    >
      {selected && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 'inherit',
          background: 'oklch(0.55 0.18 245 / 0.15)',
          pointerEvents: 'none', zIndex: 1,
        }} />
      )}
      {/* 行1: 時間（固定） */}
      <div className="bb-time-row">
        <span className="mono">{b.start}</span>
        {w > 44 && <span className="mono">–{b.end}</span>}
        {w > 70 && <span className="bb-duration">（{durMin}分）</span>}
      </div>
      {/* 行2: ボディ項目（設定順） */}
      {w > 50 && visibleBody.length > 0 && (
        <div className="bb-body">
          {visibleBody.map(f => {
            if (f.key === 'status') return (
              <span key="status" className="bb-status">{st.label}</span>
            );
            const val = resolveBlockField(f.key, b, storeName);
            if (!val) return null;
            return (
              <span key={f.key} className={f.key === 'customer' ? 'bb-cust' : 'bb-course'}>
                {val}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MemoPopup({ memo, onClose, anchorRef }) {
  const popupRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={popupRef}
      style={{
        position: 'fixed', zIndex: 99999,
        top: pos.top, left: pos.left,
        minWidth: 180, maxWidth: 260,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
        padding: '10px 12px',
        fontSize: 12, color: 'var(--text)',
        whiteSpace: 'pre-wrap', lineHeight: 1.6,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {memo}
    </div>
  );
}
