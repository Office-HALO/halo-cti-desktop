import { useState, useEffect } from 'react';
import Icon from './Icon.jsx';

const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

export default function Updater() {
  const [update, setUpdate] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | downloading | done
  const [debug, setDebug] = useState(isTauri ? 'チェック中...' : '');

  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;

    (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const u = await check();
        if (cancelled) return;
        if (u?.available) {
          setUpdate(u);
          setDebug('');
        } else {
          setDebug('最新版です');
          setTimeout(() => setDebug(''), 4000);
        }
      } catch (e) {
        console.error('[updater]', e);
        setDebug('更新確認失敗: ' + (e?.message || String(e)).slice(0, 200));
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const install = async () => {
    setStatus('downloading');
    try {
      await update.downloadAndInstall();
      setStatus('done');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      console.error('[updater install]', e);
      setDebug('インストール失敗: ' + (e?.message || String(e)).slice(0, 200));
      setStatus('idle');
    }
  };

  if (update) {
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

  if (debug) {
    return (
      <div className="updater-banner" style={{ background: 'oklch(0.30 0.04 250)' }}>
        <Icon name="refresh" size={14} />
        <span style={{ fontSize: 12 }}>{debug}</span>
      </div>
    );
  }

  return null;
}
