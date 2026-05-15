import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useAppStore } from '../../store/state.js';
import { showToast } from '../../lib/toast.js';
import Icon from '../../components/Icon.jsx';

const BEHAVIOR_OPTIONS = [
  { value: 'none',           label: 'タグ非表示',  desc: '出勤確認前など、タグを表示しない' },
  { value: 'standby',        label: '待機中',      desc: '通常表示（緑タグ）' },
  { value: 'returning',      label: '退勤',        desc: 'グレーアウト・リスト下部に移動' },
  { value: 'absent',         label: '欠勤',        desc: 'グレーアウト・リスト下部・日報に欠勤反映' },
  { value: 'same_day_absent', label: '当日欠勤',   desc: 'グレーアウト・リスト下部・日報に欠勤反映（当日欠勤としてカウント）' },
];

const EMPTY = { code: '', label: '', tag_label: '', behavior: 'standby', color: '#64748b', sort_order: 0, is_active: true, has_memo: false };
const INP = {
  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

export default function ShiftAttendanceSettings() {
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const [rows, setRows] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('shift_attendance_statuses')
      .select('*')
      .or(currentStoreId ? `store_id.eq.${currentStoreId},store_id.is.null` : 'store_id.is.null')
      .order('sort_order');
    setRows(data || []);
  };

  useEffect(() => { load(); }, [currentStoreId]);

  const openNew = () => {
    setForm({ ...EMPTY, store_id: currentStoreId || null, sort_order: rows.length, code: `status_${Date.now()}` });
    setModal('new');
  };
  const openEdit = (row) => { setForm({ ...row }); setModal(row); };
  const close = () => setModal(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.label?.trim()) { showToast('error', '表示名は必須です'); return; }
    setSaving(true);
    const payload = {
      code: form.code.trim(),
      label: form.label.trim(),
      tag_label: form.tag_label?.trim() || form.label.trim(),
      behavior: form.behavior || 'standby',
      has_memo: !!form.has_memo,
      color: form.color || '#64748b',
      sort_order: Number(form.sort_order) || 0,
      is_active: !!form.is_active,
      store_id: currentStoreId || null,
    };
    let error;
    if (modal === 'new') {
      ({ error } = await supabase.from('shift_attendance_statuses').insert(payload));
    } else {
      ({ error } = await supabase.from('shift_attendance_statuses').update(payload).eq('id', modal.id));
    }
    setSaving(false);
    if (error) { showToast('error', error.message); return; }
    showToast('ok', '保存しました');
    load();
    close();
  };

  const del = async (row) => {
    const { error } = await supabase.from('shift_attendance_statuses').delete().eq('id', row.id);
    if (error) { showToast('error', '削除失敗: ' + error.message); return; }
    showToast('ok', '削除しました');
    load();
  };

  const swap = async (idxA, idxB) => {
    const a = rows[idxA], b = rows[idxB];
    await supabase.from('shift_attendance_statuses').update({ sort_order: b.sort_order }).eq('id', a.id);
    await supabase.from('shift_attendance_statuses').update({ sort_order: a.sort_order }).eq('id', b.id);
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>出勤状態</h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
            スケジュール画面のキャスト行を右クリックした際に表示される出勤状態の選択肢
          </p>
        </div>
        <button className="btn sm primary" onClick={openNew}>
          <Icon name="plus" size={13} /> 追加
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--line)' }}>
            <th style={TH}>表示名</th>
            <th style={TH}>タグ表示名</th>
            <th style={TH}>状態</th>
            <th style={TH}>色</th>
            <th style={TH}>有効</th>
            <th style={TH}>順</th>
            <th style={TH}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id} style={{ borderBottom: '1px solid var(--line-2)' }}>
              <td style={TD}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {!row.store_id && <span style={{ fontSize: 10, color: 'var(--muted)', marginRight: 2 }}>共通</span>}
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: row.color, display: 'inline-block' }} />
                  {row.label}
                </span>
              </td>
              <td style={TD}>
                {row.tag_label ? (
                  <span style={{
                    display: 'inline-block', padding: '2px 7px', borderRadius: 4,
                    background: row.color + '22', border: `1px solid ${row.color}`,
                    fontSize: 11, color: row.color, fontWeight: 600,
                  }}>{row.tag_label}</span>
                ) : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}
              </td>
              <td style={TD}>
                {(() => {
                  const b = BEHAVIOR_OPTIONS.find((o) => o.value === row.behavior);
                  return b ? (
                    <span title={b.desc} style={{ fontSize: 12, color: 'var(--text)' }}>{b.label}</span>
                  ) : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>;
                })()}
              </td>
              <td style={TD}>
                <span style={{
                  display: 'inline-block', width: 20, height: 20, borderRadius: 4,
                  background: row.color, border: '1px solid var(--border)',
                }} title={row.color} />
              </td>
              <td style={TD}>{row.is_active ? '✓' : '—'}</td>
              <td style={TD}>{row.sort_order}</td>
              <td style={{ ...TD, textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className="btn xs ghost" onClick={() => idx > 0 && swap(idx, idx - 1)} disabled={idx === 0}><Icon name="chevronU" size={11} /></button>
                  <button className="btn xs ghost" onClick={() => idx < rows.length - 1 && swap(idx, idx + 1)} disabled={idx === rows.length - 1}><Icon name="chevronD" size={11} /></button>
                  <button className="btn xs" onClick={() => openEdit(row)}>編集</button>
                  <button className="btn xs" onClick={() => del(row)} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>削除</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modal && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span style={{ fontWeight: 600 }}>{modal === 'new' ? '出勤状態を追加' : '出勤状態を編集'}</span>
              <button className="btn sm ghost" onClick={close}><Icon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              <FormRow label="表示名 *">
                <input style={INP} value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="出勤確認済" />
              </FormRow>
              <FormRow label="タグ表示名">
                <input style={INP} value={form.tag_label || ''} onChange={(e) => set('tag_label', e.target.value)} placeholder="表示名と同じ場合は空欄可" />
              </FormRow>
              <FormRow label="状態">
                <select style={INP} value={form.behavior || 'standby'} onChange={(e) => set('behavior', e.target.value)}>
                  {BEHAVIOR_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
                  ))}
                </select>
              </FormRow>
              <FormRow label="色">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="color" value={form.color} onChange={(e) => set('color', e.target.value)}
                    style={{ width: 40, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }} />
                  <input style={{ ...INP, width: 100 }} value={form.color} onChange={(e) => set('color', e.target.value)} placeholder="#64748b" />
                </div>
              </FormRow>
              <FormRow label="表示順">
                <input style={{ ...INP, width: 80 }} type="number" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
              </FormRow>
              <FormRow label="出勤状態メモ">
                <select style={INP} value={form.has_memo ? 'on' : 'off'} onChange={(e) => set('has_memo', e.target.value === 'on')}>
                  <option value="off">無効</option>
                  <option value="on">有効 — 状態変更時にメモを入力できる</option>
                </select>
              </FormRow>
              <FormRow label="有効">
                <input type="checkbox" checked={!!form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
              </FormRow>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button className="btn sm ghost" onClick={close}>キャンセル</button>
                <button className="btn sm primary" onClick={save} disabled={saving}>保存</button>
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
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', gap: 8 }}>
      <label style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</label>
      <div>{children}</div>
    </div>
  );
}
