/**
 * tests/room-session.test.ts — REVIEW_AA §5.3 (in-room progress is not
 * persisted) and §5.4 (the re-solve exploit).
 *
 * The two defects are one mechanism seen from two ends, so they are pinned in
 * one file:
 *
 *   §5.3  The editor solved a group in the Library, paid −4 in wrong-group
 *         penalties (20 → 16 steps), reloaded, and got back sixteen unsolved
 *         tiles AND 16 steps. Board state lived in React; the charges lived in
 *         the save.
 *   §5.4  `case 'solved':` paid steps, the perfect bonus and `solveKeys(tier)`
 *         with no check on `placed.solved` — and called `markPuzzleSeen`, so
 *         after a reload `selectByTier` filtered the solved board out and the
 *         cell restocked with a different one. +8, reload, new board, +8, for
 *         ever, in the currency that gates the whole climb.
 *
 * Everything below drives the real store slices, the real save projection and
 * the real load/migrate path. `advanceRoomSession`/`openRoomSession` are the
 * SAME functions `RoomHost` calls, so these are not a parallel implementation
 * of the room loop agreeing with itself.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { create } from 'zustand';

import { createEmptySaveV2, loadSave, persistSave, resumeSaveWrites, type SaveV2 } from '../src/app/save';
import { selectSave, type ManorStore } from '../src/app/store';
import { createDaySlice } from '../src/app/slices/day';
import { createManorSlice } from '../src/app/slices/manor';
import { createRoomSlice } from '../src/app/slices/room';
import { createDialogueSlice } from '../src/app/slices/dialogue';
import { createJournalSlice } from '../src/app/slices/journal';
import { createMetaSlice } from '../src/app/slices/meta';

import { getRoomAdapter } from '../src/engine/rooms/registry';
import { ROOM_PUZZLE_KINDS, type RoomPuzzleKind } from '../src/engine/rooms/room-puzzle';
import {
  advanceRoomSession, jsonFaithful, openRoomSession, ROOM_SESSION_ENVELOPE,
  sessionSnapshotOf, snapshotRoomSession, type RoomSession, type RoomSessionSnapshot,
} from '../src/engine/rooms/room-session';
import { roomSeed } from '../src/engine/manor/grid';
import { solveKeys, stageSteps, stepsRemaining, STEP_TABLE } from '../src/engine/economy/steps';
import type { Cell, ManorState, PlacedRoom, Tier } from '../src/engine/types';

import type { WordWebPuzzleEx, WordWebRoomState } from '../src/engine/rooms/adapters/word-web';
import type { HiveRoomState } from '../src/engine/rooms/adapters/hive';
import type { TwistleRoomState } from '../src/engine/rooms/adapters/twistle';
import type { ForgottenWordRoomState } from '../src/engine/rooms/adapters/forgotten-word';
import type { CipherRoomState, CipherPuzzleEx } from '../src/engine/puzzles/cipher-adapter';
import type { CrosswordRoomState, CrosswordPuzzleEx } from '../src/engine/puzzles/crossword-adapter';
import type { SudokuRoomState } from '../src/engine/puzzles/sudoku-adapter';
import type { HivePuzzle, TwistlePuzzle, ForgottenWordPuzzle } from '../src/engine/types';
import type { SudokuPuzzle } from '../src/engine/puzzles/sudoku';

// ---------------------------------------------------------------------------
// A localStorage that behaves like the phone's (vitest runs in node — the same
// stub reset.test.ts and migrations.test.ts install).
// ---------------------------------------------------------------------------

function installLocalStorage(): Map<string, string> {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() { return map.size; },
    },
    configurable: true,
    writable: true,
  });
  return map;
}

beforeEach(() => {
  installLocalStorage();
  resumeSaveWrites();
});

// ---------------------------------------------------------------------------
// A store built from the real slices (the tests/day.test.ts pattern)
// ---------------------------------------------------------------------------

type Store = ReturnType<typeof makeStore>;

function makeStore(save: SaveV2) {
  return create<ManorStore>()((...a) => ({
    ...createDaySlice(save)(...a),
    ...createManorSlice(save)(...a),
    ...createRoomSlice(save)(...a),
    ...createDialogueSlice(save)(...a),
    ...createJournalSlice(save)(...a),
    ...createMetaSlice(save)(...a),
  }));
}

const DAY_SEED = 4242;
const CELL: Cell = { col: 2, row: 1 };          // row ≤ 2 ⇒ tier 1
const KEY = `${CELL.col},${CELL.row}`;
const START_STEPS = 20;

/** A manor holding exactly the room under test, with its board pinned. */
function manorWith(kind: RoomPuzzleKind, puzzleId: string): ManorState {
  const placed: PlacedRoom = {
    cardId: `card-${kind}`, cell: CELL, doors: ['S'], solved: false, kind, puzzleId,
  };
  return { rooms: { [KEY]: placed }, playerCell: { ...CELL }, daySeed: DAY_SEED };
}

