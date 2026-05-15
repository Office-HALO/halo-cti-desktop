import { useState, useEffect } from 'react';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { supabase } from '../lib/supabase.js';

const BADGE_COLOR = {
  '出勤': '#16a34a',
  '疎遠': '#f97316',
  '稼働無し(退店/不採用)': '#9ca3af',
};
const RATING_LABEL = {
  '⭐️苦戦中': { color: '#ef4444', label: '苦戦中' },
  '⭐️⭐️KRO水準': { color: '#f97316', label: 'KRO水準' },
  '⭐️⭐️⭐️強気でお勧め': { color: '#16a34a', label: '激推し' },
};

/** karteId か ladyId を渡して全データをロードし表示 */
export default function KarteDetailPopup({ karteId, ladyId, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    const q = karteId
      ? supabase.from('karte').select('*').eq('id', karteId).single()
      : supabase.from('karte').select('*').eq('lady_id', ladyId).maybeSingle();
    q.then(({ data: d }) => { if (d) setData(d); });
  }, [karteId, ladyId]);

  if (!data) return null;

  const d = data;
  const rating = RATING_LABEL[d.実際の評価];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)', borderRadius: 16, width: 640, maxHeight: '88vh',
          overflow: 'hidden auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
        }}>
          <Avatar name={d.name || '?'} size={64} src={d.photo_url || undefined} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{d.name}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{d.身長3サイズ}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {d.稼働状態 && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                  background: (BADGE_COLOR[d.稼働状態] || '#9ca3af') + '22',
                  color: BADGE_COLOR[d.稼働状態] || '#9ca3af',
                }}>{d.稼働状態}</span>
              )}
              {rating && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                  background: rating.color + '22', color: rating.color,
                }}>{rating.label}</span>
              )}
              {(d.店舗 || []).map(s => (
                <span key={s} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 6,
                  background: 'var(--surface-2)', color: 'var(--text)',
                }}>{s}</span>
              ))}
            </div>
          </div>
          <button className="btn sm ghost" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {d.カテゴリ?.length > 0 && (
            <Section label="カテゴリ">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {d.カテゴリ.map(c => (
                  <span key={c} style={{
                    fontSize: 12, padding: '3px 10px', borderRadius: 12,
                    background: 'var(--halo-50)', color: 'var(--halo-700)',
                  }}>{c}</span>
                ))}
              </div>
            </Section>
          )}

          <Section label="スペック">
            <Grid rows={[
              ['長所', d.長所],
              ['似有名人', d.似有名人],
              ['プレイスタイル', d.プレイスタイル],
              ['DUO対応', d['duo対応']],
              ['DUO備考', d['duo備考']],
              ['インバウンド対応', d.インバウンド対応],
              ['NG地域', d['ng地域有り'] ? `${d['ng地域有り']}${d['ng地域備考'] ? ' / ' + d['ng地域備考'] : ''}` : null],
              ['タバコ・お酒', d.タバコお酒?.join('、')],
              ['身体の特徴', d.身体の特徴?.join('、')],
            ]} />
          </Section>

          {d.data && (
            <Section label="事務所情報">
              <Grid rows={[
                ['初出勤', d.data.初出勤],
                ['実身長', d.data.実_身長 ? `${d.data.実_身長}cm` : null],
                ['実体重', d.data.実_体重 ? `${d.data.実_体重}kg` : null],
                ['実3サイズ', d.data.実_3サイズ],
                ['業界経験', d.data.業界経験],
                ['待機場所', d.data.待機場所],
                ['趣味特技', d.data.趣味特技],
                ['その他メモ', d.data.その他メモ],
              ]} />
            </Section>
          )}

          {d.文章_公開 && (
            <Section label="公開文章">
              <div style={{
                fontSize: 13, lineHeight: 1.8, color: 'var(--text)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }} dangerouslySetInnerHTML={{ __html: d.文章_公開.replace(/<br>/g, '\n') }} />
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
      }}>{label}</div>
      {children}
    </div>
  );
}

function Grid({ rows }) {
  const valid = rows.filter(([, v]) => v);
  if (!valid.length) return <div style={{ fontSize: 12, color: 'var(--muted)' }}>—</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '5px 12px', fontSize: 12 }}>
      {valid.map(([k, v]) => (
        <>
          <span key={k + '_k'} style={{ color: 'var(--muted)', fontWeight: 600 }}>{k}</span>
          <span key={k + '_v'}>{v}</span>
        </>
      ))}
    </div>
  );
}
