/**
 * THE OPEN LEDGER — the manor's one deliberate exception to the nightly wipe.
 * OWNER: sudoku room agent (round 27). See engine/rooms/room-bank.ts.
 *
 * REVIEW_AA §6 asked for a Counting House that *"banks partial progress
 * overnight and pays proportionally"*, and BENCHMARKS §7 records that the
 * reference does exactly that: an unfinished NYT sudoku is still on the page
 * tomorrow, with its pencil marks. Round 22 shipped the "pays proportionally"
 * half; this file gates the other half and, more importantly, gates the thing
 * that half opens up:
 *
 *   **A NIGHT MUST NOT LET THE MANOR BUY THE SAME NINE PLACEMENTS TWICE.**
 *
 * `PlacedRoom.ladderEarned` is how the room slice knows what fraction of a long
 * room's payout has already been paid, and it lives on `manor`, which `endDay`
 * sets to `null`. Bank the board without it and the exploit is three taps: fill
 * three quarters of the leaf tonight, sleep, resume the SAME grid on a fresh
 * PlacedRoom whose ladder is back at zero, and every rung pays again. So the
 * headline test here is a real two-day sequence driven through the live store —
 * not a unit test of the record — and it asserts on the STEP LEDGER.
 */

import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import type { ManorStore } from '../src/app/store';
import { createEmptySaveV2, type SaveV2 } from '../src/app/save';
import { createDaySlice } from '../src/app/slices/day';
import { createManorSlice } from '../src/app/slices/manor';
import { createRoomSlice } from '../src/app/slices/room';
import { createDialogueSlice } from '../src/app/slices/dialogue';
import { createJournalSlice } from '../src/app/slices/journal';
import { createMetaSlice } from '../src/app/slices/meta';
import { migrate } from '../src/app/migrations';
import { getRoomAdapter } from '../src/engine/rooms/registry';
import {
  BANKABLE_KINDS, isBankable, isUsableLedger, openLedgerOf, shouldBank,
  OPEN_LEDGER_ENVELOPE,
} from '../src/engine/rooms/room-bank';
import {
  openRoomSession, snapshotRoomSession, type RoomSession,
} from '../src/engine/rooms/room-session';
import { ROOM_PUZZLE_KINDS, type RoomPuzzleKind } from '../src/engine/rooms/room-puzzle';
import { sudokuAdapter, type SudokuRoomState } from '../src/engine/puzzles/sudoku-adapter';
import { unsettledCells, type SudokuPuzzle } from '../src/engine/puzzles/sudoku';
import { SUDOKU_CELLS_PER_STAGE } from '../src/engine/economy/effort';
import { stageSteps, STEP_TABLE } from '../src/engine/economy/steps';
import type { PlacedRoom, Tier } from '../src/engine/types';

const CELL = '1,1';
const blanksOf = (p: SudokuPuzzle) => 81 - [...p.givens].filter((c) => c !== '.').length;
const ctx = { tier: 1 as Tier, seed: 42, volumeId: 'volume-1' };

function makeStore(save: SaveV2 = createEmptySaveV2('Player')) {
  return create<ManorStore>()((...a) => ({
    ...createDaySlice(save)(...a),
    ...createManorSlice(save)(...a),
    ...createRoomSlice(save)(...a),
    ...createDialogueSlice(save)(...a),
    ...createJournalSlice(save)(...a),
    ...createMetaSlice(save)(...a),
  }));
}

/** A one-cell manor with a Counting House standing at CELL, on row 1 (tier 1). */
function standInTheCountingHouse(store: ReturnType<typeof makeStore>, puzzle: SudokuPuzzle) {
  const placed = {
    kind: 'sudoku', cell: { col: 1, row: 1 }, cardId: 'counting-house',
    puzzleId: puzzle.id, solved: false,
  } as unknown as PlacedRoom;
  store.setState({
    day: { day: 3, phase: 'exploring', daySeed: 1, activeRoom: null },
    manor: { daySeed: 1, rooms: { [CELL]: placed }, playerCell: { col: 1, row: 1 } } as never,
    ledger: { budget: 40, entries: [] },
  });
  store.getState().enterRoom(CELL);
}

