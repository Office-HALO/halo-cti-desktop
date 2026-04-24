import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '../components/Icon.jsx';
import { supabase } from '../lib/supabase.js';
import { useAppStore } from '../store/state.js';
import { localDateStr } from '../lib/utils.js';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const SLOTS = 15;
const CAST_PALETTE = [
  '#FECACA', '#FED7AA', '#FDE68A', '#D9F99D', '#A7F3D0',
  '#99F6E4', '#BAE6FD', '#C7D2FE', '#DDD6FE', '#FBCFE8',
  '#FBC2EB', '#FCA5A5', '#FCD34D', '#86EFAC', '#7DD3FC',
];

function hashColor(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) >>> 0);
  return CAST_PALETTE[h % CAST_PALETTE.length];
}

function fmtHour(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hn = parseInt(h, 10);
  if (isNaN(hn)) return '';
  if (m === '00') return String(hn);
  if (m === '30') return hn + '.5';
  return `${hn}:${m}`;
}

function getHalfPeriod(offset) {
  const today = new Date();
  const baseIdx = today.getFullYear() * 24 + today.getMonth() * 2 + (today.getDate() <= 15 ? 0 : 1);
  const targetIdx = baseIdx + offset;
  const year = Math.floor(targetIdx / 24);
  const rem = ((targetIdx % 24) + 24) % 24;
  const month = Math.floor(rem / 2);
  const isFirst = rem % 2 === 0;
  const startDay = isFirst ? 1 : 16;
  const endDay = isFirst ? 15 : new Date(year, month + 1, 0).getDate();
  const mm = String(month + 1).padStart(2, '0');
  return {
    year, month, startDay, endDay,
    firstDate: `${year}-${mm}-${String(startDay).padStart(2, '0')}`,
    lastDate: `${year}-${mm}-${String(endDay).padStart(2, '0')}`,
    label: `${year}年${month + 1}月${isFirst ? '前半' : '後半'}（${startDay}〜${endDay}日）`,
  };
}

function buildGridHtml(ladies, shiftMap, rsvMap, dates, today) {
  const buildFixedRows = (shifts, dateStr) => {
    const nameCells = [];
    const timeCells = [];
    for (let i = 0; i < SLOTS; i++) {
      const entry = shifts[i];
      if (entry) {
        const { l, s } = entry;
        const bg = hashColor(l.id);
        const endMark = s.end_type === 'reception' ? 'あ' : '';
        const timeStr = `${fmtHour(s.start_time)}-${fmtHour(s.end_time)}${endMark}`;
        const ladyName = l.display_name || l.name;
        const rsv = rsvMap[dateStr]?.[l.id] || [];
        const rsvCnt = rsv.filter((r) => r.status === 'reserved').length;
        const visitCnt = rsv.filter((r) => r.status === 'visited').length;
        const badges =
          (rsvCnt ? `<span class="clg-rsv-dot">予${rsvCnt}</span>` : '') +
          (visitCnt ? `<span class="clg-visit-dot">来${visitCnt}</span>` : '');
        const rsvJson = encodeURIComponent(JSON.stringify(rsv.map((r) => ({
          custName: r.customers?.name || '—',
          status: r.status,
          time: (r.start_time || '').slice(0, 5) + (r.end_time ? '〜' + r.end_time.slice(0, 5) : ''),
          course: r.course || '',
        }))));
        const attrs = `data-lady="${ladyName}" data-date="${dateStr}" data-time="${timeStr}" data-rsv="${rsvJson}" data-cell="true"`;
        nameCells.push(`<div class="clg-cell clg-name-cell" style="background:${bg};" ${attrs}><span class="clg-cell-text">${ladyName}</span>${badges}</div>`);
        timeCells.push(`<div class="clg-cell clg-time-cell" style="background:${bg};" ${attrs}><span class="clg-cell-text">${timeStr}</span></div>`);
      } else {
        nameCells.push(`<div class="clg-cell clg-name-cell clg-slot-empty"></div>`);
        timeCells.push(`<div class="clg-cell clg-time-cell clg-slot-empty"></div>`);
      }
    }
    return (
      `<div class="clg-subrow clg-names-row">${nameCells.join('')}</div>` +
      `<div class="clg-subrow clg-times-row">${timeCells.join('')}</div>`
    );
  };

  const renderDateRow = (dateStr) => {
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    const d = parseInt(dateStr.slice(8));
    const isToday = dateStr === today;
    const dowCls = dow === 0 ? 'clg-sun' : dow === 6 ? 'clg-sat' : '';
    const todayCls = isToday ? 'clg-today' : '';

    const dayShifts = ladies
      .map((l) => ({ l, s: shiftMap[dateStr]?.[l.id] }))
      .filter((x) => x.s)
      .sort((a, b) => (a.s.start_time || '').localeCompare(b.s.start_time || ''));

    const amShifts = dayShifts.filter((x) => parseInt(x.s.start_time?.slice(0, 2) || '99') < 14);
    const pmShifts = dayShifts.filter((x) => parseInt(x.s.start_time?.slice(0, 2) || '99') >= 14);

    return `<div class="clg-day-row ${todayCls}">
      <div class="clg-date-col ${dowCls} ${todayCls}">
        <div class="clg-day">${d}</div>
        <div class="clg-dow">${WEEKDAYS[dow]}</div>
      </div>
      <div class="clg-shifts-col">
        ${buildFixedRows(amShifts, dateStr)}
        ${buildFixedRows(pmShifts, dateStr)}
      </div>
    </div>`;
  };

  let splitIdx = dates.length;
  const idx = dates.findIndex((d) => parseInt(d.slice(8)) > 15);
  if (idx >= 0) splitIdx = idx;

  const left = dates.slice(0, splitIdx).map(renderDateRow).join('');
  const right = dates.slice(splitIdx).map(renderDateRow).join('');

  return `<div class="clg-wrap"><div class="clg-two-col">
    <div class="clg-half-col">${left}</div>
    ${right ? `<div class="clg-half-col">${right}</div>` : ''}
  </div></div>`;
}

