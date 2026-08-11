/**
 * THE DAY'S ACCOUNT — the fold behind the candle's new sheet (round 32,
 * COMPREHENSION fix 2). The argument is in src/ui/chrome/ledger-lines.ts.
 *
 * WHAT WOULD MAKE THIS FILE WORTHLESS, and is therefore not done here:
 * asserting `ledgerLines([{reason:'move',delta:-2}])[0].delta === -2`. That is
 * the fold read back to itself — it cannot come out wrong, and this campaign
 * has already audited three gates that were green on the very pool they were
 * written to condemn.
 *
 * So every case below is MADE. Real puzzles out of the shipped pools, real
 * actions through the real adapters, the real room slice turning the real
 * events into real ledger entries, and only then the account read off them.
 * The claims are the two the sheet actually makes to the player:
 *
 *   1. IT ADDS UP. `budget + Σ deltas` — the number printed at the foot of the
 *      sheet — equals what the candle says, on a day driven through the real
 *      slices. This goes red if the fold drops or double-counts an entry.
 *   2. ONLY WHAT IS WRITTEN THERE WAS CHARGED. The sheet ends on that
 *      sentence, and it is the sentence that has to kill three surviving false
 *      beliefs ("rejected words cost me steps", "talking costs steps", "wrong
 *      letters cost 2 each"). So it is proved, not asserted: a REJECTED hive
 *      word is submitted through the real adapter and must leave no row, while
 *      a real structural slip in the same room must leave one, reading the
 *      same word the float uses. A build that started ledgering free feedback
 *      turns this red — which is the only thing that could make the sheet's
 *      closing sentence a lie.
 */

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
import { accountTotals, ledgerLines } from '../src/ui/chrome/ledger-lines';
import { reasonWord } from '../src/ui/chrome/step-reasons';
import { ledgerTotal, moveAt, stepsRemaining } from '../src/engine/economy/steps';
import { hiveAdapter, HIVE_POOL } from '../src/engine/rooms/adapters/hive';
import type { RoomEvent } from '../src/engine/rooms/room-puzzle';
import type { PlacedRoom, StepEntry } from '../src/engine/types';

const CELL = '1,1';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ctx = { tier: 1 as const, seed: 42, volumeId: 'volume-1' };

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

/** Her, standing in a hive on a tier-1 row, with the real slices under her. */
function inTheConservatory() {
  const store = makeStore();
  const puzzle = HIVE_POOL[0]!;
  const placed = {
    kind: 'hive', cell: { col: 1, row: 1 }, cardId: 'card-hive',
    puzzleId: puzzle.id, solved: false,
  } as unknown as PlacedRoom;
  store.setState({
    day: { day: 3, phase: 'exploring', daySeed: 1, activeRoom: null },
    manor: { daySeed: 1, rooms: { [CELL]: placed }, playerCell: { col: 1, row: 1 } } as never,
    ledger: { budget: 22, entries: [] },
  });
  store.getState().enterRoom(CELL);
  return { store, puzzle };
}

const kindOf = (store: ReturnType<typeof makeStore>) =>
  (roomKey: string | undefined) =>
    (roomKey ? store.getState().manor?.rooms?.[roomKey]?.kind : undefined);

function submit(puzzle: (typeof HIVE_POOL)[number], word: string): RoomEvent[] {
  return hiveAdapter.reduce(puzzle, hiveAdapter.start(puzzle, ctx), { type: 'submit', word }).events;
}

