import { useState, useEffect, useCallback } from 'react';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { supabase } from '../lib/supabase.js';
import { useAppStore } from '../store/state.js';
import { showToast } from '../lib/toast.js';
import { localDateStr, formatDateJP } from '../lib/utils.js';

const trim = (t) => (t || '').slice(0, 5);
const hashHue = (s) => {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

export default function ShiftEdit() {
  const todayDate = useAppStore((s) => s.todayDate);
  const setTodayDate = useAppStore((s) => s.setTodayDate);
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const [date, setDate] = useState(todayDate || localDateStr());
  const [shifts, setShifts] = useState([]);
  const [ladies, setLadies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draftLady, setDraftLady] = useState('');
  const [draftStart, setDraftStart] = useState('11:00');
  const [draftEnd, setDraftEnd] = useState('22:00');

  const load = useCallback(async () => {
    setLoading(true);
    let shiftsQ = supabase
      .from('shifts')
      .select('*, ladies!inner(display_name, name, store_id)')
      .eq('shift_date', date)
      .order('start_time');
    if (currentStoreId) shiftsQ = shiftsQ.eq('ladies.store_id', currentStoreId);

    let ladiesQ = supabase
      .from('ladies')
      .select('id, display_name, name, is_active')
      .eq('is_active', true)
      .order('display_name');
    if (currentStoreId) ladiesQ = ladiesQ.eq('store_id', currentStoreId);

    const [{ data: s }, { data: l }] = await Promise.all([shiftsQ, ladiesQ]);
    setShifts(s || []);
    setLadies(l || []);
    setLoading(false);
  }, [date, currentStoreId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`shift-edit-${date}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [date, load]);

  const shiftDay = (offset) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    const next = localDateStr(d);
    setDate(next);
    setTodayDate(next);
  };

  const updateShift = async (id, patch) => {
    const { error } = await supabase.from('shifts').update(patch).eq('id', id);
    if (error) { showToast('error', '更新失敗: ' + error.message); return; }
    showToast('success', 'シフト更新');
    load();
  };

  const removeShift = async (id) => {
    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) { showToast('error', '削除失敗: ' + error.message); return; }
    showToast('success', '削除しました');
    load();
  };

  const addShift = async () => {
    if (!draftLady) { showToast('error', 'キャストを選択'); return; }
    if (shifts.some((s) => s.lady_id === draftLady)) {
      showToast('error', 'すでにこのキャストのシフトがあります');
      return;
    }
    const { error } = await supabase.from('shifts').insert({
      lady_id: draftLady,
      shift_date: date,
      start_time: draftStart + ':00',
      end_time: draftEnd + ':00',
    });
    if (error) { showToast('error', '追加失敗: ' + error.message); return; }
    showToast('success', 'シフト追加');
    setDraftLady('');
    load();
  };

  const usedIds = new Set(shifts.map((s) => s.lady_id));
  const available = ladies.filter((l) => !usedIds.has(l.id));

  return (
    <div className="se-root" style={{ padding: 16 }}>
      <div className="screen-toolbar" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{formatDateJP(date)}</span>
        <button className="btn sm ghost icon" title="日付選択"><Icon name="calendar" size={14} /></button>
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setTodayDate(e.target.value); }} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
        <div className="btn-group">
          <button className="btn sm" onClick={() => shiftDay(-1)}><Icon name="chevronL" size={12} />前日</button>
          <button className="btn sm primary" onClick={() => { const t = localDateStr(); setDate(t); setTodayDate(t); }}><Icon name="refresh" size={12} />今日</button>
          <button className="btn sm" onClick={() => shiftDay(1)}>次日<Icon name="chevronR" size={12} /></button>
        </div>
        <div className="chip blue">出勤 {shifts.length}人</div>
        <button className="btn sm ghost" onClick={load} style={{ marginLeft: 'auto' }}>
          <Icon name="refresh" size={12} />更新
        </button>
      </div>

      <div className="se-add" style={{
        display: 'flex', gap: 8, alignItems: 'center', padding: 12, marginBottom: 12,
        background: 'var(--row-alt)', borderRadius: 8, border: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>シフト追加:</span>
        <select value={draftLady} onChange={(e) => setDraftLady(e.target.value)} style={{ flex: '1 1 220px', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
          <option value="">— キャスト選択 —</option>
          {available.map((l) => <option key={l.id} value={l.id}>{l.display_name || l.name}</option>)}
        </select>
        <input type="time" value={draftStart} onChange={(e) => setDraftStart(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
        <span>〜</span>
        <input type="time" value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
        <button className="btn sm primary" onClick={addShift}><Icon name="plus" size={12} />追加</button>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>読み込み中...</div>
      ) : shifts.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>{date} のシフトはまだありません</div>
      ) : (
        <div className="se-list" style={{ display: 'grid', gap: 8 }}>
          {shifts.map((s) => (
            <ShiftRow
              key={s.id}
              shift={s}
              onUpdate={(patch) => updateShift(s.id, patch)}
              onRemove={() => removeShift(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ShiftRow({ shift, onUpdate, onRemove }) {
  const lady = shift.ladies || {};
  const name = lady.display_name || lady.name || '—';
  const [start, setStart] = useState(trim(shift.start_time));
  const [end, setEnd] = useState(trim(shift.end_time));
  const [confirmDel, setConfirmDel] = useState(false);

  const dirty = start !== trim(shift.start_time) || end !== trim(shift.end_time);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: 10, background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 8,
    }}>
      <Avatar name={name} size={36} hue={hashHue(name)} />
      <div style={{ flex: '0 0 200px', minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
      </div>
      <input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
      <span style={{ color: 'var(--muted)' }}>〜</span>
      <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
      {dirty && (
        <button className="btn sm primary" onClick={() => onUpdate({ start_time: start + ':00', end_time: end + ':00' })}>
          <Icon name="check" size={12} />保存
        </button>
      )}
      <button
        className="btn sm"
        onClick={() => { confirmDel ? onRemove() : setConfirmDel(true); }}
        style={{ marginLeft: 'auto', borderColor: 'var(--danger)', color: 'var(--danger)' }}
      >
        <Icon name="trash" size={12} />{confirmDel ? '本当に削除' : '削除'}
      </button>
    </div>
  );
}
