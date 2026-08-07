'use client';

// A short "swoosh" for outbound sends (texts, thread updates). Synthesized with
// the Web Audio API so there is no audio file to host. Silently no-ops if audio
// is unavailable or blocked.
export function playSwoosh() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const dur = 0.26;

    // Bandpass-filtered white noise with a rising sweep = a "swoosh".
    const size = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size); // fade the source
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(600, now);
    bp.frequency.exponentialRampToValueAtTime(3200, now + dur);
    bp.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    noise.connect(bp); bp.connect(gain); gain.connect(ctx.destination);
    noise.start(now); noise.stop(now + dur);
    noise.onended = () => { try { ctx.close(); } catch { /* ignore */ } };
  } catch { /* no sound, no problem */ }
}

// A bright two-note "ding" for alerts (a lead landing in Clean View, a stage
// change). Meant to catch attention, distinct from the softer send swoosh.
export function playDing() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    // Two quick bell tones (a rising perfect fourth: ~880 then ~1175 Hz).
    const tones = [{ f: 880, t: 0 }, { f: 1174.7, t: 0.12 }];
    for (const { f, t } of tones) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(0.3, now + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.32);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(now + t); osc.stop(now + t + 0.34);
    }
    setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 700);
  } catch { /* no sound, no problem */ }
}