function seedStore(kind: RoomPuzzleKind): Store {
  const adapter = getRoomAdapter(kind)!;
  const puzzle = adapter.select({ tier: 1, seed: roomSeed(DAY_SEED, KEY), seenIds: [] });
  const save = createEmptySaveV2('Test');
  save.day = { day: 1, phase: 'exploring', daySeed: DAY_SEED, activeRoom: null };
  save.ledger = { budget: START_STEPS, entries: [] };
  save.manor = manorWith(kind, adapter.puzzleId(puzzle));
  const store = makeStore(save);
  store.getState().enterRoom(KEY);
  return store;
}

/**
 * The room host, minus React. Exactly what RoomHost.tsx does: open (restoring
 * the parked snapshot if there is one), park the fresh board immediately, and
 * on every dispatch apply the economy and then re-park.
 */
function openHost(store: Store): { session: RoomSession; restored: boolean; tier: Tier } {
  const s = store.getState();
  const active = s.day!.activeRoom!;
  const adapter = getRoomAdapter(active.kind)!;
  const opened = openRoomSession({
    adapter,
    snapshot: sessionSnapshotOf(s.manor!.rooms[active.cellKey]),
    pinnedPuzzleId: active.puzzleId || undefined,
    ctx: { tier: active.tier, seed: roomSeed(s.day!.daySeed, active.cellKey), volumeId: s.volume.volumeId },
    seenIds: s.seenPuzzleIds[active.kind],
  })!;
  if (!opened.restored) {
    store.getState().saveRoomSession(active.cellKey, snapshotRoomSession(adapter, active.tier, opened.session));
  }
  return { ...opened, tier: active.tier };
}

function hostDispatch(store: Store, host: { session: RoomSession; tier: Tier }, action: unknown): void {
  const active = store.getState().day!.activeRoom!;
  const adapter = getRoomAdapter(active.kind)!;
  if (host.session.done) return;
  const { session, events, outcome } = advanceRoomSession(adapter, host.session, action);
  host.session = session;
  store.getState().applyRoomEvents(events, outcome);
  store.getState().saveRoomSession(active.cellKey, snapshotRoomSession(adapter, host.tier, session));
}

/** Kill the tab and come back: the real projection, the real load, real migrate. */
function reload(store: Store): Store {
  persistSave(selectSave(store.getState()));
  const next = makeStore(loadSave());
  return next;
}

const steps = (store: Store) => stepsRemaining(store.getState().ledger);

// ---------------------------------------------------------------------------
// The drill table — one scripted board per room kind
// ---------------------------------------------------------------------------

/**
 * TOTALITY IS THE POINT. This is a `Record<RoomPuzzleKind, Drill>`, so a room
 * kind added to the union fails `tsc --noEmit` until someone writes its drill
 * here — which is the compile-time half of "a room kind that adds state later
 * cannot silently forget to persist it". The runtime half is `jsonFaithful`
 * below: the snapshot stores adapter state verbatim and opaquely, so the one
 * way it can lose something is a value JSON cannot carry, and every kind is
 * driven through a real board and checked for exactly that.
 */
