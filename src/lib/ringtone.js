// Synthesized phone ringtone using Web Audio API
let ctx = null;
let timer = null;
let activeNodes = [];

function playRing() {
  if (!ctx) return;
  const now = ctx.currentTime;
  // Two-tone ring (like a classic phone) for ~1.5s
  const tones = [
    { freq: 440, start: 0, dur: 0.4 },
    { freq: 480, start: 0, dur: 0.4 },
    { freq: 440, start: 0.6, dur: 0.4 },
    { freq: 480, start: 0.6, dur: 0.4 },
  ];
  tones.forEach(({ freq, start, dur }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(0.12, now + start + 0.02);
    gain.gain.setValueAtTime(0.12, now + start + dur - 0.02);
    gain.gain.linearRampToValueAtTime(0, now + start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur);
    activeNodes.push(osc, gain);
  });
}

export function startRingtone() {
  if (timer) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    playRing();
    timer = setInterval(playRing, 3000);
  } catch {
    // ignore if AudioContext not available
  }
}

export function stopRingtone() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  activeNodes.forEach((n) => { try { n.disconnect(); } catch {} });
  activeNodes = [];
  if (ctx) {
    try { ctx.close(); } catch {}
    ctx = null;
  }
}
