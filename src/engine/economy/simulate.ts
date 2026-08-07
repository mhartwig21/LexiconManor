/**
 * Economy simulation — OWNER: A2 (Economy/Day). Pure TS, seeded, replayable.
 *
 * AAA 4.10: the step economy is simulation-tested BEFORE any playtest. This
 * module plays abstract days AND abstract multi-week CAMPAIGNS through the
 * REAL ledger + STEP_TABLE, so any tuning change to engine/economy/steps.ts
 * lands here first and tests/economy-simulation.test.ts re-verifies every
 * published target:
 *
 *   (a) a no-refund day (skip every puzzle) tops out low and ends in ~5 min;
 *   (b) a decent day runs 10–15 MINUTES at the median (p90 ≤ 20) — the
 *       criterion the 2026-08 owner playtest said we were missing by half;
 *   (c) a skilled player first REACHES the Sanctum landing around day 6–10 —
 *       never day 1 ("way too easy — I reached the Forgotten Word on my first
 *       day; Blue Prince took me 28 days");
 *   (d) the volume is typically won in 14–28 days of daily play.
 *
 * ═══ What this model does and does not claim ═══
 * Modelled from real code: every step delta (through `STEP_TABLE`/ledger),
 * per-row movement pricing (`moveAt`), locked upper-row doors (`DOOR_LOCKS`),
 * the tea arc (`teaBonus`), and — this is the part the owner playtest proved
 * matters — THE REAL DECK MIX: `deckMixAt` derives per-row category and
 * micro/anchor probabilities from A1's `BASE_DECK` × `categoryWeight` ×
 * `RARITY_WEIGHTS`, with micro/anchor read off the live room-adapter registry.
 * So the post-cull deck (the four micro archetypes retired; only the Darkroom
 * and the Linen Closet remain micro, with the Counting House / sudoku landing
 * anchor-weight) is what the clock is calibrated against, automatically, and
 * a future deck edit that changes the mix breaks these tests instead of the
 * owner's evening.
 *
 * Modelled abstractly (documented estimates, replace with instrumented
 * medians when the 3.5 playtest lands): puzzle durations (`TIME_TABLE`),
 * navigation waste (`pushBias`/`walkbackPerRow`), and the mystery's knowledge
 * curve (`KNOWLEDGE`). A7 owns the real fragment drip; the campaign model
 * here only needs it to be roughly ~1 fragment/day with a pity floor, which
 * is what AAA 4.14 already guarantees.
 *
 * Rows are 1-BASED here: entrance row 1, the SANCTUM LANDING row 6. Engine
 * rows are 0-based; conversions are explicit (`row - 1`) at every boundary.
 *
 * ═══ ROUND-7 CORRECTION — THE MILESTONE WAS A STOREY THE GAME NEVER ASKS FOR
 * ═══
 * `SANCTUM_ROW` was 7 (0-based 6): the Sanctum's OWN cell. That cell is
 * pre-placed and sealed at manor build, it is never drafted, and
 * `walkableNeighbors` only ever offers it as the door the blueprint refuses to
 * render as a walk. The word is spoken from the landing BELOW it — 0-based
 * (2,5), `engine/manor/grid.ts SANCTUM_DOOR_CELL` — so every published number
 * ("first reach day 6–10", "<8% on day 1", "the top is always bought with
 * refunds") was verified against a floor the player is never asked to enter,
 * and the floor she IS asked to reach cost 15 steps bare: under the 18-step
 * base budget. Re-measured at the live landing on the old tables, a skilled
 * player stood at the door on day 1 in 41.5% of campaigns and by day 2 in 74%.
 *
 * The milestone below is now the live landing, and `MOVE_COST_BY_ROW`'s upper
 * rows plus `DOOR_LOCKS.chanceByRow[4..5]` were re-tuned until every 4.10
 * target held for the ascent the player actually pays for.
 *
 * ═══ ROUND-11 CORRECTION — THE MODEL COULD NOT SEE THE SEAL ═══
 * Round 10 made entering a violet room file a SEALED page and made a solve
 * render it legible (engine/volume.ts). This model kept counting violet rooms
 * ENTERED as knowledge, modelled no solve-channel fragments at all, and had
 * no notion of ordering or of an overnight backlog — so AAA 4.10e was
 * verified against rules the game had stopped having, and any retune of the
 * seal would have moved the real horizon with every test still green.
 *
 * `simulateDay` now plays the seal in the order the evening really happens
 * (`pagesMadeOut`, `sealedBacklog`, through the real `decipherYield`),
 * `simulateCampaign` threads the backlog across dawns and counts only
 * made-out pages toward `deductionDay`, and the two strict solve channels are
 * modelled with the stock the volume actually authors. Measuring the seal
 * through the corrected model is also what proved it was not biting: 9.5% of
 * PROFILE_DECENT days contained a violet room at all, because
 * `categoryWeight('mystery', row)` ramped on paper while `RARITY_WEIGHTS[1]`
 * scored tier 1's only two mystery cards 9 and 1. The supply was re-tuned at
 * source (engine/manor/{deck,drafting}.ts) against the REALISED share, and
 * AAA 4.10g publishes the band tests/economy-simulation.test.ts now pins.
 *
 * ═══ ROUND-12 CORRECTION — THE MODEL ONLY EVER PLAYED ONE PLAYER ═══
 * Every campaign target 4.10 publishes was measured on `PROFILE_SKILLED`.
 * `PROFILE_DECENT` — the profile whose own docstring below calls it "the
 * MEDIAN evening, the one 4.10b clocks", i.e. the owner — played thousands of
 * single days here and never once played a campaign, so 4.10d/e/g published
 * unqualified medians nobody had checked for her. Measured when someone
 * finally ran `simulateCampaigns(PROFILE_DECENT, …)`: first landing at median
 * day 18–21 (10–14% never inside 45 days), volume won at median day 33–34,
 * 25% of campaigns unfinished after 45 evenings against a published ">90% by
 * day 35", and a solve made a page out on 0.23 of days against an unqualified
 * ">=1 day in 3".
 *
 * NOTHING IN THIS FILE WAS WRONG — the model played her correctly the whole
 * time; nobody asked it to. The fix is therefore in the test and the doc
 * (`tests/economy-simulation.test.ts` now plays both profiles and AAA 4.10e/g
 * publish both bands), plus one strictly-progressive retune of `TEA_BY_POINTS`
 * at source. The rule this leaves behind: **a profile that is named in a
 * published criterion has to be simulated against that criterion.** If a
 * future arc adds a third archetype, it owes a campaign block the day it is
 * quoted in a number.
 */

