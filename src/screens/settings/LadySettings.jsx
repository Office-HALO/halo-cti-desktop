import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { showToast } from '../../lib/toast.js';
import Icon from '../../components/Icon.jsx';

const INP = {
  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

const KIND_DEFS = {
  free:       { label: '汎用',          color: '#94a3b8' },
  profile:    { label: 'プロフィール',   color: '#6366f1' },
  cast_rank:  { label: 'キャストランク', color: '#a855f7' },
  attribute:  { label: '属性・特徴',     color: '#10b981' },
  note:       { label: 'メモ・備考',     color: '#f59e0b' },
  link:       { label: '連携情報',       color: '#3b82f6' },
  course:     { label: 'コース',         color: '#ec4899' },
  nomination: { label: '指名',           color: '#f43f5e' },
  option:     { label: 'オプション',     color: '#8b5cf6' },
  report:     { label: '日報集計',       color: '#06b6d4' },
};

function KindBadge({ kind }) {
  const def = KIND_DEFS[kind] || KIND_DEFS.free;
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 10,
      background: def.color + '22', color: def.color, whiteSpace: 'nowrap', flexShrink: 0,
    }}>{def.label}</span>
  );
}

export default function LadySettings() {
  const [fields, setFields] = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [fieldOptions, setFieldOptions] = useState([]);
  const [fieldModal, setFieldModal] = useState(null);
  const [fieldForm, setFieldForm] = useState({ label: '', field_type: 'text', kind: 'free' });
  const [optModal, setOptModal] = useState(null);
  const [optForm, setOptForm] = useState({ label: '' });
  const [saving, setSaving] = useState(false);

  const loadFields = async () => {
    const { data } = await supabase.from('lady_form_fields').select('*').order('sort_order');
    setFields(data || []);
  };

  const loadOptions = async (key) => {
    const { data } = await supabase.from('lady_field_options').select('*').eq('field_key', key).order('sort_order');
    setFieldOptions(data || []);
  };

  useEffect(() => { loadFields(); }, []);
  useEffect(() => { if (activeKey) loadOptions(activeKey); }, [activeKey]);

  const toggleVisible = async (field) => {
    if (field.is_system) return;
    await supabase.from('lady_form_fields').update({ is_visible: !field.is_visible }).eq('id', field.id);
    loadFields();
  };

  const swapOrder = async (a, b) => {
    await supabase.from('lady_form_fields').update({ sort_order: b.sort_order }).eq('id', a.id);
    await supabase.from('lady_form_fields').update({ sort_order: a.sort_order }).eq('id', b.id);
    loadFields();
  };

  const openAddField = () => {
    setFieldForm({ label: '', field_type: 'text', kind: 'free' });
    setFieldModal('new');
  };

  const openEditField = (field, e) => {
    e.stopPropagation();
    setFieldForm({ label: field.label, field_type: field.field_type, kind: field.kind || 'free' });
    setFieldModal(field);
  };

  const saveField = async () => {
    if (!fieldForm.label.trim()) { showToast('error', '名前は必須です'); return; }
    setSaving(true);
    let error;
    if (fieldModal === 'new') {
      ({ error } = await supabase.from('lady_form_fields').insert({
        field_key: `custom_${Date.now()}`,
        label: fieldForm.label.trim(),
        field_type: fieldForm.field_type,
        kind: fieldForm.kind,
        sort_order: fields.length,
        is_visible: true,
        is_system: false,
      }));
    } else {
      ({ error } = await supabase.from('lady_form_fields')
        .update({ label: fieldForm.label.trim(), field_type: fieldForm.field_type, kind: fieldForm.kind })
        .eq('id', fieldModal.id));
    }
    setSaving(false);
    if (error) { showToast('error', error.message); return; }
    showToast('ok', '保存しました');
    setFieldModal(null);
    loadFields();
  };

  const deleteField = async (field, e) => {
    e.stopPropagation();
    if (!window.confirm(`「${field.label}」を削除しますか？`)) return;
    await supabase.from('lady_form_fields').delete().eq('id', field.id);
    await supabase.from('lady_field_options').delete().eq('field_key', field.field_key);
    if (activeKey === field.field_key) { setActiveKey(null); setFieldOptions([]); }
    loadFields();
  };

  const saveOption = async () => {
    if (!optForm.label.trim()) { showToast('error', '名前は必須です'); return; }
    setSaving(true);
    let error;
    if (optModal === 'new') {
      ({ error } = await supabase.from('lady_field_options').insert({
        field_key: activeKey, label: optForm.label.trim(), sort_order: fieldOptions.length,
      }));
    } else {
      ({ error } = await supabase.from('lady_field_options')
        .update({ label: optForm.label.trim() }).eq('id', optModal.id));
    }
    setSaving(false);
    if (error) { showToast('error', error.message); return; }
    showToast('ok', '保存しました');
    setOptModal(null);
    loadOptions(activeKey);
  };

  const deleteOption = async (opt) => {
    await supabase.from('lady_field_options').delete().eq('id', opt.id);
    loadOptions(activeKey);
  };

  const swapOpt = async (a, b) => {
    await supabase.from('lady_field_options').update({ sort_order: b.sort_order }).eq('id', a.id);
    await supabase.from('lady_field_options').update({ sort_order: a.sort_order }).eq('id', b.id);
    loadOptions(activeKey);
  };

  const activeFieldObj = fields.find(f => f.field_key === activeKey);

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>在籍女性 フォーム設定</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 20px' }}>
        女性編集フォームに表示する項目を管理します。表記名・管理名は常に表示されます。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
        {/* 左：フィールド一覧 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              フォーム項目
            </div>
            <button className="btn xs" onClick={openAddField} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="plus" size={10} />追加
            </button>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {fields.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>読み込み中...</div>
            ) : fields.map((field, idx) => (
              <div
                key={field.id}
                onClick={() => field.field_type === 'select' && setActiveKey(field.field_key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
                  borderBottom: idx < fields.length - 1 ? '1px solid var(--line-2)' : 'none',
                  background: activeKey === field.field_key ? 'var(--halo-50)' : 'var(--surface)',
                  cursor: field.field_type === 'select' ? 'pointer' : 'default',
                }}
              >
                <input
                  type="checkbox"
                  checked={field.is_visible}
                  onChange={() => toggleVisible(field)}
                  onClick={e => e.stopPropagation()}
                  disabled={field.is_system}
                  style={{ accentColor: 'var(--halo-500)', flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, flex: 1, minWidth: 0, color: field.is_visible ? 'var(--text)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  {field.label}
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                    {field.is_system ? '🔒' : field.field_type === 'select' ? '選択式' : field.field_type === 'textarea' ? '複数行' : 'テキスト'}
                  </span>
                  <KindBadge kind={field.kind || 'free'} />
                </span>
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button className="btn xs ghost" disabled={idx === 0} onClick={() => swapOrder(fields[idx], fields[idx - 1])} style={{ padding: '2px 4px' }}>
                    <Icon name="chevronD" size={9} style={{ transform: 'rotate(180deg)' }} />
                  </button>
                  <button className="btn xs ghost" disabled={idx === fields.length - 1} onClick={() => swapOrder(fields[idx], fields[idx + 1])} style={{ padding: '2px 4px' }}>
                    <Icon name="chevronD" size={9} />
                  </button>
                  {!field.is_system && (
                    <>
                      <button className="btn xs ghost" onClick={(e) => openEditField(field, e)} style={{ padding: '2px 5px' }}>
                        <Icon name="edit" size={10} />
                      </button>
                      <button className="btn xs ghost" onClick={(e) => deleteField(field, e)} style={{ padding: '2px 5px', color: 'var(--danger)' }}>
                        <Icon name="trash" size={10} />
                      </button>
                    </>
                  )}
                  {field.field_type === 'select' && (
                    <Icon name="chevronR" size={10} style={{ color: 'var(--muted)', marginLeft: 2 }} />
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            className="btn sm ghost"
            onClick={openAddField}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Icon name="plus" size={12} />フィールドを追加
          </button>
          <p style={{ fontSize: 10, color: 'var(--muted)', margin: 0 }}>
            🔒 はシステム項目（表示/非表示のみ変更可）
          </p>
        </div>

        {/* 右：選択肢エディタ */}
        <div>
          {activeKey && activeFieldObj?.field_type === 'select' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>「{activeFieldObj.label}」の選択肢</div>
                <button
                  className="btn sm primary"
                  onClick={() => { setOptForm({ label: '' }); setOptModal('new'); }}
                >
                  <Icon name="plus" size={12} />追加
                </button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)' }}>
                    <th style={TH}>名前</th>
                    <th style={TH}></th>
                  </tr>
                </thead>
                <tbody>
                  {fieldOptions.length === 0 ? (
                    <tr><td colSpan={2} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>選択肢がありません</td></tr>
                  ) : fieldOptions.map((opt, idx) => (
                    <tr key={opt.id} style={{ borderBottom: '1px solid var(--line-2)' }}>
                      <td style={TD}>{opt.label}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn xs ghost" disabled={idx === 0} onClick={() => swapOpt(fieldOptions[idx], fieldOptions[idx - 1])}>
                            <Icon name="chevronD" size={10} style={{ transform: 'rotate(180deg)' }} />
                          </button>
                          <button className="btn xs ghost" disabled={idx === fieldOptions.length - 1} onClick={() => swapOpt(fieldOptions[idx], fieldOptions[idx + 1])}>
                            <Icon name="chevronD" size={10} />
                          </button>
                          <button className="btn xs" onClick={() => { setOptForm({ label: opt.label }); setOptModal(opt); }}>編集</button>
                          <button className="btn xs" onClick={() => deleteOption(opt)} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>削除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div style={{
              height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px dashed var(--border)', borderRadius: 10,
              color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 20,
            }}>
              {fields.some(f => f.field_type === 'select')
                ? '左の選択式フィールドをクリックして選択肢を管理'
                : '選択式フィールドを追加すると\nここで選択肢を設定できます'}
            </div>
          )}
        </div>
      </div>

      {/* フィールド追加・編集モーダル */}
      {fieldModal && (
        <div className="modal-overlay" onClick={() => setFieldModal(null)}>
          <div className="modal-panel" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span style={{ fontWeight: 600 }}>{fieldModal === 'new' ? 'フィールドを追加' : 'フィールドを編集'}</span>
              <button className="btn sm ghost" onClick={() => setFieldModal(null)}><Icon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FormRow label="名前 *">
                <input
                  style={INP}
                  value={fieldForm.label}
                  onChange={e => setFieldForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="例：出身地、血液型"
                  autoFocus
                />
              </FormRow>
              <FormRow label="種類">
                <div>
                  <select
                    style={{ ...INP, opacity: fieldForm.kind === 'cast_rank' ? 0.45 : 1 }}
                    value={fieldForm.kind === 'cast_rank' ? 'select' : fieldForm.field_type}
                    disabled={fieldForm.kind === 'cast_rank'}
                    onChange={e => setFieldForm(f => ({ ...f, field_type: e.target.value }))}
                  >
                    <option value="text">テキスト</option>
                    <option value="textarea">複数行テキスト</option>
                    <option value="select">選択式</option>
                  </select>
                  {fieldForm.kind === 'cast_rank' ? (
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                      ※ キャストランクマスタの選択肢が自動的に使用されます
                    </p>
                  ) : fieldForm.field_type === 'select' && (
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                      ※ 保存後に選択肢を追加できます
                    </p>
                  )}
                </div>
              </FormRow>
              <FormRow label="種別">
                <div>
                  <select
                    style={INP}
                    value={fieldForm.kind}
                    onChange={e => setFieldForm(f => ({ ...f, kind: e.target.value }))}
                  >
                    {Object.entries(KIND_DEFS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                    種別は将来的にフォームや集計への連携に使用されます
                  </p>
                </div>
              </FormRow>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button className="btn sm ghost" onClick={() => setFieldModal(null)}>キャンセル</button>
                <button className="btn sm primary" onClick={saveField} disabled={saving}>保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 選択肢モーダル */}
      {optModal && (
        <div className="modal-overlay" onClick={() => setOptModal(null)}>
          <div className="modal-panel" style={{ maxWidth: 340 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span style={{ fontWeight: 600 }}>{optModal === 'new' ? '選択肢を追加' : '選択肢を編集'}</span>
              <button className="btn sm ghost" onClick={() => setOptModal(null)}><Icon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FormRow label="名前 *">
                <input
                  style={INP}
                  value={optForm.label}
                  onChange={e => setOptForm(f => ({ ...f, label: e.target.value }))}
                  autoFocus
                />
              </FormRow>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn sm ghost" onClick={() => setOptModal(null)}>キャンセル</button>
                <button className="btn sm primary" onClick={saveOption} disabled={saving}>保存</button>
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
    <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', alignItems: 'flex-start', gap: 8 }}>
      <label style={{ fontSize: 13, color: 'var(--muted)', paddingTop: 7 }}>{label}</label>
      <div>{children}</div>
    </div>
  );
}