/** Play `n` true figures into the leaf through the real host loop. */
function inkTruth(
  store: ReturnType<typeof makeStore>, puzzle: SudokuPuzzle, session: RoomSession, n: number,
): RoomSession {
  let live = session;
  for (let i = 0; i < n; i++) {
    const state = live.state as SudokuRoomState;
    const blank = state.engine.values.findIndex((v) => v === 0);
    if (blank === -1) break;
    const digit = Number(puzzle.solution[blank]);
    const out = sudokuAdapter.reduce(puzzle, state, { type: 'ink', cell: blank, digit });
    live = {
      puzzle,
      state: out.state,
      done: out.outcome.status !== 'active',
      solvedOnce: live.solvedOnce || out.events.some((e) => e.type === 'solved'),
    };
    store.getState().applyRoomEvents(out.events, out.outcome);
    store.getState().saveRoomSession(
      CELL, snapshotRoomSession(sudokuAdapter, 1, live),
    );
  }
  return live;
}

const solveSteps = (l: { entries: { reason: string; delta: number }[] }) =>
  l.entries.filter((e) => e.reason === 'solve').reduce((s, e) => s + e.delta, 0);

// ---------------------------------------------------------------------------
// The policy
// ---------------------------------------------------------------------------

describe('the open ledger is a NARROW exception, stated once', () => {
  it('banks exactly one room kind, and every other room still dies with the manor', () => {
    // The allow-list is the ruling. If a later round adds a kind here it must
    // also pay the legibility bill in that room's copy (room-bank.ts header),
    // and this assertion is where it has to say so out loud.
    expect([...BANKABLE_KINDS]).toEqual(['sudoku']);
    for (const kind of ROOM_PUZZLE_KINDS) {
      expect(isBankable(kind), kind).toBe(kind === 'sudoku');
    }
  });

  it('requires the kind AND real work AND an unfinished board — three separate noes', () => {
    const snap = (over: Partial<{ done: boolean; solvedOnce: boolean }>) => ({
      v: 1, kind: 'sudoku' as RoomPuzzleKind, puzzleId: 'x', tier: 1 as Tier,
      stateVersion: 1, state: {}, done: false, solvedOnce: false, ...over,
    });
    expect(shouldBank('sudoku', snap({}), true)).toBe(true);
    expect(shouldBank('sudoku', snap({}), false), 'a glance is not a thread').toBe(false);
    expect(shouldBank('sudoku', snap({ done: true }), true), 'finished').toBe(false);
    expect(shouldBank('sudoku', snap({ solvedOnce: true }), true), 'solved once').toBe(false);
    expect(shouldBank('word-web', snap({}), true), 'not a bankable kind').toBe(false);
  });

  it('knows what work on a ledger leaf looks like — pencil counts, a bought figure does not', () => {
    // Pencil is the half of the solve this room's play model calls thinking,
    // and on a tier-2/3 board it is twenty minutes before the first placement.
    const puzzle = sudokuAdapter.select({ tier: 3, seed: 5, seenIds: [] });
    const fresh = sudokuAdapter.start(puzzle, { ...ctx, tier: 3 });
    expect(sudokuAdapter.hasWork!(puzzle, fresh), 'an untouched leaf').toBe(false);

    const blank = fresh.engine.values.findIndex((v) => v === 0);
    const pencilled = sudokuAdapter
      .reduce(puzzle, fresh, { type: 'pencil', cell: blank, digit: 5 }).state;
    expect(sudokuAdapter.hasWork!(puzzle, pencilled), 'one pencil mark').toBe(true);

    const bought = sudokuAdapter.reduce(puzzle, fresh, { type: 'reveal-cell' }).state;
    expect(bought.engine.revealed.length, 'the reveal landed').toBe(1);
    expect(sudokuAdapter.hasWork!(puzzle, bought), 'a figure she PAID for is not her work')
      .toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The two-day sequence — the headline
// ---------------------------------------------------------------------------

describe('the leaf survives the night, and the manor does not pay for it twice', () => {
  it('resumes the same grid, the same marks, and the same rungs across endDay', () => {
    const store = makeStore();
    const puzzle = sudokuAdapter.select({ tier: 1, seed: 42, seenIds: [] });
    standInTheCountingHouse(store, puzzle);

    // ── NIGHT ONE: two rungs' worth of ink, then away. ────────────────────
    const opened = openRoomSession({
      adapter: sudokuAdapter, snapshot: undefined, openLedger: null,
      pinnedPuzzleId: puzzle.id, ctx, seenIds: [],
    })!;
    expect(opened.source).toBe('fresh');
    const rungCells = SUDOKU_CELLS_PER_STAGE * 2;
    const night1 = inkTruth(store, puzzle, opened.session, rungCells);

    const banked = store.getState().openLedger;
    expect(banked, 'the leaf was never banked').not.toBeNull();
    expect(banked!.session.puzzleId).toBe(puzzle.id);
    const rungs = Math.ceil(blanksOf(puzzle) / SUDOKU_CELLS_PER_STAGE);
    expect(banked!.ladderEarned, 'two of the leaf\'s rungs came with it')
      .toBeCloseTo(2 / rungs, 10);
    expect(banked!.day).toBe(3);
    const paidNight1 = solveSteps(store.getState().ledger);
    expect(paidNight1, 'the rungs she climbed paid something').toBeGreaterThan(0);

    // ── THE NIGHT. The floorplan goes; the leaf does not. ─────────────────
    store.getState().leaveRoom();
    store.getState().endDay('steps-exhausted');
    expect(store.getState().manor, 'the house was NOT put away').toBeNull();
    expect(store.getState().openLedger, 'the leaf went with the house').not.toBeNull();

    // ── NIGHT TWO: a brand-new floorplan, a brand-new cell. ───────────────
    const store2 = store;
    store2.setState({
      day: { day: 4, phase: 'exploring', daySeed: 2, activeRoom: null },
      manor: {
        daySeed: 2,
        rooms: {
          // A DIFFERENT cell, and pinned to a DIFFERENT board — the open
          // ledger outranks the pin, because the pin is a fact about tonight's
          // floorplan and the leaf is a fact about her week.
          '2,1': {
            kind: 'sudoku', cell: { col: 2, row: 1 }, cardId: 'counting-house',
            puzzleId: sudokuAdapter.select({ tier: 1, seed: 99, seenIds: [puzzle.id] }).id,
            solved: false,
          } as unknown as PlacedRoom,
        },
        playerCell: { col: 2, row: 1 },
      } as never,
    });
    store2.getState().enterRoom('2,1');
    const reopened = openRoomSession({
      adapter: sudokuAdapter,
      snapshot: undefined,
      openLedger: store2.getState().openLedger,
      pinnedPuzzleId: store2.getState().manor!.rooms['2,1']!.puzzleId,
      ctx: { ...ctx, seed: 7 },
      seenIds: [],
    })!;
    expect(reopened.source, 'the banked leaf did not outrank the pin').toBe('bank');
    expect((reopened.session.puzzle as SudokuPuzzle).id, 'a different board came back')
      .toBe(puzzle.id);
    // The WORK is intact, not just the board.
    expect(unsettledCells(puzzle, (reopened.session.state as SudokuRoomState).engine).length)
      .toBe(rungCells);

    // …and the host's second half: the rungs come back onto the new cell.
    store2.getState().resumeOpenLedger('2,1');
    expect(store2.getState().manor!.rooms['2,1']!.ladderEarned).toBeCloseTo(2 / rungs, 10);
    expect(store2.getState().manor!.rooms['2,1']!.puzzleId).toBe(puzzle.id);
  });

  it('THE EXPLOIT: without the rungs, a night re-sells nine placements she already sold', () => {
    // The same sequence twice, differing in ONE call. This is the assertion
    // that makes `ladderEarned` load-bearing rather than tidy: it fails if a
    // later round banks the board and forgets the receipt.
    const run = (adoptRungs: boolean) => {
      const store = makeStore();
      const puzzle = sudokuAdapter.select({ tier: 1, seed: 42, seenIds: [] });
      standInTheCountingHouse(store, puzzle);
      const opened = openRoomSession({
        adapter: sudokuAdapter, snapshot: undefined, openLedger: null,
        pinnedPuzzleId: puzzle.id, ctx, seenIds: [],
      })!;
      const rungCells = SUDOKU_CELLS_PER_STAGE * 3;
      let live = inkTruth(store, puzzle, opened.session, rungCells);
      store.getState().leaveRoom();
      store.getState().endDay('steps-exhausted');

      store.setState({
        day: { day: 4, phase: 'exploring', daySeed: 2, activeRoom: null },
        manor: {
          daySeed: 2,
          rooms: {
            '2,1': {
              kind: 'sudoku', cell: { col: 2, row: 1 }, cardId: 'counting-house',
              puzzleId: puzzle.id, solved: false,
            } as unknown as PlacedRoom,
          },
          playerCell: { col: 2, row: 1 },
        } as never,
      });
      store.getState().enterRoom('2,1');
      const back = openRoomSession({
        adapter: sudokuAdapter, snapshot: undefined,
        openLedger: store.getState().openLedger,
        pinnedPuzzleId: puzzle.id, ctx: { ...ctx, seed: 7 }, seenIds: [],
      })!;
      if (adoptRungs) store.getState().resumeOpenLedger('2,1');
      live = back.session;
      // One more rung on night two, and nothing else.
      const state = live.state as SudokuRoomState;
      let s2 = state;
      for (let i = 0; i < SUDOKU_CELLS_PER_STAGE; i++) {
        const blank = s2.engine.values.findIndex((v) => v === 0);
        const out = sudokuAdapter.reduce(puzzle, s2, {
          type: 'ink', cell: blank, digit: Number(puzzle.solution[blank]),
        });
        s2 = out.state;
        store.getState().applyRoomEvents(out.events, out.outcome);
      }
      return solveSteps(store.getState().ledger);
    };

    const total = STEP_TABLE.solve('anchor', 1, 'sudoku');
    const rungs = Math.ceil(
      blanksOf(sudokuAdapter.select({ tier: 1, seed: 42, seenIds: [] })) / SUDOKU_CELLS_PER_STAGE);
    // Honest: four rungs' worth of the room's price, once.
    //
    // ROUND 42 — THIS ASSERTION CAUGHT A DOUBLE-PAY, which is more than it was
    // written to do. `stageSteps` gained a one-move floor per rung (the ledger
    // has no smaller coin), and `app/slices/room.ts` was reconstructing the
    // receipt as `floor(total × ladderEarned)` — its own second opinion about
    // `stageSteps`' arithmetic. The two stopped agreeing the moment the floor
    // landed: the first rung paid 1 while the receipt read 0, so the next rung
    // paid for it again and the room went on to pay MORE than `solvePayout`.
    // There is one of that number now (`stagePaidAt`), and this line — which
    // compares the incremental run against the one-shot computation — is what
    // says so.
    const honest = run(true);
    expect(honest, `four rungs of ${total}`).toBe(stageSteps('sudoku', 1, 4 / rungs, 0));
    // Forgetful: the first three rungs sold a second time.
    const forgetful = run(false);
    expect(forgetful, 'the receipt is not load-bearing — the gate is vacuous')
      .toBeGreaterThan(honest);
  });

  it('closes the leaf when it balances, so tomorrow is a fresh sheet', () => {
    const store = makeStore();
    const puzzle = sudokuAdapter.select({ tier: 1, seed: 17, seenIds: [] });
    standInTheCountingHouse(store, puzzle);
    const opened = openRoomSession({
      adapter: sudokuAdapter, snapshot: undefined, openLedger: null,
      pinnedPuzzleId: puzzle.id, ctx, seenIds: [],
    })!;
    const part = inkTruth(store, puzzle, opened.session, SUDOKU_CELLS_PER_STAGE);
    expect(store.getState().openLedger, 'mid-leaf').not.toBeNull();
    const finished = inkTruth(store, puzzle, part, 81);
    expect((finished.state as SudokuRoomState).engine.status).toBe('won');
    expect(store.getState().openLedger, 'a balanced leaf is not left open').toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The record itself
// ---------------------------------------------------------------------------

describe('a banked leaf this build cannot honour is dropped, never half-parsed', () => {
  const goodSession = () => {
    const puzzle = sudokuAdapter.select({ tier: 1, seed: 3, seenIds: [] });
    const session: RoomSession = {
      puzzle, state: sudokuAdapter.start(puzzle, ctx), done: false, solvedOnce: false,
    };
    return snapshotRoomSession(sudokuAdapter, 1, session);
  };

  it('accepts only its own envelope, a sane fraction, and a usable session', () => {
    const ok = openLedgerOf(goodSession(), 0.5, 4);
    expect(isUsableLedger(ok, sudokuAdapter)).toBe(true);
    expect(isUsableLedger({ ...ok, v: OPEN_LEDGER_ENVELOPE + 1 }, sudokuAdapter)).toBe(false);
    expect(isUsableLedger({ ...ok, ladderEarned: 1.5 }, sudokuAdapter)).toBe(false);
    expect(isUsableLedger({ ...ok, ladderEarned: Number.NaN }, sudokuAdapter)).toBe(false);
    expect(isUsableLedger({ ...ok, day: 'tuesday' }, sudokuAdapter)).toBe(false);
    expect(isUsableLedger(
      { ...ok, session: { ...ok.session, stateVersion: ok.session.stateVersion + 1 } },
      sudokuAdapter,
    ), 'a bumped state version').toBe(false);
    expect(isUsableLedger({ ...ok, session: { ...ok.session, puzzleId: 'gone' } }, sudokuAdapter))
      .toBe(true);   // shape is fine here; `find()` is what drops it at restore
    expect(isUsableLedger(ok, getRoomAdapter('word-web')), 'a kind that may not bank')
      .toBe(false);
    expect(isUsableLedger(null, sudokuAdapter)).toBe(false);
  });

  it('is pruned at LOAD by the same rule the room restores with', () => {
    const ok = openLedgerOf(goodSession(), 0.25, 2);
    const kept = migrate({ ...createEmptySaveV2('P'), openLedger: ok });
    expect(kept.openLedger, 'an honourable leaf was thrown away').not.toBeNull();

    const stale = { ...ok, session: { ...ok.session, stateVersion: 999 } };
    expect(migrate({ ...createEmptySaveV2('P'), openLedger: stale }).openLedger).toBeNull();
    expect(migrate({ ...createEmptySaveV2('P'), openLedger: { junk: true } }).openLedger).toBeNull();
    // A save written before this field existed loads with the leaf closed.
    const { openLedger: _gone, ...older } = createEmptySaveV2('P');
    expect(migrate(older).openLedger).toBeNull();
  });

  it('falls back to a fresh board when the pool no longer ships the banked leaf', () => {
    const ok = openLedgerOf(goodSession(), 0.5, 4);
    const opened = openRoomSession({
      adapter: sudokuAdapter,
      snapshot: undefined,
      openLedger: { ...ok, session: { ...ok.session, puzzleId: 'sudoku-t9-99' } },
      pinnedPuzzleId: undefined,
      ctx,
      seenIds: [],
    })!;
    expect(opened.source, 'a board the pool dropped must not block the room').toBe('fresh');
  });
});
