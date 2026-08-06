import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import {
  beginDay, buildDayRecord, canAdvancePhase, canEndDay, daySeedFor, highestRowLine,
  pruneEventsAtDusk, refundLine, shouldTriggerDusk, DAY_FLOW, DUSK_FADE_MS,
} from '../src/engine/day';
import {
  appendEntry, climbKey, createLedger, moveAt, rowName, teaArcPoints, teaBonus,
  FIRST_MORNING_POT, STEP_TABLE, TEA_ARC,
} from '../src/engine/economy/steps';
import { CARRY_OVER_EFFECTS, carryOverFrom } from '../src/engine/manor/deck';
import type { DayState, DraftOffer, PlacedRoom, StepLedger } from '../src/engine/types';
import type { RecordedEvent } from '../src/engine/events';
import { draftTargets } from '../src/engine/manor/grid';
import { createEmptySaveV2 } from '../src/app/save';
import type { ManorStore } from '../src/app/store';
import { createDaySlice } from '../src/app/slices/day';
import { createManorSlice, ensureManor } from '../src/app/slices/manor';
import { createRoomSlice } from '../src/app/slices/room';
import { createDialogueSlice } from '../src/app/slices/dialogue';
import { createJournalSlice } from '../src/app/slices/journal';
import { createMetaSlice } from '../src/app/slices/meta';

/**
 * A2 — the day lifecycle FSM. The load-bearing cozy rules: a day ending is
 * never a defeat, dusk NEVER fires inside an active puzzle (AAA 4.12), and
 * the fade budget stays under 4s.
 */

const day = (over: Partial<DayState> = {}): DayState => ({
  day: 3,
  phase: 'exploring',
  daySeed: 123,
  activeRoom: null,
  ...over,
});

const activeRoom = { cellKey: '2,3', kind: 'hive' as const, puzzleId: 'h1', tier: 2 as const };

const rec = (dayN: number, type: string, extra: object = {}): RecordedEvent => ({
  day: dayN,
  at: 0,
  event: { type, ...extra } as RecordedEvent['event'],
});

describe('phase flow', () => {
  it('runs morning → exploring → dusk → night, and night only via beginDay', () => {
    expect(DAY_FLOW.morning).toBe('exploring');
    expect(DAY_FLOW.exploring).toBe('dusk');
    expect(DAY_FLOW.dusk).toBe('night');
    expect(DAY_FLOW.night).toBeNull();
  });

  it('rejects any skipping or reversing of edges', () => {
    expect(canAdvancePhase('morning', 'exploring')).toBe(true);
    expect(canAdvancePhase('dusk', 'night')).toBe(true);
    expect(canAdvancePhase('morning', 'dusk')).toBe(false);
    expect(canAdvancePhase('exploring', 'morning')).toBe(false);
    expect(canAdvancePhase('night', 'morning')).toBe(false);
  });

  it('keeps the dusk fade at or under the 4s bar (AAA 4.12)', () => {
    expect(DUSK_FADE_MS).toBeLessThanOrEqual(4000);
  });
});

