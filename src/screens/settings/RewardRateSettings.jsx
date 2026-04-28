/**
 * RewardRateSettings.jsx
 * Gran / La Reine の指名バック率を店舗単位で設定する。
 * stores.settings JSONB に保存。
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import { showToast } from '../../lib/toast.js';
import { useAppStore } from '../../store/state.js';

/** stores.settings から報酬レートを取り出す（なければデフォルト） */
export function extractRewardRates(settings = {}) {
  return {
    gran_nom_rate_net:    settings.gran_nom_rate_net    ?? 50,
    gran_nom_rate_honshi: settings.gran_nom_rate_honshi ?? 100,
    lr_rate_net:          settings.lr_rate_net          ?? 55,
    lr_rate_honshi:       settings.lr_rate_honshi       ?? 60,
    lr_rate_over:         settings.lr_rate_over         ?? 50,
  };
}

const FIELDS = [
  {
    section: 'Gran',
    color: { bg: '#fff7ed', col: '#c2410c', bdr: '#fb923c' },
    rows: [
      { key: 'gran_nom_rate_net',    label: 'ネット / パネル 指名バック率', default: 50,  note: 'フリー指名は常に0%' },
      { key: 'gran_nom_rate_honshi', label: '本指名バック率',               default: 100, note: '' },
    ],
  },
  {
    section: 'La Reine',
    color: { bg: '#fdf4ff', col: '#7e22ce', bdr: '#c084fc' },
    rows: [
      { key: 'lr_rate_net',    label: 'ネット / パネル レート',  default: 55, note: '120分以下：（コース＋指名）× このレート' },
      { key: 'lr_rate_honshi', label: '本指名レート',            default: 60, note: '120分以下：（コース＋指名）× このレート' },
      { key: 'lr_rate_over',   label: '120分超 超過分レート',    default: 50, note: '120分超の超過分にのみ適用' },
    ],
  },
];

const INP = {
  width: 72, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
  fontFamily: 'inherit', outline: 'none', textAlign: 'right',
};

export default function RewardRateSettings() {
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const stores         = useAppStore((s) => s.stores);
  const currentStore   = stores.find((s) => s.id === currentStoreId);

  const [rates,   setRates]   = useState(extractRewardRates({}));
  const [dirty,   setDirty]   = useState({});
  const [saving,  setSaving]  = useState(false);
  const [loaded,  setLoaded]  = useState(false);

  /* ── ロード ─────────────────────────────────────── */
  const load = useCallback(async () => {
    if (!currentStoreId) return;
    const { data } = await supabase
      .from('stores').select('settings').eq('id', currentStoreId).single();
    const r = extractRewardRates(data?.settings || {});
    setRates(r);
    setDirty({});
    setLoaded(true);
  }, [currentStoreId]);

  useEffect(() => { load(); }, [load]);

  /* ── 変更 ───────────────────────────────────────── */
  const handleChange = (key, val) => {
    setDirty((d) => ({ ...d, [key]: val }));
    setRates((r) => ({ ...r, [key]: val }));
  };

  /* ── 保存 ───────────────────────────────────────── */
  const save = async () => {
    if (!Object.keys(dirty).length) { showToast('ok', '変更はありません'); return; }
    // バリデーション
    for (const [key, val] of Object.entries(dirty)) {
      const n = Number(val);
      if (isNaN(n) || n < 0 || n > 100) {
        showToast('error', `${key}: 0〜100 の値を入力してください`);
        return;
      }
    }
    setSaving(true);
    // 既存 settings とマージ
    const { data: cur } = await supabase
      .from('stores').select('settings').eq('id', currentStoreId).single();
    const merged = { ...(cur?.settings || {}), ...Object.fromEntries(
      Object.entries(dirty).map(([k, v]) => [k, Number(v)])
    )};
    const { error } = await supabase
      .from('stores').update({ settings: merged }).eq('id', currentStoreId);
    setSaving(false);
    if (error) { showToast('error', error.message); return; }
    showToast('ok', 'レート設定を保存しました');
    setDirty({});
    load();
  };

  if (!currentStoreId) {
    return <div style={{ padding: 24, color: 'var(--muted)', fontSize: 13 }}>店舗を選択してください</div>;
  }

  const dirtyCount = Object.keys(dirty).length;

  return (
    <div>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>レート設定</h2>
          {currentStore && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
              {currentStore.name} — 指名バック率などの基本レートを設定します
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirtyCount > 0 && (
            <span style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>● {dirtyCount}件 未保存</span>
          )}
          <button className="btn sm ghost" onClick={load} disabled={saving}>リセット</button>
          <button className="btn sm primary" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>

      {/* 注記 */}
      <div style={{
        padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: 6,
        fontSize: 12, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 20,
      }}>
        ここで変更した値は予約入力の報酬計算にリアルタイムで反映されます。<br />
        <strong style={{ color: 'var(--text)' }}>コースバック率</strong>はキャスト個別設定（キャスト報酬ページ）で上書きできます。ここで設定するのは<strong style={{ color: 'var(--text)' }}>指名料のバック率</strong>です。
      </div>

      {/* セクション */}
      {loaded && FIELDS.map(({ section, color, rows }) => (
        <div key={section} style={{
          marginBottom: 20, border: `1px solid ${color.bdr}`,
          borderRadius: 8, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 16px', background: color.bg,
            fontWeight: 700, fontSize: 13, color: color.col,
          }}>
            {section}
          </div>
          <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            {rows.map(({ key, label, default: def, note }) => {
              const val      = rates[key] ?? def;
              const isDirty  = dirty[key] !== undefined;
              const isCustom = !isDirty && val !== def;
              return (
                <div key={key} style={{
                  display: 'grid', gridTemplateColumns: '220px 100px 1fr',
                  alignItems: 'center', gap: 12,
                }}>
                  <label style={{ fontSize: 13, fontWeight: 500 }}>{label}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      min={0} max={100} step={1}
                      value={val}
                      onChange={(e) => handleChange(key, e.target.value)}
                      style={{
                        ...INP,
                        borderColor: isDirty ? '#d97706' : isCustom ? color.bdr : 'var(--border)',
                        background:  isDirty ? '#fef9c3' : isCustom ? color.bg  : 'var(--bg)',
                        fontWeight:  (isDirty || isCustom) ? 700 : 400,
                        color:       isDirty ? '#92400e' : isCustom ? color.col : 'var(--text)',
                      }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>%</span>
                    {val !== def && (
                      <button
                        onClick={() => handleChange(key, def)}
                        title="デフォルトに戻す"
                        style={{
                          fontSize: 10, color: 'var(--muted)', background: 'none',
                          border: 'none', cursor: 'pointer', padding: '0 2px',
                        }}
                      >↩ {def}%</button>
                    )}
                  </div>
                  {note && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{note}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
