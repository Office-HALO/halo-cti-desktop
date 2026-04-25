import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { showToast } from '../../lib/toast.js';
import { useAppStore } from '../../store/state.js';
import Icon from '../../components/Icon.jsx';
import MasterTable from '../../components/MasterTable.jsx';

const EMPTY = { code: '', name: '', display_order: 0, is_active: true };
const INP = {
  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

export default function StoresSettings() {
  const setStores = useAppStore((s) => s.setStores);
  const [rows, setRows] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('stores').select('*').order('display_order');
    setRows(data || []);
    if (data) setStores(data.filter((s) => s.is_active));
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm({ ...EMPTY, display_order: rows.length }); setModal('new'); };
  const openEdit = (row) => { setForm({ ...row }); setModal(row); };
  const close = () => setModal(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.code?.trim() || !form.name?.trim()) { showToast('error', 'コードと名前は必須です'); return; }
    setSaving(true);
    const payload = {
      code: form.code.trim(), name: form.name.trim(),
      display_order: Number(form.display_order) || 0,
      is_active: !!form.is_active,
    };
    let error;
    if (modal === 'new') {
      ({ error } = await supabase.from('stores').insert(payload));
    } else {
      ({ error } = await supabase.from('stores').update(payload).eq('id', modal.id));
    }
    setSaving(false);
    if (error) { showToast('error', error.message); return; }
    showToast('ok', '保存しました');
    load();
    close();
  };

  const del = async (row) => {
    if (!confirm(`「${row.name}」を削除しますか？\n関連するキャストランク・オプション等も全て削除されます。`)) return;
    const { error } = await supabase.from('stores').delete().eq('id', row.id);
    if (error) { showToast('error', error.message); return; }
    showToast('ok', '削除しました');
    load();
  };

  const swap = async (idxA, idxB) => {
    const a = rows[idxA], b = rows[idxB];
    await supabase.from('stores').update({ display_order: b.display_order }).eq('id', a.id);
    await supabase.from('stores').update({ display_order: a.display_order }).eq('id', b.id);
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>店舗</h2>
        <button className="btn sm primary" onClick={openNew}>
          <Icon name="plus" size={13} /> 追加
        </button>
      </div>

      <MasterTable
        rows={rows}
        columns={[
          { key: 'code', label: 'コード' },
          { key: 'name', label: '名前' },
          { key: 'is_active', label: '有効', render: (v) => v ? '✓' : '—' },
          { key: 'display_order', label: '順' },
        ]}
        onEdit={openEdit}
        onDelete={del}
        onMoveUp={(idx) => swap(idx, idx - 1)}
        onMoveDown={(idx) => swap(idx, idx + 1)}
      />

      {modal && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span style={{ fontWeight: 600 }}>{modal === 'new' ? '店舗を追加' : '店舗を編集'}</span>
              <button className="btn sm ghost" onClick={close}><Icon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              <FormRow label="コード *">
                <input style={INP} value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="main" />
              </FormRow>
              <FormRow label="名前 *">
                <input style={INP} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="本店" />
              </FormRow>
              <FormRow label="表示順">
                <input style={{ ...INP, width: 80 }} type="number" value={form.display_order} onChange={(e) => set('display_order', e.target.value)} />
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

function FormRow({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', gap: 8 }}>
      <label style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</label>
      <div>{children}</div>
    </div>
  );
}
