import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAppStore } from '../store/state.js';
import { showToast } from '../lib/toast.js';
import { formatDateJP } from '../lib/utils.js';
import Icon from '../components/Icon.jsx';

const trim5 = (t) => (t ? String(t).slice(0, 5) : '');

const HOURS = Array.from({ length: 25 }, (_, i) => i); // 0〜24
const MINS  = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function TimeSelect({ value, onChange, label }) {
  const [h, m] = value ? value.split(':').map(Number) : [null, null];
  const setH = (v) => onChange(v != null && m != null ? `${String(v).padStart(2,'0')}:${String(m).padStart(2,'0')}` : null);
  const setM = (v) => onChange(h != null && v != null ? `${String(h).padStart(2,'0')}:${String(v).padStart(2,'0')}` : null);
  const clear = () => onChange(null);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {label && <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{label}</span>}
      <select value={h ?? ''} onChange={(e) => setH(e.target.value !== '' ? Number(e.target.value) : null)} style={SEL}>
        <option value="">--</option>
        {HOURS.map(n => <option key={n} value={n}>{n}時</option>)}
      </select>
      <select value={m ?? ''} onChange={(e) => setM(e.target.value !== '' ? Number(e.target.value) : null)} style={SEL}>
        <option value="">--</option>
        {MINS.map(n => <option key={n} value={n}>{String(n).padStart(2,'0')}分</option>)}
      </select>
      {value && <button onClick={clear} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:12, padding:'0 2px' }}>✕</button>}
    </div>
  );
}

