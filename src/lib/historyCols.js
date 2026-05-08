import { useState, useEffect, useCallback } from 'react';

export const HISTORY_COL_DEFS = [
  { id: 'date',       label: '日付'        },
  { id: 'start',      label: '開始'        },
  { id: 'end',        label: '終了'        },
  { id: 'operator',   label: 'オペ'        },
  { id: 'phone',      label: '電話番号'    },
  { id: 'customer',   label: '顧客名'      },
  { id: 'course',     label: '基本'        },
  { id: 'lady',       label: 'キャスト'    },
  { id: 'nomination', label: '指名'        },
  { id: 'extension',  label: '延長'        },
  { id: 'option',     label: 'オプション'  },
  { id: 'discount',   label: '割引'        },
  { id: 'transport',  label: '交通費'      },
  { id: 'hotel',      label: '場所/ホテル' },
  { id: 'memo',       label: 'メモ'        },
  { id: 'room_no',    label: '部屋NO'      },
  { id: 'amount',     label: '合計'        },
  { id: 'status',     label: '状態'        },
];

export const DEFAULT_COL_WIDTHS = {
  date: 105, start: 44, end: 44, operator: 40, phone: 88, customer: 78,
  course: 36, lady: 78, nomination: 62, extension: 34, option: 66,
  discount: 58, transport: 58, hotel: 88, memo: 38, room_no: 52,
  amount: 66, status: 50,
};

const DEFAULT_ORDER = HISTORY_COL_DEFS.map((c) => c.id);

const LS_VIS    = 'halo_history_cols';
const LS_ORDER  = 'halo_history_cols_order';
const LS_WIDTHS = 'halo_history_col_widths';

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

export function useHistoryCols() {
  const [visible, setVisible] = useState(() =>
    load(LS_VIS, Object.fromEntries(HISTORY_COL_DEFS.map((c) => [c.id, true])))
  );
  const [order, setOrder] = useState(() => {
    const saved = load(LS_ORDER, null);
    if (!saved) return DEFAULT_ORDER;
    const extra = DEFAULT_ORDER.filter((id) => !saved.includes(id));
    return [...saved, ...extra];
  });
  const [colWidths, setColWidthsState] = useState(() => load(LS_WIDTHS, {}));

  useEffect(() => { localStorage.setItem(LS_VIS,    JSON.stringify(visible));    }, [visible]);
  useEffect(() => { localStorage.setItem(LS_ORDER,  JSON.stringify(order));      }, [order]);
  useEffect(() => { localStorage.setItem(LS_WIDTHS, JSON.stringify(colWidths));  }, [colWidths]);

  // カラムが追加されたとき（HMR含む）に order state へ反映
  useEffect(() => {
    setOrder((prev) => {
      const extra = DEFAULT_ORDER.filter((id) => !prev.includes(id));
      return extra.length > 0 ? [...prev, ...extra] : prev;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle    = useCallback((id) => setVisible((p) => ({ ...p, [id]: !p[id] })), []);
  const isVisible = useCallback((id) => visible[id] !== false, [visible]);

  const moveUp = useCallback((id) => {
    setOrder((prev) => {
      const i = prev.indexOf(id);
      if (i <= 0) return prev;
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((id) => {
    setOrder((prev) => {
      const i = prev.indexOf(id);
      if (i < 0 || i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  }, []);

  const reorder = useCallback((fromId, toId) => {
    setOrder((prev) => {
      const fromIdx = prev.indexOf(fromId);
      const toIdx   = prev.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
      const next = [...prev];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, fromId);
      return next;
    });
  }, []);

  const setColWidth = useCallback((id, w) =>
    setColWidthsState((prev) => ({ ...prev, [id]: Math.max(30, w) })), []);
  const getColWidth = useCallback((id) =>
    colWidths[id] ?? DEFAULT_COL_WIDTHS[id] ?? 80, [colWidths]);

  const orderedDefs = order
    .map((id) => HISTORY_COL_DEFS.find((c) => c.id === id))
    .filter(Boolean);
  const visibleDefs = orderedDefs.filter((c) => visible[c.id] !== false);

  return { visible, toggle, isVisible, order, orderedDefs, visibleDefs, moveUp, moveDown, reorder, setColWidth, getColWidth };
}