import { createRng } from '../rng';
import type { Cell, RoomCard, Tier } from '../types';
import { BASE_DECK, deckFor, isKeyBearing, UTILITY_EFFECTS } from '../manor/deck';
import { categoryWeight, rollCards, RARITY_WEIGHTS } from '../manor/drafting';
import { createManor, rowTier } from '../manor/grid';
import { getRoomAdapter } from '../rooms/registry';
import { decipherYield } from '../volume';
import {
  appendEntry, createLedger, ledgerTotal, stepsRemaining, stepsRefunded, stepsSpent,
  fernMorningKeys, fernPointsOnDay, firstMorningPot, keyAccessFor, moveAt, solveKeys,
  teaArcPoints, teaBonus, DOOR_LOCKS, STEP_TABLE,
} from './steps';
import type { StepLedger } from '../types';

/**
 * THE LIVE MILESTONE, 1-based: the landing the word is spoken from — engine
 * row 5, cell (2,5), `SANCTUM_DOOR_CELL`. Standing here with a north door onto
 * the sealed Sanctum is what "reached the Sanctum" means everywhere in the
 * game; the Sanctum's own row (1-based 7) is not walkable and is not a
 * milestone. Named for the landing so a future reader cannot re-confuse the
 * two (the old name was `SANCTUM_ROW` and it meant row 7).
 */
export const SANCTUM_LANDING_ROW = 6;

/**
 * THE REFILLS THE LIVE DECK CAN ACTUALLY PAY — read off `UTILITY_EFFECTS`
 * (engine/manor/deck.ts), never re-typed.
 *
 * Round-6 audit: the utility beat used to roll `randInt(STEP_TABLE.snack.min,
 * .max)` over a range — then a declared 3..7 — that NOTHING live sampled.
 * Refills are fixed, authored numbers printed on the green cards' own toasts
 * (+6 Kitchen, +5 Larder, +3 Boot Room, +2 Still Room), so AAA 4.10's "scarce
 * refills" was being verified against a distribution the deck cannot produce
 * — its floor was above the Still Room and its ceiling above every card in
 * the game. The model now draws from the shipped payouts themselves, so a
 * deck edit moves the simulated day instead of leaving it stale, and
 * `tests/steps.test.ts` holds `STEP_TABLE.snack` to describing this set.
 */
export const REFILL_PAYOUTS: readonly number[] = Object.values(UTILITY_EFFECTS)
  .map((e) => e.steps ?? 0)
  .filter((n) => n > 0)
  .sort((a, b) => a - b);

export const MOVEMENT = {
  /** Hard cap so a runaway profile terminates. */
  maxRoomsPerDay: 60,
  /**
   * What a PADLOCKED climb actually costs when she has no key, modelled
   * against the live wiring (app/slices/manor.ts `openDraft`): the door
   * refuses free — no step is charged — because the padlock was already drawn
   * on the blueprint and she never walks to a gate she cannot open (AAA 4.6).
   * She drafts laterally instead, at THIS storey's price. The only extra cost
   * is the detour: about half the time the other live door out of the room
   * she is standing in is already spoken for, and she has to walk to another
   * frontier door before she can draft at all.
   */
  lockoutDetourChance: 0.5,
} as const;

// ---------------------------------------------------------------------------
// The deck mix — derived from the REAL deck, not from vibes
// ---------------------------------------------------------------------------

/** What a drafted room turns out to be, from the economy's point of view. */
export type SimRoomKind = 'micro' | 'anchor' | 'utility' | 'parlor' | 'mystery';

export const SIM_ROOM_KINDS: readonly SimRoomKind[] =
  ['micro', 'anchor', 'utility', 'parlor', 'mystery'];

const zeroMix = (): Record<SimRoomKind, number> =>
  ({ micro: 0, anchor: 0, utility: 0, parlor: 0, mystery: 0 });

/**
 * Probability that a card drawn for a door into 0-BASED `row` is of each kind,
 * using A1's live draft weights (`categoryWeight` × `RARITY_WEIGHTS`, filtered
 * by the card's `tierRange` — which is what makes rows 0–2 offer zero tier-3
 * cards, AAA 4.2). Puzzle cards split micro/anchor by their adapter's `size`,
 * so every registered room — including sudoku's Counting House, which is
 * anchor-weight — lands in the right bucket the moment its card exists.
 *
 * Not modelled: gem affordability (AAA 4.1) and anti-repeat suppression
 * (AAA 4.3). Both nudge WHICH card of a kind appears far more than they nudge
 * the kind mix, and both are already property-tested by A1.
 */
export function deckMixAt(
  row0: number,
  deck: readonly RoomCard[] = BASE_DECK,
): Record<SimRoomKind, number> {
  const tier = rowTier(row0);
  const w = zeroMix();
  for (const card of deck) {
    if (card.tierRange[0] > tier || tier > card.tierRange[1]) continue;
    const weight = categoryWeight(card.category, row0) * RARITY_WEIGHTS[tier][card.rarity];
    if (card.category === 'puzzle') {
      const size = (card.puzzleKind && getRoomAdapter(card.puzzleKind)?.size) ?? 'anchor';
      w[size] += weight;
    } else {
      w[card.category] += weight;
    }
  }
  const total = SIM_ROOM_KINDS.reduce((s, k) => s + w[k], 0) || 1;
  for (const k of SIM_ROOM_KINDS) w[k] /= total;
  return w;
}

/** Share of PUZZLE rooms that are micro at this 0-based row (post-cull ≈ 0.2). */
export function microShareAt(row0: number, deck: readonly RoomCard[] = BASE_DECK): number {
  const mix = deckMixAt(row0, deck);
  const puzzle = mix.micro + mix.anchor;
  return puzzle > 0 ? mix.micro / puzzle : 0;
}

/**
 * THE MEASURED LIVE KEY RATE — not a hand-tuned `keyLuck` constant.
 *
 * Round-5 audit: `SimProfile.keyLuck` ramped 0.32 → 0.82 across a campaign
 * with NO live counterpart at all — `categoryWeight`/`RARITY_WEIGHTS` carried
 * no day or affinity term, so key-card frequency was identical on day 1 and
 * day 30. Now that Fern's arc raises key-bearing cards' draft weight
 * (`keyAccessFor` → `DraftRollCtx.keyAccess`), the simulation can simply
 * MEASURE the thing the live game does: roll real offers through `rollCards`
 * on the storeys she banks on, and count how often one carries a key.
 *
 * Memoised per access level: the campaign model calls this once per day and
 * there are only a handful of distinct levels.
 */
