/**
 * THE PRICE TAG — the reason word beside every step float (COMPREHENSION.md
 * fix 1). Three blind testers each finished the session holding at least one
 * confidently-held false rule about what costs steps; the ledger knew the
 * answer to all of them and the meter printed a bare number.
 *
 * These are gates, not descriptions. Each can fail:
 *   - a reason with no word (or a word that is a sentence) fails,
 *   - a room whose costed mistake nobody can name fails,
 *   - and the two the testers were most wrong about — a gift and a wrong
 *     crossword check — are pinned by name.
 */

import { describe, expect, it } from 'vitest';
import { MISTAKE_WORD, reasonWord } from '../src/ui/chrome/step-reasons';
import { ROOM_PUZZLE_KINDS } from '../src/engine/rooms/room-puzzle';
import { climbKey } from '../src/engine/economy/steps';
import type { StepEntry, StepReason } from '../src/engine/types';

const ALL_REASONS: readonly StepReason[] = [
  'day-start', 'move', 'mistake', 'hint', 'solve', 'perfect',
  'tea', 'snack', 'pet-dewey', 'gift',
];

const entry = (reason: StepReason, roomKey?: string): StepEntry =>
  ({ reason, delta: -1, at: 0, ...(roomKey ? { roomKey } : {}) });

describe('every step entry can say why', () => {
  it('names every reason in the ledger vocabulary', () => {
    for (const reason of ALL_REASONS) {
      const word = reasonWord(entry(reason));
      expect(word, `reason "${reason}" has no word`).toBeTruthy();
    }
  });

  it('keeps every word short enough to ride the float on a 375px bar', () => {
    const words = [
      ...ALL_REASONS.map((r) => reasonWord(entry(r))),
      ...Object.values(MISTAKE_WORD),
    ];
    for (const word of words) {
      // Characters are what the float's width actually tracks: measured live,
      // the longest of these ("not in the hive") draws ~100px centred under a
      // candle whose own box starts at x=71 on a 375px bar. 16 is the ceiling
      // that keeps every one of them inside the glass at that size.
      expect(word.length, `"${word}" is too long for the float`).toBeLessThanOrEqual(16);
      expect(word.split(' ').length, `"${word}" is a sentence, not a label`).toBeLessThanOrEqual(4);
      expect(word).not.toMatch(/[.!?]/);
    }
  });

  it('tells a climb from a walk — the expense the economy is built on', () => {
    expect(reasonWord(entry('move', '2,0'))).toBe('walk');
    expect(reasonWord(entry('move', climbKey('2,0', '2,5')))).toBe('climb');
  });

  it('names the costed mistake in every room the manor can deal', () => {
    for (const kind of ROOM_PUZZLE_KINDS) {
      expect(MISTAKE_WORD[kind], `no mistake word for the ${kind} room`).toBeTruthy();
      expect(reasonWord(entry('mistake', '1,1'), kind)).toBe(MISTAKE_WORD[kind]);
    }
    // A room the meter cannot identify still names what was charged for.
    expect(reasonWord(entry('mistake', '1,1'))).toBe('wrong');
    expect(reasonWord(entry('mistake', '1,1'), 'parlor')).toBe('wrong');
  });

  it('pins the four labels the comprehension test was measured against', () => {
    // "Talking to a character costs a step" — it does not; only a gift does,
    // and now the float says which.
    expect(reasonWord(entry('gift'))).toBe('gift');
    // "Wrong letters in the crossword cost 2 each" — only the full-grid check
    // is charged, and it arrives wearing its own name.
    expect(reasonWord(entry('mistake', '1,1'), 'crossword')).toBe('wrong fill');
    // "The hive charges for guesses" — only a structural slip is costed.
    expect(reasonWord(entry('mistake', '1,1'), 'hive')).toBe('not in the hive');
    // The bonus nobody could account for.
    expect(reasonWord(entry('perfect'))).toBe('no mistakes');
  });
});
