/**
 * Tiny Web Audio sound kit — procedural cues, no asset files. OWNER: A8
 * (the audio-touching layer, ARCHITECTURE §8).
 *
 * Routed through the music engine's graph: cues play on `graph.sfxIn`
 * (un-ducked) and hold the music duck open via duck.ts (−5 dB fast-attack /
 * slow-release, refcounted — rapid letter taps never pump, AAA 8.5).
 *
 * Every cue checks the save's soundEnabled flag; the AudioContext is the
 * music engine's lazy singleton (gesture-unlocked on pointerup/touchend).
 * Nothing here ever waits on AudioContext state (AAA R.4) — a cue that can't
 * play is silently dropped and the game is complete without it.
 */

import { useManorStore } from './store';
import { ensureContext } from './music/context';
import { buildAudioGraph, type AudioGraph } from './music/graph';
import { duckFor } from './music/duck';

function audio(): AudioGraph | null {
  if (!useManorStore.getState().settings.soundEnabled) return null;
  const ctx = ensureContext(); // in-gesture this resumes within the same tap
  if (!ctx) return null;
  // Schedule even while 'suspended': currentTime freezes, so queued cues fire
  // the instant the in-flight resume() lands — first tap sounds <100ms
  // (AAA 8.12) without anything ever *waiting* on state (R.4).
  return buildAudioGraph(ctx);
}

function tone(opts: {
  freq: number;
  freqEnd?: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
  delay?: number;
}) {
  const g = audio();
  if (!g) return;
  const ac = g.ctx;
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
  osc.connect(gain).connect(g.sfxIn);
  osc.start(t0);
  osc.stop(t0 + opts.duration + 0.05);
  // Music ducks under the cue and swells back (refcounted hold, AAA 8.5).
  duckFor('sfx', (opts.delay ?? 0) * 1000 + opts.duration * 1000 + 150);
}

/** Semitone offset → frequency multiplier. */
const st = (n: number) => Math.pow(2, n / 12);

export const sfx = {
  /** Soft tap for tile/letter selection. */
  tap() {
    tone({ freq: 520, duration: 0.06, type: 'triangle', volume: 0.05 });
  },
  /**
   * A found word / solved group. Optional `pitch` (AAA 1.9): pass the word
   * length (or any small integer); the chime rises ~1 semitone per unit
   * above 4, capped an octave up. `sfx.correct()` keeps the old fixed cue.
   */
  correct(pitch?: number) {
    const lift = st(Math.min(12, Math.max(0, (pitch ?? 4) - 4)));
    tone({ freq: 523 * lift, duration: 0.12, type: 'triangle' });
    tone({ freq: 784 * lift, duration: 0.16, type: 'triangle', delay: 0.09 });
  },
  /** Wrong attempt — a low thud, never a sting. */
  wrong() {
    tone({ freq: 220, freqEnd: 140, duration: 0.25, type: 'sawtooth', volume: 0.05 });
  },
  /** Pangram or big find. */
  flourish() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, duration: 0.18, type: 'triangle', delay: i * 0.08 }));
    duckFor('fanfare', 700);
  },
  /** Room solved. */
  victory() {
    [392, 523, 659, 784].forEach((f, i) => tone({ freq: f, duration: 0.22, type: 'sine', delay: i * 0.1, volume: 0.09 }));
    duckFor('fanfare', 900);
  },
  /** Reveal chime (fragments, rewards). */
  glyph() {
    tone({ freq: 1175, duration: 0.4, type: 'sine', volume: 0.06 });
    tone({ freq: 1568, duration: 0.5, type: 'sine', delay: 0.12, volume: 0.05 });
  },
  /** Big milestone (Full Bloom, volume solved). */
  levelUp() {
    [262, 330, 392, 523, 659, 784].forEach((f, i) => tone({ freq: f, duration: 0.3, type: 'triangle', delay: i * 0.09 }));
    duckFor('fanfare', 1200);
  },
  /** Dusk falls — the day is over (never a failure sting). */
  dusk() {
    [330, 277, 220, 165].forEach((f, i) => tone({ freq: f, duration: 0.5, type: 'sine', delay: i * 0.22, volume: 0.07 }));
  },
};
