import { useGameStore } from './store';

/**
 * Tiny Web Audio sound kit — procedural cues, no asset files.
 * Every cue checks the save's soundEnabled flag; the AudioContext is
 * created lazily on first use (autoplay policies require a user gesture).
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useGameStore.getState().save.settings.soundEnabled) return null;
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(opts: {
  freq: number;
  freqEnd?: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
  delay?: number;
}) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + (opts.delay ?? 0);
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + opts.duration);
  const v = opts.volume ?? 0.08;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(v, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + opts.duration + 0.05);
}

export const sfx = {
  /** Soft tap for tile/letter selection. */
  tap() {
    tone({ freq: 520, duration: 0.06, type: 'triangle', volume: 0.05 });
  },
  /** A found word / solved group. */
  correct() {
    tone({ freq: 523, duration: 0.12, type: 'triangle' });
    tone({ freq: 784, duration: 0.16, type: 'triangle', delay: 0.09 });
  },
  /** Wrong attempt. */
  wrong() {
    tone({ freq: 220, freqEnd: 140, duration: 0.25, type: 'sawtooth', volume: 0.05 });
  },
  /** Pangram or big find. */
  flourish() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, duration: 0.18, type: 'triangle', delay: i * 0.08 }));
  },
  /** Node victory. */
  victory() {
    [392, 523, 659, 784].forEach((f, i) => tone({ freq: f, duration: 0.22, type: 'sine', delay: i * 0.1, volume: 0.09 }));
  },
  /** Glyph reveal chime. */
  glyph() {
    tone({ freq: 1175, duration: 0.4, type: 'sine', volume: 0.06 });
    tone({ freq: 1568, duration: 0.5, type: 'sine', delay: 0.12, volume: 0.05 });
  },
  /** Boss falls / level up. */
  levelUp() {
    [262, 330, 392, 523, 659, 784].forEach((f, i) => tone({ freq: f, duration: 0.3, type: 'triangle', delay: i * 0.09 }));
  },
  /** Run lost. */
  defeat() {
    [330, 277, 220, 165].forEach((f, i) => tone({ freq: f, duration: 0.5, type: 'sine', delay: i * 0.22, volume: 0.07 }));
  },
};
