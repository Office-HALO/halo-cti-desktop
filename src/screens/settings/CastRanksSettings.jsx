import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { showToast } from '../../lib/toast.js';
import { useAppStore } from '../../store/state.js';
import Icon from '../../components/Icon.jsx';
import MasterTable from '../../components/MasterTable.jsx';

const EMPTY = { code: '', label: '', display_order: 0 };
const INP = {
  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

export default function CastRanksSettings() {
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const stores = useAppStore((s) => s.stores);
  const [rows, setRows] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const currentStore = stores.find((s) => s.id === currentStoreId);

  const load = async () => {
    if (!currentStoreId) return;
    const { data } = await supabase.from('cast_ranks')
      .select('*').eq('store_id', currentStoreId).order('display_order');
    setRows(data || []);
  };

  useEffect(() => { load(); }, [currentStoreId]);

  const openNew = () => { setForm({ ...EMPTY, display_order: rows.length }); setModal('new'); };
  const openEdit = (row) => { setForm({ ...row }); setModal(row); };
  const close = () => setModal(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.code?.trim() || !form.label?.trim()) { showToast('error', 'コードとラベルは必須です'); return; }
    setSaving(true);
    const payload = {
      store_id: currentStoreId,
      code: form.code.trim(),
      label: form.label.trim(),
      display_order: Number(form.display_order) || 0,
    };
    let error;
    if (modal === 'new') {
      ({ error } = await supabase.from('cast_ranks').insert(payload));
    } else {
      ({ error } = await supabase.from('cast_ranks').update(payload).eq('id', modal.id));
    }
    setSaving(false);
    if (error) { showToast('error', error.message); return; }
    showToast('ok', '保存しました');
    load();
    close();
  };

  const del = async (row) => {
    if (!confirm(`「${row.label}」を削除しますか？\nこのランクに紐付くオプション価格も削除されます。`)) return;
    const { error } = await supabase.from('cast_ranks').delete().eq('id', row.id);
    if (error) { showToast('error', error.message); return; }
    showToast('ok', '削除しました');
    load();
  };

  const swap = async (idxA, idxB) => {
    const a = rows[idxA], b = rows[idxB];
    await supabase.from('cast_ranks').update({ display_order: b.display_order }).eq('id', a.id);
    await supabase.from('cast_ranks').update({ display_order: a.display_order }).eq('id', b.id);
    load();
  };

  if (!currentStoreId) {
    return <div style={{ padding: 24, color: 'var(--muted)', fontSize: 13 }}>店舗を選択してください</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>キャストランク</h2>
          {currentStore && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{currentStore.name}</div>}
        </div>
        <button className="btn sm primary" onClick={openNew}>
          <Icon name="plus" size={13} /> 追加
        </button>
      </div>

      <MasterTable
        rows={rows}
        columns={[
          { key: 'code', label: 'コード' },
          { key: 'label', label: 'ラベル' },
          { key: 'display_order', label: '順' },
        ]}
        onEdit={openEdit}
        onDelete={del}
        onMoveUp={(idx) => swap(idx, idx - 1)}
        onMoveDown={(idx) => swap(idx, idx + 1)}
        onAdd={openNew}
        addLabel="+ ランクを追加"
      />

      {modal && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span style={{ fontWeight: 600 }}>{modal === 'new' ? 'ランクを追加' : 'ランクを編集'}</span>
              <button className="btn sm ghost" onClick={close}><Icon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              <FormRow label="コード *">
                <input style={INP} value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="rank1" />
              </FormRow>
              <FormRow label="ラベル *">
                <input style={INP} value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="ランク1" />
              </FormRow>
              <FormRow label="表示順">
                <input style={{ ...INP, width: 80 }} type="number" value={form.display_order} onChange={(e) => set('display_order', e.target.value)} />
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
