import { useState, useEffect } from 'react';
import Icon from './Icon.jsx';

// Only available in Tauri environment
const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__;

export default function Updater() {
  const [update, setUpdate] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | downloading | done

  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;

    (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const u = await check();
        if (!cancelled && u?.available) setUpdate(u);
      } catch {
        // silently ignore (no network, no release yet, etc.)
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (!update) return null;

  const install = async () => {
    setStatus('downloading');
    try {
      await update.downloadAndInstall();
      setStatus('done');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch {
      setStatus('idle');
    }
  };

  return (
    <div className="updater-banner">
      <Icon name="refresh" size={14} />
      <span>新しいバージョン <b>{update.version}</b> があります</span>
      {status === 'idle' && (
        <button className="btn sm primary" onClick={install}>
          今すぐアップデート
        </button>
      )}
      {status === 'downloading' && (
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>ダウンロード中...</span>
      )}
    </div>
  );
}
