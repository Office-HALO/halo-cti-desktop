import { useState, useRef, useEffect } from 'react';

/**
 * カスタムコンボボックス（選択可能 + フリー入力 + キーボードナビゲーション）
 * Props:
 *   items      : [{ id, name }]
 *   value      : 選択中の item id (string | null)
 *   onChange   : (id | null) => void
 *   placeholder: string
 *   className  : string (input に適用)
 *   style      : object
 */
export default function Combobox({ items = [], value, onChange, placeholder, className, style }) {
  const [inputVal, setInputVal] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef = useRef(null);
  const listRef  = useRef(null);
  // IME対応: compositionend直後のEnterを無視するためのフラグ
  const isComposingRef        = useRef(false);
  const justFinishedComposing = useRef(false);

  // 外部 value が変わったら input テキストも同期
  useEffect(() => {
    const item = items.find(i => i.id === value);
    setInputVal(item?.name ?? '');
  }, [value, items]);

  // 絞り込み（入力がある場合のみフィルタ）
  const filtered = inputVal.trim()
    ? items.filter(i => i.name.toLowerCase().includes(inputVal.toLowerCase()) || i.name.includes(inputVal))
    : items;

  const select = (item) => {
    if (item?.disabled) return;
    onChange(item?.id || null);
    setInputVal(item?.name ?? '');
    setOpen(false);
    setHighlighted(-1);
  };

  const handleKeyDown = (e) => {
    // IME変換中、またはcompositionend直後のEnterは無視（macOSでの誤選択防止）
    const imeActive = isComposingRef.current || justFinishedComposing.current;

    if (!open) {
      if (e.key === 'ArrowDown' && !imeActive) { e.preventDefault(); setOpen(true); setHighlighted(0); return; }
      if (e.key === 'Enter'     && !imeActive) { e.preventDefault(); setOpen(true); setHighlighted(0); return; }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        if (imeActive) return;
        e.preventDefault();
        setHighlighted(h => { let n = h + 1; while (n < filtered.length && filtered[n]?.disabled) n++; return Math.min(n, filtered.length - 1); });
        break;
      case 'ArrowUp':
        if (imeActive) return;
        e.preventDefault();
        setHighlighted(h => { let n = h - 1; while (n >= 0 && filtered[n]?.disabled) n--; return Math.max(n, 0); });
        break;
      case 'Enter':
        if (imeActive) return; // IME確定中・直後は候補選択しない
        e.preventDefault();
        if (highlighted >= 0 && filtered[highlighted]) select(filtered[highlighted]);
        break;
      case 'Tab':
        if (highlighted >= 0 && filtered[highlighted]) { e.preventDefault(); select(filtered[highlighted]); }
        else setOpen(false);
        break;
      case 'Escape':
        setOpen(false);
        setHighlighted(-1);
        break;
      default:
        break;
    }
  };

  // ハイライト行を自動スクロール
  useEffect(() => {
    if (highlighted >= 0 && listRef.current) {
      listRef.current.children[highlighted]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted]);

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        ref={inputRef}
        className={className}
        value={inputVal}
        placeholder={placeholder || '— なし —'}
        style={style}
        autoComplete="off"
        onCompositionStart={() => { isComposingRef.current = true; }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          justFinishedComposing.current = true;
          // keydown(Enter)はcompositionendの直後に発火するため、1フレーム後にリセット
          setTimeout(() => { justFinishedComposing.current = false; }, 0);
        }}
        onChange={e => {
          setInputVal(e.target.value);
          setOpen(true);
          setHighlighted(e.target.value.trim() ? 0 : -1);
        }}
        onFocus={() => { setOpen(true); setHighlighted(-1); }}
        onBlur={() => {
          // クリックが先に走るよう少し遅延
          setTimeout(() => {
            setOpen(false);
            const matched = items.find(i => i.name === inputVal.trim());
            if (!matched) { onChange(null); setInputVal(''); }
          }, 160);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && filtered.length > 0 && (
        <div
          ref={listRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 2px)',
            left: 0, right: 0,
            zIndex: 9999,
            background: 'var(--surface, #fff)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 8,
            boxShadow: '0 6px 20px rgba(0,0,0,0.14)',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {filtered.map((item, i) => (
            <div
              key={item.id}
              onMouseDown={() => select(item)}
              onMouseEnter={() => !item.disabled && setHighlighted(i)}
              style={{
                padding: '8px 12px',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                fontSize: 13,
                color: item.disabled ? 'var(--muted, #94a3b8)' : 'var(--text, #1e293b)',
                background: !item.disabled && i === highlighted
                  ? 'var(--halo-100, #dbeafe)'
                  : 'transparent',
                fontWeight: !item.disabled && i === highlighted ? 600 : 400,
                borderRadius: i === 0 ? '8px 8px 0 0'
                  : i === filtered.length - 1 ? '0 0 8px 8px'
                  : 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span>{item.name}</span>
              {item.disabled && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#b91c1c', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                  NG
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
