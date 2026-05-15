import { useState, useEffect } from 'react';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import Combobox from '../components/Combobox.jsx';
import { supabase } from '../lib/supabase.js';
import { useAppStore } from '../store/state.js';
import { showToast } from '../lib/toast.js';

const INP = {
  padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

const hashHue = (s) => {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

export default function Cast() {
  const allLadies = useAppStore((s) => s.allLadies);
  const setAllLadies = useAppStore((s) => s.setAllLadies);
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const [loading, setLoading] = useState(!allLadies.length);
  const [q, setQ] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('cast.viewMode') || 'grid');
  const [ranks, setRanks] = useState([]);

  useEffect(() => {
    if (!currentStoreId) return;
    supabase.from('cast_ranks').select('*').eq('store_id', currentStoreId).order('display_order')
      .then(({ data }) => setRanks(data || []));
  }, [currentStoreId]);

  const setView = (v) => { setViewMode(v); localStorage.setItem('cast.viewMode', v); };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('ladies').select('*').order('display_name');
    if (data) setAllLadies(data);
    setLoading(false);
  };

  useEffect(() => {
    if (!allLadies.length) load();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('ladies-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ladies' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = allLadies
    .filter((l) => {
      if (currentStoreId && l.store_id && l.store_id !== currentStoreId) return false;
      if (activeOnly && !l.is_active) return false;
      const kw = q.toLowerCase();
      if (kw && !((l.display_name || l.name || '').toLowerCase().includes(kw))) return false;
      return true;
    })
    // 在籍中を先頭に、退職済みを末尾に
    .sort((a, b) => {
      if (a.is_active === b.is_active) return 0;
      return a.is_active ? -1 : 1;
    });

  return (
    <div className="cast-screen-root">
      <div className="screen-toolbar">
        <div className="search-big" style={{ maxWidth: 260 }}>
          <Icon name="search" size={14} />
          <input placeholder="名前で検索" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="cast-toggle">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          在籍中のみ
        </label>
        <div className="chip blue">在籍中 {allLadies.filter((l) => l.is_active).length}</div>
        <div className="chip">全体 {allLadies.length}</div>
        <div className="btn-group" style={{ marginLeft: 'auto' }}>
          <button className={'btn sm' + (viewMode === 'grid' ? ' primary' : ' ghost')} onClick={() => setView('grid')} title="グリッド表示">
            <Icon name="grid" size={13} />
          </button>
          <button className={'btn sm' + (viewMode === 'list' ? ' primary' : ' ghost')} onClick={() => setView('list')} title="リスト表示">
            <Icon name="list" size={13} />
          </button>
        </div>
        <button className="btn sm ghost" onClick={load}>
          <Icon name="refresh" size={12} />更新
        </button>
        <button className="btn sm primary" onClick={() => setShowNew(true)}><Icon name="plus" size={12} />新規登録</button>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>キャストが見つかりません</div>
      ) : viewMode === 'grid' ? (
        <div className="cast-grid-scroll">
          <div className="cast-card-grid">
            {filtered.map((l) => (
              <CastCard key={l.id} lady={l} onClick={() => setSelected(l)} />
            ))}
          </div>
        </div>
      ) : (
        <div className="cast-grid-scroll">
          <CastListView ladies={filtered} ranks={ranks} onSelect={setSelected} />
        </div>
      )}

      {selected && (
        <LadyModal lady={selected} onClose={() => setSelected(null)} onSaved={load} />
      )}
      {showNew && (
        <LadyModal lady={null} onClose={() => setShowNew(false)} onSaved={load} />
      )}
    </div>
  );
}

function CastListView({ ladies, ranks, onSelect }) {
  const karteMap = useAppStore((s) => s.karteMap);
  const rankMap = Object.fromEntries(ranks.map((r) => [r.id, r.label]));

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: 'var(--bg-subtle)', position: 'sticky', top: 0, zIndex: 1 }}>
          <th style={TH}>表記名</th>
          <th style={TH}>管理名</th>
          <th style={TH}>ヨミガナ</th>
          <th style={TH}>ランク</th>
          <th style={TH}>タグ</th>
          <th style={{ ...TH, minWidth: 180 }}>メモ</th>
          <th style={TH}>カルテ連携</th>
          <th style={TH}>状況</th>
        </tr>
      </thead>
      <tbody>
        {ladies.map((l) => {
          const p = l.profile || {};
          const tags = (p.extra_tags || []);
          const rankLabel = l.cast_rank_id ? (rankMap[l.cast_rank_id] || '—') : '—';
          const karte = karteMap[l.id];

          return (
            <tr
              key={l.id}
              style={{ borderBottom: '1px solid var(--line-2)', cursor: 'pointer', opacity: l.is_active ? 1 : 0.45 }}
              onClick={() => onSelect(l)}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-subtle)'}
              onMouseLeave={(e) => e.currentTarget.style.background = ''}
            >
              <td style={{ ...TD, fontWeight: 600 }}>{l.display_name || '—'}</td>
              <td style={{ ...TD, color: 'var(--muted)' }}>{l.name || '—'}</td>
              <td style={{ ...TD, color: 'var(--muted)', fontSize: 12 }}>{p.furigana || '—'}</td>
              <td style={TD}>
                {l.cast_rank_id ? (
                  <span style={{ fontSize: 11, background: 'var(--bg-subtle)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 4 }}>
                    {rankLabel}
                  </span>
                ) : <span style={{ color: 'var(--muted)' }}>—</span>}
              </td>
              <td style={TD}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {tags.slice(0, 4).map((t, j) => (
                    <span key={j} className="chip" style={{ height: 16, padding: '0 5px', fontSize: 9 }}>{t}</span>
                  ))}
                </div>
              </td>
              <td style={{ ...TD, color: 'var(--muted)', maxWidth: 240 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.memo || ''}</div>
              </td>
              <td style={TD}>
                {karte ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {karte.photo_url
                      ? <img src={karte.photo_url} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
                      : <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--border)' }} />
                    }
                    <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>連携済み</span>
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                )}
              </td>
              <td style={TD}>
                <span className={'chip ' + (l.is_active ? 'green' : '')} style={{ fontSize: 10 }}>
                  {l.is_active ? '在籍' : '退職'}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const TH = { textAlign: 'left', padding: '7px 10px', color: 'var(--muted)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' };
const TD = { padding: '8px 10px', verticalAlign: 'middle' };

function CastCard({ lady, onClick }) {
  const stores = useAppStore((s) => s.stores);
  const name = lady.display_name || lady.name || '—';
  const p = lady.profile || {};
  const hue = hashHue(name);
  const storeName = stores.find((s) => s.id === lady.store_id)?.name || lady.store_code || '';
  const tags = [];
  (p.ng_areas || []).forEach((a) => tags.push({ label: `NG: ${a}`, cls: 'red' }));
  (p.extra_tags || []).forEach((t) => tags.push({ label: t, cls: '' }));

  return (
    <div className={'cast-card' + (lady.is_active ? '' : ' cast-card-inactive')} onClick={onClick}>
      <div className="cast-card-photo">
        <Avatar name={name} size={72} hue={hue} />
        <span className={'cast-card-status' + (lady.is_active ? ' status-active' : ' status-off')}>
          {lady.is_active ? '在籍' : '退職'}
        </span>
      </div>
      <div className="cast-card-body">
        <div className="cast-card-name">{name}</div>
        <div className="cast-card-store">{storeName}</div>
        <div className="cast-card-tags">
          {tags.slice(0, 3).map((t, i) => (
            <span key={i} className={'chip ' + t.cls} style={{ height: 16, padding: '0 5px', fontSize: 9 }}>{t.label}</span>
          ))}
        </div>
        {p.memo && <div className="cast-card-memo">{p.memo}</div>}
      </div>
    </div>
  );
}

function LadyModal({ lady, onClose, onSaved }) {
  const stores = useAppStore((s) => s.stores);
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const karteMap = useAppStore((s) => s.karteMap);
  const setKarteMap = useAppStore((s) => s.setKarteMap);
  const isNew = !lady?.id;
  const initial = lady || {};
  const initialP = initial.profile || {};
  const [name, setName] = useState(initial.name || '');
  const [displayName, setDisplayName] = useState(initial.display_name || '');
  const [storeId, setStoreId] = useState(initial.store_id || currentStoreId || '');
  const [castRankId, setCastRankId] = useState(initial.cast_rank_id || '');
  const [isActive, setIsActive] = useState(isNew ? true : !!initial.is_active);
  const [furigana, setFurigana] = useState(initialP.furigana || '');
  const [ngAreas, setNgAreas] = useState((initialP.ng_areas || []).join('、'));
  const [tagStr, setTagStr] = useState((initialP.extra_tags || []).join(', '));
  const [tagsStr, setTagsStr] = useState((initialP.tags || []).join(', '));
  const [memo, setMemo] = useState(initialP.memo || '');
  const [loading, setLoading] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [ranks, setRanks] = useState([]);
  const linkedKarte = lady?.id ? karteMap[lady.id] : null;
  const [karteId, setKarteId] = useState(() => linkedKarte?.id || null);
  const [karteList, setKarteList] = useState([]);
  const [formFields, setFormFields] = useState([]);
  const [formOptions, setFormOptions] = useState({});
  const [customValues, setCustomValues] = useState(initialP.custom || {});

  useEffect(() => {
    supabase.from('karte').select('id, name, 稼働状態, photo_url').order('name')
      .then(({ data }) => {
        setKarteList((data || []).map(k => ({
          id: k.id, name: k.name || '—', sub: k.稼働状態 || '', photo_url: k.photo_url,
        })));
      });
    supabase.from('lady_form_fields').select('*').order('sort_order')
      .then(({ data: defs }) => {
        setFormFields(defs || []);
        const selects = (defs || []).filter(f => f.field_type === 'select');
        if (selects.length > 0) {
          supabase.from('lady_field_options')
            .select('*').in('field_key', selects.map(f => f.field_key)).order('sort_order')
            .then(({ data: opts }) => {
              const map = {};
              for (const o of opts || []) {
                if (!map[o.field_key]) map[o.field_key] = [];
                map[o.field_key].push(o);
              }
              setFormOptions(map);
            });
        }
      });
  }, []);

  const isVisible = (key) => {
    const def = formFields.find(f => f.field_key === key);
    return formFields.length === 0 || !def || def.is_visible;
  };

  const hue = hashHue(displayName || name || '?');

  useEffect(() => {
    if (!storeId) { setRanks([]); return; }
    supabase.from('cast_ranks').select('*').eq('store_id', storeId).order('display_order')
      .then(({ data }) => setRanks(data || []));
  }, [storeId]);

  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

  const save = async () => {
    if (!displayName.trim() && !name.trim()) {
      showToast('error', '源氏名または本名を入力してください');
      return;
    }
    setLoading(true);
    const profile = {
      ...initialP,
      furigana: furigana.trim() || null,
      ng_areas: ngAreas.split(/[、,\s]+/).map((s) => s.trim()).filter(Boolean),
      extra_tags: tagStr.split(',').map((s) => s.trim()).filter(Boolean),
      tags: tagsStr.split(',').map((s) => s.trim()).filter(Boolean),
      memo: memo.trim() || null,
      custom: customValues,
    };
    const selectedStore = stores.find((s) => s.id === storeId);
    const payload = {
      name: name.trim() || null,
      display_name: displayName.trim() || null,
      store_id: storeId || null,
      store_code: selectedStore?.code || null,
      cast_rank_id: castRankId || null,
      is_active: isActive,
      profile,
    };
    let resp;
    if (isNew) {
      // login_token は NOT NULL のため、新規登録時にランダムトークンを生成
      const token = crypto.randomUUID();
      resp = await supabase.from('ladies').insert({ ...payload, login_token: token }).select().single();
    } else {
      resp = await supabase.from('ladies').update(payload).eq('id', lady.id).select().single();
    }
    if (resp.error) { setLoading(false); showToast('error', '保存失敗: ' + resp.error.message); return; }

    // カルテ連携の更新
    const savedLadyId = resp.data?.id || lady?.id;
    const prevKarteId = linkedKarte?.id || null;
    if (savedLadyId && karteId !== prevKarteId) {
      if (prevKarteId) {
        await supabase.from('karte').update({ lady_id: null }).eq('id', prevKarteId);
      }
      if (karteId) {
        await supabase.from('karte').update({ lady_id: savedLadyId }).eq('id', karteId);
      }
      // karteMapを再ロード
      const { data: km } = await supabase.from('karte').select('id, lady_id, photo_url').not('lady_id', 'is', null);
      const map = {};
      for (const row of km || []) map[row.lady_id] = { id: row.id, photo_url: row.photo_url };
      setKarteMap(map);
    }

    setLoading(false);
    showToast('success', isNew ? 'キャストを登録しました' : '更新しました');
    onSaved?.();
    onClose();
  };

  const retire = async () => {
    if (!confirmRetire) { setConfirmRetire(true); return; }
    setLoading(true);
    const { error } = await supabase.from('ladies').update({ is_active: false }).eq('id', lady.id);
    setLoading(false);
    if (error) { showToast('error', '退職処理失敗: ' + error.message); return; }
    showToast('success', '退職処理しました');
    onSaved?.();
    onClose();
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteLady = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setLoading(true);
    // 1. シフトを削除（FK: shifts_lady_id_fkey）
    const { error: shiftErr } = await supabase.from('shifts').delete().eq('lady_id', lady.id);
    if (shiftErr) { setLoading(false); showToast('error', 'シフト削除失敗: ' + shiftErr.message); return; }
    // 2. 予約の lady_id を null に（予約履歴は残す）
    const { error: rsvErr } = await supabase.from('reservations').update({ lady_id: null }).eq('lady_id', lady.id);
    if (rsvErr) { setLoading(false); showToast('error', '予約更新失敗: ' + rsvErr.message); return; }
    // 3. 本人を削除
    const { error } = await supabase.from('ladies').delete().eq('id', lady.id);
    setLoading(false);
    if (error) { showToast('error', '削除失敗: ' + error.message); return; }
    showToast('success', '削除しました');
    onSaved?.();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleBackdrop}>
      <div className="nr-modal">
        <div className="nr-head">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Avatar name={displayName || name || '?'} size={44} hue={hue} />
            <div>
              <div className="nr-title">{isNew ? '新規キャスト登録' : (displayName || name || 'キャスト編集')}</div>
              <div className="nr-subtitle">{isNew ? '基本情報を入力' : (isActive ? '在籍中' : '退職済')}</div>
            </div>
          </div>
          <button className="cp-icon-btn" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>

        <div className="nr-body">
          <div className="nr-grid">
            {/* 表記名・管理名は常に表示 */}
            <label className="nr-field">
              <span>表記名（源氏名）</span>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例: 桐谷 奈々美" />
            </label>
            <label className="nr-field">
              <span>管理名（本名）</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </label>

            {/* DB設定に基づく動的フィールド */}
            {formFields.map((field) => {
              if (!field.is_visible) return null;
              switch (field.field_key) {
                case 'store':
                  return (
                    <label key="store" className="nr-field">
                      <span>{field.label}</span>
                      <select value={storeId} onChange={(e) => { setStoreId(e.target.value); setCastRankId(''); }}>
                        <option value="">— 未設定 —</option>
                        {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </label>
                  );
                case 'cast_rank':
                  return (
                    <label key="cast_rank" className="nr-field nr-full">
                      <span>{field.label}</span>
                      <select value={castRankId} onChange={(e) => setCastRankId(e.target.value)} disabled={!storeId}>
                        <option value="">— 未設定 —</option>
                        {ranks.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </label>
                  );
                case 'status':
                  return (
                    <label key="status" className="nr-field nr-full">
                      <span>{field.label}</span>
                      <select value={isActive ? '1' : '0'} onChange={(e) => setIsActive(e.target.value === '1')}>
                        <option value="1">在籍中</option>
                        <option value="0">退職</option>
                      </select>
                    </label>
                  );
                case 'furigana':
                  return (
                    <label key="furigana" className="nr-field nr-full">
                      <span>{field.label}</span>
                      <input type="text" value={furigana} onChange={(e) => setFurigana(e.target.value)} placeholder="例: キリタニ ナナミ" />
                    </label>
                  );
                case 'ng_areas':
                  return (
                    <label key="ng_areas" className="nr-field nr-full">
                      <span>{field.label}（読点 or カンマ区切り）</span>
                      <input type="text" value={ngAreas} onChange={(e) => setNgAreas(e.target.value)} placeholder="例: 心斎橋、難波" />
                    </label>
                  );
                case 'extra_tags':
                  return (
                    <label key="extra_tags" className="nr-field nr-full">
                      <span>{field.label}（カンマ区切り）</span>
                      <input type="text" value={tagStr} onChange={(e) => setTagStr(e.target.value)} placeholder="例: 人気, 新人" />
                    </label>
                  );
                case 'tags':
                  return (
                    <label key="tags" className="nr-field nr-full">
                      <span>{field.label}（カンマ区切り）</span>
                      <input type="text" value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} placeholder="例: スレンダー, ロリ系" />
                    </label>
                  );
                case 'memo':
                  return (
                    <label key="memo" className="nr-field nr-full">
                      <span>{field.label}</span>
                      <textarea rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
                    </label>
                  );
                case 'karte':
                  return (
                    <div key="karte" className="nr-field nr-full">
                      <span style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                        {field.label}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {karteId && (() => {
                          const k = karteList.find(k => k.id === karteId);
                          return k?.photo_url
                            ? <img src={k.photo_url} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            : <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />;
                        })()}
                        <Combobox
                          items={[{ id: '__none__', name: '— 未連携 —' }, ...karteList.map(k => ({
                            id: k.id, name: k.name + (k.sub ? `（${k.sub}）` : ''),
                          }))]}
                          value={karteId || '__none__'}
                          onChange={(id) => setKarteId(id === '__none__' ? null : id)}
                          placeholder="カルテを検索して選択..."
                          style={{ ...INP, padding: '6px 10px' }}
                        />
                        {karteId && (
                          <button type="button" className="btn sm ghost" onClick={() => setKarteId(null)} style={{ flexShrink: 0, fontSize: 11 }}>
                            解除
                          </button>
                        )}
                      </div>
                      {karteId && karteId !== (linkedKarte?.id || null) && (
                        <p style={{ fontSize: 11, color: 'var(--halo-600)', marginTop: 4 }}>
                          ※ 保存すると連携が更新されます
                        </p>
                      )}
                    </div>
                  );
                default: {
                  // カスタムフィールド
                  const val = customValues[field.field_key] || '';
                  if (field.field_type === 'select') {
                    const opts = formOptions[field.field_key] || [];
                    return (
                      <label key={field.field_key} className="nr-field nr-full">
                        <span>{field.label}</span>
                        <select value={val} onChange={e => setCustomValues(v => ({ ...v, [field.field_key]: e.target.value }))}>
                          <option value="">— 未設定 —</option>
                          {opts.map(o => <option key={o.id} value={o.label}>{o.label}</option>)}
                        </select>
                      </label>
                    );
                  }
                  if (field.field_type === 'textarea') {
                    return (
                      <label key={field.field_key} className="nr-field nr-full">
                        <span>{field.label}</span>
                        <textarea rows={3} value={val} onChange={e => setCustomValues(v => ({ ...v, [field.field_key]: e.target.value }))} />
                      </label>
                    );
                  }
                  return (
                    <label key={field.field_key} className="nr-field nr-full">
                      <span>{field.label}</span>
                      <input type="text" value={val} onChange={e => setCustomValues(v => ({ ...v, [field.field_key]: e.target.value }))} />
                    </label>
                  );
                }
              }
            })}
          </div>
        </div>

        <div className="nr-actions">
          {!isNew && isActive && (
            <button className="cf-btn danger-outline" onClick={retire} disabled={loading}>
              {confirmRetire ? '本当に退職処理する' : '退職処理'}
            </button>
          )}
          {!isNew && !isActive && (
            <button
              className="cf-btn danger-outline"
              onClick={deleteLady}
              disabled={loading}
              style={{ borderColor: '#ef4444', color: '#ef4444' }}
              title="シフトも削除されます。予約履歴は担当者なしとして保持されます。"
            >
              {confirmDelete ? '⚠ シフトごと完全削除する' : '削除'}
            </button>
          )}
          <button className="cf-btn ghost" onClick={onClose} disabled={loading}>キャンセル</button>
          <button className="cf-btn primary" onClick={save} disabled={loading} style={{ marginLeft: 'auto' }}>
            <Icon name="check" size={13} />{loading ? '保存中...' : (isNew ? '登録' : '更新')}
          </button>
        </div>
      </div>
    </div>
  );
}