export default function ShiftInfoModal({ shiftId, cast, date, onClose, onSaved }) {
  const currentStoreId = useAppStore((s) => s.currentStoreId);
  const [shift, setShift] = useState(null);
  const [fields, setFields] = useState([]);
  const [options, setOptions] = useState({});   // { field_key: [{ label }] }
  const [attendanceStatuses, setAttendanceStatuses] = useState([]);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: shiftData },
      { data: fieldData },
      { data: optData },
      { data: attData },
    ] = await Promise.all([
      supabase.from('shifts').select('*, ladies(display_name, name)').eq('id', shiftId).maybeSingle(),
      supabase.from('shift_form_fields')
        .select('*')
        .or(currentStoreId ? `store_id.eq.${currentStoreId},store_id.is.null` : 'store_id.is.null')
        .eq('is_visible', true)
        .order('sort_order'),
      supabase.from('shift_field_options')
        .select('*')
        .or(currentStoreId ? `store_id.eq.${currentStoreId},store_id.is.null` : 'store_id.is.null')
        .eq('is_active', true)
        .order('sort_order'),
      supabase.from('shift_attendance_statuses')
        .select('*')
        .or(currentStoreId ? `store_id.eq.${currentStoreId},store_id.is.null` : 'store_id.is.null')
        .eq('is_active', true)
        .order('sort_order'),
    ]);

    if (shiftData) {
      setShift(shiftData);
      setForm({
        actual_start_time:  trim5(shiftData.actual_start_time) || trim5(shiftData.start_time),
        actual_end_time:    trim5(shiftData.actual_end_time)   || trim5(shiftData.end_time),
        break_start_time:   trim5(shiftData.break_start_time),
        break_end_time:     trim5(shiftData.break_end_time),
        location:           shiftData.location || '',
        break_memo:         shiftData.break_memo || '',
        attendance_status:  shiftData.attendance_status || 'none',
        photo_diary:        shiftData.photo_diary || '',
        delay_type:         shiftData.delay_type || '',
        waiting_location:   shiftData.waiting_location || '',
        delivery_location:  shiftData.delivery_location || '',
        deposit:            shiftData.deposit ?? 0,
        end_badge:          shiftData.end_badge || 'agari',
      });
    }

    // フィールド: store_id一致を優先
    const seen = new Map();
    for (const f of (fieldData || [])) {
      if (!seen.has(f.field_key) || f.store_id !== null) seen.set(f.field_key, f);
    }
    setFields([...seen.values()].sort((a, b) => a.sort_order - b.sort_order));

    // 選択肢: field_keyごとにグループ化
    const optMap = {};
    for (const o of (optData || [])) {
      if (!optMap[o.field_key]) optMap[o.field_key] = [];
      optMap[o.field_key].push(o);
    }
    setOptions(optMap);

    // 出勤状態
    const seen2 = new Map();
    for (const s of (attData || [])) {
      if (!seen2.has(s.code) || s.store_id !== null) seen2.set(s.code, s);
    }
    setAttendanceStatuses([...seen2.values()].sort((a, b) => a.sort_order - b.sort_order));

    setLoading(false);
  }, [shiftId, currentStoreId]);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const patch = {
      actual_start_time:  form.actual_start_time  ? form.actual_start_time  + ':00' : null,
      actual_end_time:    form.actual_end_time    ? form.actual_end_time    + ':00' : null,
      break_start_time:   form.break_start_time   ? form.break_start_time   + ':00' : null,
      break_end_time:     form.break_end_time     ? form.break_end_time     + ':00' : null,
      location:           form.location   || null,
      break_memo:         form.break_memo || null,
      attendance_status:  form.attendance_status === 'none' ? null : (form.attendance_status || null),
      photo_diary:        form.photo_diary       || null,
      delay_type:         form.delay_type        || null,
      waiting_location:   form.waiting_location  || null,
      delivery_location:  form.delivery_location || null,
      deposit:            Number(form.deposit) || 0,
      end_badge:          form.end_badge || 'agari',
    };
    const { error } = await supabase.from('shifts').update(patch).eq('id', shiftId);
    setSaving(false);
    if (error) { showToast('error', '保存失敗: ' + error.message); return; }
    showToast('ok', '保存しました');
    onSaved();
    onClose();
  };

  const ladyName = shift?.ladies?.display_name || shift?.ladies?.name || cast?.name || '—';

  const renderField = (field) => {
    const key = field.field_key;
    const opts = options[key] || [];

    if (key === 'actual_time') {
      return (
        <div key={key} style={FIELD_ROW}>
          <div style={FIELD_LABEL}>{field.label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <TimeSelect value={form.actual_start_time} onChange={(v) => set('actual_start_time', v)} />
            <span style={{ color: 'var(--muted)' }}>〜</span>
            <TimeSelect value={form.actual_end_time} onChange={(v) => set('actual_end_time', v)} />
            <select
              value={form.end_badge || 'agari'}
              onChange={(e) => set('end_badge', e.target.value)}
              style={SEL}
            >
              <option value="agari">上がり</option>
              <option value="reception">受付</option>
            </select>
          </div>
        </div>
      );
    }

    if (key === 'break_time') {
      return (
        <div key={key} style={FIELD_ROW}>
          <div style={FIELD_LABEL}>{field.label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TimeSelect value={form.break_start_time} onChange={(v) => set('break_start_time', v)} />
            <span style={{ color: 'var(--muted)' }}>〜</span>
            <TimeSelect value={form.break_end_time} onChange={(v) => set('break_end_time', v)} />
          </div>
        </div>
      );
    }

    if (key === 'attendance_status') {
      return (
        <div key={key} style={FIELD_ROW}>
          <div style={FIELD_LABEL}>{field.label}</div>
          <select value={form.attendance_status || ''} onChange={(e) => set('attendance_status', e.target.value)} style={{ ...SEL, width: 200 }}>
            <option value="">— なし —</option>
            {attendanceStatuses.map((s) => (
              <option key={s.code} value={s.code}>{s.label}</option>
            ))}
          </select>
        </div>
      );
    }

    if (field.field_type === 'select') {
      return (
        <div key={key} style={FIELD_ROW}>
          <div style={FIELD_LABEL}>{field.label}</div>
          <select value={form[key] || ''} onChange={(e) => set(key, e.target.value)} style={{ ...SEL, minWidth: 180 }}>
            <option value="">-- </option>
            {opts.map((o) => <option key={o.id} value={o.label}>{o.label}</option>)}
          </select>
        </div>
      );
    }

    if (field.field_type === 'number') {
      return (
        <div key={key} style={FIELD_ROW}>
          <div style={FIELD_LABEL}>{field.label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13 }}>¥</span>
            <input
              type="number"
              value={form[key] ?? 0}
              onChange={(e) => set(key, e.target.value)}
              style={{ ...SEL, width: 120 }}
            />
          </div>
        </div>
      );
    }

    if (field.field_type === 'text') {
      return (
        <div key={key} style={FIELD_ROW}>
          <div style={FIELD_LABEL}>{field.label}</div>
          <textarea
            value={form[key] || ''}
            onChange={(e) => set(key, e.target.value)}
            rows={2}
            style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, resize: 'vertical', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' }}
          />
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ zIndex: 9998 }}
    >
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="modal-head" style={{ background: 'var(--halo-500, #3b82f6)', color: '#fff', borderRadius: '10px 10px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="calendar" size={14} />
            <span style={{ fontWeight: 700 }}>出勤情報の編集</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>読み込み中...</div>
        ) : (
          <>
            <div style={{ overflowY: 'auto', flex: 1, padding: '14px 20px', display: 'grid', gap: 12 }}>
              {/* 日付 */}
              <div style={FIELD_ROW}>
                <div style={FIELD_LABEL}>日付</div>
                <div style={{ padding: '5px 10px', background: 'var(--bg-subtle)', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
                  {formatDateJP(date)}
                </div>
              </div>

              {/* 女の子 */}
              <div style={FIELD_ROW}>
                <div style={FIELD_LABEL}>女の子</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{ladyName}</div>
              </div>

              {/* 動的フィールド */}
              {fields.map(renderField)}
            </div>

            {/* Footer */}
            <div style={{ padding: '10px 20px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
              <button className="btn sm ghost" onClick={onClose}>閉じる</button>
              <button className="btn sm primary" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const SEL = {
  padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
};
const FIELD_ROW = {
  display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'start', gap: 10,
};
const FIELD_LABEL = {
  fontSize: 12, color: 'var(--muted)', fontWeight: 600, paddingTop: 6,
};