const keyRateCache = new Map<string, number>();

export function measuredKeyRate(
  keyAccess: number,
  opts: { rows?: readonly number[]; samples?: number } = {},
): number {
  const rows = opts.rows ?? [0, 1, 2];
  const samples = opts.samples ?? 900;
  const cacheKey = `${keyAccess.toFixed(3)}|${rows.join('-')}|${samples}`;
  const hit = keyRateCache.get(cacheKey);
  if (hit !== undefined) return hit;
  const deck = deckFor([]);
  let offers = 0;
  let withKey = 0;
  for (const row of rows) {
    for (let seed = 0; seed < samples; seed++) {
      const cards = rollCards(deck, createManor(seed), { col: (seed % 5) as Cell['col'], row }, {
        gems: 2, declinedLastDraft: [], drawIndex: 0, keyAccess,
      });
      offers += 1;
      if (cards.some((c) => isKeyBearing(c.id))) withKey += 1;
    }
  }
  const rate = offers > 0 ? withKey / offers : 0;
  keyRateCache.set(cacheKey, rate);
  return rate;
}

/** The live key rate for a player with `fernAffinity` points of friendship. */
export function keyLuckFor(fernAffinity: number): number {
  return measuredKeyRate(keyAccessFor(fernAffinity));
}

function drawKind(rng: () => number, mix: Record<SimRoomKind, number>): SimRoomKind {
  let r = rng();
  for (const k of SIM_ROOM_KINDS) {
    r -= mix[k];
    if (r <= 0) return k;
  }
  return 'anchor';
}

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/**
 * Seconds per player action (AAA 4.10's wall-clock promise). Estimated from
 * the design's own duration bands (30–90s micro / 2–6 min anchor, room module
 * headers) — REPLACE with instrumented medians once 3.5's playtest lands.
 * Sampled from a SEPARATE rng stream so adding or retuning the clock never
 * perturbs the seeded step-economy results the row/campaign targets pin.
 */
export const TIME_TABLE = {
  /** One move tap on the blueprint. */
  moveTap: 2,
  /** Open a door, read three cards, choose or step back. */
  draft: 10,
  /** Step into a puzzle room and decide not to play it today. */
  glance: 6,
  /** A parlor beat: a portrait, a few lines, sometimes a choice. */
  parlorBeat: 40,
  /** A utility beat: a snack, a key, a gem — a toast and out. */
  utilityBeat: 10,
  /** A mystery beat: read the fragment, watch it file itself in the journal. */
  mysteryBeat: 35,
  /** Micro solves: the 30–90s design band. */
  microSolve: [45, 90],
  /** Anchor solves: Hive/Twistle/Web/Study/Counting House run long. */
  anchorSolve: [180, 360],
  /** Attempted but left unsolved for tomorrow (AAA 4.13) — she gives it a go. */
  abandon: [70, 150],
} as const;

const sampleSeconds = (
  range: readonly [number, number] | readonly number[],
  timeRng?: () => number,
): number =>
  timeRng
    ? range[0]! + timeRng() * (range[1]! - range[0]!)
    : (range[0]! + range[1]!) / 2;

// ---------------------------------------------------------------------------
// Player profiles
// ---------------------------------------------------------------------------

export interface SimProfile {
  name: string;
  /** Chance an entered puzzle room is attempted at all (vs walked through). */
  attemptRate: number;
  /** Chance an attempted puzzle is solved. */
  solveRate: number;
  /** Of solves, share with zero costed mistakes (perfect, +2). */
  perfectRate: number;
  /** Costed mistakes on a non-perfect solve: [min, max] inclusive. */
  mistakesSolved: [number, number];
  /** Costed mistakes before leaving an unsolved room for tomorrow: [min, max]. */
  mistakesUnsolved: [number, number];
  /**
   * Navigation intent: chance a given draft is aimed UP a row rather than
   * laterally. 1/pushBias is the old `roomsPerRow` — a sharp player who reads
   * door layouts wastes fewer rooms per storey.
   */
  pushBias: number;
  /** Extra walk-back moves per row of current depth when reaching a frontier door. */
  walkbackPerRow: number;
  /**
   * How much margin over the priced cost of the NEXT storey (`climbStepCost`)
   * she insists on before taking it. 1.0 is a gambler spending her last step
   * on the stairs; 2.0 is a planner who always keeps a way back into a room.
   */
  boldness: number;
  /**
   * How reliably the green card she takes turns out to be a key source when a
   * padlock is between her and the next storey — Fern's trades and the Key
   * Cabinet showing up when she needs them. This is the campaign's SECOND
   * meta arc (see `CAMPAIGN_ARC.keyLuck*`): keys reset nightly, so the only
   * thing that can improve across days is her access to them, and that access
   * is affinity-gated — one conversation a day, AAA 5.9.
   */
  keyLuck: number;
  /** How hard she steers a 3-card offer toward violet rooms. */
  mysteryPull: number;
  /** How hard she steers toward blue puzzle rooms (the game she came for). */
  puzzlePull: number;
  /** Bramble's tea rank for this day (start-of-day refill via teaBonus). */
  brambleAffinity: number;
  /**
   * Steps on the table at dawn BEYOND Bramble's tea: the scripted day-1
   * welcome pot (`firstMorningPot`) and any cross-day investment that paid a
   * step-class grant overnight (the Larder's risen dough — AAA 4.11).
   * Ledgered as a 'tea' entry, exactly as the live day slice does.
   */
  dawnSteps?: number;
  /**
   * Keys on the sill at dawn: Fern's arc (`fernMorningKeys`) plus the Still
   * Room's overnight cordial (AAA 4.11). Keys still reset nightly — this is
   * ACCESS bought by yesterday, never a stockpile.
   */
  dawnKeys?: number;
}

/** No refunds at all: walks the manor and never touches a puzzle (4.10a). */
export const PROFILE_SKIPPER: SimProfile = {
  name: 'skipper',
  attemptRate: 0,
  solveRate: 0,
  perfectRate: 0,
  mistakesSolved: [0, 0],
  mistakesUnsolved: [0, 0],
  pushBias: 0.6,
  walkbackPerRow: 0.6,
  boldness: 1.1,
  keyLuck: 0.3,
  mysteryPull: 3,
  puzzlePull: 3,
  brambleAffinity: 0,
};

