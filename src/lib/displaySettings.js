const GANTT_KEY = 'gantt_block_fields';

export const GANTT_BODY_FIELD_DEFS = [
  { key: 'customer',    label: '顧客名',                 defaultOn: true  },
  { key: 'status',      label: 'ステータス',             defaultOn: true  },
  { key: 'duration',    label: '時間の長さ',             defaultOn: false },
  { key: 'member_no',   label: '顧客会員番号',           defaultOn: false },
  { key: 'phone_last4', label: '顧客電話番号下４桁',     defaultOn: false },
  { key: 'store_name',  label: '店舗名',                 defaultOn: false },
  { key: 'send_driver', label: '送りドライバー',         defaultOn: false },
  { key: 'recv_driver', label: '迎えドライバー',         defaultOn: false },
  { key: 'location',    label: 'ホテルもしくは顧客住所', defaultOn: false },
  { key: 'course',      label: 'コース',                 defaultOn: false },
  { key: 'nomination',  label: '指名',                   defaultOn: false },
  { key: 'discount',    label: '割引',                   defaultOn: false },
  { key: 'amount',      label: '料金総額',               defaultOn: false },
  { key: 'amount_card', label: '料金総額＋カード手数料', defaultOn: false },
  { key: 'event',       label: 'イベント',               defaultOn: false },
  { key: 'hotel_item',  label: 'ホテル',                 defaultOn: false },
  { key: 'room_no',     label: '部屋',                   defaultOn: false },
  { key: 'option',      label: 'オプション',             defaultOn: false },
  { key: 'payment',     label: '支払い方法',             defaultOn: false },
  { key: 'extension',   label: '延長',                   defaultOn: false },
  { key: 'transport',   label: '交通費',                 defaultOn: false },
  { key: 'meet_place',  label: '待ち合わせ場所',         defaultOn: false },
  { key: 'advance_cash',label: '釣銭用前渡金',           defaultOn: false },
  { key: 'special',     label: '特殊',                   defaultOn: false },
  { key: 'store_burden',label: 'お店負担',               defaultOn: false },
  { key: 'media',       label: '媒体',                   defaultOn: false },
  { key: 'membership',  label: '入会金',                 defaultOn: false },
  { key: 'creator',     label: '作成者',                 defaultOn: false },
  { key: 'recv_staff',  label: '受領スタッフ',           defaultOn: false },
  { key: 'memo',        label: 'メモ',                   defaultOn: false },
];

// Returns ordered array: [{ key, label, visible }, ...]
export function getGanttBodyFields() {
  try {
    const saved = JSON.parse(localStorage.getItem(GANTT_KEY) || 'null');
    if (Array.isArray(saved) && saved.length > 0) {
      const savedKeys = saved.map(f => f.key);
      const result = saved.map(f => ({
        ...f,
        label: GANTT_BODY_FIELD_DEFS.find(d => d.key === f.key)?.label || f.label,
      }));
      for (const def of GANTT_BODY_FIELD_DEFS) {
        if (!savedKeys.includes(def.key)) {
          result.push({ key: def.key, label: def.label, visible: def.defaultOn });
        }
      }
      return result;
    }
  } catch { /* fall through */ }
  return GANTT_BODY_FIELD_DEFS.map(d => ({ key: d.key, label: d.label, visible: d.defaultOn }));
}

export function saveGanttBodyFields(fields) {
  localStorage.setItem(GANTT_KEY, JSON.stringify(fields));
}

// selected_items から kind で名前を結合
export function itemNames(items, kind) {
  return (items || []).filter(i => i.kind === kind).map(i => i.name).filter(Boolean).join('・');
}

// ブッキングオブジェクトからフィールドキーの表示値を返す
export function resolveBlockField(key, b, storeName) {
  const items = b.items || [];
  switch (key) {
    case 'customer':    return b.customer || '';
    case 'status':      return '';  // ステータスはバッジ特別扱い
    case 'duration':    return b.duration_min ? `${b.duration_min}分` : '';
    case 'member_no':   return b.member_no || '';
    case 'phone_last4': return b.phone_last4 ? `下4桁: ${b.phone_last4}` : '';
    case 'store_name':  return storeName || '';
    case 'send_driver': return b.send_driver ? `送:${b.send_driver}` : '';
    case 'recv_driver': return b.recv_driver ? `迎:${b.recv_driver}` : '';
    case 'location':    return b.hotel || b.cust_address || '';
    case 'course':      return b.course || '';
    case 'nomination':  return b.nomination || '';
    case 'discount':    return itemNames(items, 'discount');
    case 'amount':      return b.amount != null ? `¥${Number(b.amount).toLocaleString()}` : '';
    case 'amount_card': return b.amount != null
      ? `¥${(Number(b.amount) + Number(b.fee_adj || 0)).toLocaleString()}` : '';
    case 'event':       return itemNames(items, 'event');
    case 'hotel_item':  return itemNames(items, 'hotel');
    case 'room_no':     return b.room_no || '';
    case 'option':      return itemNames(items, 'option');
    case 'payment':     return b.payment || '';
    case 'extension':   return itemNames(items, 'extension');
    case 'transport':   return itemNames(items, 'transport');
    case 'meet_place':  return b.hotel || '';
    case 'advance_cash':return b.advance_cash != null ? `¥${Number(b.advance_cash).toLocaleString()}` : '';
    case 'special':     return itemNames(items, 'other');
    case 'store_burden':return b.fee_adj ? `¥${Number(b.fee_adj).toLocaleString()}` : '';
    case 'media':       return itemNames(items, 'media') || b.first_media || '';
    case 'membership':  return (items).filter(i => (i.name || '').includes('入会金')).map(i => i.name).join('・');
    case 'creator':     return b.creator_name || '';
    case 'recv_staff':  return b.recv_staff_name || '';
    case 'memo':        return b.memo || '';
    default:            return '';
  }
}
