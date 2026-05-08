import { useState, useRef, useCallback } from 'react';
import { useHistoryCols } from '../../lib/historyCols.js';

const SAMPLE_ROWS = [
  { date: '2026/04/28(火)', start: '01:39', end: '03:19', operator: '岡田', phone: '+81903…', customer: '岸田 蓮矢', course: '70', lady: '中村 麻衣子', nomination: '本指名', extension: '30', option: 'オプA',   discount: '—',      transport: '¥3,000', hotel: 'グランヴィア', memo: '●', room_no: '667', amount: '¥41,000', status: '予約中'    },
  { date: '2026/04/27(月)', start: '18:45', end: '20:45', operator: '山田', phone: '+81903…', customer: '岸田 蓮矢', course: '90', lady: '一条 都',      nomination: 'ネット',  extension: '—',    option: '—',        discount: '-¥3,000', transport: '¥2,000', hotel: 'リッツ',     memo: '—',  room_no: '312', amount: '¥63,000', status: 'キャンセル' },
  { date: '2026/04/25(土)', start: '20:10', end: '21:10', operator: '岡田', phone: '+81903…', customer: '岸田 蓮矢', course: '60', lady: 'テストさん',   nomination: '—',       extension: '—',    option: 'オプB',   discount: '—',      transport: '—',      hotel: 'APA',        memo: '—',  room_no: '—',   amount: '¥28,000', status: '受領済'    },
];

function statusStyle(status) {
  if (status === 'キャンセル') return { color: '#991b1b', fontWeight: 700, fontSize: 11 };
  if (status === '予約中')     return { color: '#92400e', fontWeight: 700, fontSize: 11 };
  if (status === '受領済')     return { color: '#1e40af', fontWeight: 600, fontSize: 11 };
  return { fontSize: 11 };
}

function rowBg(status) {
  if (status === 'キャンセル') return '#fca5a5';
  if (status === '予約中')     return '#fde68a';
  return undefined;
}

const CELL = {
  date:       (r) => r.date,
  start:      (r) => r.start,
  end:        (r) => r.end,
  operator:   (r) => r.operator,
  phone:      (r) => r.phone,
  customer:   (r) => r.customer,
  course:     (r) => r.course,
  lady:       (r) => r.lady,
  nomination: (r) => r.nomination,
  extension:  (r) => r.extension,
  option:     (r) => r.option,
  discount:   (r) => r.discount,
  transport:  (r) => r.transport,
  hotel:      (r) => r.hotel,
  memo:       (r) => r.memo,
  room_no:    (r) => r.room_no,
  amount:     (r) => r.amount,
  status:     (r) => <span style={statusStyle(r.status)}>{r.status || '—'}</span>,
};

const MONO_COLS = new Set(['date', 'start', 'end', 'phone', 'room_no', 'amount', 'course', 'extension']);

const TH_BASE = {
  position: 'relative', padding: '3px 5px', whiteSpace: 'nowrap',
  overflow: 'hidden', textOverflow: 'ellipsis', userSelect: 'none',
  fontSize: 11, fontWeight: 700,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
};
const TD_BASE = {
  padding: '2px 5px', whiteSpace: 'nowrap', overflow: 'hidden',
  textOverflow: 'ellipsis', fontSize: 11,
  border: '1px solid var(--line)',
};

export default function HistoryColSettings() {
  const { visible, toggle, orderedDefs, visibleDefs, reorder, setColWidth, getColWidth } = useHistoryCols();

  // ── 列リスト ドラッグ並び替え ──
  const [draggingId,   setDraggingId]   = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const rowEls   = useRef({});
  const dragFrom = useRef(null);
  const dragTo   = useRef(null);

  const startDrag = useCallback((id, e) => {
    e.preventDefault();
    dragFrom.current = id;
    dragTo.current   = null;
    setDraggingId(id);
    function onMove(me) {
      for (const [rowId, el] of Object.entries(rowEls.current)) {
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (me.clientY >= rect.top && me.clientY <= rect.bottom) {
          dragTo.current = rowId; setDropTargetId(rowId); return;
        }
      }
      dragTo.current = null; setDropTargetId(null);
    }
    function onUp() {
      if (dragFrom.current && dragTo.current && dragFrom.current !== dragTo.current)
        reorder(dragFrom.current, dragTo.current);
      dragFrom.current = null; dragTo.current = null;
      setDraggingId(null); setDropTargetId(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [reorder]);

  // ── 列幅リサイズ ──
  const resizeState = useRef(null);
  const startColResize = useCallback((id, e) => {
    e.preventDefault(); e.stopPropagation();
    resizeState.current = { id, startX: e.clientX, startW: getColWidth(id) };
    function onMove(me) {
      if (!resizeState.current) return;
      const { id, startX, startW } = resizeState.current;
      setColWidth(id, startW + me.clientX - startX);
    }
    function onUp() {
      resizeState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [getColWidth, setColWidth]);

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, gap: 0 }}>

      {/* ── 左: 列リスト ── */}
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--line)', overflowY: 'auto', padding: '20px 14px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>表示項目 / 並び順</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
          ✓ で表示切替、⠿ をドラッグして順序変更
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {orderedDefs.map((col) => {
            const on        = visible[col.id] !== false;
            const isOver    = dropTargetId === col.id && draggingId !== col.id;
            const isDragged = draggingId   === col.id;
            return (
              <div
                key={col.id}
                ref={(el) => { rowEls.current[col.id] = el; }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 8px', borderRadius: 6,
                  background:  isOver   ? 'var(--halo-100, #ede9fe)' : (on ? 'var(--halo-50, #f5f3ff)' : 'transparent'),
                  border:      '1px solid',
                  borderColor: isOver   ? 'var(--halo-400, #a78bfa)' : (on ? 'var(--halo-200, #ddd6fe)' : 'var(--line)'),
                  opacity:     isDragged ? 0.35 : 1,
                  userSelect:  'none',
                  transition:  'opacity .1s, background .1s, border-color .1s',
                }}
              >
                <span onMouseDown={(e) => startDrag(col.id, e)}
                  style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1, flexShrink: 0, cursor: draggingId ? 'grabbing' : 'grab' }}>⠿</span>
                <input type="checkbox" checked={on} onChange={() => toggle(col.id)}
                  style={{ width: 14, height: 14, accentColor: 'var(--halo-600, #7c3aed)', cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: on ? 'var(--text)' : 'var(--muted)' }}>
                  {col.label}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14, fontSize: 10, color: 'var(--muted)' }}>設定は自動保存されます</div>
      </div>

      {/* ── 右: プレビュー ── */}
      <div style={{ flex: 1, padding: '20px', overflowX: 'auto', overflowY: 'auto' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>プレビュー</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
          実際のテーブルの見た目です（サンプルデータ）
        </div>
        <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
          <table style={{ tableLayout: 'fixed', borderCollapse: 'collapse', minWidth: 'max-content' }}>
            <thead>
              <tr>
                {visibleDefs.map((col) => (
                  <th key={col.id} style={{ ...TH_BASE, width: getColWidth(col.id) }}>
                    {col.label}
                    <div onMouseDown={(e) => startColResize(col.id, e)}
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 1 }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SAMPLE_ROWS.map((row, i) => {
                const bg = rowBg(row.status);
                return (
                  <tr key={i}>
                    {visibleDefs.map((col) => (
                      <td key={col.id} style={{ ...TD_BASE, ...(MONO_COLS.has(col.id) ? { fontFamily: 'monospace' } : {}), ...(bg ? { background: bg } : {}) }}>
                        {CELL[col.id]?.(row) ?? '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
