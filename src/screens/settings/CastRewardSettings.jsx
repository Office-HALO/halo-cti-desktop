/**
 * CastRewardSettings.jsx
 * キャスト報酬設定 — ladies テーブルをベースに、報酬に関わる項目を
 * スプレッドシート風の一覧で管理する。
 *
 * メインページ「在籍女性」と同じ DB を参照するため、
 * ここで変更した内容は即座にメインページにも反映される。
 *
 * profile フィールド:
 *   course_rate — コースバック率（空欄=ブランドデフォルト）
 *   nom_rate    — 指名バック率（空欄=店舗レート設定値）
 *   ext_rate    — 延長バック率（空欄=50%）
 *   reward_note — 報酬備考（自由入力）
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import { showToast } from '../../lib/toast.js';
import { useAppStore } from '../../store/state.js';
import { getRankBrand } from '../../lib/pricing.js';
import Icon from '../../components/Icon.jsx';
import Avatar from '../../components/Avatar.jsx';

/** ブランドごとのデフォルトレート（placeholder 表示用） */
function defCourseRate(rankCode) {
  const b = getRankBrand(rankCode);
  if (b === 'gran')    return 50;
  if (b === 'lareine') return 55; // lr_rate_net 相当
  return null;
}
function defNomRate(rankCode) {
  const b = getRankBrand(rankCode);
  if (b === 'gran')    return 50; // gran_nom_rate_net
  return null; // La Reine: コースに含む → N/A
}
function defExtRate(rankCode) {
  return getRankBrand(rankCode) ? 50 : null;
}

const hashHue = (s) => {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

/* セル共通スタイル */
const TH = {
  textAlign: 'left', padding: '7px 10px', fontSize: 11,
  fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--line)', background: 'var(--bg-subtle)',
  position: 'sticky', top: 0, zIndex: 1,
};
const TD = { padding: '8px 10px', verticalAlign: 'middle', borderBottom: '1px solid var(--line-2)' };