describe('beginDay', () => {
  it('starts day 1 from a fresh save', () => {
    const begun = beginDay(null, { brambleAffinity: 0, entropy: 42 });
    expect(begun).not.toBeNull();
    expect(begun!.day.day).toBe(1);
    expect(begun!.day.phase).toBe('morning');
    expect(begun!.day.activeRoom).toBeNull();
    // Owner-playtest overhaul: the base budget is deliberately too lean to
    // buy the top of the house; the tea arc is what eventually pays for it.
    expect(begun!.ledger.budget).toBe(STEP_TABLE.dayStart);
    expect(begun!.ledger.budget).toBe(18);
    expect(begun!.teaSteps).toBe(0);          // day 1: they have only just met
    // …but the FIRST morning gets a scripted welcome pot, or the very first
    // evening runs under the 10–15 minute floor (AAA 4.10b, round-5 audit).
    expect(begun!.potSteps).toBe(FIRST_MORNING_POT);
  });

  it('pours the welcome pot once, on day 1 only', () => {
    const later = beginDay(day({ phase: 'night', day: 4 }), { brambleAffinity: 2, entropy: 1 });
    expect(later!.potSteps).toBe(0);
    expect(later!.teaSteps).toBe(teaBonus(2));
  });

  it('rolls to the next morning only from night', () => {
    expect(beginDay(day({ phase: 'exploring' }), { brambleAffinity: 0, entropy: 1 })).toBeNull();
    expect(beginDay(day({ phase: 'dusk' }), { brambleAffinity: 0, entropy: 1 })).toBeNull();
    const begun = beginDay(day({ phase: 'night', day: 7 }), { brambleAffinity: 2, entropy: 1 });
    expect(begun!.day.day).toBe(8);
    expect(begun!.teaSteps).toBe(teaBonus(2));
  });

  it('derives a deterministic, day-distinct seed', () => {
    expect(daySeedFor(4, 999)).toBe(daySeedFor(4, 999));
    expect(daySeedFor(4, 999)).not.toBe(daySeedFor(5, 999));
    expect(daySeedFor(4, 999)).not.toBe(daySeedFor(4, 1000));
  });
});

describe('ending the day', () => {
  it('canEndDay: out on the blueprint, mid-day only', () => {
    expect(canEndDay(day())).toBe(true);
    expect(canEndDay(day({ phase: 'morning' }))).toBe(true);
    expect(canEndDay(null)).toBe(false);
    expect(canEndDay(day({ phase: 'dusk' }))).toBe(false);
    expect(canEndDay(day({ phase: 'night' }))).toBe(false);
  });

  it('NEVER ends the day inside an active puzzle (AAA 4.12)', () => {
    expect(canEndDay(day({ activeRoom }))).toBe(false);
    const empty: StepLedger = { budget: 0, entries: [] };
    expect(shouldTriggerDusk(day({ activeRoom }), empty)).toBe(false);
  });

  it('triggers dusk at 0 steps on the blueprint', () => {
    let l = createLedger(1);
    expect(shouldTriggerDusk(day(), l)).toBe(false);
    l = appendEntry(l, { reason: 'move', delta: -1, at: 0 });
    expect(shouldTriggerDusk(day(), l)).toBe(true);
  });

  it('does not trigger dusk when a mid-puzzle overdraft recovered', () => {
    let l = createLedger(2);
    l = appendEntry(l, { reason: 'mistake', delta: -3, at: 0 }); // dip to −1 in-room
    l = appendEntry(l, { reason: 'solve', delta: 6, at: 0 });    // solve pays out
    expect(shouldTriggerDusk(day(), l)).toBe(false);
  });

  it('never triggers dusk during morning or night phases', () => {
    const spent = appendEntry(createLedger(1), { reason: 'move', delta: -1, at: 0 });
    expect(shouldTriggerDusk(day({ phase: 'morning' }), spent)).toBe(false);
    expect(shouldTriggerDusk(day({ phase: 'night' }), spent)).toBe(false);
  });

  it('suspends dusk while a draft offer is open, like an active room (AAA 4.6)', () => {
    const spent = appendEntry(createLedger(1), { reason: 'move', delta: -1, at: 0 });
    const offer: DraftOffer = {
      atDoor: 'N', from: { col: 2, row: 0 }, cards: [], rerolled: false,
    };
    expect(shouldTriggerDusk(day(), spent, offer)).toBe(false);
    // …and fires again once the offer resolves.
    expect(shouldTriggerDusk(day(), spent, null)).toBe(true);
    expect(shouldTriggerDusk(day(), spent, undefined)).toBe(true);
  });
});

