import { useState } from 'react';
import Icon from '../../components/Icon.jsx';

const INP = {
  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

function needsPerRank(kind) {
  return kind === 'course' || kind === 'extension';
}

function defaultPriceMode(kind) {
  return needsPerRank(kind) ? 'per_rank' : 'flat';
}

function defaultRewardMode(kind) {
  if (kind === 'nomination') return 'first_vs_repeat';
  if (kind === 'course' || kind === 'extension') return 'percent';
  if (kind === 'transport' || kind === 'hotel' || kind === 'driver' || kind === 'media' || kind === 'discount') return 'none';
  return 'flat';
}

export default function OptionItemEditor({ kind, ranks, item, rankPrices = {}, onSave, onClose }) {
  const isNew = !item?.id;
  const [form, setForm] = useState(() => ({
    name: item?.name || '',
    display_order: item?.display_order ?? 0,
    is_active: item?.is_active ?? true,
    duration_min: item?.duration_min != null ? String(item.duration_min) : '',
    allow_zero_min: item?.allow_zero_min || false,
    price_mode: item?.price_mode || defaultPriceMode(kind),
    price_flat: item?.price_flat != null ? String(item.price_flat) : '',
    reward_mode: item?.reward_mode || defaultRewardMode(kind),
    reward_percent: item?.reward_percent != null ? String(item.reward_percent) : '',
    reward_flat: item?.reward_flat != null ? String(item.reward_flat) : '',
    reward_first: item?.reward_first != null ? String(item.reward_first) : '',
    reward_repeat: item?.reward_repeat != null ? String(item.reward_repeat) : '',
  }));
  const [rankPriceForm, setRankPriceForm] = useState(() => {
    const init = {};
    ranks.forEach((r) => { init[r.id] = rankPrices[r.id] != null ? String(rankPrices[r.id]) : ''; });
    return init;
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const showDuration = kind === 'course' || kind === 'extension';
  const showPrice = kind !== 'hotel' && kind !== 'driver' && kind !== 'media';
  const showReward = kind !== 'transport' && kind !== 'hotel' && kind !== 'driver' && kind !== 'media' && kind !== 'discount';
  const rewardModeFixed = kind === 'nomination' || kind === 'course' || kind === 'extension';

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave(form, rankPriceForm);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        style={{ width: 'min(600px, calc(100vw - 32px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span style={{ fontWeight: 600 }}>{isNew ? 'アイテムを追加' : 'アイテムを編集'}</span>
          <button className="btn sm ghost" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>
        <div style={{ padding: 16 }}>

          {/* 基本情報 */}
          <FieldGroup label="基本情報">
            <FormRow label="名前 *">
              <input style={INP} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="例: 70分" autoFocus />
            </FormRow>
            {showDuration && (
              <FormRow label="時間（分）">
                <input style={{ ...INP, width: 90 }} type="number" value={form.duration_min} onChange={(e) => set('duration_min', e.target.value)} placeholder="70" />
              </FormRow>
            )}
            <FormRow label="有効">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            </FormRow>
            <FormRow label="表示順">
              <input style={{ ...INP, width: 80 }} type="number" value={form.display_order} onChange={(e) => set('display_order', e.target.value)} />
            </FormRow>
          </FieldGroup>

          {/* 価格 */}
          {showPrice && (
            <FieldGroup label="価格">
              {needsPerRank(kind) && (
                <FormRow label="価格モード">
                  <div className="btn-group">
                    {[['per_rank', 'ランク別'], ['flat', '一律']].map(([m, lbl]) => (
                      <button key={m} className={'btn sm' + (form.price_mode === m ? ' primary' : '')} onClick={() => set('price_mode', m)}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </FormRow>
              )}

              {form.price_mode === 'per_rank' && ranks.length > 0 && ranks.map((r) => (
                <FormRow key={r.id} label={r.label}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>¥</span>
                    <input
                      style={{ ...INP, width: 120 }}
                      type="number"
                      value={rankPriceForm[r.id] ?? ''}
                      onChange={(e) => setRankPriceForm((p) => ({ ...p, [r.id]: e.target.value }))}
                      placeholder="（継承）"
                    />
                  </div>
                </FormRow>
              ))}

              {form.price_mode === 'per_rank' && ranks.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>
                  キャストランクが登録されていません。先にキャストランクを追加してください。
                </div>
              )}

              {form.price_mode === 'flat' && (
                <FormRow label="価格">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>¥</span>
                    <input style={{ ...INP, width: 120 }} type="number" value={form.price_flat} onChange={(e) => set('price_flat', e.target.value)} />
                  </div>
                </FormRow>
              )}
            </FieldGroup>
          )}

          {/* 報酬 */}
          {showReward && (
            <FieldGroup label="キャスト報酬">
              {kind === 'nomination' ? (
                <>
                  <FormRow label="初回報酬">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>¥</span>
                      <input style={{ ...INP, width: 120 }} type="number" value={form.reward_first} onChange={(e) => set('reward_first', e.target.value)} />
                    </div>
                  </FormRow>
                  <FormRow label="リピート報酬">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>¥</span>
                      <input style={{ ...INP, width: 120 }} type="number" value={form.reward_repeat} onChange={(e) => set('reward_repeat', e.target.value)} />
                    </div>
                  </FormRow>
                </>
              ) : (kind === 'course' || kind === 'extension') ? (
                <FormRow label="報酬率">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input style={{ ...INP, width: 80 }} type="number" value={form.reward_percent} onChange={(e) => set('reward_percent', e.target.value)} />
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>%</span>
                  </div>
                </FormRow>
              ) : (
                <>
                  {!rewardModeFixed && (
                    <FormRow label="報酬モード">
                      <select
                        style={{ ...INP, width: 'auto' }}
                        value={form.reward_mode}
                        onChange={(e) => set('reward_mode', e.target.value)}
                      >
                        <option value="none">なし</option>
                        <option value="flat">固定額</option>
                        {kind === 'event' && <option value="percent">割合 (%)</option>}
                      </select>
                    </FormRow>
                  )}
                  {form.reward_mode === 'flat' && (
                    <FormRow label="報酬">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>¥</span>
                        <input style={{ ...INP, width: 120 }} type="number" value={form.reward_flat} onChange={(e) => set('reward_flat', e.target.value)} />
                      </div>
                    </FormRow>
                  )}
                  {form.reward_mode === 'percent' && (
                    <FormRow label="報酬率">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input style={{ ...INP, width: 80 }} type="number" value={form.reward_percent} onChange={(e) => set('reward_percent', e.target.value)} />
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>%</span>
                      </div>
                    </FormRow>
                  )}
                </>
              )}
            </FieldGroup>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8 }}>
            <button className="btn sm ghost" onClick={onClose}>キャンセル</button>
            <button className="btn sm primary" onClick={handleSave} disabled={!form.name.trim()}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'grid', gap: 8 }}>{children}</div>
    </div>
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
