/**
 * RewardMatrix.jsx （簡略版）
 * Gran / La Reine の報酬計算表を静的に表示するだけ。DB不要。
 */
import { useState } from 'react';
import {
  calculateGranReward, calculateLaReineReward,
  GRAN_COURSE_TABLE, LAREINE_COURSE_TABLE,
} from '../../lib/pricing.js';

const SEL_S = {
  padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
  fontFamily: 'inherit', outline: 'none',
};

const GRAN_RANKS = [
  { code: 'rank1',  label: '★1',  nomFee: 2000 },
  { code: 'gran2',  label: '★2',  nomFee: 2000 },
  { code: 'gran3',  label: '★3',  nomFee: 3000 },
  { code: 'gran4',  label: '★4',  nomFee: 4000 },
  { code: 'gran5',  label: '★5',  nomFee: 5000 },
];

const LR_RANKS = [
  { code: 'lr_base', label: 'ベース', nomFee: 0    },
  { code: 'lr1',     label: '☆1',    nomFee: 1000 },
  { code: 'lr2',     label: '☆2',    nomFee: 2000 },
  { code: 'lr3',     label: '☆3',    nomFee: 3000 },
  { code: 'lr4',     label: '☆4',    nomFee: 4000 },
  { code: 'lr5',     label: '☆5',    nomFee: 5000 },
];

const NOM_OPTS = [
  { value: 'free',   label: 'フリー' },
  { value: 'net',    label: 'ネット/パネル' },
  { value: 'honshi', label: '本指名' },
];

const Y  = (v) => `¥${Number(v).toLocaleString()}`;
const TH = { padding: '7px 10px', fontWeight: 700, fontSize: 11, textAlign: 'right', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' };
const TD = { padding: '6px 10px', fontSize: 12, textAlign: 'right', borderBottom: '1px solid var(--line)', fontVariantNumeric: 'tabular-nums' };

export default function RewardMatrix() {
  const [nomType, setNomType] = useState('net');
  const [brand,   setBrand]   = useState('gran');

  const isGran      = brand === 'gran';
  const rankList    = isGran ? GRAN_RANKS : LR_RANKS;
  const courseTable = isGran ? GRAN_COURSE_TABLE : LAREINE_COURSE_TABLE;
  const accent      = isGran ? { bg: '#fff7ed', col: '#c2410c', bdr: '#fb923c' }
                              : { bg: '#fdf4ff', col: '#7e22ce', bdr: '#c084fc' };

  return (
    <div>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>報酬計算表</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            ブランドと指名種別を切り替えると全コースのバック額が確認できます
          </p>
        </div>
      </div>

      {/* コントロール */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 600, letterSpacing: 0.3 }}>ブランド</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ v: 'gran', label: 'Gran' }, { v: 'lareine', label: 'La Reine' }].map(b => {
              const a = b.v === 'gran'
                ? { bg: '#fff7ed', col: '#c2410c', bdr: '#fb923c' }
                : { bg: '#fdf4ff', col: '#7e22ce', bdr: '#c084fc' };
              return (
                <button key={b.v} onClick={() => setBrand(b.v)} style={{
                  padding: '5px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: brand === b.v ? a.bg : 'var(--bg)',
                  color:      brand === b.v ? a.col : 'var(--muted)',
                  border:     `1.5px solid ${brand === b.v ? a.bdr : 'var(--border)'}`,
                }}>{b.label}</button>
              );
            })}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 600, letterSpacing: 0.3 }}>指名種別</div>
          <select value={nomType} onChange={e => setNomType(e.target.value)} style={SEL_S}>
            {NOM_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* テーブル */}
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead>
            <tr style={{ background: accent.bg }}>
              <th style={{ ...TH, textAlign: 'left', position: 'sticky', left: 0, background: accent.bg, minWidth: 72 }}>コース</th>
              <th style={{ ...TH, color: 'var(--muted)', minWidth: 80 }}>客払い</th>
              {rankList.map(r => (
                <th key={r.code} style={{ ...TH, minWidth: 120, color: accent.col }}>
                  {r.label}
                  <div style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 10, marginTop: 1 }}>
                    {nomType !== 'free' && r.nomFee > 0 ? `指名 +${Y(r.nomFee)}` : '指名なし'}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {courseTable.map(row => {
              const isOver120 = !isGran && row.min > 120;
              return (
                <tr key={row.min}>
                  <td style={{ ...TD, textAlign: 'left', fontWeight: 600, position: 'sticky', left: 0, background: 'var(--surface)' }}>
                    {row.min}分
                  </td>
                  <td style={{ ...TD, color: 'var(--muted)' }}>{Y(row.price)}</td>
                  {rankList.map(rank => {
                    const nomFee = nomType === 'free' ? 0 : rank.nomFee;
                    let courseBack, nomBack;
                    if (isGran) {
                      ({ courseBack, nomBack } = calculateGranReward({ coursePrice: row.price, nominationFee: nomFee, nominationType: nomType }));
                    } else {
                      ({ courseBack, nomBack } = calculateLaReineReward({ coursePrice: row.price, nominationFee: nomFee, nominationType: nomType, durationMin: row.min }));
                    }
                    const total = courseBack + nomBack;
                    return (
                      <td key={rank.code} style={{ ...TD, background: isOver120 ? 'oklch(0.97 0.02 280 / 0.5)' : undefined }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: accent.col }}>{Y(total)}</div>
                        {nomBack > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                            コース{Y(courseBack)} + 指名{Y(nomBack)}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 計算式メモ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16, fontSize: 12 }}>
        <div style={{ padding: '10px 14px', background: '#fff7ed', borderRadius: 6, border: '1px solid #fb923c' }}>
          <div style={{ fontWeight: 700, color: '#c2410c', marginBottom: 5 }}>Gran 計算式</div>
          <div style={{ lineHeight: 1.8 }}>
            コースバック = 客払い × <b>50%</b><br />
            指名バック（ネット/パネル）= 指名料 × <b>50%</b><br />
            指名バック（本指名）= 指名料 × <b>100%</b>
          </div>
        </div>
        <div style={{ padding: '10px 14px', background: '#fdf4ff', borderRadius: 6, border: '1px solid #c084fc' }}>
          <div style={{ fontWeight: 700, color: '#7e22ce', marginBottom: 5 }}>La Reine 計算式（120分の壁）</div>
          <div style={{ lineHeight: 1.8 }}>
            120分以下：（コース + 指名）×&nbsp;<b>ネット55% / 本指名60%</b><br />
            120分超：&nbsp;120分料金 × レート + 超過分 × <b>50%</b><br />
            <span style={{ background: 'oklch(0.97 0.02 280 / 0.5)', padding: '1px 4px', borderRadius: 3 }}>紫背景</span> = 120分超の行 / 端数は100円単位で四捨五入
          </div>
        </div>
      </div>
    </div>
  );
}