/**
 * A decent, competent day — the MEDIAN evening, the one 4.10b clocks.
 *
 * ROUND 12: **also a campaign profile.** For eleven rounds this docstring said
 * "the MEDIAN evening" while nothing ever played her past dusk, so every
 * multi-week number 4.10 published described `PROFILE_SKILLED` and nobody
 * else. `tests/economy-simulation.test.ts` now runs her through
 * `simulateCampaigns` beside him and AAA 4.10e/4.10g publish her band next to
 * his. She is deliberately a *worse climber* than he is — `boldness` 1.3 vs
 * 1.0, `walkbackPerRow` 0.58 vs 0.36, `pushBias` 0.62 vs 0.78 — and that gap is
 * the design, not a bug to tune away: it is why the two bands are separate and
 * why a lever that collapses them breaks 4.10d's <8% day-1 reach instead.
 */
export const PROFILE_DECENT: SimProfile = {
  name: 'decent',
  attemptRate: 0.88,
  solveRate: 0.7,
  perfectRate: 0.18,
  mistakesSolved: [1, 3],
  mistakesUnsolved: [2, 4],
  pushBias: 0.62,
  walkbackPerRow: 0.58,
  boldness: 1.3,
  keyLuck: 0.45,
  mysteryPull: 3,
  puzzlePull: 3,
  brambleAffinity: 2,
};

/** A great day with refills: warm tea, snacks found, sharp solving (4.10c). */
export const PROFILE_GREAT: SimProfile = {
  name: 'great',
  attemptRate: 0.92,
  solveRate: 0.85,
  perfectRate: 0.3,
  mistakesSolved: [0, 2],
  mistakesUnsolved: [1, 3],
  pushBias: 0.62,
  walkbackPerRow: 0.5,
  boldness: 1.25,
  keyLuck: 0.6,
  mysteryPull: 4,
  puzzlePull: 3,
  brambleAffinity: 5,
};

/**
 * The SKILLED player of AAA 4.10c/d: solves reliably, reads door layouts, and
 * plays the climb deliberately — banking utility rooms low, then spending the
 * budget upward. Her skill does NOT change across the campaign; what changes
 * is the manor's generosity (tea) and her familiarity with it (see
 * `campaignProfileForDay`). That is the whole point: day 1 cannot be won by
 * being good, only by being good FOR A WHILE.
 */
export const PROFILE_SKILLED: SimProfile = {
  name: 'skilled',
  attemptRate: 0.68,
  solveRate: 0.85,
  perfectRate: 0.28,
  mistakesSolved: [0, 2],
  mistakesUnsolved: [1, 3],
  pushBias: 0.78,
  walkbackPerRow: 0.36,
  boldness: 1.0,
  keyLuck: 0.32,
  mysteryPull: 4,
  puzzlePull: 2.5,
  brambleAffinity: 0,
};

// ---------------------------------------------------------------------------
// One day
// ---------------------------------------------------------------------------

/**
 * What ONE storey costs from 1-based `row`: the walk back to a frontier door
 * on this floor plus the step up, priced through the real `MOVE_COST_BY_ROW`.
 * The day model's push/farm decision reads this, so any movement retune moves
 * player behaviour too — the sim never "plays" a manor the ledger would not.
 */
export function climbStepCost(
  row: number,
  profile: Pick<SimProfile, 'walkbackPerRow'>,
): number {
  const walkbacks = profile.walkbackPerRow * (row - 1);
  const midRow0 = Math.max(0, Math.floor((row - 1) / 2));
  return -moveAt(row) + walkbacks * -moveAt(midRow0);   // moveAt(row) = into row+1, 0-based
}

/**
 * What the whole remaining ascent costs from 1-based `fromRow` to THE SANCTUM
 * LANDING — movement only. Exported because it is the headline number of this
 * overhaul: a bare, perfectly-efficient ascent costs MORE than the day's base
 * budget, so the landing must be paid for with refunds and tea. Round 7: this
 * now stops at the landing (1-based 6) instead of the sealed Sanctum's own row
 * (7), i.e. it prices the climb the player is actually asked to make.
 */
export function reserveToTop(
  fromRow: number,
  profile: Pick<SimProfile, 'walkbackPerRow'>,
): number {
  let cost = 0;
  for (let r = Math.max(1, fromRow); r < SANCTUM_LANDING_ROW; r++) cost += climbStepCost(r, profile);
  return cost;
}

export interface SimDayResult {
  rooms: number;            // new rooms drafted + entered
  roomsSolved: number;
  maxRow: number;           // 1-based; 6 = the Sanctum landing (the live door)
  /** Stood on the Sanctum landing — the second gate of AAA 4.10e. */
  reachedSanctum: boolean;
  /**
   * Violet rooms entered today. ROUND 11: these file SEALED pages — entering
   * gets the document, solving renders it legible (engine/volume.ts) — so this
   * is a count of DOCUMENTS ACQUIRED, never of knowledge gained. What she can
   * actually read is `pagesMadeOut`.
   */
  fragmentsFound: number;
  /**
   * Sealed pages a solve MADE OUT today, in the order the day really happened:
   * a solve deciphers `decipherYield(tier)` of the backlog standing at that
   * moment, so a violet room entered after the day's last solve is not made out
   * today however many rooms she solved earlier. This is the quantity the
   * mystery's knowledge curve is allowed to count (AAA 4.10e/4.18).
   */
  pagesMadeOut: number;
  /** Sealed pages still smudged at dusk — they survive the night, unread. */
  sealedBacklog: number;
  /** Keys off the DECK: green cards taken for their key face. */
  keysFound: number;
  /**
   * Keys off SOLVED ROOMS (round 10, `solveKeys`) — the owner's "skill, not
   * just persistence, earns the campaign". Counted apart from `keysFound` so
   * the deck-supply assertion in tests/economy-simulation.test.ts still
   * compares like with like, and so the "primarily from solves" claim is a
   * measured ratio rather than a hope.
   */
  keysFromSolves: number;
  /** Climbs refused for want of a key (the DOOR_LOCKS gate biting). */
  lockedOut: number;
  stepsLeft: number;        // stepsRemaining at day end (0 for exhausted days)
  spent: number;
  refunded: number;
  /** Estimated wall-clock length of the day (TIME_TABLE model), in minutes. */
  minutes: number;
  ledger: StepLedger;
}

const randInt = (rng: () => number, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));

/**
 * Which of three offered cards she takes. Preference is dynamic, because real
 * push-your-luck play is: take the economy room when the day is running out or
 * when a padlock is between you and the next storey; otherwise chase violet,
 * then blue. (AAA 4.1's affordability rule guarantees a takeable card always
 * exists, so there is no "declined everything" branch to model.)
 */