describe('the day’s account adds up', () => {
  it('prints the same number the candle does, on a day driven through the real slices', () => {
    const { store, puzzle } = inTheConservatory();
    // A day with something of everything in it: a walk, a climb, a costed
    // mistake made for real, a hint, and the morning's tea.
    const at = Date.now();
    store.getState().applyStepEntry({ reason: 'tea', delta: 6, at });
    store.getState().applyStepEntry({ reason: 'move', delta: -2, at, roomKey: '1,0' });
    store.getState().applyStepEntry({ reason: 'move', delta: -2, at, roomKey: '1,1' });
    // A REAL climb. `priceEntry` re-prices every move off the row table, and
    // the differential floors at 0 — so "1,0>1,1" is a free step (both rows
    // cost 2) and would never reach the account at all. Rows 3→4 is where the
    // stairs actually start charging: moveAt(4) − moveAt(3) = −5.
    store.getState().applyStepEntry({ reason: 'move', delta: -7, at, roomKey: '1,3>1,4' });
    store.getState().applyStepEntry({ reason: 'hint', delta: -2, at, roomKey: CELL });
    const outside = [...ALPHABET].find(
      (ch) => ch !== puzzle.center && !puzzle.outer.includes(ch),
    )!;
    store.getState().applyRoomEvents(
      submit(puzzle, outside + puzzle.center + outside + puzzle.center),
      { status: 'active', perfect: false },
    );

    const ledger = store.getState().ledger;
    const lines = ledgerLines(ledger.entries, kindOf(store));
    const totals = accountTotals(ledger.budget, lines);

    expect(totals.remaining).toBe(ledgerTotal(ledger));
    expect(Math.max(0, totals.remaining)).toBe(stepsRemaining(ledger));
    // …and the fold lost nothing on the way: every entry is in exactly one row.
    const folded = lines.reduce((n, l) => n + l.count, 0);
    expect(folded).toBe(ledger.entries.filter((e: StepEntry) => e.delta !== 0).length);
  });

  it('folds repeats onto one row and keeps them in the order the day happened', () => {
    const { store } = inTheConservatory();
    const at = Date.now();
    store.getState().applyStepEntry({ reason: 'tea', delta: 6, at });
    store.getState().applyStepEntry({ reason: 'move', delta: -2, at, roomKey: '1,0' });
    store.getState().applyStepEntry({ reason: 'move', delta: -2, at, roomKey: '2,0' });
    store.getState().applyStepEntry({ reason: 'move', delta: -2, at, roomKey: '3,0' });
    const lines = ledgerLines(store.getState().ledger.entries, kindOf(store));
    expect(lines.map((l) => l.why)).toEqual(['tea', 'walk']);
    const walk = lines.find((l) => l.why === 'walk')!;
    expect(walk.count).toBe(3);
    expect(walk.delta).toBe(-6);
  });

  it('a climb and a walk are two rows, because they are two prices', () => {
    const { store } = inTheConservatory();
    const at = Date.now();
    store.getState().applyStepEntry({ reason: 'move', delta: -2, at, roomKey: '1,0' });
    store.getState().applyStepEntry({ reason: 'move', delta: -7, at, roomKey: '1,3>1,4' });
    const lines = ledgerLines(store.getState().ledger.entries, kindOf(store));
    expect(lines.map((l) => l.why).sort()).toEqual(['climb', 'walk']);
    // And the account carries the price the ENGINE set, not the one the caller
    // asked for: `priceEntry` re-prices every move off `MOVE_COST_BY_ROW`.
    expect(lines.find((l) => l.why === 'climb')!.delta).toBe(moveAt(4) - moveAt(3));
  });
});

describe('“Only what is written here was charged.”', () => {
  /**
   * THE CLAIM THE SHEET CLOSES ON, PROVED IN THE ROOM THAT BROKE IT TWICE.
   *
   * A blind tester, twice over two rounds, in this exact room: "my step count
   * fell from 7 to 4 while I was submitting… I still don't know whether
   * rejected words cost steps." Ground truth is that they do not — an invalid,
   * too-short or duplicate word is mistake weight 0 and is never ledgered
   * (economy/steps.ts). The sheet says so by OMISSION, so the omission has to
   * be real, and this is where that is checked against the shipped adapter
   * rather than against a comment.
   */
  it('a rejected hive word leaves no row in the account', () => {
    const { store, puzzle } = inTheConservatory();
    const before = store.getState().ledger.entries.length;
    // Not a word. Every letter is in the hive and the centre is present, so
    // the ONLY thing wrong with it is that the dictionary has never heard of
    // it — the commonest thing that happens in a Spelling Bee.
    const gibberish = puzzle.center + puzzle.outer.slice(0, 3).join('') + puzzle.center;
    store.getState().applyRoomEvents(
      submit(puzzle, gibberish), { status: 'active', perfect: false },
    );
    const ledger = store.getState().ledger;
    const charged = ledger.entries.slice(before).filter((e: StepEntry) => e.delta !== 0);
    expect(charged, 'a rejected word was ledgered — the sheet now lies').toEqual([]);
    expect(ledgerLines(ledger.entries, kindOf(store))).toEqual([]);
  });

  it('but a structural slip does, in the room’s own word', () => {
    const { store, puzzle } = inTheConservatory();
    // Every letter IS in the hive; the word skips the centre. That is the one
    // hive slip the house charges for, and `engine/hive.ts` tests it before
    // bad letters — the ordering that made round 26's float say the wrong
    // thing (see tests/step-reasons.test.ts).
    const offCentre = puzzle.outer.slice(0, 2).join('') + puzzle.outer.slice(0, 2).join('');
    expect([...offCentre].every((ch) => ch !== puzzle.center)).toBe(true);
    store.getState().applyRoomEvents(
      submit(puzzle, offCentre), { status: 'active', perfect: false },
    );
    const ledger = store.getState().ledger;
    const lines = ledgerLines(ledger.entries, kindOf(store));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.reason).toBe('mistake');
    expect(lines[0]!.delta).toBeLessThan(0);
    // And the record says exactly what the float said — one vocabulary, two
    // surfaces. Read off the entry, not off a copy table.
    const charged = ledger.entries.find((e: StepEntry) => e.reason === 'mistake')!;
    expect(lines[0]!.why).toBe(reasonWord(charged, 'hive'));
    expect(lines[0]!.why).toBe('missing centre');
  });
});
