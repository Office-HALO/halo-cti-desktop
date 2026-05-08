import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useAppStore } from '../../store/state.js';
import { showToast } from '../../lib/toast.js';

export default function ResvFormSettings() {
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const [fields, setFields] = useState([]);

  const loadFields = async () => {
    const { data } = await supabase
      .from('resv_form_fields')
      .select('*')
      .or(currentStoreId ? `store_id.eq.${currentStoreId},store_id.is.null` : 'store_id.is.null')
      .order('sort_order');
    // store_id 一致を優先（ShiftFormSettings と同パターン）
    const seen = new Map();
    for (const f of (data || [])) {
      if (!seen.has(f.field_key) || f.store_id !== null) seen.set(f.field_key, f);
    }
    const sorted = [...seen.values()].sort((a, b) => a.sort_order - b.sort_order);
    setFields(sorted);
  };

  useEffect(() => { loadFields(); }, [currentStoreId]);

  const toggleVisible = async (field) => {
    if (field.store_id === null && currentStoreId) {
      // グローバル定義をコピーして店舗用に作成
      const { error } = await supabase.from('resv_form_fields').insert({
        store_id: currentStoreId,
        field_key: field.field_key,
        label: field.label,
        field_type: field.field_type,
        is_visible: !field.is_visible,
        sort_order: field.sort_order,
      });
      if (error) { showToast('error', error.message); return; }
    } else {
      const { error } = await supabase.from('resv_form_fields')
        .update({ is_visible: !field.is_visible })
        .eq('id', field.id);
      if (error) { showToast('error', error.message); return; }
    }
    loadFields();
  };

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>予約フォーム設定</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px' }}>
        予約フォームで表示するフィールドを店舗ごとに管理します
      </p>

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxWidth: 360 }}>
        {fields.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            フィールドがありません
          </div>
        )}
        {fields.map((field, idx) => (
          <div
            key={field.field_key}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px',
              borderBottom: idx < fields.length - 1 ? '1px solid var(--line-2)' : 'none',
              background: 'var(--surface)',
            }}
          >
            <input
              type="checkbox"
              checked={field.is_visible}
              onChange={() => toggleVisible(field)}
              style={{ accentColor: 'var(--halo-500)' }}
            />
            <span style={{ fontSize: 13, flex: 1, color: field.is_visible ? 'var(--text)' : 'var(--muted)' }}>
              {field.label}
            </span>
            {!field.store_id && (
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>共通</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
