/**
 * pricing.js — HALO CTI 料金・報酬計算エンジン
 *
 * Gran（グラン） / La Reine（ラレーヌ）の報酬ロジックを純粋関数として実装。
 * ハードコードを避け、すべてのパーセンテージは引数で受け取れる設計。
 */

// ── ブランド判定 ──────────────────────────────────────────────
/** キャストランクコードからブランドを判定 */
export function getRankBrand(rankCode) {
  const c = (rankCode || '').toLowerCase();
  if (c === 'rank1' || c.startsWith('gran')) return 'gran';
  if (c.startsWith('lr'))                     return 'lareine';
  return null;
}

// ── 端数処理 ──────────────────────────────────────────────────
/**
 * 100円単位で四捨五入（50円以上は切り上げ）
 * 例: 550→600, 1650→1700, 25850→25900, 25800→25800
 */
export function roundToNearest100(amount) {
  return Math.floor((amount + 50) / 100) * 100;
}

// ── コース料金テーブル ─────────────────────────────────────────
export const GRAN_COURSE_TABLE = [
  { min: 70,  price: 28000 },
  { min: 90,  price: 34000 },
  { min: 120, price: 46000 },
  { min: 150, price: 58000 },
  { min: 180, price: 70000 },
  { min: 210, price: 82000 },
  { min: 240, price: 94000 },
  { min: 270, price: 106000 },
  { min: 300, price: 118000 },
  { min: 330, price: 130000 },
  { min: 360, price: 142000 },
];

export const LAREINE_COURSE_TABLE = [
  { min: 70,  price: 38000 },
  { min: 90,  price: 46000 },
  { min: 120, price: 62000 },
  { min: 150, price: 78000 },
  { min: 180, price: 94000 },
  { min: 210, price: 110000 },
  { min: 240, price: 126000 },
  { min: 270, price: 142000 },
  { min: 300, price: 158000 },
  { min: 330, price: 174000 },
  { min: 360, price: 190000 },
];

/** La Reine 120分時点の基準コース料金（120分の壁の基準値） */
export const LAREINE_PRICE_AT_120 = 62000;

export function granCoursePrice(durationMin) {
  const exact = GRAN_COURSE_TABLE.find(r => r.min === durationMin);
  if (exact) return exact.price;
  if (durationMin <= 70) return 28000;
  if (durationMin <= 90) return 34000;
  return 34000 + Math.ceil((durationMin - 90) / 30) * 12000;
}

export function laReineCoursePrice(durationMin) {
  const exact = LAREINE_COURSE_TABLE.find(r => r.min === durationMin);
  if (exact) return exact.price;
  if (durationMin <= 70) return 38000;
  if (durationMin <= 90) return 46000;
  return 46000 + Math.ceil((durationMin - 90) / 30) * 16000;
}

// ── 指名料テーブル ────────────────────────────────────────────
const GRAN_NOM_FEES    = { rank1: 2000, gran2: 2000, gran3: 3000, gran4: 4000, gran5: 5000 };
const LAREINE_NOM_FEES = { lr_base: 0, lr1: 1000, lr2: 2000, lr3: 3000, lr4: 4000, lr5: 5000 };

export function getNominationFee(rankCode) {
  const c = (rankCode || '').toLowerCase();
  if (c in GRAN_NOM_FEES)    return GRAN_NOM_FEES[c];
  if (c in LAREINE_NOM_FEES) return LAREINE_NOM_FEES[c];
  return 0;
}

// ── Gran 報酬計算 ─────────────────────────────────────────────
/**
 * Gran の報酬（バック）を計算する
 *
 * コースバック率: 一律50%
 * 指名バック率:  本指名=100%、ネット/パネル=50%、フリー=0%
 *
 * @param {object} p
 * @param {number} p.coursePrice     - コース客払い料金
 * @param {number} p.nominationFee   - 指名料（客払い）
 * @param {string} p.nominationType  - 'net'|'panel'|'honshi'|'free'
 * @param {number} [p.courseRate=0.5]   - コースバック率（変更可）
 * @param {number} [p.nomRateNet=0.5]   - ネット指名バック率
 * @param {number} [p.nomRateHonshi=1.0]- 本指名バック率
 * @returns {{ courseBack, nomBack, total }}
 */
