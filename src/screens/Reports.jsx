import { useEffect, useState, useMemo } from 'react';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { supabase } from '../lib/supabase.js';
import { exportRowsAsCsv } from '../lib/csv.js';

const hashHue = (s) => {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function presetRange(key) {
  const now = new Date();
  const todayStr = localDateStr(now);
  if (key === 'today') return { from: todayStr, to: todayStr };
  if (key === 'yesterday') {
    const d = new Date(now); d.setDate(d.getDate() - 1);
    const s = localDateStr(d);
    return { from: s, to: s };
  }
  if (key === 'this_week') {
    const d = new Date(now);
    const dow = d.getDay();
    d.setDate(d.getDate() - dow);
    return { from: localDateStr(d), to: todayStr };
  }
  if (key === 'this_month') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: localDateStr(d), to: todayStr };
  }
  if (key === 'last_month') {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: localDateStr(s), to: localDateStr(e) };
  }
  if (key === 'last_30') {
    const d = new Date(now); d.setDate(d.getDate() - 29);
    return { from: localDateStr(d), to: todayStr };
  }
  return { from: todayStr, to: todayStr };
}

export default function Reports() {
  const [preset, setPreset] = useState('this_month');
  const [{ from, to }, setRange] = useState(presetRange('this_month'));
  const [rsv, setRsv] = useState([]);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: rData }, { data: cData }] = await Promise.all([
        supabase
          .from('reservations')
          .select('id, status, amount, lady_id, customer_id, reserved_date, ladies(display_name, name)')
          .gte('reserved_date', from)
          .lte('reserved_date', to),
        supabase
          .from('call_logs')
          .select('id, started_at, from_number')
          .gte('started_at', from + 'T00:00:00+09:00')
          .lte('started_at', to + 'T23:59:59+09:00'),
      ]);
      if (cancelled) return;
      setRsv(rData || []);
      setCalls(cData || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [from, to]);

  const stats = useMemo(() => {
    const completed = rsv.filter((r) => r.status === 'complete' || r.status === 'visited');
    const cancelled = rsv.filter((r) => r.status === 'cancelled');
    const sales = completed.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const visits = completed.length;
    const reservations = rsv.length;
    const aov = visits ? Math.round(sales / visits) : 0;
    const cancelRate = reservations ? Math.round((cancelled.length / reservations) * 100) : 0;
    const uniqCustomers = new Set(completed.map((r) => r.customer_id).filter(Boolean)).size;
    return {
      sales, visits, reservations, aov, cancelRate,
      uniqCustomers, callsCount: calls.length,
      cancelledCount: cancelled.length,
    };
  }, [rsv, calls]);

  const ladyRanking = useMemo(() => {
    const map = new Map();
    rsv.forEach((r) => {
      if (!r.lady_id) return;
      if (r.status !== 'complete' && r.status !== 'visited') return;
      const name = r.ladies?.display_name || r.ladies?.name || '不明';
      const cur = map.get(r.lady_id) || { lady_id: r.lady_id, name, count: 0, sales: 0 };
      cur.count += 1;
      cur.sales += Number(r.amount) || 0;
      map.set(r.lady_id, cur);
    });
    return [...map.values()].sort((a, b) => b.sales - a.sales);
  }, [rsv]);

  const dailySeries = useMemo(() => {
    const map = new Map();
    rsv.forEach((r) => {
      if (r.status !== 'complete' && r.status !== 'visited') return;
      const d = r.reserved_date;
      const cur = map.get(d) || { date: d, count: 0, sales: 0 };
      cur.count += 1;
      cur.sales += Number(r.amount) || 0;
      map.set(d, cur);
    });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [rsv]);

  const maxSales = Math.max(1, ...dailySeries.map((d) => d.sales));

  const setPresetAndRange = (k) => { setPreset(k); setRange(presetRange(k)); };

  return (
    <div style={{ padding: 16 }}>
      <div className="screen-toolbar" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>レポート</span>
        <div className="btn-group">
          {[['today', '今日'], ['yesterday', '昨日'], ['this_week', '今週'], ['this_month', '今月'], ['last_month', '先月'], ['last_30', '直近30日']].map(([k, lbl]) => (
            <button key={k} className={'btn sm' + (preset === k ? ' primary' : '')} onClick={() => setPresetAndRange(k)}>{lbl}</button>
          ))}
        </div>
        <input type="date" value={from} onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, from: e.target.value })); }}
          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
        <span>〜</span>
        <input type="date" value={to} onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, to: e.target.value })); }}
          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
        <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => {
          exportRowsAsCsv(
            `reservations_${from}_${to}.csv`,
            rsv,
            [
              { label: '日付', key: 'reserved_date' },
              { label: 'ステータス', key: 'status' },
              { label: 'キャスト', value: (r) => r.ladies?.display_name || r.ladies?.name || '' },
              { label: '金額', key: 'amount' },
            ]
          );
        }}><Icon name="download" size={12} />予約 CSV</button>
        <button className="btn sm ghost" onClick={() => {
          exportRowsAsCsv(
            `cast_ranking_${from}_${to}.csv`,
            ladyRanking,
            [
              { label: 'キャスト名', key: 'name' },
              { label: '本数', key: 'count' },
              { label: '売上', key: 'sales' },
            ]
          );
        }}><Icon name="download" size={12} />ランキング CSV</button>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>集計中...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <Stat label="売上合計" value={`¥${stats.sales.toLocaleString()}`} />
            <Stat label="来店数" value={stats.visits} unit="本" />
            <Stat label="予約数" value={stats.reservations} unit="本" />
            <Stat label="客単価" value={`¥${stats.aov.toLocaleString()}`} />
            <Stat label="ユニーク顧客" value={stats.uniqCustomers} unit="人" />
            <Stat label="着信数" value={stats.callsCount} unit="本" />
            <Stat label="キャンセル" value={`${stats.cancelledCount}件`} sub={`(${stats.cancelRate}%)`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
            <Card title="日別売上推移">
              {dailySeries.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>データなし</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 180, padding: '12px 4px 24px' }}>
                  {dailySeries.map((d) => (
                    <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }} title={`${d.date}: ¥${d.sales.toLocaleString()} / ${d.count}本`}>
                      <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                        <div style={{
                          width: '100%',
                          height: `${(d.sales / maxSales) * 100}%`,
                          background: 'oklch(0.7 0.13 245)',
                          borderRadius: '3px 3px 0 0',
                          minHeight: 2,
                        }} />
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{d.date.slice(5)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="キャストランキング">
              {ladyRanking.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>データなし</div>
              ) : (
                <div style={{ display: 'grid', gap: 6, maxHeight: 320, overflow: 'auto' }}>
                  {ladyRanking.map((l, i) => (
                    <div key={l.lady_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 6, borderRadius: 6, background: i < 3 ? 'oklch(0.97 0.02 90)' : 'transparent' }}>
                      <span style={{ fontWeight: 700, width: 24, textAlign: 'center', color: i === 0 ? 'oklch(0.65 0.15 60)' : 'var(--muted)' }}>{i + 1}</span>
                      <Avatar name={l.name} size={32} hue={hashHue(l.name)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{l.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{l.count}本</div>
                      </div>
                      <div className="mono" style={{ fontWeight: 700 }}>¥{l.sales.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, unit, sub }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono, ui-monospace, monospace)', marginTop: 4 }}>
        {value}{unit && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 2 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