export default function Calendar() {
  const calYear = useAppStore((s) => s.calYear);
  const calMonth = useAppStore((s) => s.calMonth);
  const setCalYearMonth = useAppStore((s) => s.setCalYearMonth);
  const allLadies = useAppStore((s) => s.allLadies);
  const setAllLadies = useAppStore((s) => s.setAllLadies);
  const calHalfOffset = useAppStore((s) => s.calHalfOffset);
  const calViewMode = useAppStore((s) => s.calViewMode);

  const [viewMode, setViewMode] = useState(calViewMode || 'full');
  const [halfOffset, setHalfOffset] = useState(calHalfOffset || 0);
  const [gridHtml, setGridHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [popup, setPopup] = useState(null);
  const gridRef = useRef(null);

  const load = useCallback(async (year, month, mode, offset) => {
    setLoading(true);

    let ladies = allLadies;
    if (!ladies.length) {
      const { data } = await supabase
        .from('ladies')
        .select('id,display_name,name')
        .eq('is_active', true)
        .order('display_name');
      ladies = data || [];
      setAllLadies(ladies);
    }

    let firstDate, lastDate, lbl;
    if (mode === 'half') {
      const p1 = getHalfPeriod(offset);
      const p2 = getHalfPeriod(offset + 1);
      firstDate = p1.firstDate;
      lastDate = p2.lastDate;
      lbl = `${p1.label} + ${p2.label}`;
    } else {
      const mm = String(month + 1).padStart(2, '0');
      const lastD = new Date(year, month + 1, 0).getDate();
      firstDate = `${year}-${mm}-01`;
      lastDate = `${year}-${mm}-${lastD}`;
      lbl = `${year}年${month + 1}月`;
    }
    setLabel(lbl);

    const [{ data: shiftData }, { data: rsvData }] = await Promise.all([
      supabase.from('shifts').select('lady_id,shift_date,start_time,end_time,end_type')
        .gte('shift_date', firstDate).lte('shift_date', lastDate),
      supabase.from('reservations').select('lady_id,reserved_date,status,customers(name),start_time,end_time,course')
        .gte('reserved_date', firstDate).lte('reserved_date', lastDate)
        .in('status', ['reserved', 'visited']),
    ]);

    const shiftMap = {};
    (shiftData || []).forEach((s) => {
      (shiftMap[s.shift_date] ??= {})[s.lady_id] = s;
    });
    const rsvMap = {};
    (rsvData || []).forEach((r) => {
      if (!r.lady_id) return;
      (rsvMap[r.reserved_date] ??= {})[r.lady_id] ??= [];
      rsvMap[r.reserved_date][r.lady_id].push(r);
    });

    const start = new Date(firstDate + 'T00:00:00');
    const end = new Date(lastDate + 'T00:00:00');
    const dates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(localDateStr(new Date(d)));
    }

    setGridHtml(buildGridHtml(ladies, shiftMap, rsvMap, dates, localDateStr()));
    setLoading(false);
  }, [allLadies, setAllLadies]);

  useEffect(() => {
    load(calYear, calMonth, viewMode, halfOffset);
  }, [calYear, calMonth, viewMode, halfOffset]);

  // delegate click on grid
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const handler = (e) => {
      const cell = e.target.closest('[data-cell]');
      if (!cell) { setPopup(null); return; }
      const rect = cell.getBoundingClientRect();
      const rsvList = JSON.parse(decodeURIComponent(cell.dataset.rsv || '[]'));
      setPopup({
        lady: cell.dataset.lady,
        date: cell.dataset.date,
        time: cell.dataset.time,
        rsvList,
        x: rect.left,
        y: rect.bottom + 4,
      });
    };
    el.addEventListener('click', handler);
    return () => el.removeEventListener('click', handler);
  }, [gridHtml]);

  const nav = (offset) => {
    if (viewMode === 'half') {
      setHalfOffset((p) => p + offset);
    } else {
      let m = calMonth + offset;
      let y = calYear;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      setCalYearMonth(y, m);
    }
  };

  const today = new Date();
  const goToday = () => {
    if (viewMode === 'half') setHalfOffset(0);
    else setCalYearMonth(today.getFullYear(), today.getMonth());
  };

  return (
    <div className="cal-root">
      <div className="sched-datebar">
        <span className="sched-datestr" style={{ fontSize: 14 }}>{label}</span>
        <div className="btn-group">
          <button className="btn sm" onClick={() => nav(-1)}><Icon name="chevronL" size={12} />前</button>
          <button className="btn sm primary" onClick={goToday}><Icon name="refresh" size={12} />今月</button>
          <button className="btn sm" onClick={() => nav(1)}>次<Icon name="chevronR" size={12} /></button>
        </div>
        <button
          className={'btn sm' + (viewMode === 'half' ? ' primary' : '')}
          onClick={() => { setViewMode((m) => m === 'half' ? 'full' : 'half'); setHalfOffset(0); }}
        >
          {viewMode === 'half' ? '1ヶ月表示' : '半月表示'}
        </button>
        <button className="btn sm ghost" onClick={() => load(calYear, calMonth, viewMode, halfOffset)} style={{ marginLeft: 'auto' }}>
          <Icon name="refresh" size={12} />更新
        </button>
      </div>

      <div className="cal-scroll">
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>読み込み中...</div>
        ) : (
          <div
            ref={gridRef}
            dangerouslySetInnerHTML={{ __html: gridHtml }}
            onClick={() => {}}
          />
        )}
      </div>

      {popup && (
        <CellPopup popup={popup} onClose={() => setPopup(null)} />
      )}
    </div>
  );
}

function CellPopup({ popup, onClose }) {
  const style = {
    position: 'fixed',
    left: Math.min(popup.x, window.innerWidth - 272),
    top: Math.min(popup.y, window.innerHeight - 200),
    zIndex: 9000,
  };

  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.clg-popup')) onClose();
    };
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, [onClose]);

  return (
    <div className="clg-popup" style={style}>
      <div className="clg-popup-header">
        <strong>{popup.lady}</strong>
        <span style={{ marginLeft: 8, color: '#94A3B8', fontSize: 12 }}>{popup.date?.slice(5)} {popup.time}</span>
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>
      <div className="clg-popup-rsvs">
        {popup.rsvList.length === 0 ? (
          <div style={{ color: '#94A3B8', fontSize: 12 }}>予約なし</div>
        ) : popup.rsvList.map((r, i) => (
          <div key={i} className="clg-popup-rsv">
            <span className={'clg-popup-rsv-status' + (r.status === 'visited' ? ' visited' : '')}>
              {r.status === 'visited' ? '来店済' : '予約中'}
            </span>
            <span>{r.custName}</span>
            {r.time && <span style={{ color: '#94A3B8', fontSize: 11 }}>{r.time}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
