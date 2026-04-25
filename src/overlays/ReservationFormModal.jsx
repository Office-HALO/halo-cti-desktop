import { useState, useEffect, useMemo } from 'react';
import Icon from '../components/Icon.jsx';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';

const COURSES = [
  { label: '60分', min: 60 },
  { label: '90分', min: 90 },
  { label: '120分', min: 120 },
  { label: '150分', min: 150 },
  { label: '180分', min: 180 },
];

const STATUSES = [
  { value: 'reserved', label: '予約済' },
  { value: 'received', label: '受領済' },
  { value: 'working', label: '対応中' },
  { value: 'complete', label: '完了' },
  { value: 'hold', label: '仮予約' },
  { value: 'cancelled', label: 'キャンセル' },
];

function toHHMM(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function trimSec(t) {
  return (t || '').slice(0, 5);
}
function addMinutes(hhmm, min) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + min;
  const nh = Math.floor((total / 60) % 24);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Unified reservation create/edit modal.
 * - Pass `customer` to create new
 * - Pass `reservation` (with customer_id) to edit existing
 */
export default function ReservationFormModal({ customer, reservation, onClose, onSaved, onDeleted }) {
  const isEdit = !!reservation?.id;
  const cust = customer || reservation?.customer || null;

  const [ladies, setLadies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [date, setDate] = useState(reservation?.reserved_date || todayISO());
  const [startTime, setStartTime] = useState(
    reservation?.start_time ? trimSec(reservation.start_time) : toHHMM(new Date(Date.now() + 30 * 60 * 1000))
  );
  const [duration, setDuration] = useState(reservation?.duration_min || 90);
  const [ladyId, setLadyId] = useState(reservation?.lady_id || '');
  const [course, setCourse] = useState(reservation?.course || '90分コース');
  const [hotel, setHotel] = useState(reservation?.hotel || '');
  const [roomNo, setRoomNo] = useState(reservation?.room_no || '');
  const [amount, setAmount] = useState(reservation?.amount || '');
  const [memo, setMemo] = useState(reservation?.memo || '');
  const [status, setStatus] = useState(reservation?.status || 'reserved');

  useEffect(() => {
    supabase.from('ladies').select('id, display_name, name').eq('is_active', true).order('display_name')
      .then(({ data }) => setLadies(data || []));
  }, []);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const endTime = useMemo(() => addMinutes(startTime, duration), [startTime, duration]);

  const save = async () => {
    if (!cust?.id && !reservation?.customer_id) {
      showToast('error', '顧客情報がありません');
      return;
    }
    setLoading(true);
    const payload = {
      customer_id: cust?.id || reservation.customer_id,
      lady_id: ladyId || null,
      reserved_date: date,
      start_time: startTime + ':00',
      end_time: endTime + ':00',
      duration_min: Number(duration),
      status,
      course: course || null,
      hotel: hotel || null,
      room_no: roomNo || null,
      amount: amount ? Number(amount) : null,
      memo: memo || null,
    };

    let resp;
    if (isEdit) {
      resp = await supabase.from('reservations').update(payload).eq('id', reservation.id).select().single();
    } else {
      resp = await supabase.from('reservations').insert(payload).select().single();
    }
    setLoading(false);
    if (resp.error) { showToast('error', '保存失敗: ' + resp.error.message); return; }
    showToast('success', isEdit ? '予約を更新しました' : '予約を登録しました');
    onSaved?.(resp.data);
    onClose();
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setLoading(true);
    const { error } = await supabase.from('reservations').delete().eq('id', reservation.id);
    setLoading(false);
    if (error) { showToast('error', '削除失敗: ' + error.message); return; }
    showToast('success', '予約を削除しました');
    onDeleted?.(reservation.id);
    onClose();
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="nr-modal">
        <div className="nr-head">
          <div>
            <div className="nr-title">{isEdit ? '予約を編集' : '新規予約'}</div>
            <div className="nr-subtitle">
              {cust?.name || '顧客未選択'}{' '}
              {cust?.phone_normalized && <span className="mono">({cust.phone_normalized})</span>}
            </div>
          </div>
          <button className="cp-icon-btn" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>

        <div className="nr-body">
          <div className="nr-grid">
            {isEdit && (
              <label className="nr-field nr-full">
                <span>ステータス</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            )}
            <label className="nr-field">
              <span>日付</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="nr-field">
              <span>開始時刻</span>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="nr-field">
              <span>時間</span>
              <select value={duration} onChange={(e) => {
                const m = Number(e.target.value);
                setDuration(m);
                const match = COURSES.find((c) => c.min === m);
                if (match) setCourse(match.label + 'コース');
              }}>
                {COURSES.map((c) => <option key={c.min} value={c.min}>{c.label}</option>)}
              </select>
            </label>
            <label className="nr-field">
              <span>終了時刻</span>
              <input type="text" value={endTime} readOnly className="mono" style={{ background: 'var(--row-alt)' }} />
            </label>
            <label className="nr-field nr-full">
              <span>指名女性</span>
              <select value={ladyId} onChange={(e) => setLadyId(e.target.value)}>
                <option value="">— 未指定(フリー)—</option>
                {ladies.map((l) => <option key={l.id} value={l.id}>{l.display_name || l.name}</option>)}
              </select>
            </label>
            <label className="nr-field nr-full">
              <span>コース</span>
              <input type="text" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="90分コース" />
            </label>
            <label className="nr-field">
              <span>ホテル</span>
              <input type="text" value={hotel} onChange={(e) => setHotel(e.target.value)} placeholder="ホテル大阪心斎橋" />
            </label>
            <label className="nr-field">
              <span>部屋番号</span>
              <input type="text" value={roomNo} onChange={(e) => setRoomNo(e.target.value)} placeholder="810" />
            </label>
            <label className="nr-field nr-full">
              <span>金額</span>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="40000" />
            </label>
            <label className="nr-field nr-full">
              <span>メモ</span>
              <textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="nr-actions">
          {isEdit && (
            <button className="cf-btn danger-outline" onClick={handleDelete} disabled={loading}>
              <Icon name="trash" size={13} />{confirmDelete ? '本当に削除する' : '削除'}
            </button>
          )}
          <button className="cf-btn ghost" onClick={onClose} disabled={loading}>キャンセル</button>
          <button className="cf-btn primary" onClick={save} disabled={loading} style={{ marginLeft: 'auto' }}>
            <Icon name="check" size={13} />{loading ? '保存中...' : (isEdit ? '更新する' : '予約を登録')}
          </button>
        </div>
      </div>
    </>
  );
}
