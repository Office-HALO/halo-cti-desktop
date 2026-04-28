import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { KIND_DEFS, KIND_ORDER } from '../lib/pricing.js';
import PersonalSettings from './settings/PersonalSettings.jsx';
import StoresSettings from './settings/StoresSettings.jsx';
import CastRanksSettings from './settings/CastRanksSettings.jsx';
import OptionGroupEditor from './settings/OptionGroupEditor.jsx';
import RewardMatrix from './settings/RewardMatrix.jsx';
import RewardRateSettings from './settings/RewardRateSettings.jsx';
import CastRewardSettings from './settings/CastRewardSettings.jsx';

const KIND_ICONS = {
  course: 'yen', nomination: 'star', extension: 'yen',
  event: 'bolt', option: 'note', discount: 'yen',
  transport: 'car', hotel: 'map', driver: 'car',
  media: 'external', other: 'note',
};

const MENU = [
  { id: 'personal', label: '個人設定', icon: 'user' },
  { divider: true, label: 'マスタ' },
  { id: 'stores', label: '店舗', icon: 'grid' },
  { id: 'ranks', label: 'キャストランク', icon: 'star' },
  { divider: true, label: '料金 / 報酬' },
  { id: 'cast_reward', label: 'キャスト報酬', icon: 'star' },
  { id: 'reward_rates', label: 'レート設定', icon: 'yen' },
  { id: 'reward_matrix', label: '報酬計算表', icon: 'yen' },
  ...KIND_ORDER.map((k) => ({
    id: `kind:${k}`,
    label: KIND_DEFS[k]?.label || k,
    icon: KIND_ICONS[k] || 'note',
  })),
];

export default function Settings({ density, setDensity, pattern, setPattern }) {
  const [active, setActive] = useState('personal');

  const renderContent = () => {
    if (active === 'personal') return <PersonalSettings density={density} setDensity={setDensity} pattern={pattern} setPattern={setPattern} />;
    if (active === 'stores') return <StoresSettings />;
    if (active === 'ranks') return <CastRanksSettings />;
    if (active === 'cast_reward') return <CastRewardSettings />;
    if (active === 'reward_rates') return <RewardRateSettings />;
    if (active === 'reward_matrix') return <RewardMatrix />;
    if (active.startsWith('kind:')) return <OptionGroupEditor kind={active.slice(5)} />;
    return null;
  };

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Sidebar */}
      <nav style={{
        width: 172, flexShrink: 0,
        borderRight: '1px solid var(--line)',
        overflowY: 'auto',
        padding: '10px 6px',
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column', gap: 1,
      }}>
        {MENU.map((item, i) => {
          if (item.divider) {
            return (
              <div key={i} style={{ padding: '10px 6px 4px', fontSize: 10, fontWeight: 700, color: 'var(--mutedest, var(--muted))', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                {item.label}
              </div>
            );
          }
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '6px 8px', borderRadius: 6, border: 'none',
                background: isActive ? 'var(--halo-50)' : 'transparent',
                color: isActive ? 'var(--halo-600)' : 'var(--text)',
                fontWeight: isActive ? 600 : 400,
                fontSize: 13, cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'background .1s, color .1s',
              }}
            >
              <Icon name={item.icon} size={13} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.6 }} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Content area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {renderContent()}
      </div>
    </div>
  );
}
