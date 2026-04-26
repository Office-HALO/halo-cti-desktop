import { useState, useEffect } from 'react';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import ReservationFormModal from '../overlays/ReservationFormModal.jsx';
import Toast from '../components/Toast.jsx';
import { useAppStore } from '../store/state.js';
import { supabase } from '../lib/supabase.js';
import '../styles.css';

export default function ReservationStandaloneApp({ rsvKey }) {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState(null);
  const setStores = useAppStore((s) => s.setStores);
  const setCurrentStoreId = useAppStore((s) => s.setCurrentStoreId);

  useEffect(() => {
    // Load stores so ReservationFormModal has master data
    supabase.from('stores').select('*').eq('is_active', true).order('display_order')
      .then(({ data: rows }) => {
        if (rows?.length) {
          setStores(rows);
          const saved = localStorage.getItem('halo.cti.currentStoreId');
          const valid = saved && rows.find((s) => s.id === saved);
          setCurrentStoreId(valid ? saved : rows[0].id);
        }
      });

    const raw = localStorage.getItem(`rsv_in_${rsvKey}`);
    if (raw) {
      try { setData(JSON.parse(raw)); } catch { setData({}); }
    }
    setReady(true);
  }, [rsvKey]);

  const handleClose = async () => {
    const win = getCurrentWindow();
    win.close();
  };

  const handleSaved = async (savedData) => {
    await emit(`rsv_saved_${rsvKey}`, savedData);
    const win = getCurrentWindow();
    win.close();
  };

  const handleDeleted = async (id) => {
    await emit(`rsv_deleted_${rsvKey}`, id);
    const win = getCurrentWindow();
    win.close();
  };

  if (!ready) return null;

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: 'var(--bg, #f5f5f7)' }}>
      <ReservationFormModal
        customer={data?.customer}
        reservation={data?.reservation}
        onClose={handleClose}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
        standalone
      />
      <Toast />
    </div>
  );
}
