import Icon from './Icon.jsx';

export default function ToolsFloat({ density, setDensity, pattern, setPattern, onDemoCall }) {
  return (
    <div className="tools-float">
      <div className="density-toggle">
        {['compact', 'standard', 'comfort'].map((d) => (
          <button
            key={d}
            className={density === d ? 'active' : ''}
            onClick={() => setDensity(d)}
          >
            {d === 'compact' ? 'コンパクト' : d === 'standard' ? '標準' : 'ゆったり'}
          </button>
        ))}
      </div>
      <button className="btn sm" onClick={onDemoCall}>
        <Icon name="phoneIn" size={12} />
        デモ着信
      </button>
      <div className="pattern-toggle">
        {['A', 'B', 'C'].map((p) => (
          <button
            key={p}
            className={pattern === p ? 'active' : ''}
            onClick={() => setPattern(p)}
            title={
              p === 'A'
                ? 'Clean Grid（整ったグリッド・業務特化）'
                : p === 'B'
                ? 'Card Stack（カード化・モダンSaaS）'
                : 'Dense Pro（情報密度極限・オペレーター）'
            }
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
