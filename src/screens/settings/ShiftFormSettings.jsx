import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useAppStore } from '../../store/state.js';
import { showToast } from '../../lib/toast.js';
import Icon from '../../components/Icon.jsx';

const INP = {
  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

// 選択肢を持つフィールド
const SELECT_FIELDS = ['location', 'photo_diary', 'delay_type', 'waiting_location', 'delivery_location'];

export default function ShiftFormSettings() {
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const [fields, setFields] = useState([]);
  const [activeField, setActiveField] = useState(null); // 選択肢管理対象
  const [fieldOptions, setFieldOptions] = useState([]);
  const [optModal, setOptModal] = useState(null);
  const [optForm, setOptForm] = useState({ label: '', sort_order: 0 });
  const [saving, setSaving] = useState(false);

  const loadFields = async () => {
    const { data } = await supabase
      .from('shift_form_fields')
      .select('*')
      .or(currentStoreId ? `store_id.eq.${currentStoreId},store_id.is.null` : 'store_id.is.null')
      .order('sort_order');
    // store_id一致を優先
    const seen = new Map();
    for (const f of (data || [])) {
      if (!seen.has(f.field_key) || f.store_id !== null) seen.set(f.field_key, f);
    }
    const sorted = [...seen.values()].sort((a, b) => a.sort_order - b.sort_order);
    setFields(sorted);
    if (!activeField && sorted.length > 0) {
      const first = sorted.find(f => SELECT_FIELDS.includes(f.field_key));
      if (first) setActiveField(first.field_key);
    }
  };

  const loadOptions = async (fieldKey) => {
    if (!fieldKey) return;
    const { data } = await supabase
      .from('shift_field_options')
      .select('*')
      .or(currentStoreId ? `store_id.eq.${currentStoreId},store_id.is.null` : 'store_id.is.null')
      .eq('field_key', fieldKey)
      .order('sort_order');
    setFieldOptions(data || []);
  };

  useEffect(() => { loadFields(); }, [currentStoreId]);
  useEffect(() => { loadOptions(activeField); }, [activeField, currentStoreId]);

  const toggleVisible = async (field) => {
    if (field.store_id === null && currentStoreId) {
      // グローバル定義をコピーして店舗用に作成
      const { error } = await supabase.from('shift_form_fields').insert({
        store_id: currentStoreId,
        field_key: field.field_key,
        label: field.label,
        field_type: field.field_type,
        is_visible: !field.is_visible,
        sort_order: field.sort_order,
      });
      if (error) { showToast('error', error.message); return; }
    } else {
      const { error } = await supabase.from('shift_form_fields')
        .update({ is_visible: !field.is_visible })
        .eq('id', field.id);
      if (error) { showToast('error', error.message); return; }
    }
    loadFields();
  };

  const saveOptModal = async () => {
    if (!optForm.label?.trim()) { showToast('error', '名前は必須です'); return; }
    setSaving(true);
    const payload = {
      field_key: activeField,
      label: optForm.label.trim(),
      sort_order: Number(optForm.sort_order) || 0,
      is_active: true,
      store_id: currentStoreId || null,
    };
    let error;
    if (optModal === 'new') {
      ({ error } = await supabase.from('shift_field_options').insert(payload));
    } else {
      ({ error } = await supabase.from('shift_field_options').update(payload).eq('id', optModal.id));
    }
    setSaving(false);
    if (error) { showToast('error', error.message); return; }
    showToast('ok', '保存しました');
    setOptModal(null);
    loadOptions(activeField);
  };

  const delOption = async (opt) => {
    await supabase.from('shift_field_options').delete().eq('id', opt.id);
    loadOptions(activeField);
  };

  const swapOpt = async (idxA, idxB) => {
    const a = fieldOptions[idxA], b = fieldOptions[idxB];
    await supabase.from('shift_field_options').update({ sort_order: b.sort_order }).eq('id', a.id);
    await supabase.from('shift_field_options').update({ sort_order: a.sort_order }).eq('id', b.id);
    loadOptions(activeField);
  };

  const activeFieldLabel = fields.find(f => f.field_key === activeField)?.label || '';

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>出勤情報フォーム設定</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px' }}>
        キャスト行クリック時に表示されるフォームのフィールド表示・選択肢を管理します
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }}>
        {/* フィールド一覧 */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>フィールド</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {fields.map((field, idx) => (
              <div
                key={field.field_key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px',
                  borderBottom: idx < fields.length - 1 ? '1px solid var(--line-2)' : 'none',
                  background: activeField === field.field_key ? 'var(--halo-50)' : 'var(--surface)',
                  cursor: SELECT_FIELDS.includes(field.field_key) ? 'pointer' : 'default',
                }}
                onClick={() => SELECT_FIELDS.includes(field.field_key) && setActiveField(field.field_key)}
              >
                <input
                  type="checkbox"
                  checked={field.is_visible}
                  onChange={(e) => { e.stopPropagation(); toggleVisible(field); }}
                  style={{ accentColor: 'var(--halo-500)' }}
                />
                <span style={{ fontSize: 13, flex: 1, color: field.is_visible ? 'var(--text)' : 'var(--muted)' }}>
                  {field.label}
                </span>
                {SELECT_FIELDS.includes(field.field_key) && (
                  <Icon name="chevronR" size={10} style={{ color: 'var(--muted)' }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 選択肢管理 */}
        <div>
          {activeField && SELECT_FIELDS.includes(activeField) ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>「{activeFieldLabel}」の選択肢</div>
                <button className="btn sm primary" onClick={() => { setOptForm({ label: '', sort_order: fieldOptions.length }); setOptModal('new'); }}>
                  <Icon name="plus" size={12} />追加
                </button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)' }}>
                    <th style={TH}>名前</th>
                    <th style={TH}>有効</th>
                    <th style={TH}></th>
                  </tr>
                </thead>
                <tbody>
                  {fieldOptions.length === 0 && (
                    <tr><td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>選択肢がありません</td></tr>
                  )}
                  {fieldOptions.map((opt, idx) => (
                    <tr key={opt.id} style={{ borderBottom: '1px solid var(--line-2)' }}>
                      <td style={TD}>
                        {opt.label}
                        {!opt.store_id && <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>共通</span>}
                      </td>
                      <td style={TD}>{opt.is_active ? '✓' : '—'}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn xs ghost" disabled={idx === 0} onClick={() => swapOpt(idx, idx - 1)}><Icon name="chevronU" size={10} /></button>
                          <button className="btn xs ghost" disabled={idx === fieldOptions.length - 1} onClick={() => swapOpt(idx, idx + 1)}><Icon name="chevronD" size={10} /></button>
                          <button className="btn xs" onClick={() => { setOptForm({ label: opt.label, sort_order: opt.sort_order }); setOptModal(opt); }}>編集</button>
                          <button className="btn xs" onClick={() => delOption(opt)} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>削除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 8 }}>
              左のリストから選択肢を持つフィールドを選んでください
            </div>
          )}
        </div>
      </div>

      {optModal && (
        <div className="modal-overlay" onClick={() => setOptModal(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span style={{ fontWeight: 600 }}>{optModal === 'new' ? '選択肢を追加' : '選択肢を編集'}</span>
              <button className="btn sm ghost" onClick={() => setOptModal(null)}><Icon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              <FormRow label="名前 *">
                <input style={INP} value={optForm.label} onChange={(e) => setOptForm(f => ({ ...f, label: e.target.value }))} placeholder="例：アパホテル" />
              </FormRow>
              <FormRow label="表示順">
                <input style={{ ...INP, width: 80 }} type="number" value={optForm.sort_order} onChange={(e) => setOptForm(f => ({ ...f, sort_order: e.target.value }))} />
              </FormRow>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button className="btn sm ghost" onClick={() => setOptModal(null)}>キャンセル</button>
                <button className="btn sm primary" onClick={saveOptModal} disabled={saving}>保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TH = { padding: '6px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)' };
const TD = { padding: '8px 10px' };

function FormRow({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', alignItems: 'center', gap: 8 }}>
      <label style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</label>
      <div>{children}</div>
    </div>
  );
}
