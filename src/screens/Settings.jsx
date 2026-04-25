import { useState, useEffect } from 'react';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';

const RINGTONE_KEY = 'halo.cti.ringtoneEnabled';
const NOTIFY_KEY = 'halo.cti.desktopNotifications';

export default function Settings({ density, setDensity, pattern, setPattern }) {
  const { staff, signOut } = useAuth();
  const [ringtone, setRingtone] = useState(() => {
    const v = localStorage.getItem(RINGTONE_KEY);
    return v === null ? true : v === 'true';
  });
  const [notify, setNotify] = useState(() => localStorage.getItem(NOTIFY_KEY) === 'true');
  const [version, setVersion] = useState('');

  useEffect(() => { localStorage.setItem(RINGTONE_KEY, String(ringtone)); }, [ringtone]);
  useEffect(() => { localStorage.setItem(NOTIFY_KEY, String(notify)); }, [notify]);

  useEffect(() => {
    (async () => {
      try {
        if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
          const { getVersion } = await import('@tauri-apps/api/app');
          setVersion(await getVersion());
        }
      } catch {}
    })();
  }, []);

  const askDesktopPerm = async () => {
    if (!('Notification' in window)) { showToast('error', 'このアプリは通知非対応'); return; }
    const r = await Notification.requestPermission();
    if (r === 'granted') {
      setNotify(true);
      new Notification('HALO CTI', { body: 'デスクトップ通知が有効になりました' });
    } else {
      setNotify(false);
      showToast('error', '通知が拒否されました');
    }
  };

  const handleSignOut = async () => {
    if (!confirm('ログアウトしますか?')) return;
    await signOut?.();
    await supabase.auth.signOut();
    location.reload();
  };

  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>設定</div>

      <Section title="アカウント">
        <Row label="ログイン中" value={staff?.name || '—'} />
        <Row label="メール" value={staff?.email || '—'} />
        <div style={{ paddingTop: 4 }}>
          <button className="btn sm" onClick={handleSignOut} style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>ログアウト</button>
        </div>
      </Section>

      <Section title="表示">
        <Row label="情報密度">
          <div className="btn-group">
            {[['compact', 'コンパクト'], ['standard', '標準'], ['comfort', 'ゆったり']].map(([k, lbl]) => (
              <button key={k} className={'btn sm' + (density === k ? ' primary' : '')} onClick={() => setDensity?.(k)}>{lbl}</button>
            ))}
          </div>
        </Row>
        <Row label="配色パターン">
          <div className="btn-group">
            {['A', 'B', 'C'].map((p) => (
              <button key={p} className={'btn sm' + (pattern === p ? ' primary' : '')} onClick={() => setPattern?.(p)}>{p}</button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="通知 / サウンド">
        <Row label="着信音">
          <Toggle value={ringtone} onChange={setRingtone} />
        </Row>
        <Row label="デスクトップ通知">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Toggle value={notify} onChange={(v) => v ? askDesktopPerm() : setNotify(false)} />
            {notify && <span style={{ fontSize: 11, color: 'var(--muted)' }}>有効</span>}
          </div>
        </Row>
      </Section>

      <Section title="アプリ情報">
        <Row label="バージョン" value={version || '—'} />
        <Row label="アップデート" value="起動時に自動チェックします" />
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>{title}</div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 28 }}>
      <span style={{ fontSize: 13, color: 'var(--muted)', minWidth: 140 }}>{label}</span>
      {children || <span style={{ fontSize: 13 }}>{value}</span>}
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange?.(!value)}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: value ? 'oklch(0.6 0.15 245)' : 'var(--row-alt)',
        border: '1px solid var(--border)',
        position: 'relative', cursor: 'pointer', padding: 0,
        transition: 'background .15s',
      }}
    >
      <span style={{
        position: 'absolute', top: 1, left: value ? 17 : 1,
        width: 16, height: 16, borderRadius: 8,
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        transition: 'left .15s',
      }} />
    </button>
  );
}