function preferenceFor(
  kind: SimRoomKind, profile: SimProfile,
  ctx: { stepsLeft: number; keys: number; needsKeySoon: boolean },
): number {
  switch (kind) {
    case 'mystery': return profile.mysteryPull;
    case 'utility':
      return 1
        + (ctx.stepsLeft < 10 ? 4 : 0)
        + (ctx.needsKeySoon && ctx.keys < 2 ? 4 : 0);
    case 'anchor':
    case 'micro': return profile.puzzlePull;
    case 'parlor': return 1.5;
  }
}

/**
 * Play one abstract day through the real ledger. Deterministic per rng.
 * `timeRng` (a separate stream) samples durations for the clock model;
 * without it, durations fall to range midpoints — the economy's rng stream is
 * untouched either way, so the row/step targets never drift because the clock
 * exists.
 *
 * `carry.sealedBacklog` is yesterday's unread pages: the seal is a save-level
 * flag pair (`vol.*.sealed-` minus `vol.*.legible-`, engine/volume.ts), so a
 * page she could not make out last night is still smudged at dawn and is the
 * first thing the next solve clears. Omitted, the day starts with a clean
 * plate — correct for an isolated day, wrong for a campaign, which is why
 * `simulateCampaign` threads it.
 */
export function simulateDay(
  rng: () => number,
  profile: SimProfile,
  timeRng?: () => number,
  carry?: { sealedBacklog?: number },
): SimDayResult {
  let ledger = createLedger(STEP_TABLE.dayStart);
  const tea = teaBonus(profile.brambleAffinity);
  if (tea > 0) ledger = appendEntry(ledger, { reason: 'tea', delta: tea, at: 0 });
  // The welcome pot / yesterday's risen dough — through the same audited path
  // and the same 'tea' reason the live day slice uses (AAA 4.9).
  const dawnSteps = profile.dawnSteps ?? 0;
  if (dawnSteps > 0) ledger = appendEntry(ledger, { reason: 'tea', delta: dawnSteps, at: 0 });

  let rooms = 0;
  let roomsSolved = 0;
  let fragmentsFound = 0;
  // The seal, in the order the evening really happens (round 11). Entering a
  // violet room pushes a smudged page onto `sealed`; finishing a word game
  // pops `decipherYield(tier)` of them. Both halves are the live wiring —
  // app/slices/journal.ts `collectFragmentForRoom` / `creditSolve`.
  let sealed = Math.max(0, carry?.sealedBacklog ?? 0);
  let pagesMadeOut = 0;
  let keysFound = 0;
  let keysFromSolves = 0;
  let keys = profile.dawnKeys ?? 0;
  let lockedOut = 0;
  let row = 1;              // 1-based; the entrance
  let maxRow = 1;
  let seconds = 0;

  /** Charge one move into 0-based `intoRow0`. */
  const move = (intoRow0: number) => {
    ledger = appendEntry(ledger, {
      reason: 'move', delta: moveAt(intoRow0), at: 0, roomKey: `2,${intoRow0}`,
    });
    seconds += TIME_TABLE.moveTap;
  };

  outer: while (rooms < MOVEMENT.maxRoomsPerDay) {
    // Push or farm? Real push-your-luck play is not a coin flip: she climbs
    // while she can still SEE the top from where she stands, and settles into
    // the lower floors to bank refunds when she cannot. `reserveToTop` prices
    // the rest of the ascent through the same MOVE_COST_BY_ROW the ledger
    // uses, so the decision moves with any movement retune. This is the
    // mechanism behind the day-6–10 first reach: early in a campaign the
    // budget never gets far enough above the reserve for the climb to look
    // affordable; the tea arc is what eventually lifts it over the line.
    const stepsNow = stepsRemaining(ledger);
    const canAffordStorey = stepsNow >= climbStepCost(row, profile) * profile.boldness;
    const wantsUp = row < SANCTUM_LANDING_ROW && canAffordStorey && rng() < profile.pushBias;
    let targetRow = wantsUp ? Math.min(SANCTUM_LANDING_ROW, row + 1) : row;
    const targetRow0 = targetRow - 1;

    // --- Walk to the frontier door: 1 step in + depth-scaled walk-back. ----
    // Walk-backs traverse the storeys below; they are priced at the midpoint
    // row of that path, which is where most of the re-walking happens. The
    // multiplier is deliberately GENTLE (≈0.3 extra moves per storey of
    // depth): with per-row movement pricing the climb already gets expensive
    // on its own, and Blue Prince's much larger re-walk figure came from a
    // flat move cost on a 5×9 grid with no vertical door planning.
    const extra = profile.walkbackPerRow * (row - 1);
    const walkbacks = Math.floor(extra) + (rng() < extra % 1 ? 1 : 0);
    const midRow0 = Math.max(0, Math.floor((row - 1) / 2));
    for (let i = 0; i < walkbacks; i++) {
      move(midRow0);
      if (ledgerTotal(ledger) <= 0) break outer; // dusk, out on the blueprint
    }

    // --- The padlock (DOOR_LOCKS): the hard gate on the upper storeys. -----
    // Rolled BEFORE the step is charged, because that is how the live game
    // plays it (app/slices/manor.ts openDraft): the padlock is already drawn
    // on the blueprint, so a door she cannot open is a door she declines to
    // walk to — refused free, never a surprise charge (AAA 4.6). The key
    // itself is spent on placement, i.e. only when the climb actually
    // happens, which is exactly what the `keys -=` below models.
    if (wantsUp && (DOOR_LOCKS.chanceByRow[targetRow0] ?? 0) > 0) {
      if (rng() < DOOR_LOCKS.chanceByRow[targetRow0]!) {
        if (keys >= DOOR_LOCKS.keyCost) {
          keys -= DOOR_LOCKS.keyCost;
        } else {
          // No key: the climb is refused and she drafts laterally on this
          // storey instead — at THIS storey's price, not the one above —
          // plus the detour to a door that will actually open
          // (MOVEMENT.lockoutDetourChance).
          lockedOut += 1;
          targetRow = row;
          if (rng() < MOVEMENT.lockoutDetourChance) {
            move(Math.max(0, row - 1));
            if (ledgerTotal(ledger) <= 0) break outer;
          }
        }
      }
    }
    move(targetRow - 1);
    if (ledgerTotal(ledger) <= 0) break outer;

    // --- Draft: three cards from the real deck mix, one taken. ------------
    seconds += TIME_TABLE.draft;
    const mix = deckMixAt(targetRow - 1);
    const stepsLeft = stepsRemaining(ledger);
    const nextRow0 = Math.min(SANCTUM_LANDING_ROW, targetRow + 1) - 1;
    const ctx = {
      stepsLeft, keys,
      needsKeySoon: (DOOR_LOCKS.chanceByRow[nextRow0] ?? 0) > 0,
    };
    let kind = drawKind(rng, mix);
    let best = preferenceFor(kind, profile, ctx);
    for (let slot = 1; slot < 3; slot++) {
      const other = drawKind(rng, mix);
      const pref = preferenceFor(other, profile, ctx) + rng() * 0.5;
      if (pref > best) { best = pref; kind = other; }
    }

    rooms += 1;
    row = targetRow;
    maxRow = Math.max(maxRow, row);
    const tier: Tier = rowTier(row - 1);
    const roomKey = `sim-${rooms}`;

    // --- Resolve the room. -------------------------------------------------
    if (kind === 'micro' || kind === 'anchor') {
      // With the day nearly out she looks at the board, decides she cannot
      // afford the mistakes, and leaves it for tomorrow (AAA 4.13) — and she
      // is far more willing to squeeze in a 60-second Linen Closet than to
      // open a six-minute Library on her last four steps. This is what keeps
      // the clock's tail bounded: exhausted days do not end with an anchor.
      const lowOnSteps = stepsRemaining(ledger) < 8;
      const attemptChance = profile.attemptRate
        * (lowOnSteps ? (kind === 'anchor' ? 0.2 : 0.7) : 1);
      if (rng() < attemptChance) {
        const solved = rng() < profile.solveRate;
        const perfect = solved && rng() < profile.perfectRate;
        const [mMin, mMax] = solved ? profile.mistakesSolved : profile.mistakesUnsolved;
        const mistakes = perfect ? 0 : randInt(rng, mMin, mMax);
        for (let m = 0; m < mistakes; m++) {
          ledger = appendEntry(ledger, {
            reason: 'mistake', delta: STEP_TABLE.mistake(1, tier), at: 0, roomKey,
          });
        }
        if (solved) {
          seconds += sampleSeconds(
            kind === 'micro' ? TIME_TABLE.microSolve : TIME_TABLE.anchorSolve, timeRng,
          );
          ledger = appendEntry(ledger, {
            reason: 'solve', delta: STEP_TABLE.solve(kind, tier), at: 0, roomKey,
          });
          if (perfect) {
            ledger = appendEntry(ledger, {
              reason: 'perfect', delta: STEP_TABLE.perfect, at: 0, roomKey,
            });
          }
          // ROUND 10 — the solve pays the padlock arc (app/slices/room.ts
          // applies exactly this, off the same `solveKeys` table).
          const earned = solveKeys(tier);
          if (earned > 0) {
            keys += earned;
            keysFromSolves += earned;
          }
          // ROUND 11 — THE SOLVE IS WHAT MAKES THE PAGE OUT. Only the backlog
          // standing at THIS moment can be deciphered, which is the whole
          // reason the seal can survive a night: a violet room drafted after
          // the evening's last solve stays smudged until tomorrow.
          const madeOut = Math.min(sealed, decipherYield(tier));
          sealed -= madeOut;
          pagesMadeOut += madeOut;
          roomsSolved += 1;
        } else {
          seconds += sampleSeconds(TIME_TABLE.abandon, timeRng);
        }
      } else {
        seconds += TIME_TABLE.glance;
      }
    } else if (kind === 'utility') {
      seconds += TIME_TABLE.utilityBeat;
      // The green deck is roughly half refill (Kitchen/Larder/Boot Room/Still
      // Room), a sixth keys (Key Cabinet), the rest gems and compounding
      // trinkets that this model treats as flavour.
      const roll = rng();
      if (ctx.needsKeySoon && keys < 2 && roll < profile.keyLuck) {
        // She took the green card BECAUSE its face said "+1 key" (AAA 1.17) —
        // the padlock upstairs is visible before she picks.
        keys += 1;
        keysFound += 1;
      } else if (roll < 0.55) {
        ledger = appendEntry(ledger, {
          reason: 'snack',
          // Round-6 audit: this used to roll uniformly over `STEP_TABLE.snack`
          // (then a fictional 3..7). Refills are FIXED authored numbers on the
          // green cards, so the model now draws from the payouts the deck can
          // actually pay — see REFILL_PAYOUTS.
          delta: REFILL_PAYOUTS[randInt(rng, 0, REFILL_PAYOUTS.length - 1)]!,
          at: 0, roomKey,
        });
      } else if (roll < 0.75) {
        keys += 1;
        keysFound += 1;
      }
    } else if (kind === 'mystery') {
      seconds += TIME_TABLE.mysteryBeat;
      // Hers forever from this step — and unreadable until a word game is
      // finished (AAA 4.18 keeps it non-blocking; the owner directive keeps it
      // meaningful).
      fragmentsFound += 1;
      sealed += 1;
    } else {
      seconds += TIME_TABLE.parlorBeat;
    }

    // Dusk never fires inside a room; it fires on exit (AAA 4.12) — a
    // mid-puzzle overdraft is allowed, then the day ends out on the floor.
    if (ledgerTotal(ledger) <= 0) break;
  }

  return {
    rooms,
    roomsSolved,
    maxRow,
    reachedSanctum: maxRow >= SANCTUM_LANDING_ROW,
    fragmentsFound,
    pagesMadeOut,
    sealedBacklog: sealed,
    keysFound,
    keysFromSolves,
    lockedOut,
    stepsLeft: stepsRemaining(ledger),
    spent: stepsSpent(ledger),
    refunded: stepsRefunded(ledger),
    minutes: seconds / 60,
    ledger,
  };
}

