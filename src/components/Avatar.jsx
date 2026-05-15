export default function Avatar({ name, size = 32, hue, src }) {
  const initials = (name || '?').slice(0, 1);
  const h = hue ?? (name ? (name.charCodeAt(0) * 37) % 360 : 245);

  if (src) {
    return (
      <img
        src={src}
        alt={name || ''}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          display: 'block',
        }}
        onError={(e) => {
          // 画像読み込み失敗時はイニシャルアバターにフォールバック
          e.currentTarget.style.display = 'none';
          e.currentTarget.nextSibling?.style?.removeProperty('display');
        }}
      />
    );
  }

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
