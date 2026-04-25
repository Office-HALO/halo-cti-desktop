import { useState, useEffect } from 'react';
import Icon from '../components/Icon.jsx';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { normalizePhone } from '../lib/utils.js';

const RANKS = ['VIP', 'A', 'B', 'C', 'NG'];

export default function NewCustomerModal({ initialPhone = '', onClose, onCreated }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(initialPhone || '');
  const [rank, setRank] = useState('C');
  const [tagsStr, setTagsStr] = useState('');
  const [memberNo, setMemberNo] = useState('');
  const [memo, setMemo] = useState('');
  const [alertMemo, setAlertMemo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const save = async () => {
    if (!name.trim() && !phone.trim()) {
      showToast('error', '名前または電話番号を入力してください');
      return;
    }
    setLoading(true);
    const payload = {
      name: name.trim() || null,
      phone_normalized: phone ? normalizePhone(phone) : null,
      rank,
      tags: tagsStr.split(',').map((t) => t.trim()).filter(Boolean),
      member_no: memberNo.trim() || null,
      memo: memo.trim() || null,
      alert_memo: alertMemo.trim() || null,
      total_visits: 0,
      total_spent: 0,
      cancel_count: 0,
    };
    const { data, error } = await supabase.from('customers').insert(payload).select().single();
    setLoading(false);
    if (error) { showToast('error', '保存失敗: ' + error.message); return; }
    showToast('success', '顧客を登録しました');
    onCreated?.(data);
    onClose();
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="nr-modal">
        <div className="nr-head">
          <div>
            <div className="nr-title">新規顧客登録</div>
            <div className="nr-subtitle">顧客情報を入力してください</div>
          </div>
          <button className="cp-icon-btn" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>

        <div className="nr-body">
          <div className="nr-grid">
            <label className="nr-field nr-full">
              <span>名前</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="山田 太郎" autoFocus />
            </label>
            <label className="nr-field">
              <span>電話番号</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09012345678" />
            </label>
            <label className="nr-field">
              <span>会員番号</span>
              <input type="text" value={memberNo} onChange={(e) => setMemberNo(e.target.value)} placeholder="M-00123" />
            </label>
            <label className="nr-field">
              <span>ランク</span>
              <select value={rank} onChange={(e) => setRank(e.target.value)}>
                {RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="nr-field">
              <span>タグ（カンマ区切り）</span>
              <input type="text" value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} placeholder="優良, CB決済" />
            </label>
            <label className="nr-field nr-full">
              <span>メモ</span>
              <textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </label>
            <label className="nr-field nr-full">
              <span>要注意メモ（着信時に警告表示）</span>
              <textarea rows={2} value={alertMemo} onChange={(e) => setAlertMemo(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="nr-actions">
          <button className="cf-btn ghost" onClick={onClose} disabled={loading}>キャンセル</button>
          <button className="cf-btn primary" onClick={save} disabled={loading} style={{ marginLeft: 'auto' }}>
            <Icon name="check" size={13} />{loading ? '保存中...' : '登録'}
          </button>
        </div>
      </div>
    </>
  );
}
