import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAppStore } from '../store/state.js';
import { showToast } from '../lib/toast.js';

export default function CastContextMenu({ cast, x, y, onClose, onSaved }) {
  const ref = useRef(null);
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const [statuses, setStatuses] = useState([]);
  const [selected, setSelected] = useState(cast.attendanceStatus || 'none');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('shift_attendance_statuses')
        .select('*')
        .or(currentStoreId ? `store_id.eq.${currentStoreId},store_id.is.null` : 'store_id.is.null')
        .eq('is_active', true)
        .order('sort_order');
      // store_id一致を優先、なければグローバル(null)を使用
      const seen = new Map();
      for (const row of (data || [])) {
        if (!seen.has(row.code) || row.store_id !== null) seen.set(row.code, row);
      }
      setStatuses([...seen.values()].sort((a, b) => a.sort_order - b.sort_order));
    })();
  }, [currentStoreId]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleSave = async () => {
    if (!cast.shiftId) return;
    setSaving(true);
    const { error } = await supabase
      .from('shifts')
      .update({ attendance_status: selected === 'none' ? null : selected })
      .eq('id', cast.shiftId);
    setSaving(false);
    if (error) { showToast('error', '保存失敗: ' + error.message); return; }
    showToast('ok', '出勤状態を更新しました');
    onSaved();
    onClose();
  };

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', zIndex: 9999,
        left: x, top: y,
        width: 200,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        fontSize: 13,
        overflow: 'hidden',
      }}
    >
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--line-2)',
        background: 'var(--bg-subtle)',
        fontWeight: 700, fontSize: 12,
      }}>
        出勤状態
      </div>
      <div style={{ padding: '6px 0' }}>
        {statuses.map((st) => (
          <label
            key={st.code}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', cursor: 'pointer',
              background: selected === st.code ? 'var(--halo-50)' : 'transparent',
            }}
          >
            <input
              type="radio"
              name="attendance"
              value={st.code}
              checked={selected === st.code}
              onChange={() => setSelected(st.code)}
              style={{ accentColor: st.color }}
            />
            <span style={{
              display: 'inline-block', width: 8, height: 8,
              borderRadius: '50%', background: st.color, flexShrink: 0,
            }} />
            <span>{st.label}</span>
          </label>
        ))}
      </div>
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--line-2)' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', padding: '7px', borderRadius: 6, border: 'none',
            background: 'var(--halo-500, #3b82f6)', color: '#fff',
            fontWeight: 700, fontSize: 12, cursor: saving ? 'wait' : 'pointer',
          }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}
