import { listen } from '@tauri-apps/api/event';

const isTauri = () => typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

/**
 * Open a reservation form as a native OS window.
 * Falls back to returning null (caller renders inline) if not in Tauri.
 */
export async function openReservationWindow({ customer, reservation, onSaved, onDeleted }) {
  if (!isTauri()) return null;

  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

  const key = `rsv_${Date.now()}`;
  const storageKey = `rsv_in_${key}`;

  // Write input data for the new window to read
  localStorage.setItem(storageKey, JSON.stringify({
    customer: customer || null,
    reservation: reservation || null,
  }));

  let cleaned = false;
  const cleanup = (unlisten1, unlisten2) => {
    if (cleaned) return;
    cleaned = true;
    localStorage.removeItem(storageKey);
    unlisten1?.();
    unlisten2?.();
  };

  // Set up result listeners before opening
  const [unlistenSaved, unlistenDeleted] = await Promise.all([
    listen(`rsv_saved_${key}`, (event) => {
      cleanup(unlistenSaved, unlistenDeleted);
      onSaved?.(event.payload);
    }),
    listen(`rsv_deleted_${key}`, (event) => {
      cleanup(unlistenSaved, unlistenDeleted);
      onDeleted?.(event.payload);
    }),
  ]);

  const win = new WebviewWindow(`rsv_win_${key}`, {
    url: `/?rsvKey=${key}`,
    title: customer ? `予約入力 — ${customer.name}` : '予約入力',
    width: 1120,
    height: 700,
    minWidth: 900,
    minHeight: 560,
    resizable: true,
    alwaysOnTop: false,
    decorations: true,
  });

  win.once('tauri://destroyed', () => cleanup(unlistenSaved, unlistenDeleted));
  win.once('tauri://error', (e) => console.error('reservation window error', e));

  return win;
}
