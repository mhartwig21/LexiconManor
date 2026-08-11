/**
 * THE PRICE TAG — the reason word beside every step float (COMPREHENSION.md
 * fix 1). Three blind testers each finished the session holding at least one
 * confidently-held false rule about what costs steps; the ledger knew the
 * answer to all of them and the meter printed a bare number.
 *
 * ═══ ROUND 28 — THIS FILE USED TO BE A LOOKUP TABLE READ BACK TO ITSELF ═══
 *
 * The gate it replaces asserted `reasonWord(entry('mistake'), kind) ===
 * MISTAKE_WORD[kind]`, which is the table on both sides of the equals sign. It
 * could catch a MISSING word and never a WRONG one, and a wrong one shipped
 * behind it: the Conservatory charges for two different slips and the float
 * named the ROOM, so a word built only of hive letters that skipped the centre
 * floated "−1 not in the hive" beside a toast that said "Missing E". The house
 * shipped labels to stop teaching false rules and taught a new one.
 *
 * So nothing here is asserted against the copy tables. Every case below is
 * MADE — a real puzzle out of the shipped pool, a real action through the real
 * adapter, the real room slice turning the real event into a real ledger entry
 * — and only then is the float read off that entry and compared with the line
 * the room itself puts on the glass. Three ways for it to go red:
 *
 *   1. a costed mistake the manor can actually deal with no word of its own
 *      (the enumeration walks every adapter, not a list of kinds);
 *   2. a float that does not match the word this file pins for that mistake;
 *   3. a room whose toast has been rewritten away from the float beside it —
 *      `ROOM_SAYS` is grepped out of the view that draws it, so the two lines
 *      cannot drift apart in silence the way they just did.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import type { ManorStore } from '../src/app/store';
import { createEmptySaveV2 } from '../src/app/save';
import { createDaySlice } from '../src/app/slices/day';
import { createManorSlice } from '../src/app/slices/manor';
import { createRoomSlice } from '../src/app/slices/room';
import { createDialogueSlice } from '../src/app/slices/dialogue';
import { createJournalSlice } from '../src/app/slices/journal';
import { createMetaSlice } from '../src/app/slices/meta';
import {
  MISTAKE_WORD, MISTAKE_WORD_BY_DETAIL, reasonWord,
} from '../src/ui/chrome/step-reasons';
import { ROOM_PUZZLE_KINDS } from '../src/engine/rooms/room-puzzle';
import type { RoomEvent } from '../src/engine/rooms/room-puzzle';
import { climbKey } from '../src/engine/economy/steps';
import { hiveAdapter, HIVE_POOL } from '../src/engine/rooms/adapters/hive';
import { wordWebAdapter, WORD_WEB_POOL } from '../src/engine/rooms/adapters/word-web';
import { twistleAdapter, TWISTLE_POOL } from '../src/engine/rooms/adapters/twistle';
import {
  forgottenWordAdapter, FORGOTTEN_WORD_POOL,
} from '../src/engine/rooms/adapters/forgotten-word';
import {
  crosswordAdapter, CROSSWORD_POOL, type CrosswordRoomState,
} from '../src/engine/puzzles/crossword-adapter';
import {
  cipherAdapter, CIPHER_POOL, type CipherRoomState,
} from '../src/engine/puzzles/cipher-adapter';
import {
  sudokuAdapter, SUDOKU_POOL, type SudokuRoomState,
} from '../src/engine/puzzles/sudoku-adapter';
import { openCells, solutionLetters } from '../src/engine/puzzles/crossword';
import { cipherLettersOf, decodeMap } from '../src/engine/puzzles/cipher';
import { gridSize, centerIndex } from '../src/engine/twistle';
import type { PlacedRoom, StepEntry, StepReason, Tier } from '../src/engine/types';

const ROOT = resolve(__dirname, '..');
const CELL = '1,1';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const ALL_REASONS: readonly StepReason[] = [
  'day-start', 'move', 'mistake', 'hint', 'solve', 'perfect',
  'tea', 'snack', 'pet-dewey', 'gift',
];

const entry = (reason: StepReason, roomKey?: string): StepEntry =>
  ({ reason, delta: -1, at: 0, ...(roomKey ? { roomKey } : {}) });

// ---------------------------------------------------------------------------
// The manor, standing in one room, with the real slices under it
// ---------------------------------------------------------------------------

function makeStore() {
  const save = createEmptySaveV2('Player');
  return create<ManorStore>()((...a) => ({
    ...createDaySlice(save)(...a),
    ...createManorSlice(save)(...a),
    ...createRoomSlice(save)(...a),
    ...createDialogueSlice(save)(...a),
    ...createJournalSlice(save)(...a),
    ...createMetaSlice(save)(...a),
  }));
}

/**
 * Put her in a room of `kind` on a tier-1 row with `puzzleId` on the table,
 * then hand the events of one real mistake to the REAL room slice. The entry
 * that comes back is the one the candle actually floats — plumbing included,
 * so a slice that dropped `detail` on the way to the ledger is caught here and
 * not by a unit test of a table.
 */