interface Drill<P = never, S = never> {
  /** The room in the manor's language, for failure messages. */
  room: string;
  /** Actions to drive, in order. */
  actions(puzzle: P): unknown[];
  /** A witness that the drill actually moved the board — compared across a reload. */
  witness(state: S): unknown;
}

/** A wrong guess of the right length (the Study refuses other lengths for free). */
const shiftLetters = (w: string) =>
  [...w].map((c) => String.fromCharCode(((c.charCodeAt(0) - 65 + 1) % 26) + 65)).join('');

const DRILLS: Record<RoomPuzzleKind, Drill> = {
  'word-web': {
    room: 'the Library',
    actions: (p: WordWebPuzzleEx) => [
      // One wrong claim (−2), then one true thread woven.
      { type: 'submit', selection: p.groups.map((g) => g.words[0]!) },
      { type: 'submit', selection: [...p.groups[0]!.words] },
    ],
    witness: (s: WordWebRoomState) => ({
      solved: s.web.solvedTiers, remaining: s.web.remainingWords, mistakes: s.costedMistakes,
    }),
  },
  'hive': {
    room: 'the Conservatory',
    actions: (p: HivePuzzle) => [
      { type: 'submit', word: p.validWords[0]! },
      { type: 'submit', word: p.validWords[1] ?? p.validWords[0]! },
      { type: 'submit', word: 'ZZZZQQ' },      // free feedback moment
    ],
    witness: (s: HiveRoomState) => ({
      found: s.hive.foundWords, score: s.hive.score, rung: s.tierIndex,
    }),
  },
  'twistle': {
    room: 'the Gallery',
    actions: (p: TwistlePuzzle) => [{ type: 'submit', word: p.targetWords[0]! }],
    witness: (s: TwistleRoomState) => ({ traced: s.twistle.foundWords, missed: s.missedWords }),
  },
  'forgotten-word': {
    room: 'the Study',
    actions: (p: ForgottenWordPuzzle) => [
      { type: 'unseal-clue', clue: 'etymology' },        // a whisper spent
      { type: 'guess', word: shiftLetters(p.word) },     // a costed claim
    ],
    witness: (s: ForgottenWordRoomState) => ({
      guesses: s.fw.guesses, clues: s.fw.unlockedClues, closeness: s.closeness,
    }),
  },
  'cipher': {
    room: 'the Darkroom',
    actions: (p: CipherPuzzleEx) => {
      const letters = [...new Set([...p.ciphertext.toUpperCase()].filter((c) => /[A-Z]/.test(c)))]
        .filter((c) => !p.reveals.includes(c));
      return [
        { type: 'pencil', cipherLetter: letters[0]!, plain: 'E' },
        { type: 'pencil', cipherLetter: letters[1] ?? letters[0]!, plain: 'T' },
        { type: 'develop' },                              // incomplete → free
      ];
    },
    witness: (s: CipherRoomState) => ({
      penciled: s.engine.guesses, locked: s.engine.locked, prints: s.engine.prints,
    }),
  },
  'crossword': {
    room: 'the Linen Closet',
    actions: (p: CrosswordPuzzleEx) => {
      const e = p.entries[0]!;
      const at = (i: number) =>
        (e.dir === 'down' ? e.row + i : e.row) * p.size + (e.dir === 'across' ? e.col + i : e.col);
      return [
        { type: 'set-cell', index: at(0), letter: e.answer[0]! },
        { type: 'set-cell', index: at(1), letter: 'Z' },   // deliberately wrong
      ];
    },
    witness: (s: CrosswordRoomState) => ({ filled: s.cw.letters, revealed: s.cw.revealedCells }),
  },
  'sudoku': {
    room: 'the Counting House',
    actions: (p: SudokuPuzzle) => {
      const blanks: number[] = [];
      for (let i = 0; i < 81 && blanks.length < 2; i++) if (p.givens[i] === '.') blanks.push(i);
      const [a, b] = blanks as [number, number];
      return [
        { type: 'pencil', cell: a, digit: Number(p.solution[a]!) },   // a mark
        { type: 'pencil', cell: a, digit: ((Number(p.solution[a]!) % 9) + 1) },
        { type: 'ink', cell: b, digit: Number(p.solution[b]!) },      // a figure
      ];
    },
    witness: (s: SudokuRoomState) => ({
      figures: s.engine.values, marks: s.engine.pencil, order: s.engine.pencilOrder,
      undoDepth: s.history.length,
    }),
  },
};

