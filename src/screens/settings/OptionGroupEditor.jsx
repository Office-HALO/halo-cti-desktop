import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { showToast } from '../../lib/toast.js';
import { useAppStore } from '../../store/state.js';
import { KIND_DEFS } from '../../lib/pricing.js';
import Icon from '../../components/Icon.jsx';
import OptionItemEditor from './OptionItemEditor.jsx';

const INP = {
  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

const NO_PRICE_KINDS = new Set(['hotel', 'driver', 'media']);

export default function OptionGroupEditor({ kind }) {
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const kindDef = KIND_DEFS[kind] || {};

  const [groups, setGroups] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [itemsByGroup, setItemsByGroup] = useState({});
  const [rankPricesByItem, setRankPricesByItem] = useState({});
  const [expanded, setExpanded] = useState(null);

  // Group modal
  const [groupModal, setGroupModal] = useState(null);
  const [groupForm, setGroupForm] = useState({});

  // Item editor modal
  const [itemModal, setItemModal] = useState(null);

  const loadGroups = async () => {
    if (!currentStoreId) return;
    const { data } = await supabase.from('option_groups')
      .select('*').eq('store_id', currentStoreId).eq('kind', kind).order('display_order');
    const rows = data || [];
    setGroups(rows);
    if (rows.length > 0 && !expanded) setExpanded(rows[0].id);
  };

  const loadRanks = async () => {
    if (!currentStoreId) return;
    const { data } = await supabase.from('cast_ranks')
      .select('*').eq('store_id', currentStoreId).order('display_order');
    setRanks(data || []);
  };

  const loadItems = async (groupId) => {
    const { data: items } = await supabase.from('option_items')
      .select('*').eq('group_id', groupId).order('display_order');
    const rows = items || [];
    setItemsByGroup((prev) => ({ ...prev, [groupId]: rows }));

    const itemIds = rows.map((i) => i.id);
    if (itemIds.length > 0) {
      const { data: prices } = await supabase.from('option_item_rank_prices')
        .select('*').in('item_id', itemIds);
      const priceMap = {};
      (prices || []).forEach((p) => {
        if (!priceMap[p.item_id]) priceMap[p.item_id] = {};
        priceMap[p.item_id][p.cast_rank_id] = p.price;
      });
      setRankPricesByItem((prev) => ({ ...prev, ...priceMap }));
    }
  };

  useEffect(() => {
    setGroups([]);
    setItemsByGroup({});
    setExpanded(null);
    loadGroups();
    loadRanks();
  }, [currentStoreId, kind]);

  useEffect(() => {
    if (expanded) loadItems(expanded);
  }, [expanded]);

  // ── Group CRUD ──────────────────────────────────────────────
  const openGroupNew = () => {
    setGroupForm({
      label: kindDef.label || '',
      multi_select: !!(kindDef.multi),
      required: false,
      triple_multiplier: '2.0',
      display_order: String(groups.length),
    });
    setGroupModal('new');
  };

  const openGroupEdit = (g) => {
    setGroupForm({ ...g, triple_multiplier: String(g.triple_multiplier ?? '2.0'), display_order: String(g.display_order) });
    setGroupModal(g);
  };

  const closeGroupModal = () => setGroupModal(null);
  const setGF = (k, v) => setGroupForm((f) => ({ ...f, [k]: v }));

  const saveGroup = async () => {
    const payload = {
      store_id: currentStoreId, kind,
      label: (groupForm.label?.trim()) || kindDef.label || kind,
      required: !!groupForm.required,
      multi_select: !!groupForm.multi_select,
      triple_multiplier: parseFloat(groupForm.triple_multiplier) || 2.0,
      display_order: Number(groupForm.display_order) || 0,
    };
    let error;
    if (groupModal === 'new') {
      ({ error } = await supabase.from('option_groups').insert(payload));
    } else {
      ({ error } = await supabase.from('option_groups').update(payload).eq('id', groupModal.id));
    }
    if (error) { showToast('error', error.message); return; }
    showToast('ok', '保存しました');
    loadGroups();
    closeGroupModal();
  };

  const deleteGroup = async (g) => {
    if (!confirm(`「${g.label}」を削除しますか？\nアイテムも全て削除されます。`)) return;
    const { error } = await supabase.from('option_groups').delete().eq('id', g.id);
    if (error) { showToast('error', error.message); return; }
    showToast('ok', '削除しました');
    setExpanded(null);
    loadGroups();
  };

  // ── Item CRUD ───────────────────────────────────────────────
  const openItemNew = (groupId) => setItemModal({ groupId, item: null });
  const openItemEdit = (groupId, item) => setItemModal({ groupId, item });
  const closeItemModal = () => setItemModal(null);

  const saveItem = async (form, rankPriceForm) => {
    if (!form.name?.trim()) { showToast('error', '名前は必須です'); return; }
    const { groupId, item } = itemModal;

    let reward_mode = form.reward_mode;
    if (kind === 'nomination') reward_mode = 'first_vs_repeat';
    if (kind === 'transport' || kind === 'hotel' || kind === 'driver' || kind === 'media' || kind === 'discount') reward_mode = 'none';

    const payload = {
      group_id: groupId,
      name: form.name.trim(),
      display_order: Number(form.display_order) || 0,
      is_active: !!form.is_active,
      duration_min: form.duration_min !== '' ? Number(form.duration_min) : null,
      allow_zero_min: !!form.allow_zero_min,
      price_mode: form.price_mode || 'flat',
      price_flat: form.price_flat !== '' ? Number(form.price_flat) : null,
      reward_mode,
      reward_percent: form.reward_percent !== '' ? Number(form.reward_percent) : null,
      reward_flat: form.reward_flat !== '' ? Number(form.reward_flat) : null,
      reward_first: form.reward_first !== '' ? Number(form.reward_first) : null,
      reward_repeat: form.reward_repeat !== '' ? Number(form.reward_repeat) : null,
    };

    let savedItemId;
    let error;
    if (!item?.id) {
      const { data, error: e } = await supabase.from('option_items').insert(payload).select('id').single();
      error = e; savedItemId = data?.id;
    } else {
      ({ error } = await supabase.from('option_items').update(payload).eq('id', item.id));
      savedItemId = item.id;
    }
    if (error) { showToast('error', error.message); return; }

    if (form.price_mode === 'per_rank' && savedItemId) {
      const priceRows = Object.entries(rankPriceForm)
        .filter(([, v]) => v !== '' && v != null && !isNaN(Number(v)))
        .map(([cast_rank_id, price]) => ({ item_id: savedItemId, cast_rank_id, price: Number(price) }));
      if (priceRows.length > 0) {
        const { error: pe } = await supabase.from('option_item_rank_prices')
          .upsert(priceRows, { onConflict: 'item_id,cast_rank_id' });
        if (pe) { showToast('error', pe.message); return; }
      }
      const blankRankIds = Object.entries(rankPriceForm)
        .filter(([, v]) => v === '' || v == null)
        .map(([id]) => id);
      if (blankRankIds.length > 0) {
        await supabase.from('option_item_rank_prices')
          .delete().eq('item_id', savedItemId).in('cast_rank_id', blankRankIds);
      }
    }

    showToast('ok', '保存しました');
    loadItems(groupId);
    closeItemModal();
  };

  const deleteItem = async (groupId, item) => {
    if (!confirm(`「${item.name}」を削除しますか？`)) return;
    const { error } = await supabase.from('option_items').delete().eq('id', item.id);
    if (error) { showToast('error', error.message); return; }
    showToast('ok', '削除しました');
    loadItems(groupId);
  };

  if (!currentStoreId) {
    return <div style={{ padding: 24, color: 'var(--muted)', fontSize: 13 }}>店舗を選択してください</div>;
  }

  const showTripleMultiplier = kind === 'course' || kind === 'extension' || kind === 'event';
  const showMultiSelect = kindDef.multi || kind === 'event' || kind === 'option' || kind === 'discount';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{kindDef.label || kind}</h2>
        <button className="btn sm primary" onClick={openGroupNew}>
          <Icon name="plus" size={13} /> グループを追加
        </button>
      </div>

      {groups.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13,
          background: 'var(--surface)', borderRadius: 8, border: '1px dashed var(--border)',
        }}>
          グループが登録されていません
          <br />
          <button className="btn sm primary" style={{ marginTop: 12 }} onClick={openGroupNew}>
            + グループを作成
          </button>
        </div>
      )}

      {groups.map((g) => {
        const items = itemsByGroup[g.id] || [];
        const isExpanded = expanded === g.id;
        const showPrice = !NO_PRICE_KINDS.has(kind);

        const formatPrice = (item) => {
          if (!showPrice) return '—';
          if (item.price_mode === 'per_rank') return 'ランク別';
          if (item.price_flat != null) return `¥${Number(item.price_flat).toLocaleString()}`;
          return '—';
        };
        const formatReward = (item) => {
          switch (item.reward_mode) {
            case 'percent': return `${item.reward_percent ?? 0}%`;
            case 'flat': return `¥${Number(item.reward_flat ?? 0).toLocaleString()}`;
            case 'first_vs_repeat': return `初¥${Number(item.reward_first ?? 0).toLocaleString()} / 再¥${Number(item.reward_repeat ?? 0).toLocaleString()}`;
            case 'none': return '報酬なし';
            default: return '—';
          }
        };

        return (
          <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
            {/* Group header */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--surface)', cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setExpanded(isExpanded ? null : g.id)}
            >
              <Icon name={isExpanded ? 'chevronD' : 'chevronR'} size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{g.label}</span>
              {g.required && <Badge color="ok">必須</Badge>}
              {g.multi_select && <Badge color="halo">複数選択</Badge>}
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{items.length}件</span>
              <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 4 }}>
                <button className="btn sm ghost" onClick={() => openGroupEdit(g)}>
                  <Icon name="edit" size={12} />
                </button>
                <button className="btn sm ghost" style={{ color: 'var(--danger)' }} onClick={() => deleteGroup(g)}>
                  <Icon name="trash" size={12} />
                </button>
              </div>
            </div>

            {/* Items table */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid var(--line-2)' }}>
                {items.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-subtle)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--muted)', fontWeight: 600 }}>名前</th>
                        {showPrice && <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--muted)', fontWeight: 600 }}>価格</th>}
                        <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--muted)', fontWeight: 600 }}>報酬</th>
                        <th style={{ width: 80 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} style={{ borderTop: '1px solid var(--line-2)' }}>
                          <td style={{ padding: '8px 10px' }}>
                            {item.name}
                            {item.duration_min != null && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{item.duration_min}分</span>}
                            {!item.is_active && <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6, background: 'var(--bg-subtle)', padding: '1px 5px', borderRadius: 3 }}>非表示</span>}
                          </td>
                          {showPrice && <td style={{ padding: '8px 10px' }}>{formatPrice(item)}</td>}
                          <td style={{ padding: '8px 10px' }}>{formatReward(item)}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="btn sm ghost" onClick={() => openItemEdit(g.id, item)} style={{ marginRight: 4 }}>
                              <Icon name="edit" size={12} />
                            </button>
                            <button className="btn sm ghost" style={{ color: 'var(--danger)' }} onClick={() => deleteItem(g.id, item)}>
                              <Icon name="trash" size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {items.length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                    アイテムがありません
                  </div>
                )}
                <div style={{ padding: '8px 12px', borderTop: items.length > 0 ? '1px solid var(--line-2)' : 'none' }}>
                  <button className="btn sm ghost" onClick={() => openItemNew(g.id)} style={{ width: '100%' }}>
                    <Icon name="plus" size={12} /> アイテムを追加
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Group modal */}
      {groupModal && (
        <div className="modal-overlay" onClick={closeGroupModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span style={{ fontWeight: 600 }}>{groupModal === 'new' ? 'グループを追加' : 'グループを編集'}</span>
              <button className="btn sm ghost" onClick={closeGroupModal}><Icon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              <FormRow label="ラベル">
                <input style={INP} value={groupForm.label || ''} onChange={(e) => setGF('label', e.target.value)} />
              </FormRow>
              {showMultiSelect && (
                <FormRow label="複数選択">
                  <input type="checkbox" checked={!!groupForm.multi_select} onChange={(e) => setGF('multi_select', e.target.checked)} />
                </FormRow>
              )}
              {showTripleMultiplier && (
                <FormRow label="3P料金倍率">
                  <input style={{ ...INP, width: 90 }} type="number" step="0.1" value={groupForm.triple_multiplier || '2.0'} onChange={(e) => setGF('triple_multiplier', e.target.value)} />
                </FormRow>
              )}
              <FormRow label="必須選択">
                <input type="checkbox" checked={!!groupForm.required} onChange={(e) => setGF('required', e.target.checked)} />
              </FormRow>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button className="btn sm ghost" onClick={closeGroupModal}>キャンセル</button>
                <button className="btn sm primary" onClick={saveGroup}>保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Item editor */}
      {itemModal && (
        <OptionItemEditor
          kind={kind}
          ranks={ranks}
          item={itemModal.item}
          rankPrices={itemModal.item ? (rankPricesByItem[itemModal.item.id] || {}) : {}}
          onSave={saveItem}
          onClose={closeItemModal}
        />
      )}
    </div>
  );
}

function Badge({ color, children }) {
  const colors = {
    ok: { bg: 'var(--ok-50)', text: 'var(--ok)' },
    halo: { bg: 'var(--halo-50)', text: 'var(--halo-600)' },
  };
  const c = colors[color] || colors.halo;
  return (
    <span style={{ fontSize: 10, color: c.text, background: c.bg, padding: '2px 6px', borderRadius: 4 }}>
      {children}
    </span>
  );
}

function FormRow({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', alignItems: 'center', gap: 8 }}>
      <label style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</label>
      <div>{children}</div>
    </div>
  );
}
