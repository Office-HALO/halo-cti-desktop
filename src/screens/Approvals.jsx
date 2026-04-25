import { useState, useEffect, useCallback } from 'react';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { supabase } from '../lib/supabase.js';
import { useAppStore } from '../store/state.js';
import { showToast } from '../lib/toast.js';
import { formatDate, formatTime, formatDatetime } from '../lib/utils.js';

const TAB_LABELS = { pending: '承認待ち', approved: '承認済み', rejected: '差戻し' };

export default function Staff() {
  const allRequests = useAppStore((s) => s.allRequests);
  const setAllRequests = useAppStore((s) => s.setAllRequests);
  const currentStaff = useAppStore((s) => s.currentStaff);
  const currentTab = useAppStore((s) => s.currentTab);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('shift_requests')
      .select('*, ladies(name, display_name, store_code), staff:reviewed_by(name)')
      .gte('shift_date', today)
      .order('shift_date', { ascending: true });
    if (error) { showToast('error', 'データ読み込み失敗'); }
    else setAllRequests(data || []);
    setLoading(false);
  }, [setAllRequests]);

  useEffect(() => { load(); }, [load]);

  const approve = async (id, ladyName) => {
    const { error } = await supabase
      .from('shift_requests')
      .update({ status: 'approved', reviewed_by: currentStaff?.id, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { showToast('error', '承認失敗'); return; }
    showToast('success', `✅ ${ladyName} の申請を承認しました`);
    load();
  };

  const reject = async () => {
    if (!rejectTarget) return;
    const { error } = await supabase
      .from('shift_requests')
      .update({
        status: 'rejected',
        reviewed_by: currentStaff?.id,
        reviewed_at: new Date().toISOString(),
        reject_reason: rejectReason.trim() || null,
      })
      .eq('id', rejectTarget.id);
    if (error) { showToast('error', '差戻し失敗'); return; }
    showToast('success', `差戻しました`);
    setRejectTarget(null);
    setRejectReason('');
    load();
  };

  const stats = {
    pending: allRequests.filter((r) => r.status === 'pending').length,
    approved: allRequests.filter((r) => r.status === 'approved').length,
    rejected: allRequests.filter((r) => r.status === 'rejected').length,
  };

  const filtered = allRequests.filter((r) => r.status === currentTab);

  return (
    <div className="staff-root">
      <div className="screen-toolbar">
        <div className="staff-tabs">
          {Object.entries(TAB_LABELS).map(([k, lbl]) => (
            <button
              key={k}
              className={'staff-tab' + (currentTab === k ? ' active' : '')}
              onClick={() => setCurrentTab(k)}
            >
              {lbl}
              <span className={'staff-tab-count' + (k === 'pending' && stats.pending > 0 ? ' has-count' : '')}>
                {stats[k]}
              </span>
            </button>
          ))}
        </div>
        <button className="btn sm ghost" onClick={load} style={{ marginLeft: 'auto' }}>
          <Icon name="refresh" size={12} />更新
        </button>
      </div>

      <div className="staff-list-scroll">
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className="staff-empty">
            <div style={{ fontSize: 36 }}>📭</div>
            <div>{currentTab === 'pending' ? '承認待ちの申請はありません' : currentTab === 'approved' ? '承認済みの申請はありません' : '差戻した申請はありません'}</div>
          </div>
        ) : (
          <div className="staff-request-list">
            {filtered.map((r) => {
              const lady = r.ladies || {};
              const ladyName = lady.display_name || lady.name || '不明';
              const endLabel = r.end_type === 'finish'
                ? `${formatTime(r.end_time)}あ（業務終了）`
                : `${formatTime(r.end_time)}（受付終了）`;
              const reviewer = r.staff?.name;

              return (
                <div key={r.id} className={'staff-request-card status-' + r.status}>
                  <div className="src-header">
                    <div className="src-left">
                      <Avatar name={ladyName} size={36} />
                      <div>
                        <div className="src-name">{ladyName}</div>
                        <div className="src-store">{(lady.store_code || '').toUpperCase()}</div>
                      </div>
                    </div>
                    <span className={'chip src-badge ' + (r.status === 'pending' ? 'amber' : r.status === 'approved' ? 'green' : 'red')}>
                      {TAB_LABELS[r.status] || r.status}
                    </span>
                  </div>
                  <div className="src-body">
                    <div className="src-item"><span className="src-lbl">日付</span>{formatDate(r.shift_date)}</div>
                    <div className="src-item"><span className="src-lbl">時間</span>{formatTime(r.start_time)} 〜 {endLabel}</div>
                  </div>
                  {r.memo && <div className="src-memo">📝 {r.memo}</div>}
                  {r.status === 'pending' && (
                    <div className="src-actions">
                      <button className="btn sm primary" onClick={() => approve(r.id, ladyName)}>
                        ✅ 承認する
                      </button>
                      <button className="btn sm" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                        onClick={() => { setRejectTarget(r); setRejectReason(''); }}>
                        ❌ 差戻す
                      </button>
                    </div>
                  )}
                  {reviewer && (
                    <div className="src-reviewed">
                      {r.status === 'approved' ? '✅ 承認' : '❌ 差戻'}: {reviewer} — {formatDatetime(r.reviewed_at)}
                    </div>
                  )}
                  {r.status === 'rejected' && r.reject_reason && (
                    <div className="src-reject-reason">💬 差戻理由: {r.reject_reason}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rejectTarget && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setRejectTarget(null)}>
          <div className="modal-panel" style={{ width: 400 }}>
            <div className="modal-head">
              <span style={{ fontWeight: 600 }}>❌ 差戻し確認</span>
              <button className="btn sm ghost icon" onClick={() => setRejectTarget(null)}><Icon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13 }}>
                <strong>{(rejectTarget.ladies?.display_name || rejectTarget.ladies?.name || '?')}</strong> の
                {' '}{formatDate(rejectTarget.shift_date)} 申請を差戻しますか？
              </div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                差戻し理由（任意）
                <textarea
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 8px', borderRadius: 5, border: '1px solid var(--line-strong)', font: 'inherit', fontSize: 12, resize: 'vertical' }}
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="例: 日程が重複しています"
                />
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn sm" onClick={() => setRejectTarget(null)}>キャンセル</button>
                <button className="btn sm primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={reject}>差戻す</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
