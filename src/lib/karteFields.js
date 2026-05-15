export const KARTE_CARD_FIELD_DEFS = [
  { key: 'rating',           label: '評価バッジ',       default: true },
  { key: 'カテゴリ',          label: 'カテゴリタグ',     default: true },
  { key: '身長3サイズ',        label: '身長・3サイズ',    default: true },
  { key: '長所',              label: '長所',             default: true },
  { key: '似有名人',          label: '似有名人',         default: false },
  { key: 'duo対応',           label: 'DUO対応',          default: false },
  { key: 'インバウンド対応',   label: 'インバウンド対応', default: false },
  { key: 'プレイスタイル',     label: 'プレイスタイル',   default: false },
];

const LS_KEY        = 'karte_card_fields';
const LS_LABEL_KEY  = 'karte_card_labels';

export function getKarteCardFields() {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const defaults = Object.fromEntries(KARTE_CARD_FIELD_DEFS.map(f => [f.key, f.default]));
      return { ...defaults, ...parsed };
    }
  } catch {}
  return Object.fromEntries(KARTE_CARD_FIELD_DEFS.map(f => [f.key, f.default]));
}

export function saveKarteCardFields(fields) {
  localStorage.setItem(LS_KEY, JSON.stringify(fields));
}

export function getLabelOverrides() {
  try { return JSON.parse(localStorage.getItem(LS_LABEL_KEY) || '{}'); } catch { return {}; }
}

export function saveLabelOverrides(overrides) {
  localStorage.setItem(LS_LABEL_KEY, JSON.stringify(overrides));
}

// overrides[key] は { label?, kind? } オブジェクト
export function getFixedLabel(overrides, def) {
  const v = overrides[def.key];
  if (!v) return def.label;
  if (typeof v === 'string') return v; // 旧形式
  return v.label || def.label;
}

export function getFixedKind(overrides, def) {
  const v = overrides[def.key];
  if (!v || typeof v === 'string') return 'free';
  return v.kind || 'free';
}
