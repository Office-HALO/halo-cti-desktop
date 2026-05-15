import { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { supabase } from '../lib/supabase.js';
import { getKarteCardFields } from '../lib/karteFields.js';
import { showToast } from '../lib/toast.js';

const BADGE_COLOR = {
  '出勤': '#16a34a',
  '疎遠': '#f97316',
  '稼働無し(退店/不採用)': '#9ca3af',
  'テスト': '#7c3aed',
};

const RATING_LABEL = {
  '⭐️苦戦中': { color: '#ef4444', label: '苦戦中' },
  '⭐️⭐️KRO水準': { color: '#f97316', label: 'KRO水準' },
  '⭐️⭐️⭐️強気でお勧め': { color: '#16a34a', label: '激推し' },
};

export default function Karte() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selected, setSelected] = useState(null);
  const [visibleFields, setVisibleFields] = useState(getKarteCardFields);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [customOptions, setCustomOptions] = useState({});

  const loadCustomFieldDefs = useCallback(async () => {
    const { data: defs } = await supabase
      .from('karte_field_defs')
      .select('*')
      .order('sort_order');
    if (!defs) return;
    setCustomFieldDefs(defs);
    const selectDefs = defs.filter(d => d.field_type === 'select');
    if (selectDefs.length > 0) {
      const { data: opts } = await supabase
        .from('karte_field_options')
        .select('*')
        .in('field_key', selectDefs.map(d => d.field_key))
        .order('sort_order');
      const map = {};
      for (const opt of opts || []) {
        if (!map[opt.field_key]) map[opt.field_key] = [];
        map[opt.field_key].push(opt);
      }
      setCustomOptions(map);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('karte')
      .select('id, name, 稼働状態, 店舗, カテゴリ, 身長3サイズ, 長所, 似有名人, プレイスタイル, duo対応, インバウンド対応, 実際の評価, photo_url, lady_id, data')
      .order('name');
    if (!error) setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    loadCustomFieldDefs();
  }, [load, loadCustomFieldDefs]);

  const handleUpdated = useCallback((updated) => {
    setRows(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
    setSelected(s => s?.id === updated.id ? { ...s, ...updated } : s);
    setVisibleFields(getKarteCardFields());
    loadCustomFieldDefs();
  }, [loadCustomFieldDefs]);

  const filtered = rows.filter((r) => {
    if (filterStatus !== 'all' && r.稼働状態 !== filterStatus) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      (r.name || '').toLowerCase().includes(s) ||
      (r.長所 || '').toLowerCase().includes(s) ||
      (r.似有名人 || '').toLowerCase().includes(s) ||
      (r.カテゴリ || []).some(c => c.toLowerCase().includes(s))
    );
  });

  const statuses = ['all', '出勤', '疎遠', '稼働無し(退店/不採用)'];

  return (
    <div className="cast-screen-root">
      <div className="screen-toolbar">
        <div className="search-big" style={{ maxWidth: 260 }}>
          <Icon name="search" size={14} />
          <input
            placeholder="名前・カテゴリ・長所で検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {statuses.map(s => (
            <button
              key={s}
              className={'btn sm' + (filterStatus === s ? '' : ' ghost')}
              onClick={() => setFilterStatus(s)}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              {s === 'all' ? '全て' : s === '稼働無し(退店/不採用)' ? '退店' : s}
            </button>
          ))}
        </div>
        <div className="chip blue">{filtered.length}件</div>
        <button className="btn sm ghost" onClick={load} style={{ marginLeft: 'auto' }}>
          <Icon name="refresh" size={12} />更新
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>読み込み中...</div>
      ) : !filtered.length ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          {rows.length === 0 ? 'カルテデータがありません。移行スクリプトを実行してください。' : '該当なし'}
        </div>
      ) : (
        <div className="cast-grid-scroll">
          <div className="cast-card-grid">
            {filtered.map((row) => (
              <KarteCard
                key={row.id}
                row={row}
                visibleFields={visibleFields}
                customFieldDefs={customFieldDefs}
                onClick={() => setSelected(row)}
              />
            ))}
          </div>
        </div>
      )}

      {selected && (
        <KarteDetail
          row={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          customFieldDefs={customFieldDefs}
          customOptions={customOptions}
        />
      )}
    </div>
  );
}

