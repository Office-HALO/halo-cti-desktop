// Pricing helpers for option items / cast ranks.
// Used by the settings editor (price preview) and Phase 3's reservation
// fee-calculation engine.

/**
 * Given a list of cast ranks (in display order) and a per_rank price map
 * (item_id -> rank_id -> price), return the effective price for a given rank.
 * If the rank's price is null/undefined, fall back to the previous rank's
 * effective price (CTI V2 behavior). Returns null if no price is set anywhere.
 *
 * @param {Array<{id: string}>} rankList ordered by display_order ASC
 * @param {Record<string, number|null>} priceByRank rank_id -> price
 * @param {string} rankId target rank id
 */
export function effectivePrice(rankList, priceByRank, rankId) {
  if (!rankList?.length) return null;
  const idx = rankList.findIndex((r) => r.id === rankId);
  if (idx < 0) return null;
  for (let i = idx; i >= 0; i--) {
    const v = priceByRank[rankList[i].id];
    if (v != null && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

/**
 * Compute reward for an option item given a base price.
 *
 * @param {Object} item option_items row
 * @param {number} basePrice the resolved price for the item
 * @param {Object} ctx { isFirstMeet?: boolean, rankPriceOverride?: number|null }
 */
export function rewardFor(item, basePrice, ctx = {}) {
  if (!item) return 0;
  switch (item.reward_mode) {
    case 'percent': {
      const pct = Number(item.reward_percent) || 0;
      return Math.round((basePrice * pct) / 100);
    }
    case 'flat':
      return Number(item.reward_flat) || 0;
    case 'first_vs_repeat':
      return Number(ctx.isFirstMeet ? item.reward_first : item.reward_repeat) || 0;
    case 'none':
    default:
      return 0;
  }
}

export const KIND_DEFS = {
  course:     { label: 'コース料金',  price: 'per_rank', reward: ['percent'],            multi: false, hasDuration: true },
  nomination: { label: '指名',        price: 'flat',     reward: ['first_vs_repeat'],    multi: false },
  extension:  { label: '延長',        price: 'per_rank', reward: ['percent'],            multi: false, hasDuration: true },
  event:      { label: 'イベント',    price: 'flat',     reward: ['percent', 'flat'],    multi: true  },
  option:     { label: 'オプション',  price: 'flat',     reward: ['flat', 'none'],       multi: true  },
  discount:   { label: '割引',        price: 'flat',     reward: ['none'],               multi: true,  isNegative: true },
  transport:  { label: '交通費',      price: 'flat',     reward: ['none'],               multi: false },
  hotel:      { label: 'ホテル',      price: 'none',     reward: ['none'],               multi: false },
  driver:     { label: 'ドライバー',  price: 'none',     reward: ['none'],               multi: false },
  media:      { label: '媒体',        price: 'none',     reward: ['none'],               multi: false },
  other:      { label: 'その他',      price: 'flat',     reward: ['flat', 'none'],       multi: false },
};

export const KIND_ORDER = [
  'course', 'nomination', 'extension', 'event',
  'option', 'discount', 'transport', 'hotel',
  'driver', 'media', 'other',
];
