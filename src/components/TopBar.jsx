import { useState, useRef } from 'react';
import Icon from './Icon.jsx';
import { useAppStore } from '../store/state.js';

const TABS = [
  { id: 'schedule', label: '本日スケジュール', icon: 'calendar' },
  { id: 'incoming', label: '本日着信', icon: 'phoneIn' },
  { id: 'customers', label: '顧客管理', icon: 'users' },
  { id: 'cast', label: '在籍女性', icon: 'star' },
  { id: 'karte', label: 'カルテ', icon: 'note' },
  { id: 'calendar', label: '月次カレンダー', icon: 'calendar' },
  { id: 'staff', label: 'シフト管理', icon: 'user' },
  { id: 'approvals', label: '承認管理', icon: 'check' },
  { id: 'reports', label: 'レポート', icon: 'chart' },
];

export default function TopBar({ current, onNavigate, dateStr, onDemoCall, callStatus }) {
  const stores = useAppStore((s) => s.stores);
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const setCurrentStoreId = useAppStore((s) => s.setCurrentStoreId);
  const currentStaff = useAppStore((s) => s.currentStaff);
  const [demoOpen, setDemoOpen] = useState(false);
  const demoBtnRef = useRef(null);

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
      {import.meta.env.DEV && (
        <div>
          <button
            ref={demoBtnRef}
            className="btn sm"
            onClick={() => setDemoOpen((v) => !v)}
            style={{ background: '#7c3aed', color: '#fff', border: 'none', gap: 5, fontSize: 11, letterSpacing: 0.3 }}
          >
            <Icon name="phoneIn" size={11} />
            DEMO着信
          </button>
          {demoOpen && (() => {
            const rect = demoBtnRef.current?.getBoundingClientRect();
            return (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 9990 }} onClick={() => setDemoOpen(false)} />
                <div style={{
                  position: 'fixed',
                  top: (rect?.bottom ?? 36) + 6,
                  right: window.innerWidth - (rect?.right ?? 200),
                  zIndex: 9991,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                  minWidth: 220, padding: 6,
                }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, padding: '4px 10px 6px', textTransform: 'uppercase', letterSpacing: 0.5 }}>デモ着信シミュレーション</div>
                  {[
                    { label: 'テスト顧客でテスト', sub: '「テスト」顧客を指定', type: 'test', icon: 'user' },
                    { label: '既存顧客でテスト', sub: 'ランダム顧客', type: 'known', icon: 'users' },
                    { label: '未登録番号でテスト', sub: '090-1234-5678', type: 'unknown', icon: 'phoneIn' },
                  ].map(({ label, sub, type, icon }) => (
                    <button
                      key={type}
                      onClick={() => { onDemoCall?.(type); setDemoOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', padding: '8px 10px', border: 'none', background: 'none',
                        cursor: 'pointer', borderRadius: 6, textAlign: 'left', fontFamily: 'inherit',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--halo-50)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#7c3aed22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={icon} size={12} style={{ color: '#7c3aed' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      )}
      {callStatus?.answered ? (
        <div className="status-live" style={{ background: 'var(--ok, #16a34a)11', borderColor: 'var(--ok, #16a34a)', color: 'var(--ok, #16a34a)' }}>
          <span className="dot" style={{ background: 'var(--ok, #16a34a)', boxShadow: '0 0 0 3px #16a34a33' }} />
          通話中 · {callStatus.staffName}
        </div>
      ) : callStatus ? (
        <div className="status-live" style={{ background: '#f97316', borderColor: '#f97316', color: '#fff', animation: 'pulse 1s infinite' }}>
          <span className="dot" style={{ background: '#fff', boxShadow: '0 0 0 3px #ffffff55' }} />
          着信中
        </div>
      ) : (
        <div className="status-live">
          <span className="dot" />
          回線アクティブ
        </div>
      )}
      <button className="btn sm ghost" onClick={() => window.location.reload()}>
        <Icon name="refresh" size={13} />
        画面を更新
      </button>
      <div className="user-chip">
        <div className="avatar">
          {currentStaff ? (currentStaff.name || currentStaff.email || '?').charAt(0) : '?'}
        </div>
        {currentStaff ? (currentStaff.name || currentStaff.email) : '—'}
        <span style={{ color: 'var(--mutedest)' }}>· ログイン中</span>
      </div>
    </header>
  );
}
