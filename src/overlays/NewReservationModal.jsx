import { useEffect } from 'react';
import { openReservationWindow } from '../lib/reservationWindowBridge.js';

// Opens a native OS window for reservation entry.
export default function NewReservationModal({ customer, onClose, onCreated }) {
  useEffect(() => {
    openReservationWindow({ customer, onSaved: onCreated }).then((win) => {
      if (!win) {
        // Tauri not available — fallback handled by caller
      }
    });
    onClose?.();
  }, []);

  return null;
}
