export default function HaloLogo({ size = 28, withWord = true, color }) {
  const c = color || 'var(--halo)';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block' }}>
        <circle cx="16" cy="16" r="11" fill="none" stroke={c} strokeWidth="1.6" />
        <circle cx="16" cy="16" r="5" fill={c} />
        <path d="M5 9 L27 5" stroke={c} strokeWidth="2" strokeLinecap="round" />
      </svg>
      {withWord && (
        <span
          style={{
            fontFamily: 'Manrope, sans-serif',
            fontWeight: 800,
            letterSpacing: '.16em',
            fontSize: 14,
            color: 'var(--text)',
          }}
        >
          HALO
        </span>
      )}
    </div>
  );
}
