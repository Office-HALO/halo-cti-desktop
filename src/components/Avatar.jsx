export default function Avatar({ name, size = 32, hue }) {
  const initials = (name || '?').slice(0, 1);
  const h = hue ?? (name ? (name.charCodeAt(0) * 37) % 360 : 245);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `linear-gradient(135deg, oklch(0.78 0.10 ${h}), oklch(0.62 0.14 ${h}))`,
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.42,
        fontWeight: 600,
        fontFamily: 'Manrope',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}
