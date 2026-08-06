/**
 * Day slice — OWNER: A2 (Economy/Day). Interface frozen by the architect;
 * A2 implements the bodies against engine/day.ts + engine/economy/steps.ts.
 *
 * Holds the day FSM state, the step ledger, and the event stream. Every step
 * delta flows through the ledger (AAA 4.9); no other slice writes steps.
 *
 * A2 ADDITIVE MEMBER (consumed only by ui/chrome/*): `advanceDayPhase()` —
 * steps the cosmetic phase edges (morning→exploring after the morning beat;
 * dusk→night after the fade). The exploring→dusk edge is NOT steppable here:
 * it always goes through `endDay(cause)` so the banking cannot be skipped.
 */

import type { StateCreator } from 'zustand';
import type { DayState, StepEntry, StepLedger } from '../../engine/types';
import type { DayEndCause, GameEvent, GameEventType, RecordedEvent } from '../../engine/events';
import type { ManorStore } from '../store';
import type { SaveV2 } from '../save';
import {
  beginDay, buildDayRecord, canAdvancePhase, canEndDay, pruneEventsAtDusk, shouldTriggerDusk,
} from '../../engine/day';
import { appendEntry, stepsRemaining as remaining } from '../../engine/economy/steps';

export interface DaySlice {
  day: DayState | null;
  ledger: StepLedger;
  recentEvents: RecordedEvent[];
  counters: Partial<Record<GameEventType, number>>;

  /** morning: Bramble scene, budget = 40 + affinity bonus (engine/day.ts). */
  startDay(): void;
  /** dusk → night → bank meta, reset manor. Never fires inside an active puzzle. */
  endDay(cause: DayEndCause): void;
  /** Append a step delta through the single audited ledger (engine/economy). */
  applyStepEntry(entry: StepEntry): void;
  /** Append to the event spine: day-stamps it, bumps the lifetime counter. */
  recordEvent(event: GameEvent): void;
  stepsRemaining(): number;

  /** A2 additive (chrome-only): morning→exploring and dusk→night edges. */
  advanceDayPhase(): void;
}

export const createDaySlice =
  (initial: SaveV2): StateCreator<ManorStore, [], [], DaySlice> =>
  (set, get) => ({
    day: initial.day,
    ledger: initial.ledger,
    recentEvents: initial.events.recent,
    counters: initial.events.counters,

    startDay: () => {
      const begun = beginDay(get().day, {
        brambleAffinity: get().affinities.bramble,
        entropy: (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) | 0,
      });
      if (!begun) return; // mid-day: a day is already underway
      set({ day: begun.day, ledger: begun.ledger });
      get().recordEvent({ type: 'day-started', day: begun.day.day });
      if (begun.teaSteps > 0) {
        // Through the audited path so the morning tea renders as a floating +N.
        get().applyStepEntry({ reason: 'tea', delta: begun.teaSteps, at: Date.now() });
      }
      // The manor grid itself is rebuilt by A1 (manor slice) when it observes
      // manor === null with a fresh day.daySeed — see integration notes.
    },

    endDay: (cause) => {
      const day = get().day;
      if (!canEndDay(day)) return; // no day, already ended, or inside a puzzle
      const at = Date.now();
      // Record first so the spine's lifetime counter includes it, then bank.
      get().recordEvent({ type: 'day-ended', day: day.day, cause });
      const s = get();
      s.appendDayRecord(buildDayRecord(day, s.ledger, s.recentEvents, cause, at));
      set({
        // Dusk begins; chrome fades ≤4s then advances dusk → night (AAA 4.12).
        day: { ...day, phase: 'dusk', activeRoom: null },
        // Nightly resets (MANOR_DESIGN §9): manor layout, gems, keys. The
        // journal/volume/affinities/cabinet persist forever, untouched here.
        manor: null,
        currencies: { gems: 0, keys: 0 },
        // Pacing valves re-open for tomorrow (AAA 5.9).
        talkedToday: [],
        giftedToday: [],
        // Recent events clear at dusk; yesterday's day-ended survives so the
        // morning recap can react to the cause (AAA 5.2). Counters persist.
        recentEvents: pruneEventsAtDusk(s.recentEvents, day.day),
      });
    },

    applyStepEntry: (entry) => {
      set((s) => ({ ledger: appendEntry(s.ledger, entry) }));
      // Steps just hit 0 out on the blueprint → gentle dusk, never mid-puzzle
      // (mid-puzzle entries carry an activeRoom, so the predicate is false).
      const s = get();
      if (shouldTriggerDusk(s.day, s.ledger)) s.endDay('steps-exhausted');
    },

    recordEvent: (event) => {
      const day = get().day?.day ?? get().volume.day;
      set((s) => ({
        recentEvents: [...s.recentEvents, { day, at: Date.now(), event }],
        counters: { ...s.counters, [event.type]: (s.counters[event.type] ?? 0) + 1 },
      }));
    },

    stepsRemaining: () => remaining(get().ledger),

    advanceDayPhase: () => {
      const day = get().day;
      if (!day) return;
      // Only the cosmetic edges; exploring→dusk must go through endDay.
      const to = day.phase === 'morning' ? 'exploring' : day.phase === 'dusk' ? 'night' : null;
      if (!to || !canAdvancePhase(day.phase, to)) return;
      set({ day: { ...day, phase: to } });
    },
  });
