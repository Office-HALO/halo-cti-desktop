import { useState, useEffect } from 'react';
import { openReservationWindow } from '../lib/reservationWindowBridge.js';
import ReservationFormModal from './ReservationFormModal.jsx';

/**
 * 新規予約エントリポイント。
 * - Tauri 環境: 別ウィンドウ（ReservationStandaloneApp）を開く
 * - ブラウザ/開発環境: ReservationFormModal をインラインフォールバック表示
 */
export default function NewReservationModal({ customer, onClose, onCreated }) {
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    openReservationWindow({ customer, onSaved: onCreated }).then((win) => {
      if (!win) {
        // Tauri が利用できない（ブラウザ開発時など）→ モーダルフォールバック
        setUseFallback(true);
      } else {
        // 別ウィンドウが開いたのでこのコンポーネントは閉じる
        onClose?.();
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!useFallback) return null;

  return (
    <ReservationFormModal
      customer={customer}
      reservation={null}
      onClose={onClose}
      onSaved={(saved) => { onCreated?.(saved); onClose?.(); }}
    />
  );
}