/** Every kind, with its drill — the loop every per-kind test below runs. */
const KINDS = ROOM_PUZZLE_KINDS.map((kind) => [kind, DRILLS[kind]] as const);

// ---------------------------------------------------------------------------
// 1. The contract every adapter now owes
// ---------------------------------------------------------------------------

describe('the RoomPuzzle session contract', () => {
  it('registers an adapter for every declared kind', () => {
    for (const kind of ROOM_PUZZLE_KINDS) {
      expect(getRoomAdapter(kind), `${kind} has no adapter`).toBeDefined();
    }
  });

  it('lets every adapter find its own board by id, and only its own', () => {
    for (const kind of ROOM_PUZZLE_KINDS) {
      const adapter = getRoomAdapter(kind)!;
      const puzzle = adapter.select({ tier: 1, seed: 7, seenIds: [] });
      const id = adapter.puzzleId(puzzle);
      const found = adapter.find(id);
      expect(found, `${kind}.find('${id}')`).toBeDefined();
      expect(adapter.puzzleId(found!)).toBe(id);
      expect(adapter.find('no-such-board-anywhere')).toBeUndefined();
    }
  });

  it('declares a state version', () => {
    for (const kind of ROOM_PUZZLE_KINDS) {
      expect(Number.isInteger(getRoomAdapter(kind)!.stateVersion)).toBe(true);
    }
  });

  /**
   * THE INVARIANT THE OPAQUE SNAPSHOT RESTS ON. Nothing on the persistence path
   * enumerates a room's fields — which is what makes forgetting one impossible
   * — so the one loss it cannot notice is a value JSON does not carry. A kind
   * that reaches for a Set, a Map, a Date, an explicit `undefined` or a NaN
   * fails here, and the fix is either "don't" or `adapter.restore`.
   */
  it.each(KINDS)('%s: adapter state is JSON data, start to finish', (kind, drill) => {
    const adapter = getRoomAdapter(kind)!;
    const puzzle = adapter.select({ tier: 1, seed: roomSeed(DAY_SEED, KEY), seenIds: [] });
    let session: RoomSession = {
      puzzle, state: adapter.start(puzzle, { tier: 1, seed: 1, volumeId: 'volume-1' }),
      done: false, solvedOnce: false,
    };
    expect(jsonFaithful(session.state), `${drill.room} at start`).toBe(true);
    for (const action of drill.actions(puzzle as never)) {
      session = advanceRoomSession(adapter, session, action).session;
      expect(jsonFaithful(session.state), `${drill.room} after ${JSON.stringify(action)}`).toBe(true);
    }
    // …and the drill must actually have moved the board, or it proves nothing.
    const fresh = adapter.start(puzzle, { tier: 1, seed: 1, volumeId: 'volume-1' });
    expect(drill.witness(session.state as never), `${drill.room} drill did nothing`)
      .not.toEqual(drill.witness(fresh as never));
  });
});

// ---------------------------------------------------------------------------
// 2. §5.3 — reload mid-board, in every room kind
// ---------------------------------------------------------------------------

