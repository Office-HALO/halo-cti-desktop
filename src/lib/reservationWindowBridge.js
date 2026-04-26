import { listen } from '@tauri-apps/api/event';

const isTauri = () => typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

/**
 * Open a reservation form as a native OS window.
 * Falls back to returning null if not in Tauri.
 */
export async function openReservationWindow({ customer, reservation, onSaved, onDeleted }) {
  if (!isTauri()) return null;

  let WebviewWindow;
  try {
    ({ WebviewWindow } = await import('@tauri-apps/api/webviewWindow'));
  } catch (e) {
    console.error('WebviewWindow import failed', e);
    return null;
  }

  const key = `rsv_${Date.now()}`;
  const storageKey = `rsv_in_${key}`;

  localStorage.setItem(storageKey, JSON.stringify({
    customer: customer || null,
    reservation: reservation || null,
  }));

  let cleaned = false;
  let unlistenSaved, unlistenDeleted;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    localStorage.removeItem(storageKey);
    unlistenSaved?.();
    unlistenDeleted?.();
  };

  try {
    [unlistenSaved, unlistenDeleted] = await Promise.all([
      listen(`rsv_saved_${key}`, (event) => { cleanup(); onSaved?.(event.payload); }),
      listen(`rsv_deleted_${key}`, (event) => { cleanup(); onDeleted?.(event.payload); }),
    ]);
  } catch (e) {
    console.error('listen failed', e);
    localStorage.removeItem(storageKey);
    return null;
  }

  let win;
  try {
    win = new WebviewWindow(`rsv_win_${key}`, {
      url: `/?rsvKey=${key}`,
      title: customer ? `予約入力 — ${customer.name}` : '予約入力',
      width: 1120,
      height: 700,
      minWidth: 900,
      minHeight: 560,
      resizable: true,
      decorations: true,
    });
    win.once('tauri://destroyed', cleanup);
    win.once('tauri://error', (e) => {
      console.error('reservation window error', e);
      cleanup();
    });
  } catch (e) {
    console.error('WebviewWindow creation failed', e);
    cleanup();
    return null;
  }

  return win;
}
