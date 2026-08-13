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
import {
  appendEntry, stepsRemaining as remaining, teaArcFloor, teaArcPoints, teaDawnPour,
  STEP_TABLE, TEA_POUR,
} from '../../engine/economy/steps';
import { carryOverFrom } from '../../engine/manor/deck';

export interface DaySlice {
  day: DayState | null;
  ledger: StepLedger;
  recentEvents: RecordedEvent[];
  counters: Partial<Record<GameEventType, number>>;

  /** morning: Bramble scene, budget = STEP_TABLE.dayStart + tea (engine/day.ts). */
  startDay(): void;
  /** dusk → night → bank meta, reset manor. Never fires inside an active puzzle. */
  endDay(cause: DayEndCause): void;
  /**
   * Append a step delta through the single audited ledger (engine/economy).
   * `appendEntry` re-prices every 'move' entry by the row named in its
   * `roomKey` ("col,row"), so per-row movement pricing (`moveAt`) holds for
   * every caller — including ones still passing the deprecated flat
   * `STEP_TABLE.move`. Callers must therefore pass the DESTINATION cell key
   * on a move (AAA 4.9/4.10).
   */
  applyStepEntry(entry: StepEntry): void;
  /** Append to the event spine: day-stamps it, bumps the lifetime counter. */
  recordEvent(event: GameEvent): void;
  stepsRemaining(): number;

  /** A2 additive (chrome-only): morning→exploring and dusk→night edges. */
  advanceDayPhase(): void;

  /**
   * A2 ADDITIVE (called by the chrome's MorningCard when Bramble's morning
   * scene closes) — THE TEA ARC, BOUGHT RATHER THAN CLOCKED (AAA 4.10d).
   *
   * Round-7 defect: `startDay` applied `max(known, teaArcPoints(day))` on the
   * calendar, whether or not she ever sat down with Bramble, so the game's one
   * meta-progression was a day counter wearing a friendship's clothes. The
   * point is now granted HERE — after the shared morning actually played — and
   * the day's pot is topped up to match in the same breath, so the +N lands on
   * the counter on the screen she is standing on rather than silently at dawn
   * (AAA 4.9 / 11.15). A skipped morning falls back to `teaArcFloor`, one rung
   * behind (AAA 5.5: nothing is missable, it is only slower).
   *
   * Idempotent by construction: it never lifts her past today's ceiling.
   */
  shareMorningTea(): void;
}