/**
 * Simulate `days` seeded independent days of one profile; one continuous rng
 * stream per run, plus an independent stream for the clock model.
 */
export function simulateDays(profile: SimProfile, days: number, seed: number): SimDayResult[] {
  const rng = createRng(seed);
  const timeRng = createRng((seed ^ 0x715e17) | 0);
  const out: SimDayResult[] = [];
  for (let i = 0; i < days; i++) out.push(simulateDay(rng, profile, timeRng));
  return out;
}

// ---------------------------------------------------------------------------
// The campaign: weeks, not minutes
// ---------------------------------------------------------------------------

/**
 * What actually grows across a campaign. The player's PUZZLE skill does not
 * (she is already good); the manor's generosity and her knowledge of it do.
 * This is the arc the owner playtest found missing.
 */
export const CAMPAIGN_ARC = {
  /** Learning the manor: pushBias gained per day, and its ceiling. */
  pushBiasPerDay: 0.015,
  pushBiasGainMax: 0.1,
  /** Learning the manor: walk-back shaved per day, and its floor. */
  walkbackPerDay: 0.045,
  walkbackShaveMax: 0.35,
} as const;

/**
 * The player on day `day` (1-based): same hands, warmer house.
 *
 * ROUND-5 AUDIT — the two meta arcs are now DERIVED FROM LIVE CODE, not from
 * hard-coded constants with nothing behind them:
 *
 *   - the step arc reads `teaArcPoints(day)`, the same function
 *     `app/slices/day.ts` uses to warm Bramble every second morning, plus the
 *     scripted first-morning pot `firstMorningPot(day)`;
 *   - the padlock arc reads `fernPointsOnDay(day)` — a schedule whose point
 *     budget is asserted against her authored dialogue file — through
 *     `fernMorningKeys` (the key on the sill) and `keyLuckFor` (the MEASURED
 *     live per-offer key rate, rolled through the real `rollCards`).
 *
 * Only the familiarity terms below are still modelled by hand, and those are
 * about the player's head, not the economy's numbers.
 */
