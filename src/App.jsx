import { useState, useEffect, useCallback } from 'react';
import SideNav from './components/SideNav.jsx';
import TopBar from './components/TopBar.jsx';
import Toast from './components/Toast.jsx';
import Placeholder from './screens/Placeholder.jsx';
import Login from './screens/Login.jsx';
import Schedule from './screens/Schedule.jsx';
import Incoming from './screens/Incoming.jsx';
import Customers from './screens/Customers.jsx';
import Cast from './screens/Cast.jsx';
import ShiftEdit from './screens/ShiftEdit.jsx';
import Approvals from './screens/Approvals.jsx';
import Calendar from './screens/Calendar.jsx';
import Reports from './screens/Reports.jsx';
import Settings from './screens/Settings.jsx';
import Karte from './screens/Karte.jsx';
import IncomingCallPopup from './overlays/IncomingCallPopup.jsx';
import Updater from './components/Updater.jsx';
import CustomerFloat from './overlays/CustomerFloat.jsx';
import { useRealtimeCalls } from './hooks/useRealtimeCalls.js';
import { useMastersWarmer } from './hooks/useMastersWarmer.js';
import { useAuth } from './lib/auth.jsx';
import { useStoresBoot } from './lib/stores.js';
import { useAppStore } from './store/state.js';
import { supabase } from './lib/supabase.js';
import './styles.css';

const SCREEN_TITLES = {
  schedule: '本日スケジュール',
  incoming: '本日着信',
  customers: '顧客管理',
  cast: '在籍女性',
  karte: 'カルテ',
  calendar: '月次カレンダー',
  staff: 'シフト管理',
  approvals: '承認管理',
  reports: 'レポート',
  settings: '設定',
};

export default function App() {
  const { session, staff, loading } = useAuth();
  const setCurrentStaff = useAppStore((s) => s.setCurrentStaff);
  const setKarteMap = useAppStore((s) => s.setKarteMap);
  const allCustomers = useAppStore((s) => s.allCustomers);
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const [current, setCurrent] = useState('schedule');
  const [density, setDensity] = useState('compact');
  const [pattern, setPattern] = useState('C');
  const [activeCall, setActiveCall] = useState(null);
  const [callAnswered, setCallAnswered] = useState(false);
  const [floatCustomer, setFloatCustomer] = useState(null);

  useEffect(() => { if (staff) setCurrentStaff(staff); }, [staff?.id]);

  // カルテ写真マップを起動時にロード（lady_id → { id, photo_url }）
  useEffect(() => {
    if (!staff) return;
    supabase.from('karte').select('id, lady_id, photo_url').not('lady_id', 'is', null)
      .then(({ data }) => {
        const map = {};
        for (const row of data || []) map[row.lady_id] = { id: row.id, photo_url: row.photo_url };
        setKarteMap(map);
      });
  }, [staff?.id]);

  useStoresBoot();
  useMastersWarmer(); // ログイン後にマスタをプリロード → 予約フォームを即時表示

  const handleIncoming = useCallback((call) => setActiveCall(call), []);
  useRealtimeCalls(handleIncoming, currentStoreId);

  const handleDemoCall = useCallback((type) => {
    if (type === 'test') {
      const c = allCustomers.find((c) => (c.name || '').includes('テスト'))
        || allCustomers.find((c) => (c.name || '').toLowerCase().includes('test'))
        || allCustomers[0];
      if (!c) return;
      setActiveCall({ callLogId: 'demo', phone: c.phone_normalized || c.phone, customer: c });
    } else if (type === 'known') {
      const list = allCustomers.filter((c) => c.phone_normalized || c.phone);
      const c = list[Math.floor(Math.random() * list.length)];
      if (!c) return;
      setActiveCall({ callLogId: 'demo', phone: c.phone_normalized || c.phone, customer: c });
    } else {
      setActiveCall({ callLogId: 'demo', phone: '09012345678', customer: null });
    }
  }, [allCustomers]);

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
      <SideNav onNavigate={setCurrent} onOpenSettings={() => setCurrent('settings')} />
      <TopBar
        current={current}
        onNavigate={setCurrent}
        operator={staff.name}
        onDemoCall={handleDemoCall}
        callStatus={activeCall ? { answered: callAnswered, staffName: staff.name } : null}
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
        ) : current === 'karte' ? (
          <Karte />
        ) : current === 'calendar' ? (
          <Calendar />
        ) : current === 'staff' ? (
          <ShiftEdit />
        ) : current === 'approvals' ? (
          <Approvals />
        ) : current === 'reports' ? (
          <Reports />
        ) : current === 'settings' ? (
          <Settings density={density} setDensity={setDensity} pattern={pattern} setPattern={setPattern} />
        ) : (
          <Placeholder title={SCREEN_TITLES[current]} />
        )}
      </main>
      <Toast />
      <Updater />
      {activeCall && (
        <IncomingCallPopup
          call={activeCall}
          onClose={() => { setActiveCall(null); setCallAnswered(false); }}
          onAnswer={() => setCallAnswered(true)}
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