export const createDaySlice =
  (initial: SaveV2): StateCreator<ManorStore, [], [], DaySlice> =>
  (set, get, api) => {
    /**
     * Dusk is checked one microtask AFTER the state settles, never inside the
     * mutation that emptied the ledger. Why: manor.openDraft appends the −1
     * move entry BEFORE setting draftOffer — a synchronous dusk here would
     * flip the phase mid-call and the already-rolled offer would be discarded,
     * i.e. the player pays her last step and receives nothing (AAA 4.6 +
     * 4.12/R.3 blocker). Deferring lets the offer land; shouldTriggerDusk then
     * treats an open draft like an active room and dusk waits for resolution.
     */
    let duskCheckQueued = false;
    const scheduleDuskCheck = () => {
      if (duskCheckQueued) return;
      duskCheckQueued = true;
      queueMicrotask(() => {
        duskCheckQueued = false;
        const s = get();
        if (shouldTriggerDusk(s.day, s.ledger, s.draftOffer)) s.endDay('steps-exhausted');
      });
    };

    // Draft resolution and room exit live in other slices (manor/room); this
    // subscription is the economy's hook on those edges: an offer resolving
    // (cancel or choose) and an active room closing both re-arm the dusk
    // check, so "dusk fires on exit" (AAA 4.12) holds without cross-slice
    // calls. The scheduled microtask re-reads state, so a choose that enters
    // a puzzle room (activeRoom set in the same tick) correctly suspends it.
    api.subscribe((s, prev) => {
      const draftResolved = prev.draftOffer != null && s.draftOffer == null;
      const roomExited = prev.day?.activeRoom != null && s.day != null && s.day.activeRoom == null;
      if (draftResolved || roomExited) scheduleDuskCheck();
    });

    return {
    day: initial.day,
    ledger: initial.ledger,
    recentEvents: initial.events.recent,
    counters: initial.events.counters,

    startDay: () => {
      const prevDay = get().day;
      if (prevDay && prevDay.phase !== 'night') return; // a day is already underway
      const dayNumber = (prevDay?.day ?? 0) + 1;

      // ── THE LIVE TEA ARC (AAA 4.10d, round-5 audit; round-7 correction). ─
      // Bramble's authored file grants 2 affinity points in its entire
      // lifetime, and TEA_BY_POINTS's full pot wants 6 — so the published day
      // 6–10 curve was verified against warmth the live game could not reach.
      // The arc lives where the arc actually happens: sitting down to tea with
      // her IS the one substantive conversation AAA 5.9 allows per day.
      //
      // ROUND 7: that point is now GRANTED BY THE SHARED MORNING ITSELF
      // (`shareMorningTea`, called when her scene closes), not by the
      // calendar. What survives here is the MERCY FLOOR — the same curve one
      // rung behind (`teaArcFloor`) — so a player who skipped her mornings
      // still warms, later and less. Applied as a floor, before the pot is
      // poured, so it never eats the scarce gift currency, never overwrites
      // points she earned by gifting, never double-counts on a resumed day,
      // and cannot be lost to a dialogue choice (AAA 5.13).
      const known = get().affinities.bramble ?? 0;
      const warmed = Math.max(known, teaArcFloor(dayNumber));

      const begun = beginDay(prevDay, {
        brambleAffinity: warmed,
        entropy: (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) | 0,
      });
      if (!begun) return; // mid-day: a day is already underway

      // What yesterday left steeping (AAA 4.11 cross-day investment). Read off
      // the audited event spine — pruneEventsAtDusk keeps the closing day's
      // events, so yesterday's drafts are still here at dawn — which is why
      // this needs no new save field to lose. Keys are granted by the manor
      // slice when the grid is built; the steps are ledgered here.
      const carried = carryOverFrom(
        get().recentEvents
          .filter((e) => e.day === (prevDay?.day ?? 0) && e.event.type === 'room-drafted')
          .map((e) => (e.event as { cardId: string }).cardId),
      );

      set({ day: begun.day, ledger: begun.ledger });
      get().recordEvent({ type: 'day-started', day: begun.day.day });
      // Banked after the day rolls, so a rank-up event is stamped with THIS
      // morning (the one she shared), not with yesterday.
      if (warmed > known) get().adjustAffinity('bramble', warmed - known);
      // Through the audited path so each morning gift renders as a floating +N
      // (AAA 4.9). Three separate entries, because they are three different
      // stories: her tea, the welcome pot, and what you set up yesterday.
      // ROUND 45: every one of the three is stamped `TEA_POUR.dawnKey`, because
      // all three are inside the number the candle shows her before she takes a
      // single step — and the night digest was counting them a second time
      // under "Steps given back". The stamp is what tells the PURSE from the
      // PAYOUT; see the constant for the whole finding.
      const at = Date.now();
      if (begun.teaSteps > 0) {
        get().applyStepEntry({ reason: 'tea', delta: begun.teaSteps, at, roomKey: TEA_POUR.dawnKey });
      }
      if (begun.potSteps > 0) {
        get().applyStepEntry({ reason: 'tea', delta: begun.potSteps, at, roomKey: TEA_POUR.dawnKey });
      }
      if (carried.steps > 0) {
        get().applyStepEntry({ reason: 'tea', delta: carried.steps, at, roomKey: TEA_POUR.dawnKey });
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
      // The manor is passed BEFORE the reset four lines down: the wings she
      // argued for tonight are the last thing read off the floorplan, and then
      // the floorplan goes (REVIEW_AA §5.7, engine/manor/wings.ts).
      s.appendDayRecord(buildDayRecord(day, s.ledger, s.recentEvents, cause, at, s.manor));
      set({
        // Dusk begins; chrome fades ≤4s then advances dusk → night (AAA 4.12).
        day: { ...day, phase: 'dusk', activeRoom: null },
        // Nightly resets (MANOR_DESIGN §9): manor layout, gems, keys. The
        // journal/volume/affinities/cabinet persist forever, untouched here.
        //
        // ROUND 27 — AND `openLedger` IS UNTOUCHED HERE ON PURPOSE. It is the
        // manor's one deliberate exception to the wipe: an unfinished ledger
        // leaf is fifty-odd separate deductions and it survives the night with
        // the rungs already paid for it (engine/rooms/room-bank.ts). Every
        // OTHER room's in-progress board dies here, because it rides on
        // `manor.rooms[cellKey].session` and the floorplan is going. The
        // exception is narrow, it is one board, and the room says so in its
        // own copy three times over.
        manor: null,
        // Bookmarks persist across nights (gift currency, AAA 5.7).
        currencies: { gems: 0, keys: 0, bookmarks: s.currencies.bookmarks },
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
      // (mid-puzzle entries carry an activeRoom) and never under an open draft
      // offer — the check runs a microtask later so a door opened with the
      // last step still shows its cards (see scheduleDuskCheck above).
      scheduleDuskCheck();
    },

    recordEvent: (event) => {
      const day = get().day?.day ?? get().volume.day;
      set((s) => ({
        recentEvents: [...s.recentEvents, { day, at: Date.now(), event }],
        counters: { ...s.counters, [event.type]: (s.counters[event.type] ?? 0) + 1 },
      }));
      // Priced actions recorded by other slices route their cost HERE so every
      // delta flows through the single audited ledger (AAA 4.9): the dialogue
      // slice records 'gift-given'; the −1 "small walk to find them" ledgers
      // as a 'gift' entry and renders as a floating −1 on the counter.
      if (event.type === 'gift-given') {
        get().applyStepEntry({ reason: 'gift', delta: STEP_TABLE.gift, at: Date.now() });
      }
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

    shareMorningTea: () => {
      const day = get().day;
      if (!day || day.phase !== 'morning') return;
      const known = get().affinities.bramble ?? 0;
      const ceiling = teaArcPoints(day.day);
      if (known >= ceiling) return;    // already as warm as the mornings allow
      // One rung per shared morning: a player catching up after a gap warms a
      // rung a day, never all at once.
      const warmed = known + 1;
      get().adjustAffinity('bramble', 1);
      // …and the pot she is drinking grows to match, through the audited
      // ledger, so the single largest step grant in the game is a visible
      // floating +N at the moment the friendship pays out (AAA 4.9 / 11.15) —
      // rather than a silent dawn entry the StepMeter used to swallow.
      // ROUND 23 (`TEA_POUR`, REVIEW_AA §5.10): what she is handed HERE is the
      // cup — the rest of the warmer pot is carried up to the second landing
      // when she gets there (app/slices/manor.ts). The rung is still granted in
      // full; only the place it is drinkable moved.
      const topUp = teaDawnPour(warmed) - teaDawnPour(known);
      if (topUp > 0) {
        // Poured in the MORNING phase, before she walks out, so it is part of
        // the starting figure exactly like the cup it deepens (round 45).
        get().applyStepEntry({
          reason: 'tea', delta: topUp, at: Date.now(), roomKey: TEA_POUR.dawnKey,
        });
      }
    },
    };
  };