export function calculateGranReward({
  coursePrice    = 0,
  nominationFee  = 0,
  nominationType = 'free',
  courseRate     = 0.5,
  nomRateNet     = 0.5,
  nomRateHonshi  = 1.0,
}) {
  const courseBack = Math.round(coursePrice * courseRate);
  const nomRate    = nominationType === 'honshi' ? nomRateHonshi : nomRateNet;
  const nomBack    = nominationType === 'free' ? 0 : Math.round(nominationFee * nomRate);
  return { courseBack, nomBack, total: courseBack + nomBack };
}

// ── La Reine 報酬計算（120分の壁） ────────────────────────────
/**
 * La Reine の報酬（バック）を計算する
 *
 * 120分以下: コース料金全体 × レート
 * 120分超:  120分時点のコース料金 × レート + 超過分 × 50%
 * 端数処理: 合計を100円単位で四捨五入（50円以上切り上げ）
 *
 * @param {object} p
 * @param {number} p.coursePrice     - コース客払い料金
 * @param {number} p.nominationFee   - 指名料（客払い）
 * @param {string} p.nominationType  - 'net'|'panel'|'honshi'|'free'
 * @param {number} p.durationMin     - コース分数
 * @param {number} [p.price120]      - 120分時点コース料金（デフォルト: 62000）
 * @param {number} [p.rateNet=0.55]     - ネット指名レート
 * @param {number} [p.rateHonshi=0.60]  - 本指名レート
 * @param {number} [p.rateOver=0.50]    - 120分超過分レート
 * @returns {{ courseBack, nomBack, totalRaw, total }}
 */
export function calculateLaReineReward({
  coursePrice    = 0,
  nominationFee  = 0,
  nominationType = 'free',
  durationMin    = 70,
  price120       = LAREINE_PRICE_AT_120,
  rateNet        = 0.55,
  rateHonshi     = 0.60,
  rateOver       = 0.50,
}) {
  const rate = nominationType === 'honshi' ? rateHonshi : rateNet;

  const courseBack = durationMin <= 120
    ? coursePrice * rate
    : price120 * rate + (coursePrice - price120) * rateOver;

  const nomBack = nominationType === 'free' ? 0 : nominationFee * rate;

  const totalRaw = courseBack + nomBack;
  const total    = roundToNearest100(totalRaw);

  return {
    courseBack: Math.round(courseBack),
    nomBack:    Math.round(nomBack),
    totalRaw:   Math.round(totalRaw),
    total,
  };
}

// ── 統合エントリーポイント ────────────────────────────────────
/** ランクコードからブランドを自動判定して報酬を計算 */
export function calculateReward({ rankCode, ...params }) {
  const brand = getRankBrand(rankCode);
  if (brand === 'gran')    return calculateGranReward(params);
  if (brand === 'lareine') return calculateLaReineReward(params);
  return { courseBack: 0, nomBack: 0, total: 0 };
}

