import Icon from './Icon.jsx';
import { useAppStore } from '../store/state.js';

const TABS = [
  { id: 'schedule', label: '本日スケジュール', icon: 'calendar' },
  { id: 'incoming', label: '本日着信', icon: 'phoneIn' },
  { id: 'customers', label: '顧客管理', icon: 'users' },
  { id: 'cast', label: '在籍女性', icon: 'star' },
  { id: 'calendar', label: '月次カレンダー', icon: 'calendar' },
  { id: 'staff', label: 'シフト管理', icon: 'user' },
  { id: 'approvals', label: '承認管理', icon: 'check' },
  { id: 'reports', label: 'レポート', icon: 'chart' },
];

export default function TopBar({ current, onNavigate, dateStr, operator = '岡田' }) {
  const stores = useAppStore((s) => s.stores);
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const setCurrentStoreId = useAppStore((s) => s.setCurrentStoreId);

  const today =
    dateStr ||
    new Date().toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    });

  return (
    <header className="topbar">
      <div className="tabs">
        {TABS.map((t) => (
          <div
            key={t.id}
            className={'tab ' + (current === t.id ? 'active' : '')}
            onClick={() => onNavigate?.(t.id)}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </div>
        ))}
      </div>
      <div className="divider" />
      <div className="page-title">
        <span className="date">{today}</span>
      </div>
      <div className="spacer" />
      {stores.length > 1 && (
        <select
          value={currentStoreId || ''}
          onChange={(e) => setCurrentStoreId(e.target.value)}
          style={{
            padding: '4px 8px', borderRadius: 6,
            border: '1px solid var(--border)', fontSize: 12,
            background: 'var(--surface)',
          }}
        >
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <div className="status-live">
        <span className="dot" />
        回線アクティブ · 3
      </div>
      <button className="btn sm ghost">
        <Icon name="refresh" size={13} />
        画面を更新
      </button>
      <div className="user-chip">
        <div className="avatar">岡</div>
        {operator} MG
        <span style={{ color: 'var(--mutedest)' }}>· ログイン中</span>
      </div>
    </header>
  );
}
