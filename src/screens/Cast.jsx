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
        <button className="btn sm primary"><Icon name="plus" size={12} />新規登録</button>
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
  const p = lady.profile || {};
  const name = lady.display_name || lady.name || '—';
  const hue = hashHue(name);

  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

  return (
    <div className="modal-overlay" onClick={handleBackdrop}>
      <div className="modal-panel">
        <div className="modal-head">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Avatar name={name} size={44} hue={hue} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{(lady.store_code || '').toUpperCase()} · {lady.is_active ? '在籍' : '退職'}</div>
            </div>
          </div>
          <button className="btn sm ghost icon" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>
        <div className="kv" style={{ padding: '0 16px 16px' }}>
          <div><span className="k">本名</span><span className="v">{lady.name || '—'}</span></div>
          <div><span className="k">店舗コード</span><span className="v mono">{lady.store_code || '—'}</span></div>
          {p.ng_areas?.length > 0 && (
            <div><span className="k">NGエリア</span><span className="v">{p.ng_areas.join('、')}</span></div>
          )}
          {p.memo && <div><span className="k">メモ</span><span className="v">{p.memo}</span></div>}
          <div><span className="k">DUO</span><span className="v">{p.duo === true ? '可' : p.duo === false ? '不可' : '未設定'}</span></div>
          {p.tattoo && <div><span className="k">タトゥー</span><span className="v">あり</span></div>}
        </div>
      </div>
    </div>
  );
}
