import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { BOOKING_STATUS } from '../lib/bookingStatus.js';
import Icon from '../components/Icon.jsx';

export default function BookingQuickView({ booking, castName, onClose, onEdit }) {
  const [extra, setExtra] = useState(null);

  useEffect(() => {
    if (!booking?.id) return;
    let cancelled = false;
    (async () => {
      const { data: rsv } = await supabase
        .from('reservations')
        .select('customer_id, customers(*)')
        .eq('id', booking.id)
        .maybeSingle();
      if (cancelled || !rsv?.customers) return;
      const { data: visits } = await supabase
        .from('reservations')
        .select('amount')
        .eq('customer_id', rsv.customer_id)
        .not('status', 'in', '(cancelled,hold,ng,no_show)');
      if (cancelled) return;
      setExtra({
        phone: rsv.customers.phone || '',
        alertMemo: rsv.customers.alert_memo || '',
        visitCount: (visits || []).length,
        visitTotal: (visits || []).reduce((s, r) => s + (r.amount || 0), 0),
      });
    })();
    return () => { cancelled = true; };
  }, [booking?.id]);

  if (!booking) return null;
  const st = BOOKING_STATUS[booking.status] || BOOKING_STATUS.reserved;
  const phone = extra?.phone || '';
  const phoneDisplay = formatPhone(phone) || (booking.phone_last4 ? `下4桁: ${booking.phone_last4}` : '');

  return (
    <div className="bqv-panel">
      <div className="bqv-header">
        <button className="btn xs ghost" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="chevronL" size={12} />
          閉じる
        </button>
        <button className="btn xs primary" onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="edit" size={12} />
          編集で開く
        </button>
      </div>

      <div className="bqv-body">
        {/* 顧客セクション */}
        <div className="bqv-section">
          <div className="bqv-sec-title">顧客情報</div>

          {phoneDisplay && (
            <div className="bqv-phone">
              <Icon name="phone" size={14} />
              {phoneDisplay}
            </div>
          )}

          <div className="bqv-name-row">
            <span className="bqv-cust-name">{booking.customer || '—'}</span>
            {booking.member_no && <span className="bqv-member">{booking.member_no}</span>}
          </div>

          {extra && extra.visitCount > 0 && (
            <div className="bqv-visit-row">
              <span className="bqv-visit-count">{extra.visitCount}本</span>
              {extra.visitTotal > 0 && (
                <span className="bqv-visit-total">¥{extra.visitTotal.toLocaleString()}</span>
              )}
            </div>
          )}

          {booking.cust_address && (
            <div className="bqv-address">
              <Icon name="map" size={12} />
              {booking.cust_address}
            </div>
          )}

          {extra?.alertMemo && (
            <div className="bqv-alert">
              <Icon name="bolt" size={12} />
              {extra.alertMemo}
            </div>
          )}
        </div>

        {/* 予約セクション */}
        <div className="bqv-section">
          <div className="bqv-sec-title">予約情報</div>

          <div className="bqv-status-row">
            <span className="bqv-status-badge" style={{ background: st.bg, borderLeft: `3px solid ${st.line}` }}>
              {st.label}
            </span>
            <span className="bqv-time mono">{booking.start} → {booking.end}</span>
            {booking.duration_min && <span className="bqv-dur">（{booking.duration_min}分）</span>}
          </div>

          {castName && <BqvRow label="キャスト" value={castName} />}
          {booking.course && <BqvRow label="コース" value={booking.course} />}
          {booking.hotel && (
            <BqvRow label="ホテル" value={booking.hotel + (booking.room_no ? `  ${booking.room_no}号室` : '')} />
          )}
          {!booking.hotel && booking.room_no && <BqvRow label="部屋" value={booking.room_no} />}
          {booking.send_driver && <BqvRow label="送りD" value={booking.send_driver} />}
          {booking.recv_driver && <BqvRow label="迎えD" value={booking.recv_driver} />}
          {booking.nomination && <BqvRow label="指名" value={booking.nomination} />}
          {booking.amount != null && (
            <BqvRow label="料金" value={`¥${Number(booking.amount).toLocaleString()}`} />
          )}
          {booking.fee_adj > 0 && (
            <BqvRow label="手数料" value={`¥${Number(booking.fee_adj).toLocaleString()}`} />
          )}
          {booking.payment && <BqvRow label="支払い" value={booking.payment} />}
          {booking.advance_cash > 0 && (
            <BqvRow label="前渡金" value={`¥${Number(booking.advance_cash).toLocaleString()}`} />
          )}

          <ItemsRows items={booking.items || []} />

          {booking.memo && <BqvRow label="メモ" value={booking.memo} />}
        </div>
      </div>
    </div>
  );
}

function BqvRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="bqv-row">
      <span className="bqv-row-label">{label}</span>
      <span className="bqv-row-value">{value}</span>
    </div>
  );
}

const KIND_LABELS = {
  option: 'オプション',
  event: 'イベント',
  discount: '割引',
  transport: '交通費',
  extension: '延長',
  hotel: 'ホテル種別',
  media: '媒体',
  other: '特殊',
};

function ItemsRows({ items }) {
  const groups = {};
  for (const item of items) {
    if (!item.kind || !item.name) continue;
    if (!groups[item.kind]) groups[item.kind] = [];
    groups[item.kind].push(item.name);
  }
  return Object.entries(groups).map(([kind, names]) => (
    <BqvRow key={kind} label={KIND_LABELS[kind] || kind} value={names.join('・')} />
  ));
}

function formatPhone(phone) {
  const d = (phone || '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}
