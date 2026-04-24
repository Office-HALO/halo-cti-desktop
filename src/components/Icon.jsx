const P = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
  phone:    <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></>,
  phoneIn:  <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/><path d="M14 3l7 7M21 3v7h-7"/></>,
  users:    <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3 3.2-5 6.5-5s6 2 6.5 5"/><circle cx="17" cy="9" r="2.8"/><path d="M15.2 14.5c2.3.4 4.4 2 5 5.5"/></>,
  user:     <><circle cx="12" cy="9" r="3.5"/><path d="M4 20c1-3.5 4-5.5 8-5.5s7 2 8 5.5"/></>,
  history:  <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v4l3 2"/></>,
  chart:    <><path d="M3 20h18"/><rect x="5" y="10" width="3" height="8"/><rect x="11" y="5" width="3" height="13"/><rect x="17" y="13" width="3" height="5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
  search:   <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
  plus:     <><path d="M12 5v14M5 12h14"/></>,
  chevronL: <><path d="m15 6-6 6 6 6"/></>,
  chevronR: <><path d="m9 6 6 6-6 6"/></>,
  chevronD: <><path d="m6 9 6 6 6-6"/></>,
  close:    <><path d="M6 6l12 12M18 6 6 18"/></>,
  refresh:  <><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/></>,
  bell:     <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z"/><path d="M10 21a2 2 0 0 0 4 0"/></>,
  note:     <><path d="M4 4h12l4 4v12H4z"/><path d="M16 4v4h4"/><path d="M8 12h8M8 16h5"/></>,
  pin:      <><path d="M12 2v7l-4 4v2h8v-2l-4-4z"/><path d="M12 15v7"/></>,
  star:     <><path d="M12 3l2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.8 6.3 20.6l1.1-6.4L2.8 9.7l6.4-.9z"/></>,
  bolt:     <><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></>,
  moon:     <><path d="M20 15A8 8 0 1 1 9 4a7 7 0 0 0 11 11z"/></>,
  check:    <><path d="m5 12 5 5 9-11"/></>,
  dot:      <><circle cx="12" cy="12" r="3" fill="currentColor"/></>,
  grid:     <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
  filter:   <><path d="M3 5h18l-7 9v6l-4-2v-4z"/></>,
  more:     <><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/></>,
  external: <><path d="M7 17 17 7M8 7h9v9"/></>,
  car:      <><path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5"/><rect x="3" y="13" width="18" height="5" rx="1"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/></>,
  map:      <><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></>,
  yen:      <><path d="M5 4l7 10 7-10M5 14h14M5 18h14M12 14v6"/></>,
  edit:     <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></>,
  download: <><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></>,
  mic:      <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>,
  mute:     <><path d="M15 6.5V5a3 3 0 0 0-6 0v7"/><path d="M5 11a7 7 0 0 0 10.5 6"/><path d="M12 18v3M3 3l18 18"/></>,
};

export default function Icon({ name, size = 16, stroke = 1.6, style }) {
  const s = { width: size, height: size, display: 'block', ...style };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={s}
    >
      {P[name] || null}
    </svg>
  );
}
