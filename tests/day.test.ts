import { describe, expect, it } from 'vitest';
import {
  beginDay, buildDayRecord, canAdvancePhase, canEndDay, daySeedFor, pruneEventsAtDusk,
  shouldTriggerDusk, DAY_FLOW, DUSK_FADE_MS,
} from '../src/engine/day';
import { appendEntry, createLedger } from '../src/engine/economy/steps';
import type { DayState, StepLedger } from '../src/engine/types';
import type { RecordedEvent } from '../src/engine/events';

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
    expect(begun!.ledger.budget).toBe(40);
    expect(begun!.teaSteps).toBe(0);
  });

  it('rolls to the next morning only from night', () => {
    expect(beginDay(day({ phase: 'exploring' }), { brambleAffinity: 0, entropy: 1 })).toBeNull();
    expect(beginDay(day({ phase: 'dusk' }), { brambleAffinity: 0, entropy: 1 })).toBeNull();
    const begun = beginDay(day({ phase: 'night', day: 7 }), { brambleAffinity: 2, entropy: 1 });
    expect(begun!.day.day).toBe(8);
    expect(begun!.teaSteps).toBe(6);
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
    });
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
