import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { KARTE_CARD_FIELD_DEFS, getKarteCardFields, saveKarteCardFields, getLabelOverrides, saveLabelOverrides, getFixedLabel, getFixedKind } from '../../lib/karteFields.js';
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

export default function KarteSettings() {
  const [fixedVisible, setFixedVisible] = useState(getKarteCardFields);
  const [labelOverrides, setLabelOverrides] = useState(getLabelOverrides);
  const [customFields, setCustomFields] = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [fieldOptions, setFieldOptions] = useState([]);
  const [fieldModal, setFieldModal] = useState(null);
  const [fieldForm, setFieldForm] = useState({ label: '', field_type: 'text', kind: 'free' });
  const [fixedEditModal, setFixedEditModal] = useState(null);
  const [fixedEditForm, setFixedEditForm] = useState({ label: '', kind: 'free' });
  const [optModal, setOptModal] = useState(null);
  const [optForm, setOptForm] = useState({ label: '' });
  const [saving, setSaving] = useState(false);

  const loadCustomFields = async () => {
    const { data } = await supabase.from('karte_field_defs').select('*').order('sort_order');
    setCustomFields(data || []);
  };

  const loadOptions = async (key) => {
    const { data } = await supabase.from('karte_field_options').select('*').eq('field_key', key).order('sort_order');
    setFieldOptions(data || []);
  };

  useEffect(() => { loadCustomFields(); }, []);
  useEffect(() => { if (activeKey) loadOptions(activeKey); }, [activeKey]);

  const toggleFixed = (key) => {
    setFixedVisible(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveKarteCardFields(next);
      return next;
    });
  };

  const getFixedFieldType = (key) => {
    const v = labelOverrides[key];
    if (!v || typeof v === 'string') return 'text';
    return v.field_type || 'text';
  };

  const openEditFixed = (def) => {
    setFixedEditForm({ label: getFixedLabel(labelOverrides, def), kind: getFixedKind(labelOverrides, def), field_type: getFixedFieldType(def.key) });
    setFixedEditModal(def);
  };

  const saveFixedLabel = () => {
    const label = fixedEditForm.label.trim() || fixedEditModal.label;
    const next = { ...labelOverrides, [fixedEditModal.key]: { label, kind: fixedEditForm.kind, field_type: fixedEditForm.field_type } };
    saveLabelOverrides(next);
    setLabelOverrides(next);
    if (fixedEditForm.field_type === 'select') setActiveKey(fixedEditModal.key);
    setFixedEditModal(null);
    showToast('ok', '保存しました');
  };

  const toggleCustom = async (field) => {
    const { error } = await supabase.from('karte_field_defs')
      .update({ is_visible: !field.is_visible }).eq('id', field.id);
    if (!error) loadCustomFields();
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
      const field_key = `custom_${Date.now()}`;
      ({ error } = await supabase.from('karte_field_defs').insert({
        field_key,
        label: fieldForm.label.trim(),
        field_type: fieldForm.field_type,
        kind: fieldForm.kind,
        sort_order: customFields.length,
        is_visible: true,
      }));
    } else {
      ({ error } = await supabase.from('karte_field_defs')
        .update({ label: fieldForm.label.trim(), field_type: fieldForm.field_type, kind: fieldForm.kind })
        .eq('id', fieldModal.id));
    }
    setSaving(false);
    if (error) { showToast('error', error.message); return; }
    showToast('ok', '保存しました');
    setFieldModal(null);
    loadCustomFields();
  };

  const deleteField = async (field, e) => {
    e.stopPropagation();
    if (!window.confirm(`「${field.label}」を削除しますか？`)) return;
    await supabase.from('karte_field_defs').delete().eq('id', field.id);
    await supabase.from('karte_field_options').delete().eq('field_key', field.field_key);
    if (activeKey === field.field_key) { setActiveKey(null); setFieldOptions([]); }
    loadCustomFields();
  };

  const saveOption = async () => {
    if (!optForm.label.trim()) { showToast('error', '名前は必須です'); return; }
    setSaving(true);
    let error;
    if (optModal === 'new') {
      ({ error } = await supabase.from('karte_field_options').insert({
        field_key: activeKey, label: optForm.label.trim(), sort_order: fieldOptions.length,
      }));
    } else {
      ({ error } = await supabase.from('karte_field_options')
        .update({ label: optForm.label.trim() }).eq('id', optModal.id));
    }
    setSaving(false);
    if (error) { showToast('error', error.message); return; }
    showToast('ok', '保存しました');
    setOptModal(null);
    loadOptions(activeKey);
  };

  const deleteOption = async (opt) => {
    await supabase.from('karte_field_options').delete().eq('id', opt.id);
    loadOptions(activeKey);
  };

  const swapOpt = async (a, b) => {
    await supabase.from('karte_field_options').update({ sort_order: b.sort_order }).eq('id', a.id);
    await supabase.from('karte_field_options').update({ sort_order: a.sort_order }).eq('id', b.id);
    loadOptions(activeKey);
  };

  const activeFieldObj = customFields.find(f => f.field_key === activeKey);
  const activeFixedDef = KARTE_CARD_FIELD_DEFS.find(d => d.key === activeKey);
  const activeIsSelect = activeFieldObj?.field_type === 'select' || (activeFixedDef && getFixedFieldType(activeKey) === 'select');
  const activeLabel = activeFieldObj?.label ?? (activeFixedDef ? getFixedLabel(labelOverrides, activeFixedDef) : null);

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>レディカルテ設定</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 20px' }}>
        カルテカードに表示する項目を選択・追加します
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 220px', gap: 16 }}>
        {/* 左：フィールド一覧 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* 固定項目 */}
          <div>
            <SectionLabel label="固定項目" />
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {KARTE_CARD_FIELD_DEFS.map((def, idx) => {
                const isSelect = getFixedFieldType(def.key) === 'select';
                return (
                  <div key={def.key} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                    borderBottom: idx < KARTE_CARD_FIELD_DEFS.length - 1 ? '1px solid var(--line-2)' : 'none',
                    background: activeKey === def.key ? 'var(--halo-50)' : 'var(--surface)',
                  }}>
                    <input
                      type="checkbox"
                      checked={!!fixedVisible[def.key]}
                      onChange={() => toggleFixed(def.key)}
                      style={{ accentColor: 'var(--halo-500)', flexShrink: 0, cursor: 'pointer' }}
                    />
                    <span
                      style={{ fontSize: 13, flex: 1, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', cursor: isSelect ? 'pointer' : 'default' }}
                      onClick={() => isSelect && setActiveKey(def.key)}
                    >
                      {getFixedLabel(labelOverrides, def)}
                      {getFixedLabel(labelOverrides, def) !== def.label && (
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>({def.label})</span>
                      )}
                      {isSelect && <span style={{ fontSize: 10, color: 'var(--muted)' }}>選択式</span>}
                      {getFixedKind(labelOverrides, def) !== 'free' && (
                        <KindBadge kind={getFixedKind(labelOverrides, def)} />
                      )}
                    </span>
                    <button
                      className="btn xs ghost"
                      onClick={() => openEditFixed(def)}
                      style={{ padding: '2px 5px', flexShrink: 0 }}
                      title="名前を編集"
                    >
                      <Icon name="edit" size={10} />
                    </button>
                    {isSelect && <Icon name="chevronR" size={10} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* カスタム項目 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <SectionLabel label="カスタム項目" noMargin />
              <button className="btn xs" onClick={openAddField} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name="plus" size={10} />追加
              </button>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {customFields.length === 0 ? (
                <div style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  カスタム項目がありません
                </div>
              ) : customFields.map((field, idx) => (
                <div
                  key={field.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
                    borderBottom: idx < customFields.length - 1 ? '1px solid var(--line-2)' : 'none',
                    background: activeKey === field.field_key ? 'var(--halo-50)' : 'var(--surface)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={field.is_visible}
                    onChange={() => toggleCustom(field)}
                    style={{ accentColor: 'var(--halo-500)', flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span
                    style={{ fontSize: 13, flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', cursor: field.field_type === 'select' ? 'pointer' : 'default' }}
                    onClick={() => field.field_type === 'select' && setActiveKey(field.field_key)}
                  >
                    {field.label}
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                      {field.field_type === 'select' ? '選択式' : 'テキスト'}
                    </span>
                    <KindBadge kind={field.kind || 'free'} />
                  </span>
                  <button
                    className="btn xs ghost"
                    onClick={(e) => openEditField(field, e)}
                    style={{ padding: '2px 5px' }}
                  >
                    <Icon name="edit" size={10} />
                  </button>
                  <button
                    className="btn xs ghost"
                    onClick={(e) => deleteField(field, e)}
                    style={{ padding: '2px 5px', color: 'var(--danger)' }}
                  >
                    <Icon name="trash" size={10} />
                  </button>
                  {field.field_type === 'select' && (
                    <Icon name="chevronR" size={10} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  )}
                </div>
              ))}
            </div>

            <button
              className="btn sm ghost"
              onClick={openAddField}
              style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Icon name="plus" size={12} />フィールドを追加
            </button>
          </div>

          <p style={{ fontSize: 10, color: 'var(--muted)', margin: 0 }}>
            ※ 稼働状態・キャスト名は常に表示されます
          </p>
        </div>

        {/* 中：選択肢エディタ */}
        <div>
          {activeKey && activeIsSelect ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>「{activeLabel}」の選択肢</div>
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
                    <tr><td colSpan={2} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                      選択肢がありません
                    </td></tr>
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
              {customFields.some(f => f.field_type === 'select') || KARTE_CARD_FIELD_DEFS.some(d => getFixedFieldType(d.key) === 'select')
                ? '左の選択式フィールドをクリックして選択肢を管理'
                : 'カスタム項目を追加すると\nここで選択肢を設定できます'}
            </div>
          )}
        </div>
        {/* 右：プレビュー */}
        <div>
          <SectionLabel label="表示サンプル" />
          <KartePreviewCard
            fixedVisible={fixedVisible}
            labelOverrides={labelOverrides}
            customFields={customFields}
          />
        </div>
      </div>

      {/* 固定項目ラベル編集モーダル */}
      {fixedEditModal && (
        <div className="modal-overlay" onClick={() => setFixedEditModal(null)}>
          <div className="modal-panel" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span style={{ fontWeight: 600 }}>フィールドを編集</span>
              <button className="btn sm ghost" onClick={() => setFixedEditModal(null)}><Icon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FormRow label="名前 *">
                <input
                  style={INP}
                  value={fixedEditForm.label}
                  onChange={e => setFixedEditForm(f => ({ ...f, label: e.target.value }))}
                  placeholder={fixedEditModal.label}
                  autoFocus
                />
              </FormRow>
              <FormRow label="種類">
                <div>
                  <select
                    style={INP}
                    value={fixedEditForm.field_type}
                    onChange={e => setFixedEditForm(f => ({ ...f, field_type: e.target.value }))}
                  >
                    <option value="text">テキスト</option>
                    <option value="select">選択式</option>
                  </select>
                  {fixedEditForm.field_type === 'select' && (
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
                    value={fixedEditForm.kind}
                    onChange={e => setFixedEditForm(f => ({ ...f, kind: e.target.value }))}
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
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn sm ghost" onClick={() => setFixedEditModal(null)}>キャンセル</button>
                <button className="btn sm ghost" onClick={() => {
                  const next = { ...labelOverrides };
                  delete next[fixedEditModal.key];
                  saveLabelOverrides(next); setLabelOverrides(next); setFixedEditModal(null);
                }} style={{ color: 'var(--muted)' }}>リセット</button>
                <button className="btn sm primary" onClick={saveFixedLabel}>保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  placeholder="例：メモ、担当者"
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

      {/* 選択肢追加・編集モーダル */}
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

function SectionLabel({ label, noMargin }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--muted)',
      textTransform: 'uppercase', letterSpacing: 0.5,
      marginBottom: noMargin ? 0 : 6,
    }}>{label}</div>
  );
}

function FormRow({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', alignItems: 'flex-start', gap: 8 }}>
      <label style={{ fontSize: 13, color: 'var(--muted)', paddingTop: 7 }}>{label}</label>
      <div>{children}</div>
    </div>
  );
}

const MOCK_DATA = {
  カテゴリ: ['スリム', 'お話し上手', '穏やか'],
  身長3サイズ: '158cm / B86-W59-H87',
  長所: '笑顔が可愛い、トーク上手',
  似有名人: '広瀬すず',
  'duo対応': 'DUO可能',
  インバウンド対応: '対応可',
  プレイスタイル: 'プレイ重視',
};

function KartePreviewCard({ fixedVisible, labelOverrides, customFields }) {
  const fl = (key) => {
    const def = KARTE_CARD_FIELD_DEFS.find(d => d.key === key);
    return def ? getFixedLabel(labelOverrides, def) : key;
  };

  const specRows = [
    fixedVisible['長所']          && [fl('長所'),          MOCK_DATA.長所],
    fixedVisible['似有名人']       && [fl('似有名人'),       MOCK_DATA.似有名人],
    fixedVisible['プレイスタイル'] && [fl('プレイスタイル'), MOCK_DATA.プレイスタイル],
    fixedVisible['duo対応']       && [fl('duo対応'),        MOCK_DATA['duo対応']],
    fixedVisible['インバウンド対応'] && [fl('インバウンド対応'), MOCK_DATA.インバウンド対応],
  ].filter(Boolean);

  const visibleCustom = customFields.filter(f => f.is_visible);
  const hasAny = KARTE_CARD_FIELD_DEFS.some(d => fixedVisible[d.key]) || visibleCustom.length > 0;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', fontSize: 12, background: 'var(--surface)' }}>
      {/* ヘッダー */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-2)', display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>👤</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>サンプル 花子</div>
          {fixedVisible['身長3サイズ'] && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{MOCK_DATA.身長3サイズ}</div>
          )}
          <div style={{ marginTop: 5, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: '#16a34a22', color: '#16a34a' }}>出勤</span>
            {fixedVisible['rating'] && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: '#16a34a22', color: '#16a34a' }}>激推し</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!hasAny && (
          <div style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'center', padding: '8px 0' }}>表示項目なし</div>
        )}

        {fixedVisible['カテゴリ'] && (
          <PSection label={fl('カテゴリ')}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {MOCK_DATA.カテゴリ.map(c => (
                <span key={c} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--halo-50)', color: 'var(--halo-700)' }}>{c}</span>
              ))}
            </div>
          </PSection>
        )}

        {specRows.length > 0 && (
          <PSection label="スペック">
            <PGrid rows={specRows} />
          </PSection>
        )}

        {visibleCustom.length > 0 && (
          <PSection label="カスタム項目">
            <PGrid rows={visibleCustom.map(f => [f.label, '—'])} />
          </PSection>
        )}
      </div>
    </div>
  );
}

function PSection({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function PGrid({ rows }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px 8px', fontSize: 11 }}>
      {rows.map(([k, v]) => (
        <>
          <span key={k + '_k'} style={{ color: 'var(--muted)', fontWeight: 600 }}>{k}</span>
          <span key={k + '_v'}>{v}</span>
        </>
      ))}
    </div>
  );
}
