import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import {
  beginDay, buildDayRecord, canAdvancePhase, canEndDay, daySeedFor, highestRowLine,
  nightTallyRows, pruneEventsAtDusk, shouldTriggerDusk, DAY_FLOW, DUSK_FADE_MS,
  NIGHT_TALLY_LABELS, NIGHT_TALLY_NOTE,
} from '../src/engine/day';
import {
  appendEntry, climbKey, createLedger, moveAt, rowName, teaArcFloor, teaArcPoints, teaBonus,
  teaDawnPour, teaLandingPour,
  FIRST_MORNING_POT, STEP_TABLE, TEA_ARC, TEA_POUR,
} from '../src/engine/economy/steps';
import { CARRY_OVER_EFFECTS, carryOverFrom } from '../src/engine/manor/deck';
import type { DayState, DraftOffer, PlacedRoom, StepLedger } from '../src/engine/types';
import type { RecordedEvent } from '../src/engine/events';
import {
  atSanctumDoor, atSpeakingTube, draftTargets, SANCTUM_LANDING_MID, SANCTUM_LANDING_MID_KEY,
} from '../src/engine/manor/grid';
import { sanctumAnswered } from '../src/engine/manor/tube';
import { ENTRANCE_CELL } from '../src/engine/types';
import { getVolumeContent } from '../src/app/content/volumes';
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
    // round 36: 18 → 22; round 42: 22 → 12 MOVES, the owner's own number
    // (docs/THE_CLIMB §1b). See BASE_DAY_BUDGET.
    expect(begun!.ledger.budget).toBe(12);
    expect(begun!.teaSteps).toBe(0);          // day 1: they have only just met
    // …but the FIRST morning gets a scripted welcome pot, or the very first
    // evening runs under the 10–15 minute floor (AAA 4.10b, round-5 audit).
    expect(begun!.potSteps).toBe(FIRST_MORNING_POT);
  });

  it('pours the welcome pot once, on day 1 only', () => {
    const later = beginDay(day({ phase: 'night', day: 4 }), { brambleAffinity: 2, entropy: 1 });
    expect(later!.potSteps).toBe(0);
    // ROUND 23 (`TEA_POUR`): what dawn hands her is the CUP; the rest of the
    // pot is carried up to the second landing by the manor slice.
    expect(later!.teaSteps).toBe(teaDawnPour(2));
    expect(later!.teaSteps + teaLandingPour(2)).toBe(teaBonus(2));
  });

  it('rolls to the next morning only from night', () => {
    expect(beginDay(day({ phase: 'exploring' }), { brambleAffinity: 0, entropy: 1 })).toBeNull();
    expect(beginDay(day({ phase: 'dusk' }), { brambleAffinity: 0, entropy: 1 })).toBeNull();
    const begun = beginDay(day({ phase: 'night', day: 7 }), { brambleAffinity: 2, entropy: 1 });
    expect(begun!.day.day).toBe(8);
    expect(begun!.teaSteps).toBe(teaDawnPour(2));
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
      stepsGivenBack: 6,
      highestRow: 0,
      // ROUND 20 (REVIEW_AA §5.7): the day record also keeps what she made of
      // each wing. No manor was handed in here, so the papers learn nothing —
      // and an empty object rather than `undefined` is the point: a day was
      // recorded, and it argued for nothing.
      wings: {},
    });
  });

  it('records the CLIMB — the thing the retune is about (round-5 audit)', () => {
    // `stepsRefunded()` was documented "for the night digest" and had zero
    // callers, and nothing recorded how high she got, so the first night of
    // the game closed on a scoreboard of zeros.
    const d = day({ day: 2 });
    let l = createLedger();
    // ROUND 45: stamped like the day slice stamps it, so this fixture's dawn is
    // the game's dawn — the cup is part of the STARTING FIGURE, and the digest
    // must not print it again as something the day gave back.
    l = appendEntry(l, { reason: 'tea', delta: 4, at: 0, roomKey: TEA_POUR.dawnKey });
    l = appendEntry(l, { reason: 'move', delta: 0, at: 0, roomKey: '2,1' });
    l = appendEntry(l, { reason: 'move', delta: 0, at: 0, roomKey: climbKey('2,1', '2,3') });
    l = appendEntry(l, { reason: 'solve', delta: 6, at: 0, roomKey: '2,3' });
    l = appendEntry(l, { reason: 'move', delta: 0, at: 0, roomKey: '2,1' });   // walked back
    const record = buildDayRecord(d, l, [], 'steps-exhausted', 1);
    expect(record.highestRow).toBe(3);
    // 6 from the solve — and NOT the 4 of morning tea, which the candle already
    // showed her before she walked out (round 45; it read 10 for sixteen
    // rounds, and three blind testers did the sum and caught it).
    expect(record.stepsGivenBack).toBe(6);
    expect(highestRowLine(record)).toContain(rowName(3));
    // COMPREHENSION fix 10: the refund is a ROW among the other rows now, in
    // the same type and the same column, and the prose above it is the climb
    // alone. Three blind testers read "The manor gave back +10." as a payout
    // and went hunting for the ten; nothing in this digest is a purse.
    expect(nightTallyRows(record, 0)).toContainEqual(['Steps given back', 6]);
    expect(NIGHT_TALLY_NOTE).toMatch(/carries to tomorrow/);
    expect(NIGHT_TALLY_LABELS).toContain('Steps given back');
  });

  it('says nothing rather than printing a zero (the cozy pillar)', () => {
    const quiet = buildDayRecord(day({ day: 1 }), createLedger(), [], 'retired-early', 1);
    expect(quiet.highestRow).toBe(0);
    expect(quiet.stepsGivenBack).toBe(0);
    expect(highestRowLine(quiet)).toBeNull();
    // Every zero row is suppressed rather than printed — including the refund
    // now that it has a row of its own.
    expect(nightTallyRows(quiet, 0)).toEqual([]);
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

describe('THE SECOND GATE: the word is spoken at the door (AAA 4.10e, round 7)', () => {
  /** The answer to the shipped Volume 1, straight off the authored content. */
  const answerFor = (store: ReturnType<typeof makeStore>) =>
    getVolumeContent(store.getState().volume.volumeId)!.answer;

  /**
   * ROUND 19 — WHAT THIS TEST MEASURES CHANGED, BECAUSE THE REVIEW CHANGED IT.
   *
   * It used to assert that a word spoken from the Entrance Hall was refused
   * outright — the round-7 fix for "a fresh save could win on day 1 from the
   * ground floor with 21 untouched steps". REVIEW_AA §5.2 asks for the exact
   * opposite ("the Sanctum door is addressable from the Entrance Hall every
   * day, at zero or near-zero step cost… being turned away is content, being
   * unable to walk over is not"), and round 17 built the speaking tube to
   * answer it. So the ground floor is now a MOUTH.
   *
   * The gate round 7 was really protecting is untouched and asserted below it:
   * saying the word is not winning the volume. The ceremony is at the top of
   * the house, the volume stays open, and the climb is still owed — what she
   * buys by speaking is the Portrait's reaction on day 1 and a house that
   * stops padlocking the way up.
   */
  it('hears the word from the Entrance Hall — but does not hand her the volume', () => {
    const store = exploringStore();
    const manor = store.getState().manor!;
    expect(manor.playerCell).toEqual(ENTRANCE_CELL);   // she has not climbed
    expect(atSanctumDoor(manor)).toBe(false);
    expect(atSpeakingTube(manor)).toBe(true);
    const stepsBefore = store.getState().stepsRemaining();

    store.getState().guessAtSanctum(answerFor(store));

    // Heard: journaled, and the day's one word is spent.
    expect(store.getState().volume.guesses).toHaveLength(1);
    // The house knows she has it…
    expect(sanctumAnswered(store.getState().volume.volumeId, store.getState().flags)).toBe(true);
    // …and the volume is still open, because the ceremony is upstairs.
    expect(store.getState().volume.status).toBe('active');
    // Free, as it always was (`SANCTUM_GUESS_COST` is 0).
    expect(store.getState().stepsRemaining()).toBe(stepsBefore);
  });

  it('refuses a word from a room that is neither the door nor the tube', () => {
    // The tube is a PLACE too — the brass hangs in the Entrance Hall, not in
    // her pocket. One step off it and the house cannot hear her.
    const store = exploringStore();
    const manor = store.getState().manor!;
    const elsewhere = { col: ENTRANCE_CELL.col, row: ENTRANCE_CELL.row + 1 };
    store.setState({ manor: { ...manor, playerCell: elsewhere } });
    const stepsBefore = store.getState().stepsRemaining();

    store.getState().guessAtSanctum(answerFor(store));

    expect(store.getState().volume.status).not.toBe('solved');
    expect(store.getState().volume.guesses).toHaveLength(0);   // not even the daily guess
    expect(sanctumAnswered(store.getState().volume.volumeId, store.getState().flags)).toBe(false);
    expect(store.getState().stepsRemaining()).toBe(stepsBefore);
  });

  it('refuses it from the landing when the room drew no north door', () => {
    // Arriving on the storey is not arriving at the door: the landing room has
    // to have drawn the opening that matches the Sanctum's sealed one.
    const store = exploringStore();
    const manor = store.getState().manor!;
    const blind: PlacedRoom = {
      cardId: 'test-room', cell: SANCTUM_LANDING_MID, doors: ['S'], solved: true, kind: 'parlor',
    };
    store.setState({
      manor: {
        ...manor,
        rooms: { ...manor.rooms, [SANCTUM_LANDING_MID_KEY]: blind },
        playerCell: { ...SANCTUM_LANDING_MID },
      },
    });
    expect(atSanctumDoor(store.getState().manor)).toBe(false);
    store.getState().guessAtSanctum(answerFor(store));
    expect(store.getState().volume.status).not.toBe('solved');
    expect(store.getState().volume.guesses).toHaveLength(0);
  });

  it('hears it when she is standing at the door', () => {
    const store = exploringStore();
    const manor = store.getState().manor!;
    const landing: PlacedRoom = {
      cardId: 'test-room', cell: SANCTUM_LANDING_MID, doors: ['N', 'S'], solved: true, kind: 'parlor',
    };
    store.setState({
      manor: {
        ...manor,
        rooms: { ...manor.rooms, [SANCTUM_LANDING_MID_KEY]: landing },
        playerCell: { ...SANCTUM_LANDING_MID },
      },
    });
    expect(atSanctumDoor(store.getState().manor)).toBe(true);
    store.getState().guessAtSanctum(answerFor(store));
    expect(store.getState().volume.status).toBe('solved');
  });

  it('spends only the daily guess on a wrong word, and only at the door', () => {
    const store = exploringStore();
    const manor = store.getState().manor!;
    store.setState({
      manor: {
        ...manor,
        rooms: {
          ...manor.rooms,
          [SANCTUM_LANDING_MID_KEY]: {
            cardId: 'test-room', cell: SANCTUM_LANDING_MID, doors: ['N', 'S'],
            solved: true, kind: 'parlor',
          },
        },
        playerCell: { ...SANCTUM_LANDING_MID },
      },
    });
    const stepsBefore = store.getState().stepsRemaining();
    store.getState().guessAtSanctum('NOTTHEWORD');
    expect(store.getState().volume.guesses).toHaveLength(1);
    expect(store.getState().volume.status).not.toBe('solved');
    expect(store.getState().stepsRemaining()).toBe(stepsBefore);   // free, forever
  });
});

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

/**
 * Standing in a room on 0-based `row`, column 0 — clear of the Sanctum, which
 * since round 37 fills (1,6), (2,6) and (3,6). It used to be column 1, and at
 * row 5 that now opens north onto the sealed chamber: there is no draft there
 * at all, which is the whole point of the change and not what this test is
 * about.
 */
const atRow = (row: number) => {
  const store = exploringStore();
  const manor = store.getState().manor!;
  const landing: PlacedRoom = {
    cardId: 'gallery', cell: { col: 0, row }, doors: ['N', 'S'],
    solved: true, kind: 'twistle',
  };
  store.setState({
    manor: { ...manor, rooms: { ...manor.rooms, [`0,${row}`]: landing },
      playerCell: { col: 0, row } },
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
      expect(store.getState().manor!.rooms[`0,${row + 1}`]).toBeDefined();
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
  /** Play `days` days; `sitDown` decides whether she takes her tea that day. */
  const mornings = (days: number, sitDown: (day: number) => boolean) => {
    const store = makeStore();
    const seen: number[] = [];
    for (let d = 1; d <= days; d++) {
      store.getState().startDay();
      if (sitDown(d)) store.getState().shareMorningTea();   // the scene closed
      seen.push(store.getState().affinities.bramble);
      store.getState().advanceDayPhase();      // → exploring
      store.getState().endDay('retired-early');
      store.getState().advanceDayPhase();      // dusk → night
    }
    return { store, seen };
  };

  it('warms Bramble every other morning she actually sits down for', () => {
    const { store, seen } = mornings(12, () => true);
    expect(seen).toEqual(Array.from({ length: 12 }, (_, i) => teaArcPoints(i + 1)));
    expect(seen.at(-1)).toBe(TEA_ARC.maxPoints);
    // The gift currency is untouched: the arc costs mornings, not bookmarks.
    expect(store.getState().currencies.bookmarks)
      .toBe(makeStore().getState().currencies.bookmarks);
  });

  it('is BOUGHT, not clocked: a skipped morning leaves her a rung behind', () => {
    // ROUND-7 FINDING. `startDay` used to apply `max(known, teaArcPoints(day))`
    // on the calendar alone, so the game's only meta-progression was a day
    // counter wearing a friendship's clothes — the player had no agency in the
    // one arc that decides when the Sanctum becomes affordable.
    const shared = mornings(12, () => true).seen;
    const skipped = mornings(12, () => false).seen;
    expect(skipped).not.toEqual(shared);
    for (let d = 1; d <= 12; d++) {
      // Never missable, only slower: the unconditional dawn floor still warms
      // her, one rung behind the player who turns up (AAA 5.5).
      expect(skipped[d - 1]).toBe(teaArcFloor(d));
      expect(skipped[d - 1]!).toBeLessThanOrEqual(shared[d - 1]!);
    }
    expect(skipped.at(-1)!).toBeLessThan(shared.at(-1)!);
    // And she can start turning up again: the floor is a floor, not a cap.
    const late = mornings(12, (d) => d > 6).seen;
    expect(late.at(-1)!).toBeGreaterThan(skipped.at(-1)!);
  });

  it('never loses a rung to the split pour — the pot she earned is all there', () => {
    // ROUND 23 (`TEA_POUR`, REVIEW_AA §5.10). The dawn pot is poured before the
    // scene and the shared morning's rung is added AS THE SCENE CLOSES, through
    // the audited ledger. What changed is WHERE the rung is drinkable: the cup
    // at the door is capped at `TEA_POUR.dawnCup`, so past the first rung the
    // increase is waiting on the second landing instead of floating at dawn
    // (the dawn card itemises both lines — ui/chrome/DayTransitions.tsx).
    //
    // The invariant this test exists for is the one that must never break: a
    // rung she earned is never LOST, only relocated. Cup + landing pour is
    // exactly `teaBonus` of her new warmth, on the same morning she bought it.
    const store = makeStore();
    for (let d = 1; d < 4; d++) {           // roll to day 4: a rung morning
      store.getState().startDay();
      store.getState().shareMorningTea();
      store.getState().advanceDayPhase();
      store.getState().endDay('retired-early');
      store.getState().advanceDayPhase();
    }
    store.getState().startDay();
    const before = store.getState().ledger.entries.filter((e) => e.reason === 'tea');
    const known = store.getState().affinities.bramble;
    store.getState().shareMorningTea();
    const after = store.getState().ledger.entries.filter((e) => e.reason === 'tea');
    const warmed = known + 1;
    expect(store.getState().affinities.bramble).toBe(warmed);
    // The cup only grows while it has room; past that the rung goes upstairs.
    const dawnDelta = teaDawnPour(warmed) - teaDawnPour(known);
    expect(after.length).toBe(before.length + (dawnDelta > 0 ? 1 : 0));
    if (dawnDelta > 0) expect(after.at(-1)!.delta).toBe(dawnDelta);
    // NOTHING IS LOST. The day's dawn pot plus what waits on the landing is
    // exactly the pot her warmth entitles her to — the same number the whole
    // campaign arc was ever calibrated on (AAA 4.10d).
    const dawn = after.reduce((s, e) => s + e.delta, 0);
    expect(dawn).toBe(teaDawnPour(teaArcPoints(4)));
    expect(dawn + teaLandingPour(warmed)).toBe(teaBonus(warmed));
    expect(teaBonus(warmed)).toBeGreaterThan(teaBonus(known));
  });

  it('never lifts her past the mornings she has actually had', () => {
    const store = makeStore();
    store.getState().startDay();                 // day 1: the ceiling is 0
    store.getState().shareMorningTea();
    store.getState().shareMorningTea();          // and again, and again
    store.getState().shareMorningTea();
    expect(store.getState().affinities.bramble).toBe(teaArcPoints(1));
    // Not during any other phase, either.
    store.getState().advanceDayPhase();
    store.getState().shareMorningTea();
    expect(store.getState().affinities.bramble).toBe(teaArcPoints(1));
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

  /** Day 2's morning steps that are NOT the carry-over: Bramble's tea alone.
   *  `overnight` never plays the morning scene, so this is the dawn FLOOR. */
  const baselineTea = () => teaBonus(teaArcFloor(2));
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
    expect(teaTotal(store)).toBe(teaBonus(teaArcFloor(3)));
    expect(before).toBeGreaterThan(0);
  });
});
