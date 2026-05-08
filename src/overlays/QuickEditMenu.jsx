import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';

const STATUS_OPTIONS = [
  { value: 'reserved', label: '予約' },
  { value: 'received', label: '受領済' },
  { value: 'working', label: '対応中' },
  { value: 'complete', label: '完了' },
  { value: 'hold', label: '仮予約' },
  { value: 'cancelled', label: 'キャンセル' },
];

export default function QuickEditMenu({ reservationId, x, y, onClose, onSaved }) {
  const ref = useRef(null);
  const [rsv, setRsv] = useState(null);
  const [groups, setGroups] = useState([]);
  const [itemsByGroup, setItemsByGroup] = useState({});
  const [selections, setSelections] = useState({});
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: rsvData } = await supabase
        .from('reservations')
        .select('*, customers(name)')
        .eq('id', reservationId)
        .maybeSingle();
      if (!rsvData) return;
      setRsv(rsvData);
      setStatus(rsvData.status || 'reserved');

      // Load groups with show_in_context_menu = 'show'
      const { data: allGroups } = await supabase
        .from('option_groups')
        .select('*')
        .eq('store_id', rsvData.store_id)
        .order('display_order');
      const ctxGroups = (allGroups || []).filter(g => (g.meta?.show_in_context_menu ?? 'show') === 'show');
      setGroups(ctxGroups);

      if (ctxGroups.length > 0) {
        const { data: items } = await supabase
          .from('option_items')
          .select('*')
          .in('group_id', ctxGroups.map(g => g.id))
          .eq('is_active', true)
          .order('display_order');
        const byGroup = {};
        for (const g of ctxGroups) byGroup[g.id] = [];
        for (const item of (items || [])) {
          if (byGroup[item.group_id]) byGroup[item.group_id].push(item);
        }
        setItemsByGroup(byGroup);

        // init selections from existing selected_items
        const initSel = {};
        for (const g of ctxGroups) {
          const dt = g.meta?.display_type;
          const isMulti = g.multi_select || dt === 'multi_select' || dt === 'multi_select_count';
          initSel[g.id] = isMulti ? new Set() : null;
        }
        for (const si of (rsvData.selected_items || [])) {
          const g = ctxGroups.find(g => g.id === si.group_id);
          if (!g) continue;
          const dt = g.meta?.display_type;
          const isMulti = g.multi_select || dt === 'multi_select' || dt === 'multi_select_count';
          if (isMulti) {
            if (!(initSel[g.id] instanceof Set)) initSel[g.id] = new Set();
            initSel[g.id].add(si.item_id);
          } else {
            initSel[g.id] = si.item_id;
          }
        }
        setSelections(initSel);
      }
    })();
  }, [reservationId]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Position: keep inside viewport
  const posStyle = { position: 'fixed', zIndex: 9999, left: x, top: y };

  const toggleItem = (groupId, itemId, isMulti) => {
    setSelections(prev => {
      if (isMulti) {
        const s = new Set(prev[groupId] instanceof Set ? prev[groupId] : []);
        s.has(itemId) ? s.delete(itemId) : s.add(itemId);
        return { ...prev, [groupId]: s };
      }
      return { ...prev, [groupId]: prev[groupId] === itemId ? null : itemId };
    });
  };

  const handleSave = async () => {
    if (!rsv) return;
    setSaving(true);

    // Merge updated ctx group selections back into full selected_items
    const ctxGroupIds = new Set(groups.map(g => g.id));
    const existingOther = (rsv.selected_items || []).filter(si => !ctxGroupIds.has(si.group_id));
    const newItems = [];
    for (const g of groups) {
      const sel = selections[g.id];
      if (!sel || (sel instanceof Set && sel.size === 0)) continue;
      const ids = sel instanceof Set ? [...sel] : [sel];
      for (const itemId of ids) {
        newItems.push({ item_id: itemId, group_id: g.id, kind: g.kind, name: itemsByGroup[g.id]?.find(i => i.id === itemId)?.name || '' });
      }
    }

    const { error } = await supabase
      .from('reservations')
      .update({ status, selected_items: [...existingOther, ...newItems] })
      .eq('id', reservationId);

    setSaving(false);
    if (error) { showToast('error', '保存失敗: ' + error.message); return; }
    showToast('ok', '更新しました');
    onSaved();
  };

  // Adjust position if near bottom/right edge
  const menuW = 260;

  return (
    <div
      ref={ref}
      style={{
        ...posStyle,
        width: menuW,
        background: 'var(--surface, #fff)',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        fontSize: 13,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-2, #f1f5f9)', background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          {rsv ? (rsv.customers?.name || '顧客未設定') : '読込中...'}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {rsv && (
        <div style={{ padding: '10px 14px', display: 'grid', gap: 10 }}>
          {/* Status */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>ステータス</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  style={{
                    padding: '3px 9px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: status === opt.value ? 'var(--halo-400, #60a5fa)' : 'var(--bg)',
                    color: status === opt.value ? '#fff' : 'var(--text)',
                    fontWeight: status === opt.value ? 700 : 400,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Groups */}
          {groups.map(g => {
            const items = itemsByGroup[g.id] || [];
            if (!items.length) return null;
            const sel = selections[g.id];
            const dt = g.meta?.display_type ?? 'select';
            const isMulti = g.multi_select || dt === 'multi_select' || dt === 'multi_select_count';
            return (
              <div key={g.id}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>{g.label}</div>
                {(dt === 'select' || dt === 'select_editable') && !isMulti ? (
                  <select
                    value={typeof sel === 'string' ? sel : ''}
                    onChange={e => setSelections(prev => ({ ...prev, [g.id]: e.target.value || null }))}
                    style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }}
                  >
                    <option value="">— なし —</option>
                    {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {items.map(item => {
                      const checked = sel instanceof Set ? sel.has(item.id) : sel === item.id;
                      return (
                        <label key={item.id} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                          border: '1px solid var(--border)',
                          background: checked ? 'var(--halo-400, #60a5fa)' : 'var(--bg)',
                          color: checked ? '#fff' : 'var(--text)', fontSize: 12,
                        }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleItem(g.id, item.id, isMulti)} style={{ display: 'none' }} />
                          {item.name}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', padding: '8px', borderRadius: 7, border: 'none',
              background: 'var(--halo-500, #3b82f6)', color: '#fff',
              fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer',
              marginTop: 2,
            }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      )}
    </div>
  );
}