function KarteCard({ row, onClick, visibleFields, customFieldDefs }) {
  const statusColor = BADGE_COLOR[row.稼働状態] || '#9ca3af';
  const rating = RATING_LABEL[row.実際の評価];
  const visibleCustom = customFieldDefs.filter(f => f.is_visible);

  return (
    <div className="cast-card" style={{ cursor: 'pointer' }} onClick={onClick}>
      <div className="cast-card-photo">
        <Avatar name={row.name || '?'} size={72} src={row.photo_url || undefined} />
        <span className="cast-card-status" style={{
          background: statusColor + '22', color: statusColor, borderColor: statusColor + '44',
        }}>
          {row.稼働状態 === '出勤' ? '在籍' : row.稼働状態 === '疎遠' ? '疎遠' : '退店'}
        </span>
      </div>
      <div className="cast-card-body">
        <div className="cast-card-name">{row.name}</div>
        {visibleFields['身長3サイズ'] && (
          <div className="cast-card-store">{row.身長3サイズ || '—'}</div>
        )}
        <div className="cast-card-tags">
          {visibleFields['rating'] && rating && (
            <span className="chip" style={{ fontSize: 9, color: rating.color, borderColor: rating.color + '44', background: rating.color + '11' }}>
              {rating.label}
            </span>
          )}
          {visibleFields['カテゴリ'] && (row.カテゴリ || []).slice(0, 2).map(c => (
            <span key={c} className="chip" style={{ fontSize: 9 }}>{c}</span>
          ))}
          {visibleFields['duo対応'] && row['duo対応'] && (
            <span className="chip" style={{ fontSize: 9 }}>DUO: {row['duo対応']}</span>
          )}
          {visibleFields['インバウンド対応'] && row.インバウンド対応 && (
            <span className="chip" style={{ fontSize: 9 }}>IN: {row.インバウンド対応}</span>
          )}
        </div>
        {visibleFields['長所'] && row.長所 && (
          <div className="cast-card-memo">{row.長所}</div>
        )}
        {visibleFields['似有名人'] && row.似有名人 && (
          <div className="cast-card-memo" style={{ color: 'var(--muted)', fontSize: 10 }}>似: {row.似有名人}</div>
        )}
        {visibleFields['プレイスタイル'] && row.プレイスタイル && (
          <div className="cast-card-memo" style={{ fontSize: 10 }}>{row.プレイスタイル}</div>
        )}
        {visibleCustom.map(def => {
          const val = row.data?.custom?.[def.field_key];
          if (!val) return null;
          return (
            <div key={def.field_key} className="cast-card-memo" style={{ fontSize: 10 }}>
              <span style={{ color: 'var(--muted)' }}>{def.label}: </span>{val}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KarteDetail({ row, onClose, onUpdated, customFieldDefs, customOptions }) {
  const [full, setFull] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    supabase.from('karte').select('*').eq('id', row.id).single()
      .then(({ data }) => { if (data) { setFull(data); setForm(data); } });
  }, [row.id]);

  const d = full || row;

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop().toLowerCase();
    const path = `${row.id}/cover.${ext}`;
    const { error } = await supabase.storage
      .from('karte-photos')
      .upload(path, file, { contentType: file.type, upsert: true });
    if (error) {
      showToast('error', '写真のアップロードに失敗しました');
    } else {
      const { data: { publicUrl } } = supabase.storage.from('karte-photos').getPublicUrl(path);
      setForm(f => ({ ...f, photo_url: publicUrl }));
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    const newData = {
      ...(form.data || {}),
      custom: Object.fromEntries(
        customFieldDefs.map(def => [def.field_key, form.data?.custom?.[def.field_key] || null])
      ),
    };
    const payload = {
      稼働状態: form.稼働状態 || null,
      身長3サイズ: form.身長3サイズ || null,
      カテゴリ: form.カテゴリ,
      長所: form.長所 || null,
      似有名人: form.似有名人 || null,
      プレイスタイル: form.プレイスタイル || null,
      'duo対応': form['duo対応'] || null,
      インバウンド対応: form.インバウンド対応 || null,
      実際の評価: form.実際の評価 || null,
      文章_公開: form.文章_公開 || null,
      photo_url: form.photo_url || null,
      data: newData,
    };
    const { error } = await supabase.from('karte').update(payload).eq('id', row.id);
    setSaving(false);
    if (error) {
      showToast('error', '保存に失敗しました');
    } else {
      showToast('ok', '保存しました');
      const updated = { ...d, ...payload };
      setFull(updated);
      setForm(updated);
      setEditing(false);
      onUpdated?.(updated);
    }
  };

  const cancelEdit = () => { setEditing(false); setForm(full); };
  const setF = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const setCustomVal = (fieldKey, val) => setForm(f => ({
    ...f,
    data: { ...(f.data || {}), custom: { ...(f.data?.custom || {}), [fieldKey]: val } },
  }));

  const photoSrc = editing ? form?.photo_url : d.photo_url;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16, width: 680, maxHeight: '90vh',
        overflow: 'hidden auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }} onClick={e => e.stopPropagation()}>

        {/* ヘッダー */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
        }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar name={d.name || '?'} size={64} src={photoSrc || undefined} />
            {editing && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.5)', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 9, fontWeight: 700, textAlign: 'center',
                  }}
                >
                  {uploading ? '…' : '写真変更'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
              </>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{d.name}</div>
            {editing ? (
              <input
                style={{ ...INP, marginTop: 4, fontSize: 13 }}
                value={form?.身長3サイズ || ''}
                onChange={e => setF('身長3サイズ', e.target.value)}
                placeholder="身長・3サイズ"
              />
            ) : (
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{d.身長3サイズ}</div>
            )}
            {!editing && (
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {d.稼働状態 && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                    background: (BADGE_COLOR[d.稼働状態] || '#9ca3af') + '22',
                    color: BADGE_COLOR[d.稼働状態] || '#9ca3af',
                  }}>{d.稼働状態}</span>
                )}
                {d.実際の評価 && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                    background: (RATING_LABEL[d.実際の評価]?.color || '#888') + '22',
                    color: RATING_LABEL[d.実際の評価]?.color || '#888',
                  }}>{RATING_LABEL[d.実際の評価]?.label || d.実際の評価}</span>
                )}
                {(d.店舗 || []).map(s => (
                  <span key={s} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 6,
                    background: 'var(--surface-2)', color: 'var(--text)',
                  }}>{s}</span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {editing ? (
              <>
                <button className="btn sm ghost" onClick={cancelEdit}>キャンセル</button>
                <button className="btn sm primary" onClick={handleSave} disabled={saving}>
                  {saving ? '保存中...' : '保存'}
                </button>
              </>
            ) : (
              <button className="btn sm ghost" onClick={() => setEditing(true)}>
                <Icon name="edit" size={13} />編集
              </button>
            )}
            <button className="btn sm ghost" onClick={onClose}>
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>

        {/* 本文 */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {editing ? (
            <EditForm
              form={form}
              setF={setF}
              setCustomVal={setCustomVal}
              customFieldDefs={customFieldDefs}
              customOptions={customOptions}
            />
          ) : (
            <ViewBody d={d} customFieldDefs={customFieldDefs} />
          )}
        </div>
      </div>
    </div>
  );
}

