import { useEffect, useState } from 'react';
import { subscribeToast } from '../lib/toast.js';

export default function Toast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    return subscribeToast((event) => {
      if (event.type === 'add') {
        setToasts((prev) => [...prev, event.toast]);
      } else {
        setToasts((prev) => prev.filter((t) => t.id !== event.id));
      }
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            background:
              t.type === 'error'
                ? 'var(--danger)'
                : t.type === 'success'
                ? 'oklch(0.55 0.15 150)'
                : 'var(--surface)',
            color: t.type === 'info' ? 'var(--text)' : '#fff',
            fontSize: 13,
            fontWeight: 500,
            boxShadow: 'var(--shadow-lg, 0 4px 12px rgba(0,0,0,0.15))',
            minWidth: 240,
            border: t.type === 'info' ? '1px solid var(--line)' : 'none',
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