describe('buildDayRecord (the chronicles bank)', () => {
  it("counts only the closing day's events", () => {
    const d = day({ day: 5 });
    let l = createLedger();
    l = appendEntry(l, { reason: 'move', delta: -1, at: 0 });
    l = appendEntry(l, { reason: 'mistake', delta: -2, at: 0 });
    l = appendEntry(l, { reason: 'solve', delta: 6, at: 0 });
    const events: RecordedEvent[] = [
      rec(4, 'room-drafted'), // yesterday — must not count
      rec(5, 'room-drafted'),
      rec(5, 'room-drafted'),
      rec(5, 'room-solved'),
      rec(5, 'fragment-found'),
    ];
    const record = buildDayRecord(d, l, events, 'steps-exhausted', 1234);
    expect(record).toEqual({
      day: 5,
      endedAt: 1234,
      cause: 'steps-exhausted',
      roomsDrafted: 2,
      roomsSolved: 1,
      stepsSpent: 3,
      fragmentsFound: 1,
      stepsRefunded: 6,
      highestRow: 0,
    });
  });

  it('records the CLIMB — the thing the retune is about (round-5 audit)', () => {
    // `stepsRefunded()` was documented "for the night digest" and had zero
    // callers, and nothing recorded how high she got, so the first night of
    // the game closed on a scoreboard of zeros.
    const d = day({ day: 2 });
    let l = createLedger();
    l = appendEntry(l, { reason: 'tea', delta: 4, at: 0 });
    l = appendEntry(l, { reason: 'move', delta: 0, at: 0, roomKey: '2,1' });
    l = appendEntry(l, { reason: 'move', delta: 0, at: 0, roomKey: climbKey('2,1', '2,3') });
    l = appendEntry(l, { reason: 'solve', delta: 6, at: 0, roomKey: '2,3' });
    l = appendEntry(l, { reason: 'move', delta: 0, at: 0, roomKey: '2,1' });   // walked back
    const record = buildDayRecord(d, l, [], 'steps-exhausted', 1);
    expect(record.highestRow).toBe(3);
    expect(record.stepsRefunded).toBe(10);
    expect(highestRowLine(record)).toContain(rowName(3));
    expect(refundLine(record)).toBe('The manor gave back +10.');
  });

  it('says nothing rather than printing a zero (the cozy pillar)', () => {
    const quiet = buildDayRecord(day({ day: 1 }), createLedger(), [], 'retired-early', 1);
    expect(quiet.highestRow).toBe(0);
    expect(quiet.stepsRefunded).toBe(0);
    expect(highestRowLine(quiet)).toBeNull();
    expect(refundLine(quiet)).toBeNull();
  });
});

