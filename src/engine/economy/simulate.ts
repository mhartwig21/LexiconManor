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
import type { RoomPuzzleKind } from '../rooms/room-puzzle';
import { effortMinutes, paysInStages } from './effort';
import { BASE_DECK, deckFor, isKeyBearing, UTILITY_EFFECTS } from '../manor/deck';
import { categoryWeight, rollCards, RARITY_WEIGHTS, WING_AFFINITY } from '../manor/drafting';
import { WING_MEMORY, type WingCharacter } from '../manor/wings';

/**
 * ── HOW THE WINGS ARE MODELLED, AND THE TWO ASSUMPTIONS (round 20) ─────────
 *
 * `simulateDay` has no columns: it tracks a row, a step budget and a clock. The
 * wing term (engine/manor/wings.ts, REVIEW_AA §5.7) is the first draft weight
 * in the game that depends on a COLUMN, so it cannot be measured exactly here.
 * It is modelled with two assumptions, and both are deliberately the ones that
 * make the published bands HARDEST to hold:
 *
 *   - `character: 'puzzle'`. A wing can be remembered as blue or yellow, and
 *     the model assumes she always argues for the one with the larger effect on
 *     every published band: the blue rooms carry the minutes (an anchor is
 *     3–6 minutes against a parlor beat's 40 seconds), the solve keys, the
 *     mistakes and the whole §5.1 fragment spine, so a reading wing moves 4.10b,
 *     4.10d and 4.10e at once where a household wing barely touches them.
 *     (Green and violet cannot be a wing's character at all —
 *     `WING_CHARACTERS` excludes both, and engine/manor/wings.ts records the
 *     measurement that ruled green out — which is what keeps 4.10g's published
 *     violet shares and the green deck's step calibration out of this
 *     entirely.)
 *   - `matchChance: 0.5`. Half of every evening's drafts are assumed to land in
 *     a wing the papers remember. Four of the five columns are wing columns and
 *     at most two wings can be remembered at once, so half is at the generous
 *     end of what a real evening reaches.
 *
 * If the bands hold under both, they hold under the shipped game. `WING_MEMORY`
 * supplies the day the term switches on, so the model and the engine cannot
 * disagree about when the papers commit.
 */
export const WING_MODEL = {
  character: 'puzzle' as WingCharacter,
  matchChance: 0.5,
} as const;
import {
  canAddressSanctum, cardOpensOntoSanctum, createManor, rowTier, SANCTUM_DOOR_CELL,
} from '../manor/grid';
import { getRoomAdapter } from '../rooms/registry';
import {
  channelStock, decipherYield, FRAGMENTS_TO_DEDUCE, LINTEL_CHANNEL, PITY_DROUGHT_DAYS,
  STUDY_CHANNEL,
} from '../volume';
import type { VolumeDef } from '../types';
// The authored volume itself, so the knowledge model below is DERIVED from the
// content rather than transcribed from it (see `channelStock`). This module is
// a dev/test instrument — nothing under src/app or src/ui imports it — so the
// static JSON import cannot reach the eager bundle the 300KB budget guards.
import volume1 from '../../../content/authored/volumes/volume-1.json';

