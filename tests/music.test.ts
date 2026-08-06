/**
 * tests/music.test.ts — OWNER: A8 (Platform).
 *
 * The generative engine's pure core, held to the AAA 8.9 harmony rules by
 * brute force: long seeded chord walks in every mood scale must never break
 * voice-leading, and the director's mood mapping must be deterministic.
 * (Audio nodes themselves can't run under node — the DOM-free split between
 * theory/director-logic and the WebAudio shell is what makes this testable.)
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import {
  SCALES,
  type ScaleName,
  initialChord,
  nextChord,
  nextMelodyNote,
  commonToneCount,
  topVoice,
  pitchClass,
  triadPitchClasses,
  G3,
  midiToFreq,
} from '../src/app/music/theory';
import { pickMoodKey } from '../src/app/music/director';

const SCALE_NAMES = Object.keys(SCALES) as ScaleName[];

describe('theory — chord walks obey AAA 8.9 in every scale', () => {
  it.each(SCALE_NAMES)('%s: 300 changes, ≥2 common tones, top voice ≤2 semitones', (name) => {
    const scale = SCALES[name];
    const rng = createRng(0xbeef ^ name.length);
    const root = 60;
    let chord = initialChord(root, scale);
    let moved = 0;
    for (let i = 0; i < 300; i++) {
      const next = nextChord(rng, root, scale, chord);
      if (next !== chord) {
        moved++;
        expect(commonToneCount(chord.midis, next.midis)).toBeGreaterThanOrEqual(2);
        expect(Math.abs(topVoice(next.midis) - topVoice(chord.midis))).toBeLessThanOrEqual(2);
      }
      chord = next;
    }
    // The walk must actually walk (holding forever would pass vacuously).
    expect(moved).toBeGreaterThan(50);
  });

  it.each(SCALE_NAMES)('%s: no 3rds/7ths voiced below G3', (name) => {
    const scale = SCALES[name];
    const rng = createRng(0xcafe);
    const root = 57; // the lowest root the director uses (dusk/night)
    let chord = initialChord(root, scale);
    for (let i = 0; i < 200; i++) {
      const rootPc = triadPitchClasses(root, scale, chord.degree)[0]!;
      for (const midi of chord.midis) {
        const iv = (pitchClass(midi) - rootPc + 12) % 12;
        const thirdOrSeventh = iv === 3 || iv === 4 || iv === 10 || iv === 11;
        if (thirdOrSeventh) expect(midi).toBeGreaterThanOrEqual(G3);
      }
      chord = nextChord(rng, root, scale, chord);
    }
  });

  it('melody stays inside its register band and mostly steps', () => {
    const scale = SCALES.lydian;
    const rng = createRng(0x5eed);
    const chord = initialChord(63, scale);
    let prev = 80;
    let leaps = 0;
    for (let i = 0; i < 500; i++) {
      const next = nextMelodyNote(rng, prev, chord, 63, scale, 72, 93);
      expect(next).toBeGreaterThanOrEqual(72);
      expect(next).toBeLessThanOrEqual(93);
      if (Math.abs(next - prev) > 3) leaps++;
      prev = next;
    }
    expect(leaps / 500).toBeLessThan(0.3); // smooth top line, occasional leap
  });

  it('midiToFreq is anchored at A4', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });

  it('lydian carries the ♯4 tell (AAA 8.10)', () => {
    expect(SCALES.lydian).toContain(6);
    expect(SCALES.ionian).not.toContain(6);
  });
});

describe('director — pickMoodKey precedence', () => {
  const base = {
    phase: 'exploring' as string | null,
    activeRoomKind: null as string | null,
    activeRoomCategory: null as string | null,
    playerRow: 2,
    stepsLow: false,
  };

  it('day phases outrank everything', () => {
    expect(pickMoodKey({ ...base, phase: 'dusk', activeRoomCategory: 'mystery' })).toBe('dusk');
    expect(pickMoodKey({ ...base, phase: 'night' })).toBe('night');
    expect(pickMoodKey({ ...base, phase: 'morning' })).toBe('morning');
  });

  it('violet rooms are identifiable by ear — mystery beats room kind', () => {
    expect(pickMoodKey({ ...base, activeRoomCategory: 'mystery', activeRoomKind: 'hive' })).toBe('mystery');
  });

  it('the Conservatory has its own palette; other rooms share the puzzle mood', () => {
    expect(pickMoodKey({ ...base, activeRoomKind: 'hive' })).toBe('conservatory');
    expect(pickMoodKey({ ...base, activeRoomKind: 'twistle' })).toBe('puzzle');
  });

  it('sanctum proximity and dwindling steps color the walk', () => {
    expect(pickMoodKey({ ...base, playerRow: 5 })).toBe('sanctum');
    expect(pickMoodKey({ ...base, stepsLow: true })).toBe('dusk');
    expect(pickMoodKey(base)).toBe('exploring');
  });
});
