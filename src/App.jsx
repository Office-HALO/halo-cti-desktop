import { useState, useEffect, useCallback } from 'react';
import SideNav from './components/SideNav.jsx';
import TopBar from './components/TopBar.jsx';
import ToolsFloat from './components/ToolsFloat.jsx';
import Toast from './components/Toast.jsx';
import Placeholder from './screens/Placeholder.jsx';
import Login from './screens/Login.jsx';
import Schedule from './screens/Schedule.jsx';
import Incoming from './screens/Incoming.jsx';
import Customers from './screens/Customers.jsx';
import Cast from './screens/Cast.jsx';
import Staff from './screens/Staff.jsx';
import Calendar from './screens/Calendar.jsx';
import IncomingCallPopup from './overlays/IncomingCallPopup.jsx';
import Updater from './components/Updater.jsx';
import CustomerFloat from './overlays/CustomerFloat.jsx';
import { useRealtimeCalls } from './hooks/useRealtimeCalls.js';
import { useAuth } from './lib/auth.jsx';
import './styles.css';

const SCREEN_TITLES = {
  schedule: '本日スケジュール',
  incoming: '本日着信',
  customers: '顧客管理',
  cast: '在籍女性',
  calendar: '月次カレンダー',
  staff: 'シフト管理',
  reports: 'レポート',
};

export default function App() {
  const { session, staff, loading } = useAuth();
  const [current, setCurrent] = useState('schedule');
  const [density, setDensity] = useState('compact');
  const [pattern, setPattern] = useState('C');
  const [activeCall, setActiveCall] = useState(null);
  const [floatCustomer, setFloatCustomer] = useState(null);

  const handleIncoming = useCallback((call) => setActiveCall(call), []);
  useRealtimeCalls(handleIncoming);

  const handleOpenCustomer = useCallback((id, phone) => {
    setFloatCustomer({ id, phone: phone || null });
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-density', density);
    document.body.setAttribute('data-pattern', pattern);
  }, [density, pattern]);

  if (loading && !session) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: 'var(--muted)' }}>
        読み込み中...
      </div>
    );
  }

  if (!session || !staff) {
    return (
      <>
        <Login />
        <Toast />
      </>
    );
  }

  return (
    <div className={'app pattern-' + pattern}>
      <SideNav />
      <TopBar
        current={current}
        onNavigate={setCurrent}
        operator={staff.name}
      />
      <main className="main">
        {current === 'schedule' ? (
          <Schedule density={density} />
        ) : current === 'incoming' ? (
          <Incoming />
        ) : current === 'customers' ? (
          <Customers />
        ) : current === 'cast' ? (
          <Cast />
        ) : current === 'calendar' ? (
          <Calendar />
        ) : current === 'staff' ? (
          <Staff />
        ) : (
          <Placeholder title={SCREEN_TITLES[current]} />
        )}
      </main>
      <ToolsFloat
        density={density}
        setDensity={setDensity}
        pattern={pattern}
        setPattern={setPattern}
        onDemoCall={() => setActiveCall({ callLogId: 'demo', phone: '090-1234-5678', customer: null })}
      />
      <Toast />
      <Updater />
      {activeCall && (
        <IncomingCallPopup
          call={activeCall}
          onClose={() => setActiveCall(null)}
          onOpenCustomer={(id) => handleOpenCustomer(id, activeCall?.phone)}
        />
      )}
      {floatCustomer && (
        <CustomerFloat
          customerId={floatCustomer.id}
          phone={floatCustomer.phone}
          onClose={() => setFloatCustomer(null)}
        />
      )}
    </div>
  );
}
