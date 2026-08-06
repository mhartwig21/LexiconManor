/**
 * Volume mystery FSM — OWNER: A7 (Mystery). Pure-engine tests for guessing
 * (one per day, closeness, never a penalty), the deterministic fragment drip,
 * the pity rule, letter arrivals, and the volume roll.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DayRecord, VolumeState } from '../src/engine/types';
import {
  advanceVolume, applyGuess, arrivedLetters, computeCloseness, fragmentDroughtDays,
  freshVolumeState, hasGuessedOnDay, letterGrants, nextFragmentForRoom, normalizeGuess,
  openedLetterFlag, pityDue, solvedFlag, unfoundFragments, PITY_DROUGHT_DAYS,
  type VolumeContent,
} from '../src/engine/volume';

const volume = JSON.parse(
  readFileSync(join(__dirname, '..', 'content', 'authored', 'volumes', 'volume-1.json'), 'utf8'),
) as VolumeContent;

const fresh = (): VolumeState => freshVolumeState(volume.id, 1);

const dayRecord = (day: number, fragmentsFound: number): DayRecord => ({
  day, endedAt: day * 1000, cause: 'steps-exhausted', roomsDrafted: 3, roomsSolved: 2,
  stepsSpent: 40, fragmentsFound,
});

describe('normalizeGuess', () => {
  it('uppercases and strips everything but letters', () => {
    expect(normalizeGuess('  Lacuna! ')).toBe('LACUNA');
    expect(normalizeGuess('la cuna')).toBe('LACUNA');
  });
  it('strips a leading article only as a separate word', () => {
    expect(normalizeGuess('the lacuna')).toBe('LACUNA');
    expect(normalizeGuess('a lacuna')).toBe('LACUNA');
    expect(normalizeGuess('theory')).toBe('THEORY');
    expect(normalizeGuess('anthem')).toBe('ANTHEM');
  });
});

describe('computeCloseness (the Portrait’s sigh metadata, AAA 4.17)', () => {
  it('counts distinct shared letters and length match', () => {
    const c = computeCloseness('LACUNA', 'LAGOON', []);
    expect(c.sharedLetters).toBe(3); // L, A, N — distinct letters of the guess in the answer... G,O out
    expect(c.rightLength).toBe(true);
    expect(c.repeat).toBe(false);
  });
  it('flags a repeated guess', () => {
    const c = computeCloseness('LACUNA', 'VELLUM', [{ guess: 'VELLUM' }]);
    expect(c.repeat).toBe(true);
  });
  it('zero shared letters is representable (the warmest sigh)', () => {
    expect(computeCloseness('LACUNA', 'THEORY', []).sharedLetters).toBe(0);
  });
});

describe('applyGuess — one word a day at the door', () => {
  it('a wrong guess journals the day and never mutates status', () => {
    const { state, result } = applyGuess(volume, fresh(), 'vellum', 3);
    expect(result.kind).toBe('wrong');
    expect(state.status).toBe('active');
    expect(state.guesses).toEqual([{ day: 3, guess: 'VELLUM' }]);
    expect(hasGuessedOnDay(state, 3)).toBe(true);
  });

  it('the daily gate: a second guess the same day is refused, tomorrow is fine', () => {
    const first = applyGuess(volume, fresh(), 'vellum', 3);
    const sameDay = applyGuess(volume, first.state, 'lacuna', 3);
    expect(sameDay.result.kind).toBe('gate');
    expect(sameDay.state).toBe(first.state); // untouched
    const nextDay = applyGuess(volume, first.state, 'lacuna', 4);
    expect(nextDay.result.kind).toBe('solved');
  });

  it('the right word solves the volume — from day one, no fragments required (AAA 4.18)', () => {
    const { state, result } = applyGuess(volume, fresh(), 'Lacuna', 1);
    expect(result).toEqual({ kind: 'solved', word: 'LACUNA' });
    expect(state.status).toBe('solved');
  });

  it('accepted alternates (the plural) are met with grace', () => {
    expect(applyGuess(volume, fresh(), 'lacunae', 1).result.kind).toBe('solved');
  });

  it('empty and post-solve guesses are no-ops', () => {
    expect(applyGuess(volume, fresh(), '  !! ', 1).result.kind).toBe('empty');
    const solved = applyGuess(volume, fresh(), 'lacuna', 1).state;
    expect(applyGuess(volume, solved, 'vellum', 2).result.kind).toBe('gate');
  });

  it('wrong guesses carry closeness for the sigh variants', () => {
    const { result } = applyGuess(volume, fresh(), 'lagoon', 2);
    expect(result.kind).toBe('wrong');
    if (result.kind === 'wrong') {
      expect(result.closeness.rightLength).toBe(true);
      expect(result.closeness.sharedLetters).toBeGreaterThan(0);
    }
  });

  it('flag names produced by the machine are legal per docs/flags.md', () => {
    const re = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*){1,2}$/;
    expect(solvedFlag(volume.id)).toMatch(re);
    expect(openedLetterFlag(volume.id, 'first-post')).toMatch(re);
  });
});

describe('fragment drip — deterministic, category-aware, never stranded (AAA 4.14)', () => {
  it('pulls the lowest unfound revealOrder for a matching category', () => {
    const first = nextFragmentForRoom(volume, fresh(), 'mystery');
    expect(first?.id).toBe('v1-d1'); // revealOrder 1, mystery-sourced
  });

  it('prefers the category, then falls back to the global lowest', () => {
    const s = fresh();
    const puzzle = nextFragmentForRoom(volume, s, 'puzzle');
    expect(puzzle?.sourceRoomCategory).toBe('puzzle');
    // Exhaust all puzzle-sourced fragments → the drip falls back, never null.
    const allPuzzle = volume.fragments.filter((f) => f.sourceRoomCategory === 'puzzle').map((f) => f.id);
    const drained: VolumeState = { ...s, foundFragmentIds: allPuzzle };
    const fallback = nextFragmentForRoom(volume, drained, 'puzzle');
    expect(fallback).not.toBeNull();
    expect(fallback!.sourceRoomCategory).not.toBe('puzzle');
  });

  it('walking the drip files every fragment exactly once, in revealOrder within a category run', () => {
    let s = fresh();
    const seen: string[] = [];
    for (let i = 0; i < volume.fragments.length; i++) {
      const f = nextFragmentForRoom(volume, s, 'mystery')!;
      seen.push(f.id);
      s = { ...s, foundFragmentIds: [...s.foundFragmentIds, f.id] };
    }
    expect(new Set(seen).size).toBe(volume.fragments.length);
    expect(nextFragmentForRoom(volume, s, 'mystery')).toBeNull();
    expect(unfoundFragments(volume, s)).toEqual([]);
  });
});

describe('pity rule — no fragment for 3 days of play brings the post (AAA 4.14)', () => {
  it('counts the drought from the tail of the day records', () => {
    expect(fragmentDroughtDays([dayRecord(1, 2), dayRecord(2, 0), dayRecord(3, 0)])).toBe(2);
    expect(fragmentDroughtDays([dayRecord(1, 0), dayRecord(2, 1)])).toBe(0);
    expect(fragmentDroughtDays([])).toBe(0);
  });

  it('pityDue only during an active volume with fragments left', () => {
    const drought = [dayRecord(1, 0), dayRecord(2, 0), dayRecord(3, 0)];
    expect(pityDue(volume, fresh(), drought)).toBe(true);
    expect(pityDue(volume, fresh(), [dayRecord(3, 1)])).toBe(false);
    const solved: VolumeState = { ...fresh(), status: 'solved' };
    expect(pityDue(volume, solved, drought)).toBe(false);
    const all: VolumeState = { ...fresh(), foundFragmentIds: volume.fragments.map((f) => f.id) };
    expect(pityDue(volume, all, drought)).toBe(false);
  });

  it('a pity letter arrives during a drought and grants the next unfound fragment', () => {
    const s = { ...fresh(), foundFragmentIds: ['v1-d1'] };
    const opts = { droughtDays: PITY_DROUGHT_DAYS, openedIds: new Set<string>() };
    const tray = arrivedLetters(volume, s, 5, opts);
    const pity = tray.find((l) => l.pity);
    expect(pity).toBeDefined();
    expect(letterGrants(volume, pity!, s)).toEqual(['v1-e1']); // lowest unfound revealOrder
  });

  it('no drought → no fresh pity letter, but an opened one stays readable', () => {
    const noDrought = { droughtDays: 0, openedIds: new Set<string>() };
    expect(arrivedLetters(volume, fresh(), 9, noDrought).some((l) => l.pity)).toBe(false);
    const kept = { droughtDays: 0, openedIds: new Set(['under-the-tray']) };
    expect(arrivedLetters(volume, fresh(), 9, kept).some((l) => l.id === 'under-the-tray')).toBe(true);
  });
});

describe('letters — overnight post, pure derivation', () => {
  const opts = { droughtDays: 0, openedIds: new Set<string>() };

  it('respects earliestDay and minFragments', () => {
    const day1 = arrivedLetters(volume, fresh(), 1, opts).map((l) => l.id);
    expect(day1).toContain('first-post');
    expect(day1).not.toContain('readers-note'); // day 2 + needs a fragment
    const s = { ...fresh(), foundFragmentIds: ['v1-d1'] };
    expect(arrivedLetters(volume, s, 2, opts).map((l) => l.id)).toContain('readers-note');
  });

  it('the epilogue letter waits for the solved volume', () => {
    expect(arrivedLetters(volume, fresh(), 30, opts).map((l) => l.id)).not.toContain('after-the-door');
    const solved: VolumeState = { ...fresh(), status: 'solved' };
    expect(arrivedLetters(volume, solved, 30, opts).map((l) => l.id)).toContain('after-the-door');
  });

  it('static grants skip fragments already found', () => {
    const letter = volume.letters.find((l) => l.id === 'readers-note')!;
    expect(letterGrants(volume, letter, fresh())).toEqual(['v1-d2']);
    const has = { ...fresh(), foundFragmentIds: ['v1-d2'] };
    expect(letterGrants(volume, letter, has)).toEqual([]);
  });
});

describe('volume roll', () => {
  it('advanceVolume starts a fresh state on the new id', () => {
    const next = advanceVolume({ ...volume, id: 'volume-2' }, 12);
    expect(next).toEqual({
      volumeId: 'volume-2', day: 12, foundFragmentIds: [], interpretedFragmentIds: [],
      guesses: [], status: 'active',
    });
  });
});