// ── 既存APIとの互換レイヤー ───────────────────────────────────
export function effectivePrice(rankList, priceByRank, rankId) {
  if (!rankList?.length) return null;
  const idx = rankList.findIndex(r => r.id === rankId);
  if (idx < 0) return null;
  for (let i = idx; i >= 0; i--) {
    const v = priceByRank[rankList[i].id];
    if (v != null && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

export function rewardFor(item, basePrice, ctx = {}) {
  if (!item) return 0;
  if (ctx.rewardOverride != null && !Number.isNaN(Number(ctx.rewardOverride))) {
    return Number(ctx.rewardOverride);
  }
  switch (item.reward_mode) {
    case 'percent': {
      const pct = Number(item.reward_percent) || 0;
      return Math.round((basePrice * pct) / 100);
    }
    case 'flat':
      return Number(item.reward_flat) || 0;
    case 'first_vs_repeat':
      return Number(ctx.isFirstMeet ? item.reward_first : item.reward_repeat) || 0;
    case 'percent_first_vs_repeat': {
      const pct = ctx.isFirstMeet
        ? (Number(item.reward_percent_first) || 0)
        : (Number(item.reward_percent_repeat) || 0);
      return Math.ceil((basePrice * pct / 100) / 100) * 100;
    }
    case 'none':
    default:
      return 0;
  }
}

export const KIND_DEFS = {
  course:     { label: 'コース料金',  price: 'per_rank', reward: ['percent', 'percent_first_vs_repeat'],                  multi: false, hasDuration: true },
  nomination: { label: '指名',        price: ['flat', 'per_rank'], reward: ['first_vs_repeat', 'percent_first_vs_repeat'], multi: false },
  extension:  { label: '延長',        price: 'per_rank', reward: ['percent', 'percent_first_vs_repeat'],                  multi: false, hasDuration: true },
  event:      { label: 'イベント',    price: 'flat',     reward: ['percent', 'flat'],   multi: true  },
  option:     { label: 'オプション',  price: 'flat',     reward: ['flat', 'none'],      multi: true  },
  discount:   { label: '割引',        price: 'flat',     reward: ['none'],              multi: true,  isNegative: true },
  transport:  { label: '交通費',      price: 'flat',     reward: ['none'],              multi: false },
  hotel:      { label: 'ホテル',      price: 'none',     reward: ['none'],              multi: false },
  driver:     { label: 'ドライバー',  price: 'none',     reward: ['none'],              multi: false },
  media:      { label: '媒体',        price: 'none',     reward: ['none'],              multi: false },
  other:      { label: 'その他',      price: 'flat',     reward: ['flat', 'none'],      multi: false },
};

export const KIND_ORDER = [
  'course', 'nomination', 'extension', 'event',
  'option', 'discount', 'transport', 'hotel',
  'driver', 'media', 'other',
];

// ── 開発環境での自動検証 ─────────────────────────────────────
if (import.meta?.env?.DEV) {
  const pass = (label, got, exp) =>
    console[got === exp ? 'log' : 'error'](`${got === exp ? '✓' : '✗'} ${label}: ${got} (期待値: ${exp})`);

  console.group('📊 pricing.js 検証');

  console.group('Gran');
  let r;
  r = calculateGranReward({ coursePrice: 46000, nominationFee: 3000, nominationType: 'net' });
  pass('Gran★3 120分 ネット courseBack', r.courseBack, 23000);
  pass('Gran★3 120分 ネット nomBack',    r.nomBack,    1500);
  pass('Gran★3 120分 ネット total',      r.total,      24500);

  r = calculateGranReward({ coursePrice: 46000, nominationFee: 3000, nominationType: 'honshi' });
  pass('Gran★3 120分 本指名 courseBack', r.courseBack, 23000);
  pass('Gran★3 120分 本指名 nomBack',    r.nomBack,    3000);
  pass('Gran★3 120分 本指名 total',      r.total,      26000);

  r = calculateGranReward({ coursePrice: 70000, nominationFee: 5000, nominationType: 'honshi' });
  pass('Gran★5 180分 本指名 total',      r.total,      40000);
  console.groupEnd();

  console.group('La Reine');
  r = calculateLaReineReward({ coursePrice: 38000, nominationFee: 0, nominationType: 'net', durationMin: 70 });
  pass('LR base 70分  ネット courseBack', r.courseBack, 20900);

  r = calculateLaReineReward({ coursePrice: 46000, nominationFee: 0, nominationType: 'net', durationMin: 90 });
  pass('LR base 90分  ネット courseBack', r.courseBack, 25300);

  r = calculateLaReineReward({ coursePrice: 62000, nominationFee: 0, nominationType: 'net', durationMin: 120 });
  pass('LR base 120分 ネット courseBack', r.courseBack, 34100);

  r = calculateLaReineReward({ coursePrice: 78000, nominationFee: 0, nominationType: 'net', durationMin: 150 });
  pass('LR base 150分 ネット courseBack(120分の壁)', r.courseBack, 42100);

  r = calculateLaReineReward({ coursePrice: 78000, nominationFee: 0, nominationType: 'honshi', durationMin: 150 });
  pass('LR base 150分 本指名 courseBack(120分の壁)', r.courseBack, 45200);

  r = calculateLaReineReward({ coursePrice: 46000, nominationFee: 1000, nominationType: 'net', durationMin: 90 });
  pass('LR☆1  90分  ネット total(端数処理)', r.total, 25900); // 25300+550=25850→25900

  r = calculateLaReineReward({ coursePrice: 78000, nominationFee: 3000, nominationType: 'net', durationMin: 150 });
  pass('LR☆3  150分 ネット totalRaw', r.totalRaw, 43750);
  pass('LR☆3  150分 ネット total(端数)', r.total,   43800);

  r = calculateLaReineReward({ coursePrice: 78000, nominationFee: 5000, nominationType: 'honshi', durationMin: 150 });
  pass('LR☆5  150分 本指名 total', r.total, 48200);

  r = calculateLaReineReward({ coursePrice: 94000, nominationFee: 0, nominationType: 'net', durationMin: 180 });
  pass('LR base 180分 ネット courseBack(120分の壁)', r.courseBack, 50100);

  console.groupEnd();
  console.groupEnd();
}
