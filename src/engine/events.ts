/**
 * The event spine (ARCHITECTURE §6).
 *
 * FROZEN CONTRACT (architect-owned). This one stream is what keeps the six
 * parallel systems decoupled: dialogue conditions, achievements, journal
 * cross-refs, and the music director all *read* it; slices *emit* into it via
 * the day slice's `recordEvent`. Day-stamped recent events clear at dusk;
 * per-type lifetime counters persist forever (both live in the save).
 *
 * Agents: request additions from the architect — do not edit. Additive
 * variants are cheap; renames/removals are breaking.
 */

import type { CharacterId, RoomCategory, SolveChannelId, Tier } from './types';
import type { RoomPuzzleKind } from './rooms/room-puzzle';

/** Why the day ended. Never a failure: "the day is over," not a defeat. */
export type DayEndCause = 'steps-exhausted' | 'retired-early' | 'volume-solved';

/** Closeness metadata for the Portrait's sigh variants (AAA 4.17). */
export interface GuessCloseness {
  sharedLetters: number;   // letters shared with the answer
  rightLength: boolean;
  repeat: boolean;         // she has guessed this before
}

export type GameEvent =
  | { type: 'day-started'; day: number }
  | { type: 'day-ended'; day: number; cause: DayEndCause }
  | { type: 'room-drafted'; cellKey: string; cardId: string; category: RoomCategory }
  | { type: 'room-solved'; cellKey: string; kind: RoomPuzzleKind; tier: Tier; perfect: boolean }
  | { type: 'room-abandoned'; cellKey: string; kind: RoomPuzzleKind }
  /** Big in-room moments characters react to (AAA 5.1): pangram, Full Bloom, … */
  | { type: 'room-notable'; kind: RoomPuzzleKind; note: string }
  /**
   * A page became hers. `via` names the SOLVE CHANNEL that paid for it, and is
   * absent for every other faucet (a violet draw, a letter, a testimony scene).
   *
   * ── ROUND 18 DEFECT (verifier): THE VALVE COUNTED THE WRONG FAUCET ─────────
   * `solveChannelFiledToday` used to ask "did a fragment BELONGING to this
   * channel arrive today", which is a question about the page rather than about
   * the tap. That was harmless only while the channel label was welded to the
   * fragment kind. The moment REVIEW_AA §5.1's re-route put lintel-labelled
   * pages into the violet drip, entering a mystery room CONSUMED the lintel
   * channel's daily allowance — so on exactly the days the player drew the good
   * room, solving every word game in the house paid nothing. That is §5.1's
   * finding reintroduced through a side door, and silently. The valve now asks
   * about the tap, which is what it always meant.
   */
  | { type: 'fragment-found'; fragmentId: string; via?: SolveChannelId }
  /**
   * A solve made sealed pages out (round 10's seal; `DECIPHER_YIELD_BY_TIER`
   * sets how many at once, so this is a batch, not one id). `fragment-found`
   * says the page is HERS; this says it finally SPEAKS — they are different
   * beats and a violet room fires the first without the second.
   */
  | { type: 'fragment-made-out'; fragmentIds: readonly string[] }
  | { type: 'fragment-interpreted'; fragmentId: string }
  | { type: 'letter-opened'; letterId: string }
  | { type: 'sanctum-guess-wrong'; guess: string; closeness: GuessCloseness }
  | { type: 'volume-solved'; volumeId: string }
  | { type: 'affinity-rank-up'; character: CharacterId; rank: number }
  | { type: 'gift-given'; character: CharacterId }
  | { type: 'dialogue-seen'; nodeId: string; character: CharacterId }
  | { type: 'dewey-petted' };

export type GameEventType = GameEvent['type'];

/** An event as stored on the stream: day-stamped, wall-clocked. */
export interface RecordedEvent {
  day: number;   // in-game day number
  at: number;    // epoch ms, supplied by the caller (engine stays pure)
  event: GameEvent;
}

// ---------------------------------------------------------------------------
// DialogueQuery — the frozen snapshot dialogue conditions evaluate against
// (ARCHITECTURE §5). A6's selector is a pure function of this + authored JSON.
// ---------------------------------------------------------------------------

export type DialogueTrigger =
  | 'morning' | 'parlor' | 'idle' | 'sanctum-idle' | 'sanctum-after-guess'
  | 'letter' | 'night';

export interface DialogueQuery {
  day: number;
  slot: DialogueTrigger;
  character: CharacterId;
  /** Dialogue node ids seen, forever ("once" nodes drop out of eligibility). */
  seen: ReadonlySet<string>;
  /** Set flags, named per docs/flags.md. Flags are write-once. */
  flags: ReadonlySet<string>;
  affinities: Readonly<Record<CharacterId, number>>;
  /** Lifetime per-event-type counters (persist forever). */
  counters: Readonly<Partial<Record<GameEventType, number>>>;
  /** Day-stamped events, cleared at dusk — powers `withinDays` conditions. */
  recentEvents: readonly RecordedEvent[];
  /** Pacing valves (AAA 5.9): one substantive conversation / gift per day. */
  talkedToday: ReadonlySet<CharacterId>;
  giftedToday: ReadonlySet<CharacterId>;
  /** Mystery context for fragmentCount / volume-gated conditions. */
  volumeId: string;
  fragmentsFound: number;
  /**
   * How many filed fragments she can actually READ (round 10's seal).
   * `fragmentsFound` is what she has been *collecting*; this is what she
   * *knows*. Conditions whose copy claims knowledge ("you have read more of me
   * now than anyone living") hang on this one — see the `fragmentsLegible`
   * condition kind in `engine/dialogue/schema.ts`.
   */
  fragmentsLegible: number;
}