function ledgerEntryFor(kind: string, puzzleId: string, events: RoomEvent[]): StepEntry {
  const store = makeStore();
  const placed = {
    kind, cell: { col: 1, row: 1 }, cardId: `card-${kind}`, puzzleId, solved: false,
  } as unknown as PlacedRoom;
  store.setState({
    day: { day: 3, phase: 'exploring', daySeed: 1, activeRoom: null },
    manor: { daySeed: 1, rooms: { [CELL]: placed }, playerCell: { col: 1, row: 1 } } as never,
    ledger: { budget: 40, entries: [] },
  });
  store.getState().enterRoom(CELL);
  store.getState().applyRoomEvents(events, { status: 'active', perfect: false });
  const mistakes = store.getState().ledger.entries.filter((e) => e.reason === 'mistake');
  expect(mistakes.length, `${kind}: the room slice charged nothing`).toBe(1);
  return mistakes[0]!;
}

const ctx = (tier: Tier) => ({ tier: tier as 1 | 2 | 3, seed: 42, volumeId: 'volume-1' });

// ---------------------------------------------------------------------------
// One real mistake per case, made the way she would make it
// ---------------------------------------------------------------------------

interface Case {
  kind: string;
  /** The room's own key for the mistake — what the ledger entry must carry. */
  detail: string;
  /** The word the candle floats beside the number. */
  float: string;
  /** A line the ROOM puts on the glass for this same mistake, as shipped. */
  roomSays: string;
  /** The view that draws that line. */
  view: string;
  /** Makes it happen: a real puzzle, a real action, the real adapter. */
  make: () => { puzzleId: string; events: RoomEvent[] };
}

/** A letter the hive does not hold. */
function outsideLetter(allowed: Set<string>): string {
  return [...ALPHABET].find((ch) => !allowed.has(ch))!;
}

/** A length-n trace on a twistle grid that never steps on the centre tile. */
function offCentreTrace(grid: string[], n: number): string | null {
  const size = gridSize(grid);
  const centre = centerIndex(size);
  const neighbours = (i: number): number[] => {
    const out: number[] = [];
    const r = Math.floor(i / size), c = i % size;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
        const j = nr * size + nc;
        if (j !== centre) out.push(j);
      }
    }
    return out;
  };
  const walk = (path: number[]): number[] | null => {
    if (path.length === n) return path;
    for (const j of neighbours(path[path.length - 1]!)) {
      if (path.includes(j)) continue;
      const found = walk([...path, j]);
      if (found) return found;
    }
    return null;
  };
  for (let start = 0; start < grid.length; start++) {
    if (start === centre) continue;
    const path = walk([start]);
    if (path) return path.map((i) => grid[i]!).join('');
  }
  return null;
}