export function campaignProfileForDay(base: SimProfile, day: number): SimProfile {
  const d = Math.max(0, day - 1);
  const fern = fernPointsOnDay(day);
  return {
    ...base,
    brambleAffinity: teaArcPoints(day),
    dawnSteps: (base.dawnSteps ?? 0) + firstMorningPot(day),
    dawnKeys: (base.dawnKeys ?? 0) + fernMorningKeys(fern),
    pushBias: Math.min(
      0.85, base.pushBias + Math.min(CAMPAIGN_ARC.pushBiasGainMax, CAMPAIGN_ARC.pushBiasPerDay * d),
    ),
    walkbackPerRow: Math.max(
      0.3, base.walkbackPerRow - Math.min(CAMPAIGN_ARC.walkbackShaveMax, CAMPAIGN_ARC.walkbackPerDay * d),
    ),
    keyLuck: keyLuckFor(fern),
  };
}

/**
 * The Study's share of the puzzle rooms drafted at this 0-based row, derived
 * from the live deck exactly the way `deckMixAt` derives its own mix. The
 * campaign's solve-channel model reads it, so a deck edit that makes the
 * Forgotten Word commoner or rarer moves the measured horizon instead of
 * quietly invalidating it. (tests/volume-pacing.test.ts derives the same
 * number over the real volume JSON; this is the abstract model's copy.)
 */
export function studySolveShareAt(
  row0: number,
  deck: readonly RoomCard[] = BASE_DECK,
): number {
  const tier = rowTier(row0);
  let study = 0;
  let puzzle = 0;
  for (const card of deck) {
    if (card.category !== 'puzzle') continue;
    if (card.tierRange[0] > tier || tier > card.tierRange[1]) continue;
    const w = categoryWeight('puzzle', row0) * RARITY_WEIGHTS[tier][card.rarity];
    puzzle += w;
    if (card.puzzleKind === 'forgotten-word') study += w;
  }
  return puzzle > 0 ? study / puzzle : 0;
}

/**
 * The mystery's knowledge curve (A7 owns the real drip; AAA 4.14 guarantees
 * the shape this models).
 *
 * ═══ ROUND-11 CORRECTION — THE MODEL ENCODED PRE-SEAL RULES ═══
 * This block used to add `SimDayResult.fragmentsFound` — violet rooms
 * ENTERED — straight into the deduction count, and modelled no solve channel
 * at all. Under the shipped rules neither is true: a violet room files a
 * SEALED page that narrows nothing until a solve makes it out
 * (engine/volume.ts `sealedFragmentIds` / `DECIPHER_YIELD_BY_TIER`), and the
 * word games pay two strict channels of their own. So 4.10e was verified
 * against rules the game no longer has, and any retune of the seal would have
 * moved the real horizon with every test still green.
 *
 * Now: only MADE-OUT pages (`SimDayResult.pagesMadeOut`, computed in day
 * order) count as knowledge; the solve channels are modelled with the stock
 * the volume actually authors; letters, testimony and the pity floor arrive
 * legible, exactly as `letterGrants`/`grantsFragmentIds` file them.
 */
export const KNOWLEDGE = {
  /** P(a letter carrying a fragment arrives overnight). */
  letterChance: 0.18,
  /** P(character testimony yields a fragment), ramping as affinities warm. */
  testimonyChance: 0.16,
  testimonyRampDays: 8,
  /** AAA 4.14: never 3 consecutive days with no new fragment. */
  pityDays: 3,
  /**
   * THE SOLVE CHANNELS (engine/volume.ts `STUDY_CHANNEL`/`LINTEL_CHANNEL`):
   * a solved Study hands over a definition line, any other solved word game a
   * lintel engraving — valved to one per day per channel, and STRICT, so a
   * channel only pays while the volume still authors something labelled for
   * it. Volume 1 authors 3 `puzzle/definition-line` and 2 `puzzle/engraving`
   * fragments, which is why wiring the word games into the mystery moved the
   * horizon by days rather than weeks. Arrives LEGIBLE: she solved for it.
   */
  studyChannelStock: 3,
  lintelChannelStock: 2,
  /**
   * The volume's whole authored supply — nothing can be learned past it.
   * Volume 1 ships 17 fragments (the seventeenth is the Portrait's confession,
   * a scene rather than a clue).
   */
  volumeFragments: 17,
  /**
   * Fragments she needs LEGIBLE before the word is deducible for her. Sampled
   * per campaign — some volumes click early, some resist.
   *
   * ROUND-11 RE-DERIVATION. This band used to be [11, 17], calibrated when
   * this model had no solve channels at all and counted violet rooms entered
   * as knowledge outright. Wiring the channels in put five guaranteed early
   * fragments on the board, so the old floor no longer described the same
   * thing. Re-derived from what actually pins the answer instead of from the
   * old number: tests/volume-solvability.test.ts proves volume 1's SIX
   * engravings are individually soft and jointly sufficient — the chain runs
   * 171755 → 15232 → 298 → 22 → 11 → 2 → 1, so five of them still leave two
   * candidate words. Six engravings among seventeen fragments arriving in
   * revealOrder means all six are inside the first k she holds with
   * probability C(k,6)/C(17,6): 3.7% at k = 11, 13.9% at 13, 40% at 15. A
   * floor of 11 was therefore claiming a deduction the constraint set does
   * not support in nineteen campaigns out of twenty; 13 is the optimistic
   * end (she guessed between the last two candidates), 17 the resistant one.
   */
  fragmentsToDeduce: [13, 17] as const,
} as const;