describe('§5.3 — in-room progress survives a reload', () => {
  it.each(KINDS)('%s: the board, the progress and the steps all come back', (kind, drill) => {
    const store = seedStore(kind);
    const host = openHost(store);
    const adapter = getRoomAdapter(kind)!;

    const boardBefore = adapter.puzzleId(host.session.puzzle);
    for (const action of drill.actions(host.session.puzzle as never)) hostDispatch(store, host, action);
    const stateBefore = host.session.state;
    const stepsBefore = steps(store);
    const witnessBefore = drill.witness(stateBefore as never);

    // The whole point: this drill has already CHARGED her for the work.
    expect(stepsBefore, `${drill.room} charged nothing — the drill proves nothing`)
      .toBeLessThanOrEqual(START_STEPS);

    // ── the tab dies ──
    const after = reload(store);
    const resumed = openHost(after);

    expect(resumed.restored, `${drill.room} restarted instead of resuming`).toBe(true);
    expect(adapter.puzzleId(resumed.session.puzzle), `${drill.room} came back a different board`)
      .toBe(boardBefore);
    expect(drill.witness(resumed.session.state as never), `${drill.room} lost its progress`)
      .toEqual(witnessBefore);
    // Identity, not merely equivalence: every field, including the ones this
    // file has never heard of.
    expect(resumed.session.state).toEqual(JSON.parse(JSON.stringify(stateBefore)));
    expect(steps(after), `${drill.room} charged twice / refunded`).toBe(stepsBefore);
  });

  it('the Library, exactly as the editor drove it: −4 in penalties, reload, tiles still solved', () => {
    const store = seedStore('word-web');
    const host = openHost(store);
    const puzzle = host.session.puzzle as WordWebPuzzleEx;

    // Two wrong groups (−2 each at tier 1) and one thread woven.
    hostDispatch(store, host, { type: 'submit', selection: puzzle.groups.map((g) => g.words[0]!) });
    hostDispatch(store, host, { type: 'submit', selection: puzzle.groups.map((g) => g.words[1]!) });
    hostDispatch(store, host, { type: 'submit', selection: [...puzzle.groups[0]!.words] });

    // ROUND 22 (REVIEW_AA §6) — THE THREAD SHE WOVE IS PAID FOR. The Library
    // is one of the rooms long enough to pay its rungs (`paysInStages`), so a
    // solved group banks its quarter of the room's payout the moment it lands
    // instead of paying nothing until all four are placed. −4 in penalties,
    // +1 for the thread.
    const rung = stageSteps('word-web', 1, 0.25, 0);
    expect(rung, 'the Library stopped paying its rungs').toBeGreaterThan(0);
    expect(steps(store)).toBe(START_STEPS - 4 + rung);
    const solvedTiers = (host.session.state as WordWebRoomState).web.solvedTiers;
    expect(solvedTiers).toHaveLength(1);

    const after = reload(store);
    const resumed = openHost(after);
    const state = resumed.session.state as WordWebRoomState;

    expect(state.web.solvedTiers).toEqual(solvedTiers);
    expect(state.web.remainingWords).toHaveLength(12);   // NOT sixteen unsolved tiles
    expect(state.costedMistakes).toBe(2);
    expect(steps(after)).toBe(START_STEPS - 4 + rung);
    // …and the rung cannot be paid twice by coming back to the room: the
    // fraction earned rides on the PlacedRoom, beside the board itself.
    expect(after.getState().manor!.rooms[KEY]!.ladderEarned).toBeCloseTo(0.25, 6);
  });

  it('parks the board before the first move, so an eviction cannot re-roll it', () => {
    const store = seedStore('twistle');
    const host = openHost(store);
    const board = getRoomAdapter('twistle')!.puzzleId(host.session.puzzle);

    // Nothing played. Mark that very board seen behind her back — the state the
    // §5.4 loop used to engineer — and reload.
    store.getState().markPuzzleSeen('twistle', board);
    const after = reload(store);
    const resumed = openHost(after);

    expect(resumed.restored).toBe(true);
    expect(getRoomAdapter('twistle')!.puzzleId(resumed.session.puzzle)).toBe(board);
  });

  /**
   * ROUND 19 — THE TWO "NEVER DO THAT AGAIN" LISTS, DRIVEN RATHER THAN TRUSTED.
   *
   * The per-kind reload test above asserts whole-state identity, so every field
   * IS covered — but only for the states its drill actually reaches, and two of
   * the fields §5.3 names by hand are memory prostheses (AAA 3.3) that the
   * drills never populate: the Gallery's struck-through misses and the Library's
   * remembered wrong selection. A prosthesis that forgets on reload is worse
   * than no prosthesis, because she re-derives a dead end she has already paid
   * for, so both are driven to a non-empty state here and then reloaded.
   */
  it('the Gallery brings back the struck-through misses, not just the traced words', () => {
    const store = seedStore('twistle');
    const host = openHost(store);
    const puzzle = host.session.puzzle as TwistlePuzzle;

    // A miss is a REAL path that is not a target. Any proper prefix of a target
    // traces the same cells, so it has a path by construction; the first one
    // that is not itself a target is the miss we want. If a board ever ships
    // with no such prefix this fails loudly rather than silently proving [] ≡ [].
    let miss: string | null = null;
    for (const target of puzzle.targetWords) {
      for (let n = puzzle.rules.minLength; n < target.length && !miss; n++) {
        const candidate = target.slice(0, n);
        if (!puzzle.targetWords.includes(candidate)) miss = candidate;
      }
      if (miss) break;
    }
    expect(miss, 'no traceable non-target prefix on this board').toBeTruthy();

    hostDispatch(store, host, { type: 'submit', word: puzzle.targetWords[0]! });
    hostDispatch(store, host, { type: 'submit', word: miss! });
    const before = host.session.state as TwistleRoomState;
    expect(before.missedWords, 'the drill produced no miss').toContain(miss);
    expect(before.twistle.foundWords).toContain(puzzle.targetWords[0]);

    const resumed = openHost(reload(store));
    const after = resumed.session.state as TwistleRoomState;
    expect(after.missedWords).toEqual(before.missedWords);
    expect(after.twistle.foundWords).toEqual(before.twistle.foundWords);
    expect(after.attempts).toBe(before.attempts);
  });

  it('the Library brings back the wrong selection its hint reads from', () => {
    const store = seedStore('word-web');
    const host = openHost(store);
    const puzzle = host.session.puzzle as WordWebPuzzleEx;

    // One word from each thread: guaranteed wrong, and it is the selection
    // `buy-hint` names an intruder out of.
    const wrong = puzzle.groups.map((g) => g.words[0]!);
    hostDispatch(store, host, { type: 'submit', selection: wrong });
    const before = host.session.state as WordWebRoomState;
    expect(before.lastWrongSelection).toEqual(wrong);

    const after = openHost(reload(store)).session.state as WordWebRoomState;
    expect(after.lastWrongSelection).toEqual(wrong);
    expect(after.attempts).toBe(before.attempts);
    expect(after.costedMistakes).toBe(before.costedMistakes);
  });

  it('a solved room reopens finished — the verdict, not a fresh board', () => {
    const store = seedStore('twistle');
    const host = openHost(store);
    const puzzle = host.session.puzzle as TwistlePuzzle;
    for (const word of puzzle.targetWords.slice(0, puzzle.targetCount)) {
      hostDispatch(store, host, { type: 'submit', word });
    }
    expect(host.session.solvedOnce).toBe(true);
    expect(store.getState().manor!.rooms[KEY]!.solved).toBe(true);

    const resumed = openHost(reload(store));
    expect(resumed.restored).toBe(true);
    expect(resumed.session.solvedOnce).toBe(true);
    expect(resumed.session.done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. §5.4 — the re-solve exploit
// ---------------------------------------------------------------------------

describe('§5.4 — a room is paid for once', () => {
  /** Solve the Gallery outright, and record what a first solve is worth. */
  function solveTheGallery(): { store: Store; paidSteps: number; paidKeys: number; board: string } {
    const store = seedStore('twistle');
    const host = openHost(store);
    const puzzle = host.session.puzzle as TwistlePuzzle;
    for (const word of puzzle.targetWords.slice(0, puzzle.targetCount)) {
      hostDispatch(store, host, { type: 'submit', word });
    }
    return {
      store,
      paidSteps: steps(store),
      paidKeys: store.getState().currencies.keys,
      board: getRoomAdapter('twistle')!.puzzleId(host.session.puzzle),
    };
  }

  const solveCount = (s: Store) =>
    s.getState().recentEvents.filter((e) => e.event.type === 'room-solved').length;

  /**
   * THE EDITOR'S LOOP, DRIVEN EXACTLY: solve (+8 and a key), let
   * `markPuzzleSeen` fire, reload, walk back in, solve again — three laps.
   *
   * The lap is closed at three independent points now, and the test says which
   * is doing the work, because a fix that leans on only one of them is a fix
   * that comes back:
   *   1. the cell no longer RESTOCKS — the board is found by the id pinned at
   *      placement, so `selectByTier`'s seen-filter cannot hand the same cell a
   *      different puzzle (that re-roll was the exploit's engine);
   *   2. the reopened board comes back SOLVED, so the room refuses input;
   *   3. and if both of those were somehow bypassed, the guard below still pays
   *      nothing (`refuses a second payout…`).
   */
  it('the reviewer\'s loop pays exactly once, however many laps you run', () => {
    const first = solveTheGallery();
    expect(first.paidSteps).toBe(START_STEPS + STEP_TABLE.solve('anchor', 1, 'twistle') + STEP_TABLE.perfect);
    expect(first.paidKeys).toBe(solveKeys(1, 'twistle'));
    expect(solveCount(first.store)).toBe(1);
    // The board is now marked seen — the precondition the exploit ran on.
    expect(first.store.getState().seenPuzzleIds.twistle).toContain(first.board);

    let current = first.store;
    for (let lap = 1; lap <= 3; lap++) {
      current = reload(current);
      const again = openHost(current);
      expect(getRoomAdapter('twistle')!.puzzleId(again.session.puzzle), `lap ${lap} restocked the cell`)
        .toBe(first.board);
      for (const word of (again.session.puzzle as TwistlePuzzle).targetWords) {
        hostDispatch(current, again, { type: 'submit', word });
      }
      expect(steps(current), `lap ${lap} printed steps`).toBe(first.paidSteps);
      expect(current.getState().currencies.keys, `lap ${lap} printed keys`).toBe(first.paidKeys);
      expect(solveCount(current), `lap ${lap} filed a second solve on the spine`).toBe(1);
    }
  });

  /**
   * The same lap with §5.3's two defences DELIBERATELY STRIPPED — the parked
   * session deleted and the pin cleared, which is precisely the pre-fix code
   * path (`RoomHost` used to `select()` unconditionally on every entry). The
   * cell duly restocks with a different, unseen board, the player solves it,
   * and the guard is now the only thing standing between her and infinite keys.
   */
  it('pays nothing even when the cell genuinely restocks with a new board', () => {
    const first = solveTheGallery();
    const current = reload(first.store);

    const manor = current.getState().manor!;
    const bare = { ...manor.rooms[KEY]! };
    delete bare.session;
    delete bare.puzzleId;
    current.setState({
      manor: { ...manor, rooms: { ...manor.rooms, [KEY]: bare } },
      day: { ...current.getState().day!, activeRoom: { cellKey: KEY, kind: 'twistle', puzzleId: '', tier: 1 } },
    });

    const again = openHost(current);
    const restocked = getRoomAdapter('twistle')!.puzzleId(again.session.puzzle);
    // Belt-and-braces on the test itself: if the pool were one board deep this
    // would silently stop exercising the exploit's shape.
    expect(restocked, 'the pool did not restock — this lap proved nothing')
      .not.toBe(first.board);

    for (const word of (again.session.puzzle as TwistlePuzzle).targetWords) {
      hostDispatch(current, again, { type: 'submit', word });
    }
    expect(steps(current)).toBe(first.paidSteps);
    expect(current.getState().currencies.keys).toBe(first.paidKeys);
    expect(solveCount(current)).toBe(1);
  });

  /**
   * The guard is on `manor.rooms[cellKey].solved`, so it holds even if some
   * future path hands the room a genuinely fresh board and a genuinely fresh
   * `solved` event — the belt to §5.3's braces.
   */
  it('refuses a second payout even when handed a brand-new solved event', () => {
    const store = seedStore('twistle');
    const solved = { rooms: { ...store.getState().manor!.rooms }, playerCell: CELL, daySeed: DAY_SEED };
    solved.rooms[KEY] = { ...solved.rooms[KEY]!, solved: true };
    store.setState({ manor: solved });

    const before = { steps: steps(store), keys: store.getState().currencies.keys };
    store.getState().applyRoomEvents(
      [{ type: 'solved', perfect: true }, { type: 'reward', keys: 0 }],
      { status: 'solved', perfect: true },
    );

    expect(steps(store)).toBe(before.steps);
    expect(store.getState().currencies.keys).toBe(before.keys);
    expect(store.getState().recentEvents.some((e) => e.event.type === 'room-solved')).toBe(false);
  });

  it('still pays the first solve in full', () => {
    const store = seedStore('twistle');
    const before = steps(store);
    store.getState().applyRoomEvents(
      [{ type: 'solved', perfect: true }],
      { status: 'solved', perfect: true },
    );
    expect(steps(store)).toBe(before + STEP_TABLE.solve('anchor', 1, 'twistle') + STEP_TABLE.perfect);
    expect(store.getState().manor!.rooms[KEY]!.solved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. The schema step
// ---------------------------------------------------------------------------

describe('the room-session schema step (migrations)', () => {
  function saveWithSession(session: unknown): SaveV2 {
    const save = createEmptySaveV2('Test');
    save.manor = manorWith('twistle', 'tw-x');
    (save.manor.rooms[KEY] as PlacedRoom).session = session as RoomSessionSnapshot;
    return save;
  }

  const goodSnapshot = (): RoomSessionSnapshot => {
    const adapter = getRoomAdapter('twistle')!;
    const puzzle = adapter.select({ tier: 1, seed: 3, seenIds: [] });
    return snapshotRoomSession(adapter, 1, {
      puzzle, state: adapter.start(puzzle, { tier: 1, seed: 3, volumeId: 'volume-1' }),
      done: false, solvedOnce: false,
    });
  };

  const roundTrip = (save: SaveV2): SaveV2 => {
    persistSave(save);
    return loadSave();
  };

  it('leaves a save written before room sessions existed exactly as it was', () => {
    const save = createEmptySaveV2('Test');
    save.manor = manorWith('twistle', 'tw-x');
    const loaded = roundTrip(save);
    expect(loaded.manor!.rooms[KEY]!.session).toBeUndefined();
    expect(loaded.manor!.rooms[KEY]!.cardId).toBe('card-twistle');
  });

  it('carries a snapshot this build can honour', () => {
    const snap = goodSnapshot();
    const loaded = roundTrip(saveWithSession(snap));
    expect(loaded.manor!.rooms[KEY]!.session).toEqual(snap);
  });

  it.each([
    ['a bumped adapter state version', { stateVersion: 99 }],
    ['a bumped envelope version', { v: ROOM_SESSION_ENVELOPE + 1 }],
    ['a snapshot from another room kind', { kind: 'hive' as const }],
    ['no puzzle id', { puzzleId: '' }],
  ])('drops %s at the door, and keeps the room', (_name, patch) => {
    const loaded = roundTrip(saveWithSession({ ...goodSnapshot(), ...patch }));
    expect(loaded.manor!.rooms[KEY]!.session).toBeUndefined();
    expect(loaded.manor!.rooms[KEY]!.puzzleId).toBe('tw-x');
  });

  it('drops garbage without taking the manor down with it', () => {
    for (const junk of [null, 42, 'nope', {}, { v: 1 }]) {
      const loaded = roundTrip(saveWithSession(junk));
      expect(loaded.manor!.rooms[KEY]!.session).toBeUndefined();
    }
  });

  it('opens the room fresh when the board a snapshot names is gone', () => {
    const adapter = getRoomAdapter('twistle')!;
    const snap = { ...goodSnapshot(), puzzleId: 'tw-deleted-in-a-content-regen' };
    const opened = openRoomSession({
      adapter,
      snapshot: snap,
      pinnedPuzzleId: undefined,
      ctx: { tier: 1, seed: 5, volumeId: 'volume-1' },
      seenIds: [],
    })!;
    expect(opened.restored).toBe(false);
    expect(opened.session.puzzle).toBeDefined();
  });
});