const CASES: Case[] = [
  {
    kind: 'hive',
    detail: 'missing-center',
    float: 'missing centre',
    roomSays: 'Missing ${puzzle.center}',
    view: 'src/ui/rooms/anchor/HiveView.tsx',
    make: () => {
      // THE ONE THAT SHIPPED WRONG. Every letter is in the hive; the centre
      // is not among them, and `missing-center` is tested before `bad-letter`
      // (engine/hive.ts), so the old room-keyed float called a hive word "not
      // in the hive".
      const puzzle = HIVE_POOL[0]!;
      const word = puzzle.outer.slice(0, 2).join('') + puzzle.outer.slice(0, 2).join('');
      expect([...word].every((ch) => ch !== puzzle.center)).toBe(true);
      const out = hiveAdapter.reduce(puzzle, hiveAdapter.start(puzzle, ctx(1)), {
        type: 'submit', word,
      });
      return { puzzleId: puzzle.id, events: out.events };
    },
  },
  {
    kind: 'hive',
    detail: 'bad-letters',
    float: 'not in the hive',
    roomSays: "'bad-letters': 'Bad letters'",
    view: 'src/ui/rooms/anchor/HiveView.tsx',
    make: () => {
      const puzzle = HIVE_POOL[0]!;
      const outside = outsideLetter(new Set([puzzle.center, ...puzzle.outer]));
      const out = hiveAdapter.reduce(puzzle, hiveAdapter.start(puzzle, ctx(1)), {
        type: 'submit', word: puzzle.center + outside + outside + outside,
      });
      return { puzzleId: puzzle.id, events: out.events };
    },
  },
  {
    kind: 'word-web',
    detail: 'one-away',
    float: 'one away',
    roomSays: 'One away…',
    view: 'src/ui/rooms/anchor/WordWebView.tsx',
    make: () => {
      const puzzle = WORD_WEB_POOL[0]!;
      const selection = [
        ...puzzle.groups[0]!.words.slice(0, 3), puzzle.groups[1]!.words[0]!,
      ];
      const out = wordWebAdapter.reduce(puzzle, wordWebAdapter.start(puzzle, ctx(2)), {
        type: 'submit', selection,
      });
      return { puzzleId: puzzle.id, events: out.events };
    },
  },
  {
    kind: 'word-web',
    detail: 'wrong',
    float: 'wrong group',
    roomSays: 'No two of these share a thread.',
    view: 'src/ui/rooms/anchor/WordWebView.tsx',
    make: () => {
      const puzzle = WORD_WEB_POOL[0]!;
      const selection = [
        ...puzzle.groups[0]!.words.slice(0, 2), ...puzzle.groups[1]!.words.slice(0, 2),
      ];
      const out = wordWebAdapter.reduce(puzzle, wordWebAdapter.start(puzzle, ctx(2)), {
        type: 'submit', selection,
      });
      return { puzzleId: puzzle.id, events: out.events };
    },
  },
  {
    kind: 'twistle',
    detail: 'breaks-rule',
    float: 'missed the tile',
    roomSays: 'It must cross the marked tile',
    view: 'src/ui/rooms/anchor/TwistleView.tsx',
    make: () => {
      const puzzle = TWISTLE_POOL.find((p) => p.rules.centerRequired)!;
      const word = offCentreTrace(puzzle.grid, puzzle.rules.minLength)!;
      const out = twistleAdapter.reduce(puzzle, twistleAdapter.start(puzzle, ctx(2)), {
        type: 'submit', word,
      });
      return { puzzleId: puzzle.id, events: out.events };
    },
  },
  {
    kind: 'forgotten-word',
    detail: 'wrong',
    float: 'wrong guess',
    roomSays: 'guessesLeft',   // the Study answers on its card, not in a toast
    view: 'src/ui/rooms/anchor/ForgottenWordView.tsx',
    make: () => {
      const puzzle = FORGOTTEN_WORD_POOL[0]!;
      const wrong = [...puzzle.word].reverse().join('') === puzzle.word
        ? puzzle.word.slice(0, -1) + (puzzle.word.endsWith('A') ? 'E' : 'A')
        : [...puzzle.word].reverse().join('');
      const out = forgottenWordAdapter.reduce(
        puzzle, forgottenWordAdapter.start(puzzle, ctx(1)), { type: 'guess', word: wrong },
      );
      return { puzzleId: puzzle.id, events: out.events };
    },
  },
  {
    kind: 'crossword',
    detail: 'checked-wrong',
    float: 'wrong fill',
    roomSays: 'Not quite —',
    view: 'src/ui/rooms/micro/CrosswordView.tsx',
    make: () => {
      const puzzle = CROSSWORD_POOL[0]!;
      const sol = solutionLetters(puzzle);
      let state = crosswordAdapter.start(puzzle, ctx(1)) as CrosswordRoomState;
      let events: RoomEvent[] = [];
      // Every square filled, every letter wrong: the auto-check fires on the
      // last one, and THAT is the room's single priced moment.
      for (const cell of openCells(puzzle)) {
        const truth = sol.get(cell)!;
        const letter = truth === 'A' ? 'B' : 'A';
        const out = crosswordAdapter.reduce(puzzle, state, { type: 'set-cell', index: cell, letter });
        state = out.state;
        events = out.events;
      }
      return { puzzleId: puzzle.id, events };
    },
  },
  {
    kind: 'cipher',
    detail: 'murky',
    float: 'still murky',
    roomSays: 'Still murky —',
    view: 'src/ui/rooms/micro/CipherView.tsx',
    make: () => {
      const puzzle = CIPHER_POOL[0]!;
      const truth = decodeMap(puzzle);
      let state = cipherAdapter.start(puzzle, ctx(1)) as CipherRoomState;
      for (const letter of cipherLettersOf(puzzle)) {
        if (state.engine.locked.includes(letter)) continue;
        const right = truth[letter]!;
        const plain = right === 'A' ? 'B' : 'A';
        state = cipherAdapter.reduce(puzzle, state, {
          type: 'pencil', cipherLetter: letter, plain,
        }).state;
      }
      const out = cipherAdapter.reduce(puzzle, state, { type: 'develop' });
      return { puzzleId: puzzle.id, events: out.events };
    },
  },
  {
    kind: 'sudoku',
    detail: 'balanced-astray',
    float: 'figures astray',
    roomSays: 'astray',
    view: 'src/ui/rooms/micro/SudokuView.tsx',
    make: () => {
      const puzzle = SUDOKU_POOL[0]!;
      let state = sudokuAdapter.start(puzzle, ctx(1)) as SudokuRoomState;
      const blank = state.engine.values.findIndex((v) => v === 0);
      const truth = Number(puzzle.solution[blank]);
      // Board-legal but untrue: a figure the leaf does not object to, which is
      // the only kind that survives to be weighed.
      const wrong = legalButWrong(state.engine.values, blank, truth);
      state = sudokuAdapter.reduce(puzzle, state, { type: 'ink', cell: blank, digit: wrong }).state;
      const out = sudokuAdapter.reduce(puzzle, state, { type: 'balance' });
      return { puzzleId: puzzle.id, events: out.events };
    },
  },
  {
    kind: 'sudoku',
    detail: 'balanced-true',
    float: 'the weighing',
    roomSays: 'The books balance',
    view: 'src/ui/rooms/micro/SudokuView.tsx',
    make: () => {
      // The commonest priced weighing in the house, and the one the old float
      // called "wrong number": every figure of hers is TRUE and the clerk is
      // paid for the answer, not for an error.
      const puzzle = SUDOKU_POOL[0]!;
      let state = sudokuAdapter.start(puzzle, ctx(1)) as SudokuRoomState;
      const blank = state.engine.values.findIndex((v) => v === 0);
      state = sudokuAdapter.reduce(puzzle, state, {
        type: 'ink', cell: blank, digit: Number(puzzle.solution[blank]),
      }).state;
      const out = sudokuAdapter.reduce(puzzle, state, { type: 'balance' });
      return { puzzleId: puzzle.id, events: out.events };
    },
  },
];