function EditForm({ form, setF, setCustomVal, customFieldDefs, customOptions }) {
  if (!form) return null;

  const handleCategoryChange = (val) => {
    const arr = val.split(/[,、\n]/).map(s => s.trim()).filter(Boolean);
    setF('カテゴリ', arr);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Row label="稼働状態">
        <select style={INP} value={form.稼働状態 || ''} onChange={e => setF('稼働状態', e.target.value)}>
          <option value="">—</option>
          <option value="出勤">出勤</option>
          <option value="疎遠">疎遠</option>
          <option value="稼働無し(退店/不採用)">稼働無し(退店/不採用)</option>
        </select>
      </Row>
      <Row label="評価">
        <select style={INP} value={form.実際の評価 || ''} onChange={e => setF('実際の評価', e.target.value)}>
          <option value="">—</option>
          <option value="⭐️苦戦中">⭐️苦戦中</option>
          <option value="⭐️⭐️KRO水準">⭐️⭐️KRO水準</option>
          <option value="⭐️⭐️⭐️強気でお勧め">⭐️⭐️⭐️強気でお勧め</option>
        </select>
      </Row>
      <Row label="カテゴリ">
        <div>
          <input
            style={INP}
            value={(form.カテゴリ || []).join('、')}
            onChange={e => handleCategoryChange(e.target.value)}
            placeholder="読点「、」またはカンマで区切り"
          />
        </div>
      </Row>
      <Row label="長所">
        <input style={INP} value={form.長所 || ''} onChange={e => setF('長所', e.target.value)} />
      </Row>
      <Row label="似有名人">
        <input style={INP} value={form.似有名人 || ''} onChange={e => setF('似有名人', e.target.value)} />
      </Row>
      <Row label="プレイスタイル">
        <input style={INP} value={form.プレイスタイル || ''} onChange={e => setF('プレイスタイル', e.target.value)} />
      </Row>
      <Row label="DUO対応">
        <input style={INP} value={form['duo対応'] || ''} onChange={e => setF('duo対応', e.target.value)} />
      </Row>
      <Row label="インバウンド">
        <input style={INP} value={form.インバウンド対応 || ''} onChange={e => setF('インバウンド対応', e.target.value)} />
      </Row>
      <Row label="公開文章">
        <textarea
          style={{ ...INP, height: 100, resize: 'vertical' }}
          value={form.文章_公開 || ''}
          onChange={e => setF('文章_公開', e.target.value)}
        />
      </Row>

      {customFieldDefs.length > 0 && (
        <>
          <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              カスタム項目
            </div>
            {customFieldDefs.map(def => {
              const val = form.data?.custom?.[def.field_key] || '';
              if (def.field_type === 'select') {
                const opts = customOptions[def.field_key] || [];
                return (
                  <Row key={def.field_key} label={def.label}>
                    <select
                      style={INP}
                      value={val}
                      onChange={e => setCustomVal(def.field_key, e.target.value)}
                    >
                      <option value="">—</option>
                      {opts.map(o => <option key={o.id} value={o.label}>{o.label}</option>)}
                    </select>
                  </Row>
                );
              }
              return (
                <Row key={def.field_key} label={def.label}>
                  <input
                    style={INP}
                    value={val}
                    onChange={e => setCustomVal(def.field_key, e.target.value)}
                  />
                </Row>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ViewBody({ d, customFieldDefs }) {
  const customVals = d.data?.custom || {};
  const filledCustom = customFieldDefs.filter(def => customVals[def.field_key]);

  return (
    <>
      {d.カテゴリ?.length > 0 && (
        <Section label="カテゴリ">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {d.カテゴリ.map(c => (
              <span key={c} style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 12,
                background: 'var(--halo-50)', color: 'var(--halo-700)',
              }}>{c}</span>
            ))}
          </div>
        </Section>
      )}

      <Section label="スペック">
        <Grid rows={[
          ['長所', d.長所],
          ['似有名人', d.似有名人],
          ['プレイスタイル', d.プレイスタイル],
          ['DUO対応', d['duo対応']],
          ['DUO備考', d['duo備考']],
          ['インバウンド対応', d.インバウンド対応],
          ['インバウンド備考', d.インバウンド備考],
          ['NG地域', d['ng地域有り'] ? `${d['ng地域有り']} / ${d['ng地域備考'] || ''}` : null],
          ['タバコ・お酒', d.タバコお酒?.join('、')],
          ['身体の特徴', d.身体の特徴?.join('、')],
        ]} />
      </Section>

      {filledCustom.length > 0 && (
        <Section label="カスタム項目">
          <Grid rows={filledCustom.map(def => [def.label, customVals[def.field_key]])} />
        </Section>
      )}

      {d.data && (
        <Section label="事務所情報">
          <Grid rows={[
            ['初出勤', d.data.初出勤],
            ['実身長', d.data.実_身長 ? `${d.data.実_身長}cm` : null],
            ['実体重', d.data.実_体重 ? `${d.data.実_体重}kg` : null],
            ['実3サイズ', d.data.実_3サイズ],
            ['業界経験', d.data.業界経験],
            ['待機場所', d.data.待機場所],
            ['婚姻歴', d.data.婚姻歴],
            ['お子様', d.data.お子様],
            ['趣味特技', d.data.趣味特技],
            ['出勤の融通', d.data.出勤依頼の融通],
            ['その他メモ', d.data.その他メモ],
          ]} />
        </Section>
      )}

      {d.文章_公開 && (
        <Section label="公開文章（校正後）">
          <div style={{
            fontSize: 13, lineHeight: 1.8, color: 'var(--text)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }} dangerouslySetInnerHTML={{ __html: d.文章_公開.replace(/<br>/g, '\n') }} />
        </Section>
      )}
    </>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: 'var(--muted)', paddingTop: 7 }}>{label}</label>
      <div>{children}</div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Grid({ rows }) {
  const valid = rows.filter(([, v]) => v);
  if (!valid.length) return <div style={{ fontSize: 12, color: 'var(--muted)' }}>—</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 12px', fontSize: 12 }}>
      {valid.map(([k, v]) => (
        <>
          <span key={k + '_k'} style={{ color: 'var(--muted)', fontWeight: 600 }}>{k}</span>
          <span key={k + '_v'} style={{ color: 'var(--text)' }}>{v}</span>
        </>
      ))}
    </div>
  );
}

const INP = {
  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};
