import { useState, useEffect } from 'react';
import Icon from './Icon.jsx';
import HaloLogo from './HaloLogo.jsx';
import NotificationsPanel from './NotificationsPanel.jsx';
import { supabase } from '../lib/supabase.js';

export default function SideNav({ onNavigate, onOpenSettings }) {
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { count } = await supabase
        .from('shift_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingCount(count || 0);
    };
    load();
    const ch = supabase
      .channel('side-nav-pending')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_requests' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <>
      <nav className="sidenav">
        <div className="logo">
          <HaloLogo size={26} withWord={false} />
        </div>
        <div className="spacer" />
        <div className="nav-item" onClick={() => onOpenSettings?.()} style={{ cursor: 'pointer' }}>
          <Icon name="settings" size={18} />
          <span className="tip">設定</span>
        </div>
        <div className="nav-item" onClick={() => setOpen(true)} style={{ cursor: 'pointer', position: 'relative' }}>
          <Icon name="bell" size={18} />
          {pendingCount > 0 && (
            <span style={{
              position: 'absolute', top: 4, right: 4,
              minWidth: 14, height: 14, padding: '0 3px',
              borderRadius: 7,
              background: 'var(--danger, oklch(0.6 0.2 25))',
              color: '#fff', fontSize: 9, fontWeight: 700,
              display: 'grid', placeItems: 'center',
            }}>{pendingCount > 99 ? '99+' : pendingCount}</span>
          )}
          <span className="tip">通知</span>
        </div>
      </nav>
      {open && <NotificationsPanel onClose={() => setOpen(false)} onNavigate={onNavigate} />}
    </>
  );
}
