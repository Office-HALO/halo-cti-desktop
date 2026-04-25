import { useState, useEffect } from 'react';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { supabase } from '../lib/supabase.js';
import { useAppStore } from '../store/state.js';
import { showToast } from '../lib/toast.js';

const hashHue = (s) => {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

export default function Cast() {
  const allLadies = useAppStore((s) => s.allLadies);
  const setAllLadies = useAppStore((s) => s.setAllLadies);
  const [loading, setLoading] = useState(!allLadies.length);
  const [q, setQ] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    setLoading(true);
    let query = supabase.from('ladies').select('*').order('display_name');
    const { data } = await query;
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

  const filtered = allLadies.filter((l) => {
    if (activeOnly && !l.is_active) return false;
    const kw = q.toLowerCase();
    if (kw && !((l.display_name || l.name || '').toLowerCase().includes(kw))) return false;
    return true;
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
        <button className="btn sm ghost" onClick={load} style={{ marginLeft: 'auto' }}>
          <Icon name="refresh" size={12} />更新
        </button>
        <button className="btn sm primary" onClick={() => setShowNew(true)}><Icon name="plus" size={12} />新規登録</button>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>キャストが見つかりません</div>
      ) : (
        <div className="cast-grid-scroll">
          <div className="cast-card-grid">
            {filtered.map((l) => (
              <CastCard key={l.id} lady={l} onClick={() => setSelected(l)} />
            ))}
          </div>
        </div>
      )}

      {selected && (
        <LadyModal lady={selected} onClose={() => setSelected(null)} />
      )}
      {showNew && (
        <LadyModal lady={null} onClose={() => setShowNew(false)} />
      )}
    </div>
  );
}

function CastCard({ lady, onClick }) {
  const name = lady.display_name || lady.name || '—';
  const p = lady.profile || {};
  const hue = hashHue(name);
  const tags = [];
  if (p.duo === true) tags.push({ label: 'DUO可', cls: 'green' });
  if (p.duo === false) tags.push({ label: 'DUO不可', cls: 'red' });
  if (p.tattoo) tags.push({ label: 'タトゥー有', cls: 'amber' });
  (p.ng_areas || []).forEach((a) => tags.push({ label: `NG: ${a}`, cls: 'red' }));
  (p.tags || []).forEach((t) => tags.push({ label: t, cls: '' }));

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
        <div className="cast-card-store">{(lady.store_code || '').toUpperCase()}</div>
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

function LadyModal({ lady, onClose }) {
  const isNew = !lady?.id;
  const initial = lady || {};
  const initialP = initial.profile || {};
  const [name, setName] = useState(initial.name || '');
  const [displayName, setDisplayName] = useState(initial.display_name || '');
  const [storeCode, setStoreCode] = useState(initial.store_code || '');
  const [isActive, setIsActive] = useState(isNew ? true : !!initial.is_active);
  const [duo, setDuo] = useState(initialP.duo === true ? 'yes' : initialP.duo === false ? 'no' : '');
  const [tattoo, setTattoo] = useState(!!initialP.tattoo);
  const [ngAreas, setNgAreas] = useState((initialP.ng_areas || []).join('、'));
  const [tagsStr, setTagsStr] = useState((initialP.tags || []).join(', '));
  const [memo, setMemo] = useState(initialP.memo || '');
  const [loading, setLoading] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);

  const hue = hashHue(displayName || name || '?');

  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

  const save = async () => {
    if (!displayName.trim() && !name.trim()) {
      showToast('error', '源氏名または本名を入力してください');
      return;
    }
    setLoading(true);
    const profile = {
      ...initialP,
      duo: duo === 'yes' ? true : duo === 'no' ? false : null,
      tattoo,
      ng_areas: ngAreas.split(/[、,\s]+/).map((s) => s.trim()).filter(Boolean),
      tags: tagsStr.split(',').map((s) => s.trim()).filter(Boolean),
      memo: memo.trim() || null,
    };
    const payload = {
      name: name.trim() || null,
      display_name: displayName.trim() || null,
      store_code: storeCode.trim() || null,
      is_active: isActive,
      profile,
    };
    let resp;
    if (isNew) {
      resp = await supabase.from('ladies').insert(payload).select().single();
    } else {
      resp = await supabase.from('ladies').update(payload).eq('id', lady.id).select().single();
    }
    setLoading(false);
    if (resp.error) { showToast('error', '保存失敗: ' + resp.error.message); return; }
    showToast('success', isNew ? 'キャストを登録しました' : '更新しました');
    onClose();
  };

  const retire = async () => {
    if (!confirmRetire) { setConfirmRetire(true); return; }
    setLoading(true);
    const { error } = await supabase.from('ladies').update({ is_active: false }).eq('id', lady.id);
    setLoading(false);
    if (error) { showToast('error', '退職処理失敗: ' + error.message); return; }
    showToast('success', '退職処理しました');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleBackdrop}>
      <div className="nr-modal" style={{ position: 'relative', transform: 'none' }}>
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
            <label className="nr-field">
              <span>源氏名</span>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例: 桐谷 奈々美" />
            </label>
            <label className="nr-field">
              <span>本名</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="nr-field">
              <span>店舗コード</span>
              <input type="text" value={storeCode} onChange={(e) => setStoreCode(e.target.value)} placeholder="例: shinsaibashi" />
            </label>
            <label className="nr-field">
              <span>在籍状況</span>
              <select value={isActive ? '1' : '0'} onChange={(e) => setIsActive(e.target.value === '1')}>
                <option value="1">在籍中</option>
                <option value="0">退職</option>
              </select>
            </label>
            <label className="nr-field">
              <span>DUO</span>
              <select value={duo} onChange={(e) => setDuo(e.target.value)}>
                <option value="">未設定</option>
                <option value="yes">可</option>
                <option value="no">不可</option>
              </select>
            </label>
            <label className="nr-field">
              <span>タトゥー</span>
              <select value={tattoo ? '1' : '0'} onChange={(e) => setTattoo(e.target.value === '1')}>
                <option value="0">なし</option>
                <option value="1">あり</option>
              </select>
            </label>
            <label className="nr-field nr-full">
              <span>NGエリア(読点 or カンマ区切り)</span>
              <input type="text" value={ngAreas} onChange={(e) => setNgAreas(e.target.value)} placeholder="例: 心斎橋、難波" />
            </label>
            <label className="nr-field nr-full">
              <span>タグ(カンマ区切り)</span>
              <input type="text" value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} placeholder="例: 人気, 新人" />
            </label>
            <label className="nr-field nr-full">
              <span>メモ</span>
              <textarea rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="nr-actions">
          {!isNew && isActive && (
            <button className="cf-btn danger-outline" onClick={retire} disabled={loading}>
              {confirmRetire ? '本当に退職処理する' : '退職処理'}
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