/* バック率 1セル分 */
function RateCell({ lady, field, defVal, placeholder, disabled, isSaving, onBlur }) {
  const custVal  = lady.profile?.[field] ?? null;
  const hasCustom = custVal != null;
  if (disabled) {
    return (
      <td style={TD}>
        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>コースに含む</span>
      </td>
    );
  }
  return (
    <td style={TD}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          key={`${lady.id}_${field}_${custVal ?? 'null'}`}
          type="number"
          min={0} max={100} step={1}
          defaultValue={custVal ?? ''}
          placeholder={defVal != null ? String(defVal) : (placeholder || '—')}
          onBlur={(e) => onBlur(lady, field, e.target.value)}
          disabled={isSaving}
          style={{
            width: 52, padding: '4px 6px',
            border: `1px solid ${hasCustom ? '#f59e0b' : 'var(--border)'}`,
            borderRadius: 6,
            background: hasCustom ? '#fffbeb' : 'var(--bg)',
            color: hasCustom ? '#92400e' : 'var(--text)',
            fontSize: 12, fontWeight: hasCustom ? 700 : 400,
            fontFamily: 'inherit', outline: 'none', textAlign: 'right',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>%</span>
        {hasCustom && (
          <span style={{
            fontSize: 10, padding: '1px 5px', borderRadius: 3,
            background: '#fef3c7', color: '#b45309', fontWeight: 600,
          }}>カスタム</span>
        )}
      </div>
    </td>
  );
}

export default function CastRewardSettings() {
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const stores = useAppStore((s) => s.stores);
  const setAllLadies = useAppStore((s) => s.setAllLadies);

  const [ladies,    setLadies]    = useState([]);
  const [ranks,     setRanks]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showRetired, setShowRetired] = useState(false);
  const [q,         setQ]         = useState('');
  const [dirty,     setDirty]     = useState({});
  const [saving,    setSaving]    = useState({});

  const currentStore = stores.find((s) => s.id === currentStoreId);

  /* ── データロード ─────────────────────────────────────────── */
  const load = useCallback(async () => {
    if (!currentStoreId) return;
    setLoading(true);
    const [{ data: ladyRows }, { data: rankRows }] = await Promise.all([
      supabase.from('ladies').select('*').eq('store_id', currentStoreId).order('display_name'),
      supabase.from('cast_ranks').select('*').eq('store_id', currentStoreId).order('display_order'),
    ]);
    setLadies(ladyRows || []);
    setRanks(rankRows || []);
    setDirty({});
    setLoading(false);
    if (ladyRows) setAllLadies(ladyRows);
  }, [currentStoreId]);

  useEffect(() => { load(); }, [load]);

  /* Realtime */
  useEffect(() => {
    if (!currentStoreId) return;
    const ch = supabase
      .channel('cast-reward-settings-ladies')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ladies' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentStoreId, load]);

  /* ── フィルタ ─────────────────────────────────────────────── */
  const filtered = ladies.filter((l) => {
    if (!showRetired && !l.is_active) return false;
    const kw = q.trim().toLowerCase();
    if (kw && !((l.display_name || l.name || '').toLowerCase().includes(kw))) return false;
    return true;
  });

  /* ── 変更ハンドラ ─────────────────────────────────────────── */
  const markDirty = (id, field, value) => {
    setDirty((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  };

  /* ランク変更 → 即時保存 */
  const handleRankChange = async (lady, rankId) => {
    const id = lady.id;
    markDirty(id, 'cast_rank_id', rankId || null);
    setSaving((p) => ({ ...p, [id]: true }));
    const { error } = await supabase.from('ladies').update({ cast_rank_id: rankId || null }).eq('id', id);
    setSaving((p) => ({ ...p, [id]: false }));
    if (error) {
      showToast('error', '保存失敗: ' + error.message);
    } else {
      showToast('ok', `${lady.display_name || lady.name} のランクを更新しました`);
      setDirty((prev) => { const n = { ...prev }; delete n[id]; return n; });
      load();
    }
  };

  /* 報酬備考変更 → blur 時保存 */
  const handleNoteBlur = async (lady, value) => {
    const id = lady.id;
    const current = lady.profile?.reward_note || '';
    if (value === current) return;
    setSaving((p) => ({ ...p, [id]: true }));
    const profile = { ...(lady.profile || {}), reward_note: value.trim() || null };
    const { error } = await supabase.from('ladies').update({ profile }).eq('id', id);
    setSaving((p) => ({ ...p, [id]: false }));
    if (error) {
      showToast('error', '保存失敗: ' + error.message);
    } else {
      setDirty((prev) => { const n = { ...prev }; delete n[id]; return n; });
      load();
    }
  };

  /* バック率フィールド変更 → blur 時保存（field = 'course_rate' | 'nom_rate' | 'ext_rate'） */
  const handleRateFieldBlur = async (lady, field, value) => {
    const id = lady.id;
    const current = lady.profile?.[field] ?? null;
    const newVal  = value.trim() === '' ? null : Number(value.trim());
    if (newVal === current) return;
    if (newVal !== null && (isNaN(newVal) || newVal < 0 || newVal > 100)) {
      showToast('error', '0〜100 の数値を入力してください');
      return;
    }
    setSaving((p) => ({ ...p, [id]: true }));
    const profile = { ...(lady.profile || {}), [field]: newVal };
    const { error } = await supabase.from('ladies').update({ profile }).eq('id', id);
    setSaving((p) => ({ ...p, [id]: false }));
    if (error) {
      showToast('error', '保存失敗: ' + error.message);
    } else {
      const fieldLabel = { course_rate: 'コース', nom_rate: '指名', ext_rate: '延長' }[field] || field;
      showToast('ok', newVal != null
        ? `${lady.display_name || lady.name} の${fieldLabel}バック率を ${newVal}% に設定しました`
        : `${lady.display_name || lady.name} の${fieldLabel}バック率をデフォルトに戻しました`);
      setDirty((prev) => { const n = { ...prev }; delete n[id]; return n; });
      load();
    }
  };

  /* ── 在籍切り替え ─────────────────────────────────────────── */
  const toggleActive = async (lady) => {
    const { error } = await supabase.from('ladies').update({ is_active: !lady.is_active }).eq('id', lady.id);
    if (error) showToast('error', error.message);
    else load();
  };

  const rankMap = Object.fromEntries(ranks.map((r) => [r.id, r]));

  if (!currentStoreId) {
    return <div style={{ padding: 24, color: 'var(--muted)', fontSize: 13 }}>店舗を選択してください</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* ── ヘッダー ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>キャスト報酬</h2>
          {currentStore && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              {currentStore.name} — ランク設定はここで変更でき、在籍女性ページにも即時反映されます
            </div>
          )}
        </div>
      </div>

      {/* ── ツールバー ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', flex: '0 0 220px' }}>
          <Icon name="search" size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="名前で絞り込み"
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'var(--text)', width: '100%' }}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
          退職含む
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {filtered.length}名 / 全{ladies.filter(l => l.is_active).length}名在籍
          </span>
          <button className="btn sm ghost" onClick={load}>
            <Icon name="refresh" size={12} /> 更新
          </button>
        </div>
      </div>

      {/* ── テーブル ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>読み込み中…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>対象のキャストがいません</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              {/* バック率 グループヘッダー */}
              <tr style={{ background: 'var(--bg-subtle)' }}>
                <th colSpan={4} style={{ ...TH, borderBottom: 'none' }} />
                <th colSpan={3} style={{
                  ...TH, textAlign: 'center', borderBottom: 'none',
                  borderLeft: '2px solid var(--halo-200, #bfdbfe)',
                  color: 'var(--halo-700, #1d4ed8)', fontSize: 10, letterSpacing: 0.5,
                }}>
                  バック率（空欄=デフォルト）
                </th>
                <th colSpan={3} style={{ ...TH, borderBottom: 'none' }} />
              </tr>
              <tr>
                <th style={{ ...TH, width: 36 }}>#</th>
                <th style={{ ...TH, minWidth: 140 }}>源氏名</th>
                <th style={{ ...TH, minWidth: 180 }}>キャストランク</th>
                <th style={{ ...TH, minWidth: 100 }}>種別</th>
                {/* バック率 3列 */}
                <th style={{ ...TH, minWidth: 90, borderLeft: '2px solid var(--halo-200, #bfdbfe)', textAlign: 'center' }}>
                  コース
                </th>
                <th style={{ ...TH, minWidth: 90, textAlign: 'center' }}>指名料</th>
                <th style={{ ...TH, minWidth: 90, textAlign: 'center' }}>延長</th>
                <th style={{ ...TH, minWidth: 200 }}>報酬備考</th>
                <th style={{ ...TH, width: 72 }}>在籍</th>
                <th style={{ ...TH, width: 52 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lady, i) => {
                const name = lady.display_name || lady.name || '—';
                const hue = hashHue(name);
                const rank = rankMap[lady.cast_rank_id];
                const isDirty = !!dirty[lady.id];
                const isSaving = !!saving[lady.id];
                const noteVal = dirty[lady.id]?.reward_note !== undefined
                  ? (dirty[lady.id].reward_note || '')
                  : (lady.profile?.reward_note || '');
                const currentRankId = dirty[lady.id]?.cast_rank_id !== undefined
                  ? (dirty[lady.id].cast_rank_id || '')
                  : (lady.cast_rank_id || '');
                const brand = getRankBrand(rank?.code || '');
                const isLaReine = brand === 'lareine';

                return (
                  <tr
                    key={lady.id}
                    style={{
                      opacity: lady.is_active ? 1 : 0.45,
                      background: isDirty ? 'var(--bg-subtle)' : 'transparent',
                    }}
                  >
                    {/* # */}
                    <td style={{ ...TD, color: 'var(--muted)', fontSize: 11, textAlign: 'right' }}>{i + 1}</td>

                    {/* 源氏名 */}
                    <td style={TD}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={name} size={28} hue={hue} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{name}</div>
                          {lady.name && lady.display_name && (
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{lady.name}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* キャストランク */}
                    <td style={TD}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select
                          value={currentRankId}
                          onChange={(e) => handleRankChange(lady, e.target.value)}
                          disabled={isSaving}
                          style={{
                            padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6,
                            background: 'var(--bg)', color: 'var(--text)', fontSize: 12,
                            fontFamily: 'inherit', outline: 'none',
                            borderColor: currentRankId ? 'var(--halo-300, #93c5fd)' : 'var(--border)',
                          }}
                        >
                          <option value="">— 未設定 —</option>
                          {ranks.map((r) => (
                            <option key={r.id} value={r.id}>{r.label}</option>
                          ))}
                        </select>
                        {isSaving && <span style={{ fontSize: 10, color: 'var(--muted)' }}>保存中…</span>}
                      </div>
                    </td>

                    {/* 種別バッジ */}
                    <td style={{ ...TD, color: 'var(--muted)', fontSize: 12 }}>
                      {rank ? (
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                          background: isLaReine ? '#fdf4ff' : 'var(--halo-50, #eff6ff)',
                          border: `1px solid ${isLaReine ? '#c084fc' : 'var(--halo-200, #bfdbfe)'}`,
                          color: isLaReine ? '#7e22ce' : 'var(--halo-700, #1d4ed8)',
                          fontSize: 11, fontWeight: 600,
                        }}>
                          {rank.label}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: 11 }}>ランク未設定</span>
                      )}
                    </td>

                    {/* バック率: コース */}
                    <RateCell
                      lady={lady}
                      field="course_rate"
                      defVal={defCourseRate(rank?.code)}
                      isSaving={isSaving}
                      onBlur={handleRateFieldBlur}
                    />

                    {/* バック率: 指名料 (La Reine はコースに含むため N/A) */}
                    <RateCell
                      lady={lady}
                      field="nom_rate"
                      defVal={defNomRate(rank?.code)}
                      disabled={isLaReine}
                      isSaving={isSaving}
                      onBlur={handleRateFieldBlur}
                    />

                    {/* バック率: 延長 */}
                    <RateCell
                      lady={lady}
                      field="ext_rate"
                      defVal={defExtRate(rank?.code)}
                      isSaving={isSaving}
                      onBlur={handleRateFieldBlur}
                    />

                    {/* 報酬備考 */}
                    <td style={TD}>
                      <input
                        type="text"
                        defaultValue={noteVal}
                        placeholder="例：延長バック別途協議"
                        onFocus={(e) => markDirty(lady.id, 'reward_note', e.target.value)}
                        onChange={(e) => markDirty(lady.id, 'reward_note', e.target.value)}
                        onBlur={(e) => handleNoteBlur(lady, e.target.value)}
                        disabled={isSaving}
                        style={{
                          width: '100%', padding: '5px 8px',
                          border: '1px solid var(--border)', borderRadius: 6,
                          background: 'var(--bg)', color: 'var(--text)',
                          fontSize: 12, fontFamily: 'inherit', outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </td>

                    {/* 在籍状況 */}
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <span
                        className={'chip ' + (lady.is_active ? 'green' : '')}
                        style={{ fontSize: 10, cursor: 'pointer' }}
                        title={lady.is_active ? 'クリックで退職' : 'クリックで復帰'}
                        onClick={() => toggleActive(lady)}
                      >
                        {lady.is_active ? '在籍' : '退職'}
                      </span>
                    </td>

                    {/* 保存ステータス */}
                    <td style={{ ...TD, textAlign: 'center' }}>
                      {isSaving ? (
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>…</span>
                      ) : isDirty ? (
                        <span style={{ fontSize: 10, color: '#d97706' }}>未保存</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── フッター 凡例 ── */}
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 16, flexShrink: 0, flexWrap: 'wrap' }}>
        <span>💡 ランクを変更すると即時保存されます</span>
        <span>📝 バック率・備考は入力欄を離れたとき（blur）に保存されます</span>
        <span>🔄 在籍女性ページと同一データを参照しています</span>
        <span>La Reine の指名バック率はコース計算に含まれるため設定不要です</span>
      </div>
    </div>
  );
}