export interface SimCampaignResult {
  days: SimDayResult[];
  /** 1-based day she first stood on the Sanctum row. null = never, in window. */
  firstSanctumReachDay: number | null;
  /** 1-based day she had enough LEGIBLE fragments to name the word. */
  deductionDay: number | null;
  /** 1-based day she both KNEW it and REACHED the door. The volume win. */
  volumeWinDay: number | null;
  /** Fragments she can actually read (sealed pages excluded until made out). */
  fragments: number;
  /** Documents filed, legible or not — the AAA 4.14 drought is measured here. */
  fragmentsFiled: number;
  /** Days that ended with at least one page still smudged (the seal biting). */
  sealedOvernightDays: number;
  fragmentsNeeded: number;
}

/**
 * Play a whole campaign: `days` consecutive days of one player, with the tea
 * arc, the familiarity arc and the fragment drip running across them. The
 * volume is won on the first day she both knows the word and reaches the
 * Sanctum door — the two independent gates that make day 1 impossible and
 * week 3 likely.
 */
export function simulateCampaign(
  base: SimProfile,
  days: number,
  seed: number,
): SimCampaignResult {
  const rng = createRng(seed);
  const timeRng = createRng((seed ^ 0x715e17) | 0);
  const metaRng = createRng((seed ^ 0x5eed21) | 0);

  const [needMin, needMax] = KNOWLEDGE.fragmentsToDeduce;
  const fragmentsNeeded = randInt(metaRng, needMin, needMax);

  const results: SimDayResult[] = [];
  let fragments = 0;          // LEGIBLE — what she can read and reason from
  let fragmentsFiled = 0;     // documents in hand, smudged or not
  let studyStock = KNOWLEDGE.studyChannelStock;
  let lintelStock = KNOWLEDGE.lintelChannelStock;
  let sealedBacklog = 0;
  let sealedOvernightDays = 0;
  let dryStreak = 0;
  let firstSanctumReachDay: number | null = null;
  let deductionDay: number | null = null;
  let volumeWinDay: number | null = null;

  for (let day = 1; day <= days; day++) {
    const profile = campaignProfileForDay(base, day);
    // Yesterday's unread pages are still on the desk at dawn — the seal is a
    // save flag, not a day-scoped counter (engine/volume.ts).
    const result = simulateDay(rng, profile, timeRng, { sealedBacklog });
    results.push(result);
    sealedBacklog = result.sealedBacklog;
    if (sealedBacklog > 0) sealedOvernightDays += 1;

    if (result.reachedSanctum && firstSanctumReachDay === null) firstSanctumReachDay = day;

    // --- The fragment drip (AAA 4.14: ≥2 source types + a pity floor). ----
    // `filed` is what ARRIVED (documents in hand, smudged or not — the number
    // the chronicles print). `legible` is what she can actually reason from,
    // and round 13 makes it the DROUGHT's quantity too: the live pity floor now
    // reads `legibleDroughtDays` (engine/volume.ts), because a sealed page
    // taught her nothing and must not switch mercy off. The model keyed its
    // `dryStreak` off `filed`, so it reproduced the shipped bug instead of
    // flagging it — which is why this line is the fix's tripwire, not a detail.
    let filed = result.fragmentsFound;
    let legible = result.pagesMadeOut;

    // The word games pay their own two channels — strictly, once per day per
    // channel, and only while the volume still authors something labelled for
    // them. The i-th solve is placed at row min(i, today's top), the same
    // cheap ordering tests/volume-pacing.test.ts uses over the real content,
    // which matters because the Study is a rows-5–6 card: its channel only
    // opens on a day she climbed far enough to find it.
    let studyPaid = false;
    let lintelPaid = false;
    for (let i = 0; i < result.roomsSolved; i++) {
      const row0 = Math.min(i, Math.max(0, result.maxRow - 1));
      const isStudy = metaRng() < studySolveShareAt(row0);
      if (isStudy && !studyPaid && studyStock > 0) {
        studyPaid = true; studyStock -= 1; filed += 1; legible += 1;
      } else if (!isStudy && !lintelPaid && lintelStock > 0) {
        lintelPaid = true; lintelStock -= 1; filed += 1; legible += 1;
      }
    }

    if (metaRng() < KNOWLEDGE.letterChance) { filed += 1; legible += 1; }
    const warmth = Math.min(1, day / KNOWLEDGE.testimonyRampDays);
    if (metaRng() < KNOWLEDGE.testimonyChance * warmth) { filed += 1; legible += 1; }
    dryStreak = legible > 0 ? 0 : dryStreak + 1;
    if (dryStreak >= KNOWLEDGE.pityDays) { filed += 1; legible += 1; dryStreak = 0; }

    // Nothing can be learned past the volume's authored supply.
    filed = Math.min(filed, KNOWLEDGE.volumeFragments - fragmentsFiled);
    fragmentsFiled += filed;
    fragments = Math.min(fragments + legible, fragmentsFiled);

    if (deductionDay === null && fragments >= fragmentsNeeded) deductionDay = day;
    if (
      volumeWinDay === null && deductionDay !== null && day >= deductionDay &&
      result.reachedSanctum
    ) {
      volumeWinDay = day;
    }
  }

  return {
    days: results, firstSanctumReachDay, deductionDay, volumeWinDay,
    fragments, fragmentsFiled, sealedOvernightDays, fragmentsNeeded,
  };
}

/** `count` seeded campaigns of the same player — the distribution 4.10 pins. */
export function simulateCampaigns(
  base: SimProfile, count: number, days: number, seed: number,
): SimCampaignResult[] {
  const out: SimCampaignResult[] = [];
  for (let i = 0; i < count; i++) out.push(simulateCampaign(base, days, (seed + i * 0x9e37) | 0));
  return out;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/** Median of a list of numbers. */
export function medianOf(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** q-quantile (0..1, nearest-rank) of a list of numbers. */
export function quantileOf(xs: readonly number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[i]!;
}

/** Median of a numeric projection over results. */
export function median<T>(results: readonly T[], pick: (r: T) => number): number {
  return medianOf(results.map(pick));
}

/** q-quantile of a numeric projection over results. */
export function quantile<T>(results: readonly T[], q: number, pick: (r: T) => number): number {
  return quantileOf(results.map(pick), q);
}

/** Share of results satisfying a predicate. */
export function share<T>(results: readonly T[], pred: (r: T) => boolean): number {
  return results.filter(pred).length / results.length;
}
