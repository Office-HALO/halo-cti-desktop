export default function Placeholder({ title }) {
  return (
    <div
      style={{
        padding: 48,
        color: 'var(--muted)',
        fontSize: 14,
        display: 'grid',
        placeItems: 'center',
        height: '100%',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🚧</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          {title}
        </div>
        <div>Phase B で実装予定</div>
      </div>
    </div>
  );
}