/** A digit no visible peer of `cell` already holds, and not the true one. */
function legalButWrong(values: number[], cell: number, truth: number): number {
  const size = 9;
  const r = Math.floor(cell / size), c = cell % size;
  const seen = new Set<number>();
  for (let i = 0; i < 9; i++) {
    seen.add(values[r * 9 + i]!);
    seen.add(values[i * 9 + c]!);
  }
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
    seen.add(values[(br + dr) * 9 + bc + dc]!);
  }
  for (let d = 1; d <= 9; d++) if (d !== truth && !seen.has(d)) return d;
  throw new Error('no board-legal wrong figure at this cell');
}

// ---------------------------------------------------------------------------

describe('the float names the mistake the room named', () => {
  for (const c of CASES) {
    it(`${c.kind} — ${c.detail}`, () => {
      const { puzzleId, events } = c.make();
      const mistakes = events.filter((e) => e.type === 'mistake');
      expect(mistakes.length, 'the adapter refused nothing').toBe(1);
      const mistake = mistakes[0] as Extract<RoomEvent, { type: 'mistake' }>;
      expect(mistake.weight, 'this case is meant to be COSTED').not.toBe(0);
      expect(mistake.detail, 'the adapter did not name its own mistake').toBe(c.detail);

      // Through the live slice, to the ledger, to the candle.
      const led = ledgerEntryFor(c.kind, puzzleId, events);
      expect(led.delta).toBeLessThan(0);
      expect(led.detail, 'the room slice dropped the room\'s own key').toBe(c.detail);
      expect(reasonWord(led, c.kind)).toBe(c.float);

      // And the room still says what this file says it says.
      expect(
        readFileSync(resolve(ROOT, c.view), 'utf8'),
        `${c.view} no longer says "${c.roomSays}" — the float beside it may now be a lie`,
      ).toContain(c.roomSays);
    });
  }

  it('has a word for every costed mistake the manor can deal, and no word for a mistake it cannot', () => {
    const made = new Set(CASES.map((c) => `${c.kind}:${c.detail}`));
    // Every row of copy is earned by a case above that actually produced it.
    expect([...Object.keys(MISTAKE_WORD_BY_DETAIL)].sort()).toEqual([...made].sort());
    // And every kind the manor can place is represented, so a room registered
    // tomorrow cannot ship a charge nobody can name.
    const covered = new Set(CASES.map((c) => c.kind));
    for (const kind of ROOM_PUZZLE_KINDS) {
      expect(covered.has(kind), `no costed mistake is exercised for the ${kind} room`).toBe(true);
    }
  });
});

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
      ...Object.values(MISTAKE_WORD_BY_DETAIL),
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

  it('falls back to a word that is true of ALL of a room\'s charges', () => {
    // A ledger saved before `detail` existed still floats a word, and that
    // word must not be false of any charge the room can lay: the Conservatory
    // fallback cannot say "not in the hive" (a missing centre is a hive word)
    // and the Counting House fallback cannot say "wrong number" (the books
    // balance and she is still charged for the weighing).
    for (const kind of ROOM_PUZZLE_KINDS) {
      expect(MISTAKE_WORD[kind], `no fallback word for the ${kind} room`).toBeTruthy();
    }
    const charges = (kind: string) => CASES.filter((c) => c.kind === kind);
    for (const kind of ROOM_PUZZLE_KINDS) {
      const only = charges(kind);
      // A room that charges for exactly one thing has nothing to hedge: its
      // fallback IS that word, and this catches the two drifting apart.
      if (only.length === 1) expect(MISTAKE_WORD[kind], kind).toBe(only[0]!.float);
    }
    // The two rooms the false label lived in, pinned by the thing that was
    // wrong with them. "not in the hive" is FALSE of a hive word that skipped
    // the centre, and "wrong number" is FALSE of a weighing that found every
    // figure true — so neither may come back as the word an entry with no
    // detail floats.
    expect(MISTAKE_WORD['hive']).not.toBe(MISTAKE_WORD_BY_DETAIL['hive:bad-letters']);
    expect(MISTAKE_WORD['sudoku']).not.toBe(MISTAKE_WORD_BY_DETAIL['sudoku:balanced-astray']);
    expect(MISTAKE_WORD['sudoku']).not.toMatch(/wrong/);
    expect(reasonWord(entry('mistake', '1,1'))).toBe('wrong');
    expect(reasonWord(entry('mistake', '1,1'), 'parlor')).toBe('wrong');
  });

  it('pins the four labels the comprehension test was measured against', () => {
    // "Talking to a character costs a step" — it does not; only a gift does,
    // and now the float says which.
    expect(reasonWord(entry('gift'))).toBe('gift');
    // "Wrong letters in the crossword cost 2 each" — only the full-grid check
    // is charged, and it arrives wearing its own name.
    expect(reasonWord({ ...entry('mistake', '1,1'), detail: 'checked-wrong' }, 'crossword'))
      .toBe('wrong fill');
    // "The hive charges for guesses" — only a structural slip is costed.
    expect(reasonWord({ ...entry('mistake', '1,1'), detail: 'bad-letters' }, 'hive'))
      .toBe('not in the hive');
    // The bonus nobody could account for.
    expect(reasonWord(entry('perfect'))).toBe('no mistakes');
  });
});
