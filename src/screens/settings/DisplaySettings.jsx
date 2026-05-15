import { useState, useRef, useEffect } from 'react';
import { getGanttBodyFields, saveGanttBodyFields, resolveBlockField } from '../../lib/displaySettings.js';
import { BOOKING_STATUS } from '../../lib/bookingStatus.js';
import { showToast } from '../../lib/toast.js';
import Icon from '../../components/Icon.jsx';

const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180];
const TOTAL_GANTT_MIN = 14 * 60; // 840分（Schedule.jsx と同一基準）

function calcEnd(startH, startM, dur) {
  const t = startH * 60 + startM + dur;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export default function DisplaySettings() {
  const [bodyFields, setBodyFields] = useState(getGanttBodyFields);
  const [sampleDuration, setSampleDuration] = useState(90);
  const [sampleStatusKey, setSampleStatusKey] = useState('received');
  const previewRef = useRef(null);
  const [previewW, setPreviewW] = useState(0);

  // ドラッグ状態
  const dragIdx = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  useEffect(() => {
    if (!previewRef.current) return;
    const obs = new ResizeObserver(e => setPreviewW(e[0].contentRect.width));
    obs.observe(previewRef.current);
    return () => obs.disconnect();
  }, []);

  const save = (next) => {
    setBodyFields(next);
    saveGanttBodyFields(next);
    showToast('ok', '保存しました');
  };

  const toggleVisible = (idx) => {
    const next = bodyFields.map((f, i) => i === idx ? { ...f, visible: !f.visible } : f);
    save(next);
  };

  // ドラッグ & ドロップ
  const onDragStart = (e, idx) => {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(idx);
  };
  const onDrop = (e, toIdx) => {
    e.preventDefault();
    const fromIdx = dragIdx.current;
    if (fromIdx === null || fromIdx === toIdx) { setDragOver(null); return; }
    const next = [...bodyFields];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    dragIdx.current = null;
    setDragOver(null);
    save(next);
  };
  const onDragEnd = () => { dragIdx.current = null; setDragOver(null); };

  // プレビュー計算
  const pxPerMin = previewW > 0 ? previewW / TOTAL_GANTT_MIN : 0;
  const blockW = Math.max(sampleDuration * pxPerMin, 4);
  const endTime = calcEnd(18, 30, sampleDuration);

  // プレビュー用サンプル booking オブジェクト（実際の b と同構造）
  const sampleData = {
    start: '18:30', end: endTime,
    duration_min: sampleDuration,
    customer: '山田 花子', member_no: 'M-0042',
    phone_last4: '1234', cust_address: '大阪市北区1-1',
    status: 'reserved',
    course: 'Aコース', hotel: 'グランドカーム', room_no: '503',
    amount: 46000, fee_adj: 1840,
    payment: 'カード', advance_cash: 1000,
    first_media: 'net', send_driver: '田中', recv_driver: '鈴木',
    nomination: 'フリー', memo: 'サンプルメモ',
    items: [
      { kind: 'status',    name: '予約'        },
      { kind: 'option',    name: 'マッサージ'  },
      { kind: 'event',     name: 'バースデー'  },
      { kind: 'discount',  name: '初回割引'    },
      { kind: 'transport', name: '交通費'      },
      { kind: 'media',     name: 'ネット'      },
      { kind: 'hotel',     name: 'グランドカーム' },
      { kind: 'extension', name: '30分延長'    },
    ],
  };

  // プレビューブロック位置（18:30 = 570分から）
  const offsetMin = 9 * 60 + 30;
  const blockLeft = pxPerMin > 0
    ? Math.min(offsetMin * pxPerMin, Math.max(0, previewW - blockW - 2))
    : 0;

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>表示設定</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 24px' }}>
        各画面の表示項目をカスタマイズします。
      </p>

      <section>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>
          ガントチャート
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 24, alignItems: 'start' }}>

          {/* 左：設定リスト */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-2)' }}>予約ブロックの表示項目</div>

            {/* 時間行（固定・変更不可） */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px',
              borderRadius: '8px 8px 0 0',
              border: '1px solid var(--border)',
              borderBottom: 'none',
              background: 'var(--bg-subtle)',
            }}>
              <span style={{ fontSize: 11, color: 'var(--mutedest)', width: 16 }}>—</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>時刻・所要時間</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--mutedest)', background: 'var(--line)', borderRadius: 4, padding: '1px 6px' }}>固定</span>
            </div>

            {/* ボディ行（ドラッグ可） */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '0 0 8px 8px', overflow: 'visible' }}>
              {bodyFields.map((field, idx) => (
                <div
                  key={field.key}
                  draggable
                  onDragStart={e => onDragStart(e, idx)}
                  onDragOver={e => onDragOver(e, idx)}
                  onDrop={e => onDrop(e, idx)}
                  onDragEnd={onDragEnd}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px',
                    borderTop: '1px solid var(--line-2)',
                    background: dragOver === idx ? 'var(--halo-50)' : 'var(--surface)',
                    transition: 'background .1s',
                    cursor: 'grab',
                    userSelect: 'none',
                  }}
                >
                  {/* ドラッグハンドル */}
                  <span style={{ color: 'var(--mutedest)', cursor: 'grab', flexShrink: 0, display: 'flex' }}>
                    <Icon name="grid" size={12} />
                  </span>
                  <input
                    type="checkbox"
                    checked={field.visible}
                    onChange={() => toggleVisible(idx)}
                    onClick={e => e.stopPropagation()}
                    style={{ accentColor: 'var(--halo-500)', flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 13, color: field.visible ? 'var(--text)' : 'var(--muted)' }}>
                    {field.label}
                  </span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
              ドラッグで表示順を変更できます
            </p>
          </div>

          {/* 右：プレビュー */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>プレビュー</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>コース分数</span>
                <div className="btn-group">
                  {DURATION_OPTIONS.map(d => (
                    <button
                      key={d}
                      className={`btn xs${sampleDuration === d ? ' primary' : ''}`}
                      onClick={() => setSampleDuration(d)}
                      style={{ minWidth: 40, justifyContent: 'center' }}
                    >
                      {d}分
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ステータス切替 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>ステータス</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {Object.entries(BOOKING_STATUS).map(([key, st]) => (
                  <button
                    key={key}
                    onClick={() => setSampleStatusKey(key)}
                    style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                      border: `1px solid ${sampleStatusKey === key ? st.line : 'transparent'}`,
                      background: st.bg,
                      fontWeight: sampleStatusKey === key ? 700 : 400,
                      outline: sampleStatusKey === key ? `2px solid ${st.line}` : 'none',
                    }}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* レーン */}
            <div
              ref={previewRef}
              style={{
                position: 'relative', height: 64,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8, overflow: 'hidden',
              }}
            >
              {/* 1時間グリッド */}
              {previewW > 0 && Array.from({ length: 13 }, (_, i) => (
                <div key={i} style={{
                  position: 'absolute', left: (i + 1) * (previewW / 14),
                  top: 0, bottom: 0, borderLeft: '1px solid var(--line-2)', pointerEvents: 'none',
                }} />
              ))}

              {/* ブロック */}
              {pxPerMin > 0 && (() => {
                const st = BOOKING_STATUS[sampleStatusKey];
                return (
                  <div
                    className="book-block"
                    style={{
                      left: blockLeft, width: blockW,
                      background: st.bg,
                      borderLeft: `3px solid ${st.line}`,
                      color: 'var(--text)', cursor: 'default',
                    }}
                  >
                    {/* 行1: 時刻固定 */}
                    <div className="bb-time-row">
                      <span className="mono">{sampleData.start}</span>
                      {blockW > 44 && <span className="mono">–{sampleData.end}</span>}
                      {blockW > 70 && <span className="bb-duration">（{sampleDuration}分）</span>}
                    </div>
                    {/* 行2: ボディ */}
                    {blockW > 50 && (
                      <div className="bb-body">
                        {bodyFields.filter(f => f.visible).map(f => {
                          if (f.key === 'status') return (
                            <span key="status" className="bb-status">{st.label}</span>
                          );
                          const val = resolveBlockField(f.key, sampleData, 'KRO');
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
              })()}
            </div>

            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              ※ ブロック幅が狭い場合は項目が自動的に省略されます
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
