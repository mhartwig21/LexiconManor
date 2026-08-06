/**
 * app/music/theory.ts — pure music theory. OWNER: A8.
 * No audio, no DOM: scales, chord walks and voicing rules, unit-testable.
 * Reuses engine/rng for determinism.
 *
 * Rules enforced (AAA 8.9):
 *  - every chord change shares ≥2 common tones (pitch classes);
 *  - the top voice moves ≤2 semitones;
 *  - no 3rds/7ths voiced below ~G3 (MIDI 55) — register floor;
 *  - harmonic rhythm is the caller's job (8–16s, director.ts).
 */

import type { Rng } from '../../engine/rng';
import { randInt } from '../../engine/rng';

/** Scale masks as semitone offsets from the root. */
export const SCALES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  /** Violet-room color: the ♯4 is the tell (AAA 8.10). */
  lydian: [0, 2, 4, 6, 7, 9, 11],
} as const;

export type ScaleName = keyof typeof SCALES;

export const G3 = 55; // register floor for 3rds/7ths
export const C5 = 72; // celesta floor (AAA 8.2)

export interface Chord {
  /** Voiced MIDI notes, ascending. */
  midis: number[];
  /** Scale degree (0-based) the chord is built on. */
  degree: number;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/** Diatonic triad pitch classes on a scale degree. */
export function triadPitchClasses(root: number, scale: readonly number[], degree: number): number[] {
  const deg = (i: number) => pitchClass(root + scale[(degree + i) % scale.length]!);
  return [deg(0), deg(2), deg(4)];
}

/** Interval of a chord tone above the chord's root pitch class (0..11). */
function intervalFromRoot(rootPc: number, midi: number): number {
  return (pitchClass(midi) - rootPc + 12) % 12;
}

/** Is this chord tone a 3rd or 7th (the muddy-below-G3 intervals)? */
function isThirdOrSeventh(rootPc: number, midi: number): boolean {
  const iv = intervalFromRoot(rootPc, midi);
  return iv === 3 || iv === 4 || iv === 10 || iv === 11;
}

/**
 * Voice a triad near a previous top note: three pitch classes placed in a
 * comfortable register, top voice as close to `prevTop` as possible,
 * 3rds raised above the G3 floor.
 */
export function voiceTriad(pcs: number[], prevTop: number, registerCenter = 60): Chord['midis'] {
  const rootPc = pcs[0]!;
  // Choose the top: the pc realization nearest prevTop.
  let top = prevTop;
  let bestDist = Infinity;
  for (const pc of pcs) {
    for (let oct = -1; oct <= 1; oct++) {
      const cand = prevTop - ((prevTop - pc) % 12) + oct * 12;
      const norm = cand < 40 ? cand + 12 : cand;
      const d = Math.abs(norm - prevTop);
      if (d < bestDist) {
        bestDist = d;
        top = norm;
      }
    }
  }
  // Fill the remaining two voices below the top, near the register center.
  const rest = pcs.filter((pc) => pc !== pitchClass(top));
  const midis: number[] = [top];
  let below = top;
  for (const pc of rest) {
    let m = below - (((below - pc) % 12) + 12) % 12;
    if (m >= below) m -= 12;
    // Register floor: 3rds/7ths never below G3 (raise them).
    while (isThirdOrSeventh(rootPc, m) && m < G3) m += 12;
    // Keep some spread sanity around the center.
    while (m < registerCenter - 19) m += 12;
    midis.push(m);
    below = Math.min(below, m);
  }
  return [...midis].sort((a, b) => a - b);
}

export function commonToneCount(a: number[], b: number[]): number {
  const setA = new Set(a.map(pitchClass));
  let n = 0;
  for (const pc of new Set(b.map(pitchClass))) if (setA.has(pc)) n++;
  return n;
}

export function topVoice(midis: number[]): number {
  return midis[midis.length - 1]!;
}

/** Starting chord: tonic triad voiced around the register center. */
export function initialChord(root: number, scale: readonly number[], registerCenter = 60): Chord {
  const pcs = triadPitchClasses(root, scale, 0);
  return { midis: voiceTriad(pcs, registerCenter + 7, registerCenter), degree: 0 };
}

/**
 * Chord walk step: candidate diatonic triads filtered by the two rules
 * (≥2 common tones, top voice ≤2 semitones), seeded-random among survivors.
 * Falls back to holding the current chord if nothing qualifies (never breaks
 * the rules to "make progress").
 */
export function nextChord(
  rng: Rng,
  root: number,
  scale: readonly number[],
  current: Chord,
  registerCenter = 60,
): Chord {
  const candidates: Chord[] = [];
  for (let degree = 0; degree < scale.length; degree++) {
    if (degree === current.degree) continue;
    const pcs = triadPitchClasses(root, scale, degree);
    const midis = voiceTriad(pcs, topVoice(current.midis), registerCenter);
    if (commonToneCount(current.midis, midis) < 2) continue;
    if (Math.abs(topVoice(midis) - topVoice(current.midis)) > 2) continue;
    candidates.push({ midis, degree });
  }
  if (candidates.length === 0) return current;
  return candidates[randInt(rng, candidates.length)]!;
}

/** Scale tones inside [lo, hi] — melody material for the phrase generator. */
export function scaleMidisInRange(root: number, scale: readonly number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) {
    if (scale.includes((pitchClass(m) - pitchClass(root) + 12) % 12)) out.push(m);
  }
  return out;
}

/**
 * Pick the next melody note: prefer chord tones, stay within a 2–4 semitone
 * drift of the previous note (smooth top line), occasionally leap.
 */
export function nextMelodyNote(
  rng: Rng,
  prev: number,
  chord: Chord,
  root: number,
  scale: readonly number[],
  lo: number,
  hi: number,
): number {
  const pool = scaleMidisInRange(root, scale, lo, hi);
  if (pool.length === 0) return prev;
  const chordPcs = new Set(chord.midis.map(pitchClass));
  const leap = rng() < 0.15;
  const maxStep = leap ? 7 : 3;
  const near = pool.filter((m) => Math.abs(m - prev) <= maxStep && m !== prev);
  const source = near.length > 0 ? near : pool;
  const chordy = source.filter((m) => chordPcs.has(pitchClass(m)));
  const pickFrom = chordy.length > 0 && rng() < 0.7 ? chordy : source;
  return pickFrom[randInt(rng, pickFrom.length)]!;
}
