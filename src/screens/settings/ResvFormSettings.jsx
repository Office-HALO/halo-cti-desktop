import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useAppStore } from '../../store/state.js';
import { showToast } from '../../lib/toast.js';

const INPUT_TYPES = [
  { value: 'select',          label: '選択' },
  { value: 'multi_select',    label: '複数選択' },
  { value: 'select_editable', label: '選択（編集可）' },
  { value: 'number',          label: '数字のみ' },
  { value: 'text',            label: 'テキスト' },
  { value: 'textarea',        label: 'テキスト（複数行）' },
  { value: 'toggle',          label: 'トグル' },
  { value: 'datetime',        label: '日付+時間' },
  { value: 'button_group',    label: 'ボタン選択' },
];

const inputTypeLabel = (v) => INPUT_TYPES.find((t) => t.value === v)?.label ?? v;

const FIELD_KINDS = [
  '店舗', '媒体', '日時', 'キャスト', '指名', '初回フラグ',
  'コース', '延長', '交通費', 'ホテル', '部屋番号',
  'イベント', '受付方法', 'オプション', '支払方法', '割引', '備考',
  '送り / 迎えドライバー', '集合場所', '受付番号', '3P対応',
];

export default function ResvFormSettings() {
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const [fields, setFields] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});

  const loadFields = async () => {
    const { data } = await supabase
      .from('resv_form_fields')
      .select('*')
      .or(currentStoreId ? `store_id.eq.${currentStoreId},store_id.is.null` : 'store_id.is.null')
      .order('sort_order');
    const seen = new Map();
    for (const f of (data || [])) {
      if (!seen.has(f.field_key) || f.store_id !== null) seen.set(f.field_key, f);
    }
    setFields([...seen.values()].sort((a, b) => a.sort_order - b.sort_order));
  };

  useEffect(() => { loadFields(); }, [currentStoreId]);

  const ensureStoreRow = async (field) => {
    if (field.store_id !== null || !currentStoreId) return field;
    const { data, error } = await supabase.from('resv_form_fields').insert({
      store_id:   currentStoreId,
      field_key:  field.field_key,
      label:      field.label,
      field_kind: field.field_kind,
      field_type: field.field_type,
      input_type: field.input_type,
      is_visible: field.is_visible,
      sort_order: field.sort_order,
    }).select().single();
    if (error) { showToast('error', error.message); return null; }
    return data;
  };

  const toggleVisible = async (field) => {
    const row = await ensureStoreRow(field);
    if (!row) return;
    const { error } = await supabase.from('resv_form_fields')
      .update({ is_visible: !row.is_visible })
      .eq('id', row.id);
    if (error) { showToast('error', error.message); return; }
    loadFields();
  };

  const startEdit = (field) => {
    setEditingId(field.id);
    setDraft({ label: field.label, field_kind: field.field_kind || '', input_type: field.input_type || 'select' });
  };

  const cancelEdit = () => { setEditingId(null); setDraft({}); };

  const saveEdit = async (field) => {
    const row = await ensureStoreRow(field);
    if (!row) return;
    const { error } = await supabase.from('resv_form_fields')
      .update({ label: draft.label, field_kind: draft.field_kind, input_type: draft.input_type })
      .eq('id', row.id);
    if (error) { showToast('error', error.message); return; }
    showToast('success', '保存しました');
    setEditingId(null);
    loadFields();
  };

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>予約入力フォーム設定</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px' }}>
        予約入力画面に表示するフィールドの名前・種別・入力方式を管理します
      </p>

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {/* ヘッダー行 */}
        <div style={{
          display: 'grid', gridTemplateColumns: '32px 1fr 1fr 1fr 56px 60px',
          padding: '8px 12px', background: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border)',
          fontSize: 11, fontWeight: 700, color: 'var(--muted)', gap: 8,
        }}>
          <span>表示</span>
          <span>名前</span>
          <span>種別</span>
          <span>入力方式</span>
          <span />
          <span />
        </div>

        {fields.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            読み込み中...
          </div>
        )}

        {fields.map((field, idx) => {
          const isEditing = editingId === field.id;
          const isGlobal = !field.store_id;
          return (
            <div
              key={field.field_key}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 1fr 1fr 1fr 56px 60px',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderBottom: idx < fields.length - 1 ? '1px solid var(--line-2)' : 'none',
                background: isEditing ? 'var(--halo-50, #f5f3ff)' : 'var(--surface)',
              }}
            >
              {/* 表示トグル */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <input
                  type="checkbox"
                  checked={field.is_visible}
                  onChange={() => toggleVisible(field)}
                  style={{ accentColor: 'var(--halo-500)', width: 15, height: 15, cursor: 'pointer' }}
                />
              </div>

              {/* 名前 */}
              {isEditing ? (
                <input
                  value={draft.label}
                  onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                  style={{ fontSize: 12, padding: '4px 7px', border: '1px solid var(--halo-400)', borderRadius: 5, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                  autoFocus
                />
              ) : (
                <span style={{ fontSize: 13, color: field.is_visible ? 'var(--text)' : 'var(--muted)', fontWeight: 500 }}>
                  {field.label}
                </span>
              )}

              {/* 種別 */}
              {isEditing ? (
                <input
                  list={`kinds-${field.field_key}`}
                  value={draft.field_kind}
                  onChange={(e) => setDraft((d) => ({ ...d, field_kind: e.target.value }))}
                  placeholder="種別を入力..."
                  style={{ fontSize: 12, padding: '4px 7px', border: '1px solid var(--halo-400)', borderRadius: 5, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                />
              ) : (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {field.field_kind || '—'}
                </span>
              )}
              {isEditing && (
                <datalist id={`kinds-${field.field_key}`}>
                  {FIELD_KINDS.map((k) => <option key={k} value={k} />)}
                </datalist>
              )}

              {/* 入力方式 */}
              {isEditing ? (
                <select
                  value={draft.input_type}
                  onChange={(e) => setDraft((d) => ({ ...d, input_type: e.target.value }))}
                  style={{ fontSize: 12, padding: '4px 7px', border: '1px solid var(--halo-400)', borderRadius: 5, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                >
                  {INPUT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: 12 }}>
                  <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 4, background: 'var(--bg-subtle)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text)' }}>
                    {inputTypeLabel(field.input_type)}
                  </span>
                </span>
              )}

              {/* 共通バッジ */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                {isGlobal && (
                  <span style={{ fontSize: 10, color: 'var(--muted)', padding: '1px 5px', border: '1px solid var(--line)', borderRadius: 3 }}>共通</span>
                )}
              </div>

              {/* 操作ボタン */}
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                {isEditing ? (
                  <>
                    <button
                      onClick={() => saveEdit(field)}
                      style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: 'none', background: 'var(--halo-600, #7c3aed)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                    >保存</button>
                    <button
                      onClick={cancelEdit}
                      style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' }}
                    >✕</button>
                  </>
                ) : (
                  <button
                    onClick={() => startEdit(field)}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' }}
                  >編集</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
        ※ 共通フィールドを編集すると、この店舗専用の設定として保存されます
      </p>
    </div>
  );
}
