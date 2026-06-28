function playBeeps(pattern: Array<{ t: number; freq: number; dur?: number }>, volume = 0.08): void {
  if (typeof globalThis.AudioContext === 'undefined') return;
  try {
    const ctx = new AudioContext();
    for (const { t, freq, dur = 0.15 } of pattern) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.value = volume;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    }
    const end = pattern.reduce((m, p) => Math.max(m, p.t + (p.dur ?? 0.15)), 0);
    setTimeout(() => void ctx.close(), end * 1000 + 200);
  } catch {
    // bỏ qua
  }
}

/** Alarm nhẹ — cá mập đặt lệnh lớn. */
export function playWhalePlacedAlarm(): void {
  playBeeps([
    { t: 0, freq: 660 },
    { t: 0.18, freq: 784 },
  ]);
}

/** Alarm gấp — cá mập gỡ lệnh / spoofing. */
export function playWhalePullAlarm(): void {
  playBeeps(
    [
      { t: 0, freq: 988, dur: 0.12 },
      { t: 0.14, freq: 880, dur: 0.12 },
      { t: 0.28, freq: 988, dur: 0.12 },
      { t: 0.42, freq: 1175, dur: 0.2 },
    ],
    0.1,
  );
}

/** @deprecated dùng playWhalePlacedAlarm / playWhalePullAlarm */
export function playWhaleRadarAlarm(): void {
  playWhalePullAlarm();
}