const VOLUME_1 = volume1 as unknown as VolumeDef;
import {
  appendEntry, createLedger, ledgerTotal, stepsRemaining, stepsRefunded, stepsSpent,
  fernMorningKeys, fernPointsOnDay, firstMorningPot, keyAccessFor, moveAt, solveKeys,
  sanctumMercyArmed, sanctumPlanWarmth, stageSteps, teaArcPoints, teaDawnPour, teaLandingPour,
  DOOR_LOCKS, ROOM_SIZE, SANCTUM_ARC, STEP_TABLE, TEA_POUR,
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
 * ═══ ROUND-13 CORRECTION — THE MILESTONE WAS THE STOREY, NOT THE DOOR ══════
 *
 * Third recurrence of the round-6/7/11 escape, and the deepest: `simulateDay`
 * returned `reachedSanctum: maxRow >= SANCTUM_LANDING_ROW` — merely standing on
 * the storey. The gate the live game enforces is `atSanctumDoor`
 * (engine/manor/grid.ts, consumed by the blueprint, the journal's guess flow
 * and the Sanctum screen): the landing cell AND a north door on the room
 * drafted there, matching the Sanctum's sealed south one.
 *
 * Measured over the real deck and the rigid rotation: entering the landing
 * from below, only **27.7%** of tier-3-eligible plans place with a north door,
 * and a real 3-card `rollCards` offer at (2,5) contains one on **60.8%** of
 * offers. So roughly two evenings in five she paid 22+ steps to arrive at an
 * offer that could not open the door — and every 4.10d/e number retuned across
 * rounds 6–12 was measured against a storey, not a door.
 *
 * The model now DRAFTS THE LANDING FOR REAL: `landingDraft` below rolls the
 * offer through the same `rollCards` the slice calls, at the same
 * `SANCTUM_DOOR_CELL`, and asks the same `cardOpensOntoSanctum` the card face
 * draws. `SimDayResult.reachedSanctum` IS `atSanctumDoor`; the storey is
 * reported separately as `reachedLanding`, and the two can never be conflated
 * again because `tests/economy-simulation.test.ts` pins the identity the way
 * it already pins `SANCTUM_LANDING_ROW === SANCTUM_DOOR_CELL.row + 1`.
 *
 * ONE MODELLING CHOICE, STATED: when the offer contains a plan that opens
 * north, the model assumes she takes it (p = the offer rate, 0.61 bare). That
 * is the OPTIMISTIC bound, and it is only honest because round 13 also made it
 * legible — `ui/blueprint/DraftModal.tsx` stamps "opens onto the Sanctum" on
 * exactly those cards, off the same predicate. Without that stamp the right
 * number would be the per-card 27.7%, and the arc below would be tuned against
 * a decision the player cannot see. The UI change is load-bearing for this
 * number; if it is ever removed, this model is wrong again.
 */
export const LANDING_ENTRY_DIR = 'N' as const;

/** The live deck, memoised — `landingDraft` rolls a real offer per landing. */
let landingDeck: readonly RoomCard[] | null = null;

/**
 * Roll the REAL offer at the Sanctum landing and answer the only question that
 * matters up there: does any plan in it open onto the sealed door?
 *
 * Not modelled (documented, small, and both conservative): the live manor has
 * more rooms placed by the time she gets up here, so `eligibleCards`' deck
 * thinning differs slightly; and taking the north plan constrains which ROOM
 * she ends up in, which the day model still draws from `deckMixAt`. Neither
 * moves the door rate this function exists to measure.
 */
export function landingDraft(
  seed: number,
  arc: { planWarmth?: number; mercy?: boolean; keyAccess?: number } = {},
): boolean {
  landingDeck ??= deckFor([]);
  const manor = createManor(seed);
  const cards = rollCards(landingDeck, manor, SANCTUM_DOOR_CELL, {
    gems: 2,
    declinedLastDraft: [],
    drawIndex: 0,
    keyAccess: arc.keyAccess ?? 0,
    entryDir: LANDING_ENTRY_DIR,
    sanctumPlanWarmth: arc.planWarmth ?? 0,
    sanctumMercy: arc.mercy ?? false,
  });
  return cards.some(
    (c) => cardOpensOntoSanctum(c, LANDING_ENTRY_DIR, manor, SANCTUM_DOOR_CELL),
  );
}

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

/**
 * ═══ ROUND 23 — THE EVENING HAS TWO ENDINGS, AND THE MODEL ONLY HAD ONE ═══
 *
 * `simulateDay`'s only exits were `ledgerTotal(ledger) <= 0` and the runaway
 * cap, so **100.0% of simulated days ended at exactly 0 steps** — and
 * `scripts/review-metrics.ts` printed *"(d) unspent budget at day end median
 * 0.0% p90 0.0%"* as clearing REVIEW_AA §8's *"no day ending with more than
 * ~20% of the budget unspent"*. It cleared it by construction. A gate whose
 * answer is fixed by the loop condition is worse than no gate, and this
 * repo's own STATUS.md lesson list names that failure mode twice.
 *
 * The live game ships both endings: dusk when the steps run out, and "An early
 * night, well chosen" (`NIGHT_LINES`) when she puts the kettle on with steps
 * still in hand. The second one is APPETITE, and it cannot be anything else —
 * the live `openDraft` refuses only below one step and its own comment says
 * *"even if it was her last step, the offer still opens"*, so there is no
 * affordability rule that would ever stop her. A model that retired her when
 * the next door out-priced her purse would be modelling a game we do not ship;
 * what actually happens is that she looks at the clock.
 *
 * `SimProfile.sessionMinutes` is that clock: the evening she came for. It sits
 * well above 4.10b's published 10–15 minute median on purpose — it describes
 * the TAIL of the distribution (the evening that got away from her), never the
 * shape of a normal one, so it cannot be the thing that makes 4.10b pass.
 *
 * What it buys is an honest `(d)`: `scripts/review-metrics.ts` can now print
 * the share of evenings that end each way beside the unspent number, instead
 * of a 0.0% that was fixed by the loop condition.
 */
export const RETIREMENT = {
  /**
   * Longest an evening runs before she stops, as a multiple of
   * `SESSION_WIND_DOWN.afterMinutes` — the profile field is the tunable, this
   * is the floor a profile may not sit under without saying why.
   */
  minSessionFactor: 1.25,
} as const;

/** Why an evening ended (round 23) — see `RETIREMENT`. */
export type SimEndReason = 'broke' | 'retired' | 'capped';

/**
 * Last 0-based row of THE GROUND FLOOR for §5.10's purposes — the tier-1 band,
 * the storeys 62% of the median player's rooms stand on and the ones the
 * economy critic measured. DERIVED from `rowTier`, never written down twice:
 * a tier retune moves the band the gate is measured over, rather than leaving
 * the gate pointing at storeys that stopped being the ground floor.
 */
export const GROUND_ROWS = (() => {
  let r = 0;
  while (rowTier(r + 1) === rowTier(0)) r += 1;
  return r;
})();

/** 0-based row of the first storey a padlock can stand on (`DOOR_LOCKS`). */
export const FIRST_LOCKED_ROW = DOOR_LOCKS.chanceByRow.findIndex((c) => c > 0);

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
  /**
   * ── THE WING TERM, MODELLED (round 20, REVIEW_AA §5.7) ──────────────────
   *
   * `engine/manor/drafting.ts` now multiplies a card's weight by
   * `WING_AFFINITY` when its category matches what the lexicographer's papers
   * remember of the WING the door opens into. That is the first term in the
   * game that reads a COLUMN, and this model has never had columns: it tracks
   * a row and a step budget. Rather than leave the effect unmodelled — the
   * exact §0.5 escape shape, "a number verified against a game that is not the
   * shipped one" — the mix takes the same term here, normalised the same way
   * (violet-neutral over the non-mystery pool), and `simulateDay` applies it to
   * the share of her drafts that land in a remembered wing.
   *
   * Passing nothing leaves every number this function has ever returned
   * bit-identical, which is what keeps the 4.10b clock calibrated as it was.
   * Passing one leaves the MYSTERY share bit-identical too, by construction —
   * so 4.10g's published violet shares are outside this term either way.
   */
  wingCharacter?: WingCharacter,
): Record<SimRoomKind, number> {
  const tier = rowTier(row0);
  const w = zeroMix();
  const eligible = deck.filter((c) => c.tierRange[0] <= tier && tier <= c.tierRange[1]);
  const bare = (card: RoomCard) =>
    categoryWeight(card.category, row0) * RARITY_WEIGHTS[tier][card.rarity];
  // The same non-mystery normalisation `wingBoost` performs on a live pool.
  let k = 1;
  if (wingCharacter) {
    let charW = 0;
    let otherW = 0;
    for (const card of eligible) {
      if (card.category === 'mystery') continue;
      if (card.category === wingCharacter) charW += bare(card);
      else otherW += bare(card);
    }
    if (charW > 0 && otherW > 0) k = (charW + otherW) / (WING_AFFINITY * charW + otherW);
  }
  for (const card of eligible) {
    let weight = bare(card);
    if (wingCharacter && card.category !== 'mystery') {
      weight *= card.category === wingCharacter ? WING_AFFINITY * k : k;
    }
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

/**
 * WHICH PUZZLE ROOM SHE ACTUALLY MET, off the real draft weights (round 22).
 *
 * `deckMixAt` answers "micro or anchor", which was enough while every anchor
 * was priced and clocked identically. It is not enough any more: the Gallery
 * and the Counting House are both anchors, both offered on the ground floor at
 * ~25% of 3-card offers, and one of them is twenty seconds and the other is
 * twelve minutes. The clock and the payout both key off the KIND now, so the
 * model has to draw one — through the same `categoryWeight × RARITY_WEIGHTS ×
 * tierRange` product `deckMixAt` uses, so a deck edit moves this with it.
 *
 * Returns a normalised distribution over the kinds of the requested size that
 * are eligible at this row; an empty object if the deck offers none.
 */
export function puzzleKindMixAt(
  row0: number,
  size: 'micro' | 'anchor',
  deck: readonly RoomCard[] = BASE_DECK,
): Partial<Record<RoomPuzzleKind, number>> {
  const tier = rowTier(row0);
  const w: Partial<Record<RoomPuzzleKind, number>> = {};
  let total = 0;
  for (const card of deck) {
    if (card.category !== 'puzzle' || !card.puzzleKind) continue;
    if (card.tierRange[0] > tier || tier > card.tierRange[1]) continue;
    if (ROOM_SIZE[card.puzzleKind] !== size) continue;
    const weight = categoryWeight('puzzle', row0) * RARITY_WEIGHTS[tier][card.rarity];
    w[card.puzzleKind] = (w[card.puzzleKind] ?? 0) + weight;
    total += weight;
  }
  if (total <= 0) return w;
  for (const k of Object.keys(w) as RoomPuzzleKind[]) w[k]! /= total;
  return w;
}

const kindMixCache = new Map<string, Partial<Record<RoomPuzzleKind, number>>>();

function drawPuzzleKind(
  rng: () => number, row0: number, size: 'micro' | 'anchor',
): RoomPuzzleKind {
  const cacheKey = `${row0}|${size}`;
  let mix = kindMixCache.get(cacheKey);
  if (!mix) {
    mix = puzzleKindMixAt(row0, size);
    kindMixCache.set(cacheKey, mix);
  }
  let r = rng();
  let last: RoomPuzzleKind = size === 'micro' ? 'crossword' : 'twistle';
  for (const [kind, p] of Object.entries(mix) as [RoomPuzzleKind, number][]) {
    last = kind;
    r -= p;
    if (r <= 0) return kind;
  }
  return last;
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
  /**
   * ── ROUND 22: PUZZLE DURATIONS ARE PER KIND NOW (REVIEW_AA §6) ──────────
   *
   * This used to be two numbers — `microSolve: [45, 90]` and `anchorSolve:
   * [180, 360]` — one uniform 3–6 minute band covering the twistle, the word
   * web, the hive, the forgotten word AND the 9×9 expert sudoku, under a
   * comment that said *"REPLACE with instrumented medians once 3.5's playtest
   * lands"*. It never happened, so AAA 4.10b's published 10–15 minute median
   * had never been measured against a room that takes a quarter of an hour:
   * corrected for honest room times the median evening was ≈17 minutes and the
   * p90 ≈32 against a published ≤23. One Counting House broke the band on its
   * own, and the instrument could not see it.
   *
   * The durations live in `engine/economy/effort.ts` now — per kind, per tier,
   * instrumented over the shipped pools and pinned to the content facts they
   * were derived from — and the day model draws the ROOM SHE ACTUALLY MET
   * (`puzzleKindMixAt`, off the real deck weights) rather than a size bucket.
   */
  solveSeconds: (kind: RoomPuzzleKind, tier: Tier): number =>
    effortMinutes(kind, tier) * 60,
} as const;

/**
 * ── HOW LONG SHE IS WILLING TO SIT, AND WHY THE MODEL NEEDED IT ───────────
 *
 * With honest durations the old model became incoherent: it solved every
 * attempted room at `profile.solveRate` and charged the room's full length,
 * which says the median player finishes a fourteen-minute Spelling-Bee-Genius
 * climb 70% of the time inside a twelve-minute evening. Both hostile reviewers
 * pressed "Leave it for tomorrow" on the Counting House; the model had no way
 * to express that at all.
 *
 * So a room now costs what she is WILLING to give it. `patienceMinutes` is her
 * appetite for one room; the spread is the evening's mood. She finishes the
 * room if the sitting she was willing to give it covers the work it asks for —
 * which makes the per-kind solve rate a DERIVED quantity (twistle ≈ her skill,
 * hive ≈ near zero at tier 1 for a median player) instead of seven hand-tuned
 * constants nobody could check.
 *
 * And the work she did do is not thrown away: `stageSteps` pays the ladder she
 * climbed (engine/economy/steps.ts), which is REVIEW_AA §6's whole ask and the
 * reason abandoning a long room stopped being a wasted evening.
 */
export const PATIENCE_SPREAD: readonly [number, number] = [0.6, 1.8];

/**
 * THE LAST-WORD PULL. Patience is elastic in one direction only: a room whose
 * END IS IN SIGHT gets the extra minutes ("one more group and the board is
 * done"), while a room several times her appetite is banked and left however
 * close the next rung looks. Without this the model claimed a player walks out
 * of a four-minute Word Web at three minutes fifty with three groups placed,
 * which nobody has ever done. It is deliberately a MULTIPLIER on the sitting
 * she was already willing to give, not a flat grace period, so it stretches the
 * Library and the Darkroom and cannot reach the Conservatory.
 */
export const PATIENCE_STRETCH = 1.5;

/**
 * ── THE EVENING WINDS DOWN ────────────────────────────────────────────────
 *
 * Patience is not only per-room: a player who has already been at it for a
 * quarter of an hour does not open the Counting House. Without this the model's
 * long tail was made of evenings that started a second fifteen-minute room at
 * minute twenty — which is how a p90 gets to half an hour on paper while the
 * real player is putting the kettle on. She still plays; she plays SHORT, and
 * she banks the rungs of anything long instead of settling into it.
 *
 * `afterMinutes` is deliberately just under 4.10b's own published median band,
 * so the wind-down describes the end of a normal evening rather than a rule
 * that shapes it.
 */
export const SESSION_WIND_DOWN = { afterMinutes: 12, patienceFactor: 0.35 } as const;

/**
 * The clock's own jitter. `ROOM_EFFORT` gives the honest MEDIAN minutes; a real
 * evening is faster or slower than the median, and that variance belongs to the
 * clock, never to the economy — so it is sampled from the separate `timeRng`
 * stream and the ledger cannot move because the clock model changed. Without a
 * clock stream the day runs at exactly the median, which is what keeps
 * `simulateDay(rng, profile)` a pure economy instrument.
 */
const clockJitter = (timeRng?: () => number): number =>
  timeRng ? 0.8 + timeRng() * 0.4 : 1;

// ---------------------------------------------------------------------------
// Player profiles
// ---------------------------------------------------------------------------

export interface SimProfile {
  name: string;
  /** Chance an entered puzzle room is attempted at all (vs walked through). */
  attemptRate: number;
  /**
   * Chance an attempted puzzle she was WILLING TO SIT OUT is solved — her
   * hands, not her appetite. Round 22 split the two: the room's length is
   * settled by `patienceMinutes` against `ROOM_EFFORT`, and this is what is
   * left, i.e. skill. A room longer than the sitting she was willing to give it
   * is left for tomorrow however good she is, and pays for the rungs she
   * climbed (`stageSteps`) rather than nothing at all.
   */
  solveRate: number;
  /**
   * ROUND 23 — THE EVENING SHE CAME FOR, in minutes: past this she is out on
   * the blueprint with steps still in hand and she stops ("An early night,
   * well chosen", `NIGHT_LINES`). See `RETIREMENT` for why this is the ONLY
   * honest second ending — the live game has no affordability refusal above
   * one step. Omitted, she plays until the ledger is empty, which is what
   * every profile did for twenty-two rounds and what made REVIEW_AA §8's
   * unspent-budget gate vacuous.
   */
  sessionMinutes?: number;
  /**
   * Minutes she will give ONE room before banking what she has and stepping
   * back out (AAA 4.13's "leave it for tomorrow", as a number). Multiplied by a
   * per-room roll over `PATIENCE_SPREAD` — some evenings she settles in.
   */
  patienceMinutes: number;
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
  patienceMinutes: 0,
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
  sessionMinutes: 18,
  attemptRate: 0.88,
  solveRate: 0.8,
  patienceMinutes: 3,
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
  sessionMinutes: 22,
  attemptRate: 0.92,
  solveRate: 0.9,
  patienceMinutes: 4,
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
  sessionMinutes: 20,
  attemptRate: 0.68,
  solveRate: 0.9,
  patienceMinutes: 5,
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

/**
 * What the ground floor cost and what it left in her hand (REVIEW_AA §5.10).
 * "Ground floor" is the tier-1 band — 0-based rows 0–2, `rowTier` tier 1 —
 * which is 62% of the rooms the median player enters, and "below row 4" in the
 * review's own words.
 */
export interface GroundPressure {
  /**
   * Steps in hand at every moment she spent on rows 0–2 BEFORE first climbing
   * above them. Sampled after each ledger entry, so it is her purse as she
   * walks the floor, not a day-end aggregate. The median of this pooled across
   * a campaign is the §5.10 headline: it must not exceed the purse day 1 has
   * always had (`BASE_DAY_BUDGET + FIRST_MORNING_POT`).
   */
  inHand: readonly number[];
  /** Steps she spent, net of everything the floor paid back, on rows 0–2. */
  groundNet: number;
  /** Rooms entered on rows 0–2 (the denominator of the drain). */
  groundRooms: number;
  /**
   * Steps in hand the moment she first stepped onto the first PADLOCKED storey
   * (0-based row 4) — the review's *"she arrives at the first real gate richer
   * than she started"*. Null on an evening that never got there.
   */
  atFirstLock: number | null;
  /** Highest total she ever held today. */
  peak: number;
}

export interface SimDayResult {
  rooms: number;            // new rooms drafted + entered
  roomsSolved: number;
  maxRow: number;           // 1-based; 6 = the Sanctum landing (the live door)
  /**
   * **The live second gate of AAA 4.10e — `atSanctumDoor`, not the storey.**
   * She stood on the landing AND the plan she drafted there opened north onto
   * the Sanctum's sealed door. Round 13: this used to be
   * `maxRow >= SANCTUM_LANDING_ROW`, i.e. the storey alone, which the live game
   * has never accepted as reaching anything.
   */
  reachedSanctum: boolean;
  /**
   * Stood on the landing CELL — the climb, paid for, whatever it opened onto.
   * Reported apart from `reachedSanctum` on purpose: conflating the two is the
   * round-13 defect, and the gap between these two numbers is the thing the
   * landing arc (`SANCTUM_ARC`) exists to close.
   */
  reachedLanding: boolean;
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
  /**
   * ROUND 17 (REVIEW_AA §5.2) — could she SAY A WORD to the Sanctum today, at
   * all, at zero step cost? Read off the live predicate against a dawn manor
   * (`canAddressSanctum(createManor(...))`), never asserted: the day begins in
   * the Entrance Hall and the speaking tube is bolted to its wall, so this is
   * true on day 1 of a fresh save — and it goes false the moment somebody
   * deletes the tube, which is the point of measuring it rather than stating it.
   */
  couldSpeak: boolean;
  /** Estimated wall-clock length of the day (TIME_TABLE model), in minutes. */
  minutes: number;
  /**
   * ROUND 23 — how the evening ENDED. Before this the answer was 'broke' by
   * construction on 100.0% of days, which is what made REVIEW_AA §8's unspent
   * budget gate vacuous. See `RETIREMENT`.
   */
  endReason: SimEndReason;
  /**
   * ROUND 23 (REVIEW_AA §5.10) — THE GROUND FLOOR, MEASURED.
   *
   * The review's item is *"if a resource is never scarce it is not a resource,
   * it is a formality"*, and nothing in this model could see it: every
   * published number was a whole-day aggregate, so a floor that charged 1 step
   * a room while a solve paid 12 looked exactly like a floor that bit. These
   * are the per-storey facts the §5.10 gate is written against
   * (tests/economy-pressure.test.ts), collected in the order the evening
   * really happens.
   */
  pressure: GroundPressure;
  ledger: StepLedger;
  /**
   * Pages she could actually READ today, from every faucet (round 18). Written
   * by `simulateCampaign` after the drip resolves — absent on a bare
   * `simulateDay`, which knows nothing about a volume's stock. This is the
   * numerator of REVIEW_AA's *"legible fragment on ≥90% of the first 14 days"*.
   */
  legibleToday?: number;
  /** Pages FILED today, legible or not — the cozy half of the same promise. */
  filedToday?: number;
}

/**
 * Can the player address the Sanctum from where a day BEGINS? A fresh manor
 * puts her in the Entrance Hall (`createManor`), and the tube is there
 * (`SPEAKING_TUBE_CELL`), so this is the model's whole account of §5.2's
 * headline metric: the day she first says a word at the door.
 */
export function canSpeakAtDawn(): boolean {
  return canAddressSanctum(createManor(1));
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
  carry?: {
    sealedBacklog?: number;
    /**
     * Evenings she has ALREADY spent on the top storeys — `maxRow` at or above
     * `SANCTUM_ARC.surveyRow0` — which is the landing arc's only fuel. Live
     * source: `chronicles.dayRecords[].highestRow`, written every dusk and
     * persisted forever (`surveyEveningsIn`). 0 on an isolated day, which is
     * correct: an isolated day has no campaign behind it.
     */
    surveyEvenings?: number;
    /** LEGIBLE fragments on the desk at dawn — the mercy's knowledge half. */
    legibleFragments?: number;
    /**
     * ROUND 20 (REVIEW_AA §5.7) — what the papers remember the wings for. See
     * `WING_MODEL` for the two assumptions this makes and why they are the
     * pessimistic ones for every band in 4.10.
     */
    wingCharacter?: WingCharacter;
    /** Fern's key access, so the landing offer rolls the weights she really has. */
    keyAccess?: number;
    /**
     * ROUND 17 (REVIEW_AA §5.2) — THE WORD HAS ALREADY BEEN SPOKEN, down the
     * Entrance Hall's speaking tube, and the house is holding its doors for the
     * walk up (engine/manor/tube.ts `sanctumAnswered` / `doorsHeldOpen`).
     *
     * Two effects, both live: the landing offer's mercy slot is armed outright
     * (so the storey she pays for is the door she gets), and the padlocks on
     * the upper rows stand open (so the last climb is a climb and not a key
     * lottery). Both are inert on every day before the answer, which is why
     * this cannot touch 4.10d's day-1 landing reach — it cannot be true on a
     * day she has not already won the deduction.
     */
    sanctumAnswered?: boolean;
  },
): SimDayResult {
  let ledger = createLedger(STEP_TABLE.dayStart);
  // ROUND 23 — the cup at the door; the rest of the pot is carried up to the
  // second landing (`TEA_POUR`, REVIEW_AA §5.10). Same total, same arc, and
  // the ground floor stops getting richer every week.
  const tea = teaDawnPour(profile.brambleAffinity);
  if (tea > 0) ledger = appendEntry(ledger, { reason: 'tea', delta: tea, at: 0 });
  const landingPot = teaLandingPour(profile.brambleAffinity);
  let landingPoured = false;
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
  // THE LANDING DRAFT (round 13). She gets exactly one at (2,5) per evening —
  // the cell is drafted once and the manor resets at dawn — so this is rolled
  // on the first arrival and never again today.
  let landingDrafted = false;
  let atSanctumDoor = false;
  const surveyEvenings = carry?.surveyEvenings ?? 0;
  // ROUND 17: once the word is answered the house stops gambling with her —
  // the mercy slot is armed and the plans of the top storey are as good as they
  // will ever get. Before that, both terms are exactly what they always were.
  const answered = carry?.sanctumAnswered ?? false;
  const landingArc = {
    planWarmth: answered ? 1 : sanctumPlanWarmth(surveyEvenings),
    mercy: answered || sanctumMercyArmed(surveyEvenings, carry?.legibleFragments ?? 0),
    keyAccess: carry?.keyAccess ?? 0,
  };

  // ── THE GROUND FLOOR, MEASURED (round 23, REVIEW_AA §5.10). ─────────────
  // Sampled as the evening happens rather than reconstructed at dusk: the
  // question is what she is holding while she walks rows 0–2, and once she has
  // climbed out of the band the samples stop, because a purse she carries back
  // down at dusk is not the ground floor's tension, it is the day's residue.
  const pressure: GroundPressure = {
    inHand: [], groundNet: 0, groundRooms: 0, atFirstLock: null, peak: STEP_TABLE.dayStart,
  };
  const inHandSamples = pressure.inHand as number[];
  let leftGround = false;
  let lastTotal = ledgerTotal(ledger);   // after the dawn pour: the arc is not the floor's
  pressure.peak = lastTotal;
  /** Reconcile the ledger since the last mark: her purse, her peak, the drain. */
  const mark = () => {
    const total = ledgerTotal(ledger);
    if (total > pressure.peak) pressure.peak = total;
    if (!leftGround) {
      pressure.groundNet += total - lastTotal;
      inHandSamples.push(Math.max(0, total));
    }
    lastTotal = total;
  };
  mark();

  /** Charge one move into 0-based `intoRow0`. */
  const move = (intoRow0: number) => {
    // The step OUT of the tier-1 band belongs to the climb, not to the floor.
    if (intoRow0 > GROUND_ROWS) leftGround = true;
    ledger = appendEntry(ledger, {
      reason: 'move', delta: moveAt(intoRow0), at: 0, roomKey: `2,${intoRow0}`,
    });
    seconds += TIME_TABLE.moveTap;
    mark();
  };

  let endReason: SimEndReason = 'capped';
  outer: while (rooms < MOVEMENT.maxRoomsPerDay) {
    // ── THE EVENING'S SECOND ENDING (round 23, `RETIREMENT`). ─────────────
    // "An early night, well chosen" — she is out on the blueprint with steps
    // still in hand and she puts the kettle on. Before this the loop only ever
    // exited broke, which is what made REVIEW_AA §8's unspent-budget gate
    // answer itself: 100.0% of days ended at exactly 0.
    if (profile.sessionMinutes !== undefined && seconds / 60 >= profile.sessionMinutes) {
      endReason = 'retired';
      break outer;
    }
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
      if (ledgerTotal(ledger) <= 0) { endReason = 'broke'; break outer; } // dusk, out on the blueprint
    }

    // --- The padlock (DOOR_LOCKS): the hard gate on the upper storeys. -----
    // Rolled BEFORE the step is charged, because that is how the live game
    // plays it (app/slices/manor.ts openDraft): the padlock is already drawn
    // on the blueprint, so a door she cannot open is a door she declines to
    // walk to — refused free, never a surprise charge (AAA 4.6). The key
    // itself is spent on placement, i.e. only when the climb actually
    // happens, which is exactly what the `keys -=` below models.
    if (wantsUp && !answered && (DOOR_LOCKS.chanceByRow[targetRow0] ?? 0) > 0) {
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
            if (ledgerTotal(ledger) <= 0) { endReason = 'broke'; break outer; }
          }
        }
      }
    }
    move(targetRow - 1);
    // She has paid for the storey, so she is STANDING on it — even if that was
    // her last step. The live game agrees and is explicit about it
    // (app/slices/manor.ts openDraft: "even if it was her last step, the offer
    // still opens", dusk deferred until it resolves), so recording the arrival
    // before the dusk check is what stops the model from charging her for a
    // floor it then says she never reached.
    row = targetRow;
    maxRow = Math.max(maxRow, row);
    if (ledgerTotal(ledger) <= 0) { endReason = 'broke'; break outer; }

    // --- Draft: three cards from the real deck mix, one taken. ------------
    seconds += TIME_TABLE.draft;
    // The wing term (round 20): on the share of drafts that land in a wing the
    // papers remember, the deck she is offered is the tidied one.
    const inRememberedWing =
      carry?.wingCharacter !== undefined && rng() < WING_MODEL.matchChance;
    const mix = deckMixAt(
      targetRow - 1, BASE_DECK, inRememberedWing ? carry?.wingCharacter : undefined,
    );
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
    const tier: Tier = rowTier(row - 1);
    const roomKey = `sim-${rooms}`;
    if (!leftGround) pressure.groundRooms += 1;
    if (row - 1 >= FIRST_LOCKED_ROW && pressure.atFirstLock === null) {
      pressure.atFirstLock = stepsRemaining(ledger);
    }

    // ── BRAMBLE CARRIES THE POT UP (round 23, `TEA_POUR`, REVIEW_AA §5.10). ─
    // The live counterpart is app/slices/manor.ts, on the placement that puts
    // her on the second landing — same row, same one-per-evening rule, and the
    // same audited 'tea' entry, so what floats on her counter here is what
    // floats on it in the game.
    if (!landingPoured && row - 1 >= TEA_POUR.landingRow0) {
      landingPoured = true;
      if (landingPot > 0) {
        ledger = appendEntry(ledger, {
          reason: 'tea', delta: landingPot, at: 0, roomKey: TEA_POUR.key,
        });
      }
    }

    // ── THE SECOND GATE, DRAFTED FOR REAL (round 13, AAA 4.10d/e). ─────────
    // Arriving on the landing is the CLIMB; opening the door is the GATE, and
    // the gate is a card. Roll the offer she really gets at (2,5), through the
    // same `rollCards` the slice calls, and take the plan that opens north if
    // one is there — which she can now see on the card face (DraftModal stamps
    // it). One roll per evening: the cell is drafted once and the manor resets
    // at dawn, so an evening that lands on a sealed plan is an evening spent.
    if (row === SANCTUM_LANDING_ROW && !landingDrafted) {
      landingDrafted = true;
      atSanctumDoor = landingDraft(Math.floor(rng() * 2 ** 31), landingArc);
    }

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
        // ── WHICH ROOM, AND HOW LONG SHE GIVES IT (round 22). ───────────────
        // The kind is drawn off the real draft weights, the work it asks for
        // comes from `ROOM_EFFORT`, and the sitting she was willing to give it
        // decides whether the evening contains a solved Conservatory or a
        // Conservatory she banked three rungs of and left for tomorrow.
        const puzzleKind = drawPuzzleKind(rng, targetRow - 1, kind);
        const workMinutes = effortMinutes(puzzleKind, tier);
        const windDown = seconds / 60 > SESSION_WIND_DOWN.afterMinutes
          ? SESSION_WIND_DOWN.patienceFactor : 1;
        const willing = profile.patienceMinutes * windDown
          * (PATIENCE_SPREAD[0] + rng() * (PATIENCE_SPREAD[1] - PATIENCE_SPREAD[0]));
        const inSight = workMinutes <= willing * PATIENCE_STRETCH;
        const solved = inSight && rng() < profile.solveRate;
        const playedMinutes = solved ? workMinutes : Math.min(willing, workMinutes);
        const workedFraction = workMinutes > 0 ? playedMinutes / workMinutes : 1;
        const perfect = solved && rng() < profile.perfectRate;
        const [mMin, mMax] = solved ? profile.mistakesSolved : profile.mistakesUnsolved;
        // Mistakes scale with the time actually spent in the room: a board she
        // looked at for ninety seconds cannot cost her four wrong claims.
        const mistakes = perfect ? 0
          : Math.round(randInt(rng, mMin, mMax) * (solved ? 1 : workedFraction));
        for (let m = 0; m < mistakes; m++) {
          ledger = appendEntry(ledger, {
            reason: 'mistake', delta: STEP_TABLE.mistake(1, tier), at: 0, roomKey,
          });
        }
        seconds += TIME_TABLE.solveSeconds(puzzleKind, tier) * workedFraction * clockJitter(timeRng);
        if (solved) {
          ledger = appendEntry(ledger, {
            reason: 'solve', delta: STEP_TABLE.solve(kind, tier, puzzleKind), at: 0, roomKey,
          });
          if (perfect) {
            ledger = appendEntry(ledger, {
              reason: 'perfect', delta: STEP_TABLE.perfect, at: 0, roomKey,
            });
          }
          // ROUND 10 — the solve pays the padlock arc (app/slices/room.ts
          // applies exactly this, off the same `solveKeys` table).
          const earned = solveKeys(tier, puzzleKind);
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
        } else if (paysInStages(puzzleKind, tier)) {
          // ── THE LADDER PAYS (REVIEW_AA §6, round 22). ────────────────────
          // She worked it and left it for tomorrow, and the rungs she crossed
          // are hers: `stageSteps` is the same function the room slice calls
          // off the adapters' own progress events, so what the model banks
          // here is exactly what the live ledger prints. Before this, a hive
          // worked for six minutes paid ZERO, which is why both reviewers
          // stopped opening the long rooms at all.
          const banked = stageSteps(puzzleKind, tier, workedFraction, 0);
          if (banked > 0) {
            ledger = appendEntry(ledger, {
              reason: 'solve', delta: banked, at: 0, roomKey,
            });
          }
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

    mark();
    // Dusk never fires inside a room; it fires on exit (AAA 4.12) — a
    // mid-puzzle overdraft is allowed, then the day ends out on the floor.
    if (ledgerTotal(ledger) <= 0) { endReason = 'broke'; break; }
  }

  return {
    rooms,
    roomsSolved,
    maxRow,
    reachedSanctum: atSanctumDoor,
    reachedLanding: maxRow >= SANCTUM_LANDING_ROW,
    fragmentsFound,
    pagesMadeOut,
    sealedBacklog: sealed,
    keysFound,
    keysFromSolves,
    lockedOut,
    stepsLeft: stepsRemaining(ledger),
    spent: stepsSpent(ledger),
    refunded: stepsRefunded(ledger),
    couldSpeak: canSpeakAtDawn(),
    minutes: seconds / 60,
    endReason,
    pressure,
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
  /**
   * AAA 4.14's floor, DERIVED from the shipped rule rather than transcribed
   * (round 18 — the §0 lesson applied to one more constant). This was the
   * literal `3`; when `PITY_DROUGHT_DAYS` moved to 2 the model would have gone
   * on measuring the old mercy channel while the game shipped the new one, and
   * every band below would have been quietly wrong in the reassuring direction.
   */
  pityDays: PITY_DROUGHT_DAYS,
  /**
   * THE SOLVE CHANNELS (engine/volume.ts `STUDY_CHANNEL`/`LINTEL_CHANNEL`):
   * the Study's channel and the lintel channel, valved to one per day per
   * channel and STRICT, so a channel only pays while the volume still authors
   * something labelled for it. Arrives LEGIBLE: she solved for it.
   *
   * ROUND 17 — DERIVED, NOT TRANSCRIBED (REVIEW_AA §5.1 + §0's lesson). These
   * were the literals `3` and `2`, copied from the volume's pre-re-route
   * routing: under the old kind-based rule exactly TWO fragments in the whole
   * volume were reachable by an ordinary evening's solve. §5.1 re-routed the
   * spine through the word games — the authored counts are now 2 and 11 — and
   * a transcribed constant would have left this model measuring the starved
   * channel while the game shipped the fixed one. `channelStock` reads the same
   * authored JSON the live game routes on, so the re-route moved the model with
   * it and a future re-route cannot leave it behind.
   */
  studyChannelStock: channelStock(VOLUME_1, STUDY_CHANNEL),
  lintelChannelStock: channelStock(VOLUME_1, LINTEL_CHANNEL),
  /**
   * The volume's whole authored supply — nothing can be learned past it.
   * Volume 1 ships 28 fragments since round 21 (the last of them is the
   * Portrait's confession, a scene rather than a clue). Counted, never typed,
   * for the same reason as above.
   */
  volumeFragments: VOLUME_1.fragments.length,
  /**
   * Fragments she needs LEGIBLE before the word is deducible for her. Sampled
   * per campaign — some volumes click early, some resist.
   *
   * ROUND-11 RE-DERIVATION. This band used to be [11, 17], calibrated when
   * this model had no solve channels at all and counted violet rooms entered
   * as knowledge outright. Wiring the channels in put five guaranteed early
   * fragments on the board, so the old floor no longer described the same
   * thing. Re-derived from what actually pins the answer instead of from the
   * old number: tests/volume-solvability.test.ts proves volume 1's engravings
   * are individually soft and jointly sufficient, and the ORDERED chain is
   * what fixes the band — every engraving must leave a strictly shorter
   * shortlist than the state before it, and the last one is the tie-breaker.
   *
   * ROUND 21, the current derivation. Volume 1 authors 28 pages and TEN
   * engravings at revealOrder 2/5/8/11/14/17/20/22/24/26; the chain runs
   *
   *   171755 → 15232 → 6575 → 208 → 146 → 56 → 11 → 5 → 3 → 2 → 1
   *
   * so the ninth (vowel-sequence A-U-A) still leaves LACUNA and LAGUNA and
   * only the tenth (contains C, cut into the Sanctum door) parts them. The
   * optimistic end is therefore "she holds all 25 pages before the tie-breaker
   * and guesses between two words"; the resistant end is the whole 28-page
   * file. Under the old 17-page volume the identical two rules gave [15, 17].
   */
  /* ROUND 16: IMPORTED, NOT RESTATED. This band is the mystery's property,
   * not the model's — it belongs to volume 1's constraint set, and
   * engine/volume.ts owns it (`FRAGMENTS_TO_DEDUCE`). It used to be a literal
   * `[13, 17]` here, held equal to the engine's copy only by a test in
   * tests/journal.test.ts, which fails loudly on drift but cannot prevent it.
   * Now there is one number and drift is impossible. */
  fragmentsToDeduce: FRAGMENTS_TO_DEDUCE,
} as const;

export interface SimCampaignResult {
  days: SimDayResult[];
  /**
   * 1-based day she first stood AT THE SANCTUM DOOR — the live `atSanctumDoor`
   * gate. null = never, in window. (Round 13: this used to mean the storey.)
   */
  firstSanctumReachDay: number | null;
  /**
   * 1-based day she first stood on the landing CELL, door or no door. The
   * climb's own milestone, reported apart from the gate's so the cost of the
   * gate is a measured number rather than a story.
   */
  firstLandingDay: number | null;
  /** Evenings spent on the landing across the campaign. */
  landingEvenings: number;
  /** Evenings that surveyed the top storeys — the landing arc's fuel. */
  surveyEvenings: number;
  /**
   * ROUND 17 (REVIEW_AA §5.2) — THE HEADLINE METRIC: the 1-based day she could
   * first SAY A WORD to the Sanctum. Before the speaking tube this was
   * `firstSanctumReachDay` by construction (the door was the only mouth in the
   * game), i.e. median day 9 skilled / 19 median-player, with a 7–14% tail that
   * never spoke at all. With the tube it is the first day she plays.
   */
  firstSpeakDay: number | null;
  /** 1-based day she had enough LEGIBLE fragments to name the word. */
  deductionDay: number | null;
  /**
   * 1-based day she NAMED it — spoke the true word, at the door or down the
   * tube. The deduction plus one evening: the model has her fragments landing
   * during the day and the file read that night, so the tube hears it at the
   * next dawn. The volume is NOT closed here (see `volumeWinDay`).
   */
  answeredDay: number | null;
  /**
   * 1-based day she both KNEW it and REACHED the door. The volume win — the
   * ceremony is at the top of the house and always has been.
   */
  volumeWinDay: number | null;
  /**
   * Evenings between naming the word and being let in to say it to his face.
   * The quantity REVIEW_AA §5.2 is about, and the one `SANCTUM_ARC`'s mercy was
   * built to bound: measured median 9 / p90 25 before that arc, median 7 / p90
   * 17 after it, and it is what the answered-door hold collapses.
   */
  answeredToWinDays: number | null;
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
  let firstLandingDay: number | null = null;
  let landingEvenings = 0;
  let surveyEvenings = 0;
  let deductionDay: number | null = null;
  let answeredDay: number | null = null;
  let firstSpeakDay: number | null = null;
  let volumeWinDay: number | null = null;

  for (let day = 1; day <= days; day++) {
    const profile = campaignProfileForDay(base, day);
    /**
     * ROUND 17 (REVIEW_AA §5.2). Two independent facts, kept apart on purpose:
     *
     *   `answered` — the true word is already spoken and the house is holding
     *     its doors (yesterday's fact, read at dawn like every other carry).
     *   `speaks today` — she has the word and has not said it yet. The model
     *     has fragments landing DURING an evening and the file read that night,
     *     so the earliest she can name it is the morning after `deductionDay`.
     *     That is deliberately the conservative reading: a real player who
     *     deduces it mid-evening simply walks back down to the hall and says it
     *     the same day, which this model never credits her for.
     */
    if (answeredDay === null && deductionDay !== null && day > deductionDay) answeredDay = day;
    const answered = answeredDay !== null && day >= answeredDay;
    // Yesterday's unread pages are still on the desk at dawn — the seal is a
    // save flag, not a day-scoped counter (engine/volume.ts).
    const result = simulateDay(rng, profile, timeRng, {
      sealedBacklog,
      // THE LANDING ARC (round 13, `SANCTUM_ARC`) — the campaign's one lever
      // that is still moving after day 12. Both terms are yesterday's, read at
      // dawn: the evenings already spent on that landing (live source:
      // `chronicles.dayRecords[].highestRow`, which persists forever) and the
      // pages she can actually READ (sealed smudges arm nothing).
      surveyEvenings,
      legibleFragments: fragments,
      keyAccess: keyAccessFor(fernPointsOnDay(day)),
      sanctumAnswered: answered,
      // ROUND 20: the papers commit after `WING_MEMORY.eveningsToRemember`
      // evenings of agreement, so a campaign's first two nights are exactly
      // what they always were and every day after carries the wing term.
      wingCharacter: day > WING_MEMORY.eveningsToRemember ? WING_MODEL.character : undefined,
    });
    results.push(result);
    if (firstSpeakDay === null && result.couldSpeak) firstSpeakDay = day;
    sealedBacklog = result.sealedBacklog;
    if (sealedBacklog > 0) sealedOvernightDays += 1;
    // `maxRow` is 1-based here, `SANCTUM_ARC.surveyRow0` is a 0-based grid row.
    if (result.maxRow - 1 >= SANCTUM_ARC.surveyRow0) surveyEvenings += 1;
    if (result.reachedLanding) {
      landingEvenings += 1;
      if (firstLandingDay === null) firstLandingDay = day;
    }

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

    /**
     * ROUND 18 (REVIEW_AA §5.1's success metric, made readable).
     *
     * The review asks for *"a legible fragment on ≥ 90% of the first 14 days"*
     * and names `simulateCampaigns(PROFILE_DECENT, …)` as the instrument. The
     * quantity existed only as a local in this loop, so nobody outside could
     * measure it without reimplementing the loop — which is how the two
     * reviewers ended up with opposite journals and no shared number. It is
     * recorded on the day now, and `scripts/review-metrics.ts` reads it.
     */
    result.legibleToday = legible;
    result.filedToday = filed;

    // Nothing can be learned past the volume's authored supply.
    filed = Math.min(filed, KNOWLEDGE.volumeFragments - fragmentsFiled);
    fragmentsFiled += filed;
    fragments = Math.min(fragments + legible, fragmentsFiled);

    if (deductionDay === null && fragments >= fragmentsNeeded) deductionDay = day;
    // THE WIN IS STILL AT THE DOOR (REVIEW_AA §5.2's "keep the ceremony of
    // actually reaching the Sanctum meaningful"). The tube carries the word;
    // the seal, the reveal and the monologue only ever play on the landing. So
    // winning needs BOTH gates exactly as 4.10e always said — what changed is
    // that the second one is no longer a lottery once the first is won.
    if (volumeWinDay === null && answered && result.reachedSanctum) volumeWinDay = day;
  }

  return {
    days: results, firstSanctumReachDay, firstLandingDay, landingEvenings, surveyEvenings,
    firstSpeakDay, deductionDay, answeredDay, volumeWinDay,
    answeredToWinDays:
      answeredDay !== null && volumeWinDay !== null ? volumeWinDay - answeredDay : null,
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