describe('pruneEventsAtDusk (the one-day-deep stream)', () => {
  it("keeps ALL of the closing day's events so the morning can react to them (AAA 5.2)", () => {
    const events: RecordedEvent[] = [
      rec(4, 'day-ended', { cause: 'steps-exhausted' }), // stale, two days back
      rec(4, 'room-solved'),                             // stale, ages off
      rec(5, 'room-solved'),
      rec(5, 'fragment-found'),
      rec(5, 'day-ended', { cause: 'retired-early' }),
    ];
    const pruned = pruneEventsAtDusk(events, 5);
    expect(pruned).toHaveLength(3);
    expect(pruned.every((e) => e.day === 5)).toBe(true);
    expect(pruned.map((e) => e.event.type)).toEqual([
      'room-solved', 'fragment-found', 'day-ended',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Store-level integration: the dusk deferral (A2's day slice composed with the
// real sibling slices, exactly as app/store.ts composes them — but on a fresh
// save and without the persistence subscription).
// ---------------------------------------------------------------------------

const makeStore = () => {
  const save = createEmptySaveV2('Tester');
  return create<ManorStore>()((...a) => ({
    ...createDaySlice(save)(...a),
    ...createManorSlice(save)(...a),
    ...createRoomSlice(save)(...a),
    ...createDialogueSlice(save)(...a),
    ...createJournalSlice(save)(...a),
    ...createMetaSlice(save)(...a),
  }));
};

/** The dusk check runs a microtask after state settles; let it. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Fresh store, day started and out on the blueprint with the manor built. */
const exploringStore = () => {
  const store = makeStore();
  store.getState().startDay();          // morning, budget 40
  store.getState().advanceDayPhase();   // → exploring
  ensureManor();                        // A1 builds the grid for the live day
  return store;
};

describe('the last-step draft never charges for a look it refuses to give (AAA 4.6 + 4.12/R.3)', () => {
  it('1 step left + openDraft → the offer is visible; the day ends only after it resolves', async () => {
    const store = exploringStore();
    // Exactly one step left — the tensest moment of a steps-exhausted day.
    store.setState({ ledger: { budget: 1, entries: [] } });
    const target = draftTargets(store.getState().manor!)[0]!;

    store.getState().openDraft(target.dir);
    await flush();

    const s = store.getState();
    expect(s.draftOffer).not.toBeNull();          // she gets the look she paid for
    expect(s.day!.phase).toBe('exploring');       // dusk is suspended by the offer
    expect(s.stepsRemaining()).toBe(0);           // the step was honestly ledgered
    expect(s.ledger.entries.at(-1)!.reason).toBe('move');

    // Backing out resolves the draft → NOW the day ends, gently.
    store.getState().cancelDraft();
    await flush();
    const after = store.getState();
    expect(after.day!.phase).toBe('dusk');
    expect(after.chronicles.dayRecords.at(-1)!.cause).toBe('steps-exhausted');
  });

  it('with steps to spare, resolving a draft does not end the day', async () => {
    const store = exploringStore();
    const target = draftTargets(store.getState().manor!)[0]!;
    store.getState().openDraft(target.dir);
    await flush();
    expect(store.getState().draftOffer).not.toBeNull();
    store.getState().cancelDraft();
    await flush();
    expect(store.getState().day!.phase).toBe('exploring'); // 39 steps remain
  });
});

describe('dusk on room exit, never inside (AAA 4.12, store level)', () => {
  it('a mid-room overdraft lets the puzzle finish; dusk fires on exit', async () => {
    const store = exploringStore();
    const day1 = store.getState().day!;
    store.setState({
      day: { ...day1, activeRoom: { cellKey: '2,1', kind: 'hive', puzzleId: 'p', tier: 1 } },
    });
    // Drain the whole budget inside the room (mistakes): no dusk yet.
    store.getState().applyStepEntry({ reason: 'mistake', delta: -45, at: 0, roomKey: '2,1' });
    await flush();
    expect(store.getState().day!.phase).toBe('exploring');
    // Leaving the room with the ledger dry → the day ends out on the floor.
    store.getState().leaveRoom();
    await flush();
    expect(store.getState().day!.phase).toBe('dusk');
  });

  it('an overdraft earned back in-room does not end the day on exit', async () => {
    const store = exploringStore();
    const day1 = store.getState().day!;
    store.setState({
      day: { ...day1, activeRoom: { cellKey: '2,1', kind: 'hive', puzzleId: 'p', tier: 1 } },
      ledger: { budget: 2, entries: [] },
    });
    store.getState().applyStepEntry({ reason: 'mistake', delta: -3, at: 0, roomKey: '2,1' });
    store.getState().applyStepEntry({ reason: 'solve', delta: 6, at: 0, roomKey: '2,1' });
    store.getState().leaveRoom();
    await flush();
    expect(store.getState().day!.phase).toBe('exploring');
  });
});

describe('the gift is a priced action through the audited ledger (AAA 4.9)', () => {
  it('giveGift ledgers a −1 gift entry (STEP_TABLE.gift) alongside the affinity', async () => {
    const store = exploringStore();
    store.getState().giveGift('bramble');
    const s = store.getState();
    const gift = s.ledger.entries.find((e) => e.reason === 'gift');
    expect(gift).toBeDefined();
    expect(gift!.delta).toBe(-1);
    expect(s.stepsRemaining()).toBe(STEP_TABLE.dayStart + FIRST_MORNING_POT - 1);
    // Day 1's morning arc grants nothing yet, so the gift is the whole of it.
    expect(s.affinities.bramble).toBe(teaArcPoints(1) + 1);
    expect(s.giftedToday).toContain('bramble');
    await flush();
    expect(store.getState().day!.phase).toBe('exploring');
  });

  it('the once-per-day valve never double-charges', () => {
    const store = exploringStore();
    store.getState().giveGift('bramble');
    store.getState().giveGift('bramble');
    const gifts = store.getState().ledger.entries.filter((e) => e.reason === 'gift');
    expect(gifts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ROUND-5 AUDIT — the live paths behind the campaign model
// ---------------------------------------------------------------------------

/** Standing in a room on 0-based `row`, column 1 (clear of the Sanctum stack). */
const atRow = (row: number) => {
  const store = exploringStore();
  const manor = store.getState().manor!;
  const landing: PlacedRoom = {
    cardId: 'gallery', cell: { col: 1, row }, doors: ['N', 'S'],
    solved: true, kind: 'twistle',
  };
  store.setState({
    manor: { ...manor, rooms: { ...manor.rooms, [`1,${row}`]: landing },
      playerCell: { col: 1, row } },
    currencies: { gems: 0, keys: 4, bookmarks: 0 },   // keys so no padlock refuses
    ledger: { budget: 40, entries: [] },
  });
  return store;
};

describe('backing out of a draft costs the LOCAL rate, not a storey (AAA 4.6)', () => {
  it('opening and cancelling at an upper door costs exactly -moveAt(her row)', () => {
    // The finding: `openDraft` ledgered the move at the TARGET cell's rate
    // before the offer even opened, while she never left her cell — so a
    // declined look at a row-6 door burned 5 of an 18-step budget, 28% of the
    // day, and the modal's "Step back" promised the opposite.
    for (const row of [0, 3, 5]) {
      const store = atRow(row);
      const before = store.getState().stepsRemaining();
      store.getState().openDraft('N');
      expect(store.getState().draftOffer).not.toBeNull();
      store.getState().cancelDraft();
      const spent = before - store.getState().stepsRemaining();
      expect(spent).toBe(-moveAt(row));
    }
  });

  it('still charges the full storey when she actually climbs it', () => {
    // The totals the pinned simulation targets depend on are unchanged: the
    // door-step plus the climb differential equal one move into the new row.
    for (const row of [0, 3, 5]) {
      const store = atRow(row);
      const before = store.getState().stepsRemaining();
      store.getState().openDraft('N');
      const card = store.getState().draftOffer!.cards[0]!;
      store.getState().chooseDraftCard(card.id);
      const moves = store.getState().ledger.entries.filter((e) => e.reason === 'move');
      expect(moves.reduce((s, e) => s + e.delta, 0)).toBe(moveAt(row + 1));
      // …and the room really was placed a storey up.
      expect(store.getState().manor!.rooms[`1,${row + 1}`]).toBeDefined();
      expect(before - store.getState().stepsRemaining()).toBeGreaterThan(0);
    }
  });

  it('never refunds a walk back downstairs', () => {
    const store = atRow(4);
    store.getState().openDraft('S');
    const card = store.getState().draftOffer!.cards[0]!;
    store.getState().chooseDraftCard(card.id);
    for (const e of store.getState().ledger.entries) {
      if (e.reason === 'move') expect(e.delta).toBeLessThanOrEqual(0);
    }
  });
});

describe("the tea arc has a live source: shared mornings (AAA 4.10d / 5.9)", () => {
  it('warms Bramble every other morning, without spending a bookmark', () => {
    const store = makeStore();
    const seen: number[] = [];
    for (let d = 1; d <= 12; d++) {
      store.getState().startDay();
      seen.push(store.getState().affinities.bramble);
      store.getState().advanceDayPhase();      // → exploring
      store.getState().endDay('retired-early');
      store.getState().advanceDayPhase();      // dusk → night
    }
    expect(seen).toEqual(Array.from({ length: 12 }, (_, i) => teaArcPoints(i + 1)));
    expect(seen.at(-1)).toBe(TEA_ARC.maxPoints);
    // The gift currency is untouched: the arc costs mornings, not bookmarks.
    expect(store.getState().currencies.bookmarks)
      .toBe(makeStore().getState().currencies.bookmarks);
  });

  it('is a FLOOR, never a clobber: gifted points are kept', () => {
    const store = makeStore();
    store.getState().startDay();
    store.setState({ affinities: { ...store.getState().affinities, bramble: 9 } });
    store.getState().advanceDayPhase();
    store.getState().endDay('retired-early');
    store.getState().advanceDayPhase();
    store.getState().startDay();
    expect(store.getState().affinities.bramble).toBe(9);
  });

  it('pours the pot BEFORE the day is played, through the audited ledger', () => {
    const store = makeStore();
    store.getState().startDay();
    const tea = store.getState().ledger.entries.filter((e) => e.reason === 'tea');
    expect(tea).toHaveLength(1);
    expect(tea[0]!.delta).toBe(FIRST_MORNING_POT);
    expect(store.getState().stepsRemaining()).toBe(STEP_TABLE.dayStart + FIRST_MORNING_POT);
  });
});

describe('something keeps overnight (AAA 4.11 — the cross-day investment)', () => {
  const [stepCard] = Object.entries(CARRY_OVER_EFFECTS).find(([, e]) => (e.steps ?? 0) > 0)!;
  const [keyCard] = Object.entries(CARRY_OVER_EFFECTS).find(([, e]) => (e.keys ?? 0) > 0)!;

  /** Draft `cardId` on day 1, then roll to day 2's dawn. */
  const overnight = (cardId: string) => {
    const store = exploringStore();
    store.getState().recordEvent({
      type: 'room-drafted', cellKey: '2,1', cardId, category: 'utility',
    });
    store.getState().endDay('retired-early');
    store.getState().advanceDayPhase();       // dusk → night
    store.getState().startDay();
    ensureManor();
    return store;
  };

  /** Day 2's morning steps that are NOT the carry-over: Bramble's tea alone. */
  const baselineTea = () => teaBonus(teaArcPoints(2));
  const teaTotal = (store: ReturnType<typeof makeStore>) =>
    store.getState().ledger.entries
      .filter((e) => e.reason === 'tea')
      .reduce((s, e) => s + e.delta, 0);

  it("pays yesterday's steeping into this morning's ledger", () => {
    const carried = carryOverFrom([stepCard]);
    expect(carried.steps).toBeGreaterThan(0);
    expect(teaTotal(overnight(stepCard))).toBe(baselineTea() + carried.steps);
  });

  it('leaves a key on the sill for a climb prepared the day before', () => {
    const carried = carryOverFrom([keyCard]);
    expect(carried.keys).toBeGreaterThan(0);
    expect(overnight(keyCard).getState().currencies.keys).toBe(carried.keys);
  });

  it('pays nothing when nothing was set up', () => {
    const store = overnight('library');
    expect(teaTotal(store)).toBe(baselineTea());
    expect(store.getState().currencies.keys).toBe(0);
  });

  it('does not keep paying out forever: the promise is for ONE morning', () => {
    const store = overnight(stepCard);
    store.getState().advanceDayPhase();      // → exploring, day 2
    store.getState().endDay('retired-early');
    store.getState().advanceDayPhase();      // dusk → night
    const before = teaTotal(store);
    store.getState().startDay();             // day 3: yesterday set nothing up
    expect(teaTotal(store)).toBe(teaBonus(teaArcPoints(3)));
    expect(before).toBeGreaterThan(0);
  });
});
