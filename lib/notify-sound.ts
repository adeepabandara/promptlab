/**
 * Plays a pleasant two-tone chime using the Web Audio API.
 * No external files required.
 */
export function playCompletionSound(type: 'success' | 'error' = 'success') {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new AudioContext();

    const notes = type === 'success'
      ? [523.25, 659.25, 783.99] // C5 E5 G5 — major chord arpeggio
      : [392, 349.23];            // G4 F4 — descending for error

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      const start = ctx.currentTime + i * 0.15;
      const end = start + 0.25;

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, end);

      osc.start(start);
      osc.stop(end);
    });

    // Close context after sounds finish
    setTimeout(() => ctx.close(), (notes.length * 150) + 400);
  } catch {
    // Audio not available — silently ignore
  }
}
