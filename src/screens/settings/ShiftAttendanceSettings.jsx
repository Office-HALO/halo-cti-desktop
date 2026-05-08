import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useAppStore } from '../../store/state.js';
import { showToast } from '../../lib/toast.js';
import Icon from '../../components/Icon.jsx';

const EMPTY = { code: '', label: '', color: '#64748b', sort_order: 0, is_active: true };
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
    setForm({ ...EMPTY, store_id: currentStoreId || null, sort_order: rows.length });
    setModal('new');
  };
  const openEdit = (row) => { setForm({ ...row }); setModal(row); };
  const close = () => setModal(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.code?.trim()) { showToast('error', 'コードは必須です'); return; }
    if (!form.label?.trim()) { showToast('error', '表示名は必須です'); return; }
    setSaving(true);
    const payload = {
      code: form.code.trim(),
      label: form.label.trim(),
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
            <th style={TH}>コード</th>
            <th style={TH}>表示名</th>
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
                <code style={{ fontSize: 11, background: 'var(--row-alt)', padding: '2px 6px', borderRadius: 4 }}>{row.code}</code>
                {!row.store_id && <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>共通</span>}
              </td>
              <td style={TD}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: row.color, display: 'inline-block' }} />
                  {row.label}
                </span>
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
              <FormRow label="コード *">
                <input style={INP} value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="confirmed" />
              </FormRow>
              <FormRow label="表示名 *">
                <input style={INP} value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="出勤確認済" />
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
