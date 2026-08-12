/**
 * The floorplan deck — OWNER: A1 (Manor). Registry touchpoint: deck card ids.
 *
 * RoomCard defs (shape frozen in engine/types.ts). Blue Prince lessons
 * (BENCHMARKS §4 / AAA 4.7): specialist categories stay small and equal enough
 * to memorize (~5-7 each); blue puzzle rooms are the bulk of the deck. The
 * base deck is static; floorplan-cabinet unlocks append ids from the meta
 * slice (deckFor).
 *
 * ── DOOR LAYOUT VOCABULARY ────────────────────────────────────────────────
 *   dead-end ['N'] · corridor ['N','S'] ·
 *   corner-L ['N','E'] · corner-R ['N','W'] ·
 *   tee ['N','E','W'] · fork-L ['N','E','S'] · fork-R ['N','W','S'] ·
 *   cross ['N','E','S','W']
 *
 * ── ROUND-20 REBALANCE (REVIEW_AA §5.7, "make drafting a decision") ────────
 *
 * THE REVIEW'S CHARGE: *"7 of 30 cards can ONLY be dead ends and 13 can roll
 * one; the manor comes out a corridor."* Measured off this file with
 * `scripts/draft-shape.ts` before the change: 7 pure dead-end cards, 13 of 41
 * plans (31.7%) a dead end, and — the finding neither reviewer had — **every
 * single corner in the deck was the same corner.** `['N','E']` under the rigid
 * rotation (grid.ts THE ORIENTATION CONVENTION) always turns you LEFT: walking
 * north it opens west, walking west it opens south, walking south it opens
 * east. Twelve of the deck's forty-one plans were that one turn, and the deck
 * held no mirror of it at all, so the house could bend one way and only one
 * way. A floorplan generator with a single handedness does not produce
 * floorplans; it produces a spiral and a price list.
 *
 * The rebalance, and what each half is for:
 *
 *   - **`CORNER_R` exists.** Every card that carried a corner now carries both,
 *     so a corner is a real fork in the plan rather than a fixed turn, and the
 *     card face (which draws the post-rotation truth since round 9) is what
 *     tells her which she is being handed.
 *   - **`FORK_L`/`FORK_R`** — carry on AND branch. The deck had exactly one
 *     plan (`CROSS`, on one card) that both continued and opened a wing; a
 *     `TEE` branches but never carries on, and a `CORRIDOR` carries on but
 *     never branches, so a manor could not be both deep and wide without
 *     spending a whole storey on the turn. Both forks are placed only on cards
 *     whose `tierRange` stops at 2 — see the landing note below.
 *   - **Pure dead ends: 7 → 3**, and the three that stay are the three rooms
 *     whose FICTION is the end of the house — the Study (the mystery's engine,
 *     rare, tier 3, gem 2), the Gem Vault (a vault has one door) and the
 *     Observatory (the top of a tower). Dead-end PLANS fall 31.7% → 20.3%.
 *     The tension the review asked us to keep is kept: twelve of the deck's
 *     twenty-eight cards can still roll one (the review counted thirteen), a bad
 *     hand can still seal a wing, and the difference is that it is now a hand you
 *     can read and usually a hand you have an answer to.
 *   - **A sealed room now PAYS** (`SEALED_ROOM_BOUNTY`, below) — the review's
 *     own "done looks like": *"the card face says 'this room seals itself' and
 *     the player takes it anyway because it pays for it."*
 *
 * THE ONE NUMBER HELD FIXED, DELIBERATELY: the Sanctum landing. AAA 4.10d/e
 * are measured through `landingDraft`, which rolls a real offer at (2,5), and
 * only a plan containing canonical `'S'` opens north when the landing is
 * entered from below. So every tier-3-eligible card's *share* of S-bearing
 * plans is unchanged by this rebalance — the Conservatory kept two plans and
 * swapped a corner rather than gaining a third, the Counting House likewise,
 * the Darkroom traded its dead end for a corner rather than adding one — and
 * both forks live on tier-1–2 cards that the landing never sees. Measured
 * before and after: 19.0% of tier-3-eligible plans open north, 63.4% of bare
 * offers up there contain one. Unmoved, on purpose: the campaign arc is not
 * this item's to retune.
 *
 * These are CANONICAL plans, drawn as you stand at the threshold: **`'N'` is
 * the door you walk in through.** Placement turns the whole plan rigidly so
 * that `'N'` lands on the wall you came from, and every other door follows by
 * the same quarter-turns — a pure function of (layout, entry direction), no
 * rng and no choosing (engine/manor/grid.ts `orientLayout`). So a corner
 * entered walking north ALWAYS opens west; entered walking east it always
 * opens north. Author a layout with this in mind: the `'N'` is the entrance
 * and the rest is what she finds once she is inside.
 *
 * ── ROUND-36 REBALANCE (the dominance round) ──────────────────────────────
 *
 * THE CHARGE: the daily decision the whole loop hangs on was **67.0% DOMINATED**
 * — on two thirds of offers some card was at least as good as every other on
 * both axes a player can read before she spends (frontier and steps,
 * engine/economy/manor-walk.ts). Against a permutation null of 68.7% that says
 * the deck was not *pairing* geometry with payout; it was that the two axes were
 * too COARSE to trade against each other. Frontier spread was zero on 31.6% of
 * offers, because 60% of drawn plans left exactly one way on.
 *
 * The rebalance is one sentence: **the fatter the wage, the tighter the plan.**
 *
 *   - The 12-step anchors and the fat green room lose their halls. The Library
 *     (TEE → CORNER_R), the Orangery (TEE → CORNER_L) and the Kitchen (which
 *     dropped its TEE outright) are the three most-drawn wide plans in the deck
 *     and all three sat on cards that also pay well; every offer containing one
 *     had its answer written on it.
 *   - The rooms that pay NOTHING get the halls. Every parlor is a thoroughfare
 *     now (the Post Room forks, the Greenhouse and the Reading Nook tee), and
 *     so are the Chart Room and the Bureau. The trade the draft is supposed to
 *     be is now on the card face: *this room pays twelve steps and corners you;
 *     that one pays nothing and keeps the house open.*
 *   - The Linen Closet spans the range on its own (dead end · corner · tee), so
 *     a single common card can be the narrow plan or the wide one.
 *
 * THE CHART ROOM AND THE BUREAU ARE NOT DECORATION — THEY ARE A REPAIR, and it
 * is the finding this round nearly shipped without. A violet room pays no steps
 * and, before this, drew no wide plan: on the two axes the draft is measured on
 * it was the dominated card in every offer that held one. So the moment the
 * draft became a decision, the player correctly started DECLINING the mystery.
 * Measured on the day model: violet picks fell 1.21 → 0.79 an evening and the
 * fragment drip thinned with it (worst filed drought 3 days → 4, through
 * volume-pacing's floor). Giving those two cards a hall — a room of maps is a
 * room you route from, and the Bureau's drawers stand in a passage — puts them
 * back in the running without touching their draw weight, and the median
 * player's violet-met rate lands at **33.9%** against the 37.0% it was and the
 * 50% ceiling above which 4.10g says it has stopped being a rare room. The
 * Observatory, the Boxroom and the Archive keep their dead ends: violet is
 * still mostly a room you go INTO rather than through.
 *
 * MEASURED, with `scripts/draft-shape.ts` and the walker in
 * tests/draft-dominance.test.ts: dominance **67.0% → 34.9%**, frontier spread
 * zero **31.6% → 5.6%**, three-cards-one-category **19.3% → 15.5%**. The deck
 * now sits fifteen points BELOW its own permutation null, which is the
 * signature of cards that genuinely trade rather than merely differ.
 *
 * TWO THINGS HELD FIXED BY CONSTRUCTION, and both are checkable rather than
 * asserted:
 *   1. **The landing — the DECK half of it.** Every tier-3-eligible card's
 *      chance of drawing an S-bearing plan is bit-identical: the four cards
 *      that lost a plan had no S-plan to lose, and the Library kept its
 *      corridor. 41 tier-3 plans before and after, 17.1% of them S-bearing,
 *      and `scripts/draft-shape.ts` reads the same 19.0% of plans opening north
 *      per card-day before and after. So nothing in THIS file moves AAA
 *      4.10d/e, the way round 20 also kept them out of its own rebalance.
 *
 *      What DOES move the landing is drafting.ts's spread rule, and it is
 *      reported rather than buried: a plan that opens north is a corridor, a
 *      fork or a cross — the wide shapes — so the rule surfaces them, and a
 *      bare offer up there contains one on **71.2%** of draws against 63.4%.
 *      That is the round-13 blocker getting smaller (two evenings in five
 *      arriving at an offer that could not open the door, now closer to one in
 *      four), it is good news, and it is why `SANCTUM_ARC` has slightly less
 *      work to do than it did.
 *   2. **The deck's dead-end share and its mean way-on count.** 20.3% and 1.00
 *      before; 20.7% and 1.05 after. This is a rebalance of WHICH cards carry
 *      the wide plans, not a wider deck — a wider deck shows up immediately as
 *      a cheaper climb and a ground floor that stops costing her (round 36
 *      measured exactly that on its first attempt, at mean 1.08).
 *
 * THE THREE PROTECTED ROOMS ARE UNTOUCHED: the Conservatory, the Counting House
 * and the Study keep the plans they had, and the Study keeps its single door.
 *
 * A card may carry several plans. Which one arrives is a deterministic hash of
 * (daySeed, target cell, card id) — `layoutFor` — so the shape behind a given
 * door is fixed for the day and the draft card face can show it before she
 * picks. Adding or removing a layout therefore changes what that card looks
 * like at every door, but never *whether* it is placeable.
 */

import type { Dir, RoomCard } from '../types';
import { KEY_SUPPLY } from '../economy/steps';

const DEAD_END: Dir[] = ['N'];
const CORRIDOR: Dir[] = ['N', 'S'];
/** Turns LEFT in play: entered walking north it opens west. */
const CORNER_L: Dir[] = ['N', 'E'];
/** Its mirror — turns RIGHT: entered walking north it opens east. */
const CORNER_R: Dir[] = ['N', 'W'];
const TEE: Dir[] = ['N', 'E', 'W'];
/** Carries on and branches once. Tier 1–2 cards only (see the landing note). */
const FORK_L: Dir[] = ['N', 'E', 'S'];
const FORK_R: Dir[] = ['N', 'W', 'S'];
const CROSS: Dir[] = ['N', 'E', 'S', 'W'];

// ---------------------------------------------------------------------------
// Puzzle rooms (blue) — the word games, the bulk of the deck
// ---------------------------------------------------------------------------

const PUZZLE_CARDS: RoomCard[] = [
  // Anchors (MANOR_DESIGN §6)
  { id: 'library', name: 'The Library', category: 'puzzle', puzzleKind: 'word-web',
    doorLayouts: [CORNER_R, CORRIDOR], tierRange: [1, 3], gemCost: 0, rarity: 'standard' },
  { id: 'reading-room', name: 'The Reading Room', category: 'puzzle', puzzleKind: 'word-web',
    doorLayouts: [CORNER_L, CORNER_R, DEAD_END], tierRange: [2, 3], gemCost: 1, rarity: 'unusual' },
  { id: 'conservatory', name: 'The Conservatory', category: 'puzzle', puzzleKind: 'hive',
    doorLayouts: [CORNER_R, CORRIDOR], tierRange: [1, 3], gemCost: 0, rarity: 'standard' },
  { id: 'orangery', name: 'The Orangery', category: 'puzzle', puzzleKind: 'hive',
    doorLayouts: [CORNER_L, CORNER_R], tierRange: [2, 3], gemCost: 1, rarity: 'unusual' },
  { id: 'gallery', name: 'The Gallery', category: 'puzzle', puzzleKind: 'twistle',
    doorLayouts: [CORRIDOR, TEE], tierRange: [1, 3], gemCost: 0, rarity: 'standard' },
  { id: 'long-gallery', name: 'The Long Gallery', category: 'puzzle', puzzleKind: 'twistle',
    doorLayouts: [CROSS], tierRange: [2, 3], gemCost: 1, rarity: 'unusual' },
  // A2 ROW-GATING (2026-08 owner playtest: "I reached the Forgotten Word on my
  // FIRST DAY"). The Study is the room that feeds the meta-mystery directly —
  // MANOR_DESIGN §6 already calls it "large, rare". Gating it to tier 3 puts
  // it on rows 5–6 only, i.e. behind the padlocks and the priced climb, so
  // finding it is the reward for an ascent instead of a day-1 coin flip.
  { id: 'study', name: 'The Study', category: 'puzzle', puzzleKind: 'forgotten-word',
    doorLayouts: [DEAD_END], tierRange: [3, 3], gemCost: 2, rarity: 'rare' },

  // Micro-rooms (30-90s). OWNER CULL round ("fewer but better"): the
  // Vestibule/Staircase/Music Room/Pantry archetypes are retired; the two
  // survivors carry the whole micro slot, so both span all three tiers,
  // stay common/free, and between them cover pass-through layouts (the
  // Darkroom picks up a corridor so blue micro rooms aren't all dead ends).
  { id: 'darkroom', name: 'The Darkroom', category: 'puzzle', puzzleKind: 'cipher',
    doorLayouts: [CORNER_L, CORNER_R, CORRIDOR], tierRange: [1, 3], gemCost: 0, rarity: 'common' },
  { id: 'linen-closet', name: 'The Linen Closet', category: 'puzzle', puzzleKind: 'crossword',
    doorLayouts: [DEAD_END, CORNER_R, TEE], tierRange: [1, 3], gemCost: 0, rarity: 'common' },

  // The ledger rooms (sudoku). Playtest round: the owner's expert-baseline
  // request, so BOTH cards draw from a pool with no easy bin — the Counting
  // House spans every row (tier by manor row: rows 1-2 draw technique-tier 1
  // ≈ NYT hard/expert, rows 5-6 draw tier 3 ≈ diabolical), and the Strong
  // Room is the premium upper-row card that never offers anything softer
  // than tier 2. Same anchor pattern as Library/Reading Room.
  { id: 'counting-house', name: 'The Counting House', category: 'puzzle', puzzleKind: 'sudoku',
    doorLayouts: [CORRIDOR, CORNER_R], tierRange: [1, 3], gemCost: 0, rarity: 'standard' },
  { id: 'strong-room', name: 'The Strong Room', category: 'puzzle', puzzleKind: 'sudoku',
    doorLayouts: [DEAD_END, CORNER_R], tierRange: [2, 3], gemCost: 1, rarity: 'unusual' },
];

// ---------------------------------------------------------------------------
// Utility rooms (green) — the economy (fade at higher rows)
// ---------------------------------------------------------------------------

const UTILITY_CARDS: RoomCard[] = [
  { id: 'kitchen', name: 'The Kitchen', category: 'utility',
    doorLayouts: [CORNER_L, CORNER_R], tierRange: [1, 2], gemCost: 0, rarity: 'standard' },
  { id: 'larder', name: 'The Larder', category: 'utility',
    doorLayouts: [DEAD_END, CORNER_R], tierRange: [1, 2], gemCost: 0, rarity: 'common' },
  { id: 'boot-room', name: 'The Boot Room', category: 'utility',
    doorLayouts: [CORRIDOR, CORNER_L], tierRange: [1, 1], gemCost: 0, rarity: 'common' },
  { id: 'gem-vault', name: 'The Gem Vault', category: 'utility',
    doorLayouts: [DEAD_END], tierRange: [1, 3], gemCost: 0, rarity: 'unusual' },
  { id: 'key-cabinet', name: 'The Key Cabinet', category: 'utility',
    doorLayouts: [CORNER_L, CORNER_R, DEAD_END], tierRange: [1, 3], gemCost: 0, rarity: 'unusual' },
  { id: 'dumbwaiter', name: 'The Dumbwaiter', category: 'utility',
    doorLayouts: [CORRIDOR, FORK_L], tierRange: [1, 2], gemCost: 1, rarity: 'unusual' },
  { id: 'still-room', name: 'The Still Room', category: 'utility',
    doorLayouts: [CORNER_R, TEE], tierRange: [1, 2], gemCost: 0, rarity: 'common' },
];

// ---------------------------------------------------------------------------
// Parlor rooms (yellow) — a character is here (flows land with A6)
// ---------------------------------------------------------------------------

const PARLOR_CARDS: RoomCard[] = [
  { id: 'reading-nook', name: 'The Reading Nook', category: 'parlor',
    doorLayouts: [TEE, CORNER_R, DEAD_END], tierRange: [1, 3], gemCost: 0, rarity: 'standard' },
  { id: 'post-room', name: 'The Post Room', category: 'parlor',
    doorLayouts: [TEE, FORK_L], tierRange: [1, 2], gemCost: 0, rarity: 'standard' },
  { id: 'greenhouse', name: 'The Greenhouse', category: 'parlor',
    doorLayouts: [TEE, CORNER_L], tierRange: [1, 3], gemCost: 0, rarity: 'standard' },
  { id: 'morning-room', name: 'The Morning Room', category: 'parlor',
    doorLayouts: [TEE, FORK_R], tierRange: [1, 2], gemCost: 0, rarity: 'unusual' },
  { id: 'drawing-room', name: 'The Drawing Room', category: 'parlor',
    doorLayouts: [CORRIDOR, TEE], tierRange: [2, 3], gemCost: 1, rarity: 'unusual' },
];

// ---------------------------------------------------------------------------
// Mystery rooms (violet) — clue fragments; the reason to climb
// ---------------------------------------------------------------------------

/**
 * ROUND-11 RETUNE — THE VIOLET ROOM THE GROUND FLOOR CAN ACTUALLY DRAW.
 *
 * Measured before this change (`deckMixAt`, engine/economy/simulate.ts): a
 * card drawn on 0-based rows 0–2 was a mystery card **0.16%–0.56%** of the
 * time, because tier 1 admits only the Archive (unusual) and the Bureau
 * (rare) and `RARITY_WEIGHTS[1]` scores those 9 and 1 against a puzzle deck
 * full of commons. The consequence, simulated end to end: the median evening
 * (PROFILE_DECENT) contained a violet room on **9.5%** of days — so the
 * round-10 seal, the mechanic that carries "solving needs to matter", was
 * something nine evenings in ten never showed the player at all.
 *
 * The Archive is the *plain* violet room — free, a dead end, one shelf of
 * somebody's papers — and it is the card whose whole job is to be the violet
 * room she finds. It is a STANDARD card now. The Bureau, Chart Room,
 * Observatory and Boxroom keep their unusual/rare weights, so violet is still
 * a category you climb toward (`categoryWeight('mystery', row)` ramps on top
 * of this); what changed is that the ground floor can show her one.
 */
const MYSTERY_CARDS: RoomCard[] = [
  { id: 'archive', name: 'The Archive', category: 'mystery',
    doorLayouts: [DEAD_END, CORNER_R], tierRange: [1, 3], gemCost: 0, rarity: 'standard' },
  { id: 'chart-room', name: 'The Chart Room', category: 'mystery',
    doorLayouts: [TEE, CORNER_R], tierRange: [2, 3], gemCost: 1, rarity: 'unusual' },
  { id: 'observatory', name: 'The Observatory', category: 'mystery',
    doorLayouts: [DEAD_END], tierRange: [2, 3], gemCost: 2, rarity: 'rare' },
  { id: 'bureau', name: 'The Bureau', category: 'mystery',
    doorLayouts: [TEE, CORNER_R, DEAD_END], tierRange: [1, 2], gemCost: 1, rarity: 'rare' },
  { id: 'boxroom', name: 'The Boxroom', category: 'mystery',
    doorLayouts: [DEAD_END, CORNER_R], tierRange: [3, 3], gemCost: 2, rarity: 'rare' },
];

export const BASE_DECK: readonly RoomCard[] = [
  ...PUZZLE_CARDS, ...UTILITY_CARDS, ...PARLOR_CARDS, ...MYSTERY_CARDS,
];

/**
 * Cabinet-unlockable extras (AAA 4.7).
 *
 * ROUND-7 DEFECT, fixed here: `unlockedBy` named `posy-quest-1` /
 * `posy-quest-2` — ids nothing in the game ever produced. Posy's favor chain
 * had been authored the whole time and sets `posy.quest1.done`; her locked
 * rank sets `posy.deputy` (content/authored/dialogue/posy.json). The two
 * vocabularies never met, `meta.unlockCard` had zero call sites, and both
 * plates in the cabinet were permanently silhouetted.
 *
 * `unlockedBy` is now THE STORY FLAG ITSELF (docs/flags.md grammar), so the
 * award path is a lookup instead of a translation table someone has to
 * remember to keep in step: the meta slice watches the flag set and calls
 * `unlockCard` for every card whose flag has been set (app/slices/meta.ts).
 * `tests/keepsakes.test.ts` walks the authored dialogue and fails the build if
 * a card is gated on a flag no authored effect can set.
 */
export const UNLOCKABLE_CARDS: readonly RoomCard[] = [
  { id: 'winter-garden', name: 'The Winter Garden', category: 'puzzle', puzzleKind: 'hive',
    doorLayouts: [CROSS], tierRange: [1, 3], gemCost: 0, rarity: 'unusual', unlockedBy: 'posy.quest1.done' },
  { id: 'map-room', name: 'The Map Room', category: 'mystery',
    doorLayouts: [CORNER_L, CORNER_R], tierRange: [1, 3], gemCost: 1, rarity: 'unusual', unlockedBy: 'posy.deputy' },
];

/** Cards whose gating flag is set — the live unlock path (AAA 11.17). */
export function cardsUnlockedByFlags(flags: readonly string[]): string[] {
  const have = new Set(flags);
  return UNLOCKABLE_CARDS.filter((c) => c.unlockedBy && have.has(c.unlockedBy)).map((c) => c.id);
}

const CARDS_BY_ID = new Map<string, RoomCard>(
  [...BASE_DECK, ...UNLOCKABLE_CARDS].map((c) => [c.id, c]),
);

export function cardById(id: string): RoomCard | undefined {
  return CARDS_BY_ID.get(id);
}

/** The live deck: base cards plus cabinet-unlocked extras (AAA 4.7). */
export function deckFor(unlockedCardIds: readonly string[]): RoomCard[] {
  return [
    ...BASE_DECK,
    ...UNLOCKABLE_CARDS.filter((c) => unlockedCardIds.includes(c.id)),
  ];
}

// ---------------------------------------------------------------------------
// Card flavor + utility effects (kept OUTSIDE the frozen RoomCard shape)
// ---------------------------------------------------------------------------

/** One-line reward preview per card, for the draft card face. */
export const CARD_PREVIEWS: Record<string, string> = {
  'library': 'Four shelves, sixteen spines',
  'reading-room': 'Harder shelves, quieter light',
  'conservatory': 'Seven letters in bloom',
  'orangery': 'A warmer, wilder hive',
  'gallery': 'Trace words hung in a grid',
  'long-gallery': 'A grand hall of hidden words',
  'study': 'A definition missing its word',
  'darkroom': 'A phrase in cipher',
  'linen-closet': 'A crossword folded small',
  'counting-house': 'Nine figures, nine columns, one ledger',
  'strong-room': 'The ledger the auditors gave up on',
  'kitchen': '+6 steps · +2 per green room drafted after',
  'larder': '+5 steps · dough set to rise: +2 tomorrow',
  'boot-room': `+3 steps · +${KEY_SUPPLY.bootRoomKeys} key`,
  'gem-vault': '+2 gems',
  'key-cabinet': `+${KEY_SUPPLY.cabinetKeys} keys · for the padlocks upstairs`,
  'dumbwaiter': '+1 step per room drafted after it',
  'still-room': '+1 gem · +2 steps · a key on the sill tomorrow',
  'reading-nook': 'Ellery keeps the lamps low',
  'post-room': 'Posy sorts the morning letters',
  'greenhouse': 'Fern tends something for you',
  'morning-room': 'A friendly face, warm light',
  'drawing-room': 'Good company, better rumors',
  'archive': 'A clue fragment waits here',
  'chart-room': 'The lexicographer charted something',
  'observatory': 'A clearer view of the mystery',
  'bureau': 'Locked drawers, loose papers',
  'boxroom': 'The oldest boxes in the house',
  'winter-garden': 'A hive that blooms in frost',
  'map-room': 'Fragments pinned to the walls',
};

/**
 * Player-facing names for cabinet unlock quests (AAA 4.7: a locked plate names
 * the deed that fills it). Keyed by the gating STORY FLAG, so a plate and the
 * conversation that fills it cannot drift apart. Rendered by CabinetSheet.
 */
export const UNLOCK_QUEST_NAMES: Record<string, string> = {
  'posy.quest1.done': "Posy’s lost word",
  'posy.deputy': "Posy’s deputy sash",
};

export interface UtilityEffect {
  steps?: number;
  gems?: number;
  keys?: number;
  /** BP Nursery pattern (AAA 4.11): +compoundSteps whenever a later draft matches. */
  compounding?: 'utility' | 'any';
  compoundSteps?: number;
  /** Warm one-liner shown when the effect lands. */
  toast: string;
}

/**
 * Applied once when the room is drafted; compounding hooks fire on later drafts.
 *
 * KEY SOURCES (the padlock arc): the upper storeys are gated by `DOOR_LOCKS`,
 * so the green deck is where an ascent is PREPARED. The two key-bearing cards
 * are deliberately one deliberate and one incidental — the Key Cabinet is the
 * unusual card you hope for when you mean to climb, the Boot Room is the
 * common ground-floor hook you take anyway. Both counts live in A2's
 * `KEY_SUPPLY` (engine/economy/steps.ts), the one tunable economy file, so the
 * drop rate can be retuned without touching the deck's composition — rarity
 * and category are untouched, which is what keeps `deckMixAt` (and therefore
 * the 4.10b clock) calibrated exactly as it was.
 */
export const UTILITY_EFFECTS: Record<string, UtilityEffect> = {
  'kitchen': { steps: 6, compounding: 'utility', compoundSteps: 2,
    toast: 'Something warm from the oven. +6 steps' },
  'larder': { steps: 5,
    toast: 'Bread, cheese, and a stolen minute. +5 steps — dough left to rise' },
  'boot-room': { steps: 3, keys: KEY_SUPPLY.bootRoomKeys,
    toast: 'Dry socks, and a spare key on the hook. +3 steps' },
  'gem-vault': { gems: 2, toast: 'Two gems, cold and bright' },
  'key-cabinet': { keys: KEY_SUPPLY.cabinetKeys,
    toast: 'Keys, filed under someday. Two of them look upward' },
  'dumbwaiter': { compounding: 'any', compoundSteps: 1,
    toast: 'It rattles helpfully at every new room' },
  'still-room': { gems: 1, steps: 2,
    toast: 'Cordial and a gem. +2 steps — and a batch set to steep for tomorrow' },
};

/**
 * THE RENDER SEAM FOR `UtilityEffect.toast` (AAA 11.18).
 *
 * Round-6 defect: these lines had been authored since the deck was written
 * ("Two gems, cold and bright"; "Dry socks, and a spare key on the hook") and
 * `applyDraftEffects` (app/slices/manor.ts) applied the steps, gems and keys
 * without ever reading `.toast`. Two gems appeared in the bar with no word
 * said about them and no delta on the chip. Unused notice copy is a notice
 * someone forgot to show, so the string now has exactly one accessor and
 * `tests/notice-copy.test.ts` fails the build if any shipped notice string
 * loses its render site.
 *
 * Rendered by `src/ui/chrome/NoticeRail.tsx`, driven off the audited event
 * spine's `room-drafted` — so the notice lands on whatever screen she is
 * actually standing on (AAA 11.11), not on the one that happened to apply it.
 */
export function payoutNoticeFor(cardId: string): { title: string; toast: string } | null {
  const effect = UTILITY_EFFECTS[cardId];
  if (!effect) return null;
  return { title: cardById(cardId)?.name ?? cardId, toast: effect.toast };
}

// ---------------------------------------------------------------------------
// The sealed room (REVIEW_AA §5.7)
// ---------------------------------------------------------------------------

/**
 * ── A SEALED ROOM KEEPS SOMETHING ──────────────────────────────────────────
 *
 * The review's own statement of done for the drafting layer: *"Dead ends drop
 * to a small, telegraphed, deliberately-chosen minority — the card face says
 * 'this room seals itself' AND THE PLAYER TAKES IT ANYWAY BECAUSE IT PAYS FOR
 * IT."* The first two clauses landed in round 9 (the honest diagram) and in the
 * deck rebalance above. This is the third, and without it the other two only
 * make dead ends rarer, never *chooseable*.
 *
 * WHY A GEM AND NOT A STEP. A dead end costs her a FRONTIER, not a walk, so
 * paying her in walking money would be answering the wrong complaint — and
 * `STEP_TABLE` is the one surface the whole 4.10 campaign arc is calibrated
 * against (AAA 4.10b's clock, 4.10d's `reserveToTop`), which this item has no
 * business moving. A gem buys the reroll at the NEXT door and the premium cards
 * she could not otherwise afford, so the loop closes on itself exactly where
 * the frustration is: the room that sealed her wing pays for the look that
 * un-seals the next one. Gems are also the one currency `simulateDay` does not
 * model (`deckMixAt`'s own note: affordability is not modelled), so the bounty
 * cannot silently move a published band.
 *
 * It is EARNED, not free: `sealsItself` is a pure function of (card, day, cell,
 * heading) and the draft card face draws it before she taps
 * (ui/blueprint/DraftModal.tsx), so taking a sealing plan for the gem is a
 * decision with a stated price, which is the whole of §5.7.
 */
/**
 * ═══ ROUND 31 — THE STAMP SAYS WHAT IT COSTS (COMPREHENSION wrong-belief 8)
 *
 * The stamp read "Seals itself · +1 gem", and the blind-play test found it
 * being read as ATMOSPHERE — *"a cosy room that shuts its own door"* — with the
 * gem taken for a garnish. One tester took a sealing plan twice in two days and
 * ended his upward progress both times without knowing he had done it.
 *
 * "Seals itself" is a house phrase; it is not a rule of play, and a priced
 * trade whose price is unnamed is not a trade. So the stamp now states the
 * charge in the middle, between what it does and what it pays: the room costs
 * her a way on, and the gem is what the manor pays for it. Same words as the
 * card's door-plan line ("A dead end — no way on from here"), so the two
 * surfaces read as one sentence rather than two claims.
 */
export const SEALED_ROOM_BOUNTY = {
  gems: 1,
  /** The card-face stamp, said before she spends. */
  stamp: 'Seals itself · no way on from here · +1 gem',
  eyebrow: 'A room with one door',
  toast: 'Nothing has been through here in years, and now nothing will. +1 gem',
} as const;

/** The notice the rail shows when a drafted plan turns out to seal itself. */
export function sealedRoomNotice(): { title: string; toast: string } {
  return { title: SEALED_ROOM_BOUNTY.eyebrow, toast: SEALED_ROOM_BOUNTY.toast };
}

/** Cards whose face promises a key — the padlock arc's supply (AAA 4.10d). */
export const KEY_BEARING_CARD_IDS: readonly string[] = Object.entries(UTILITY_EFFECTS)
  .filter(([, e]) => (e.keys ?? 0) > 0)
  .map(([id]) => id);

export function isKeyBearing(cardId: string): boolean {
  return (UTILITY_EFFECTS[cardId]?.keys ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Cross-day investment (AAA 4.11: "at least one cross-day investment exists")
// ---------------------------------------------------------------------------

/**
 * THE THINGS THAT KEEP OVERNIGHT — Blue Prince's Sauna pattern, cozy scale.
 *
 * Round-5 audit: nothing in the game paid into tomorrow. `endDay` wipes gems,
 * keys and the whole manor, and every UTILITY_EFFECT was same-day, so a deep
 * push could never be *prepared* across a night — every ascent was
 * re-improvised from scratch and the campaign's only carry-over was affinity.
 *
 * Two existing green cards now keep something overnight. Deliberately EXISTING
 * cards, not new ones: adding a card would move `deckMixAt` and silently
 * recalibrate the 4.10b clock, whereas a new effect on the Larder and the
 * Still Room changes what those rooms MEAN without touching deck composition
 * at all.
 *
 *   - The Larder: dough set to rise → +2 steps at tomorrow's dawn, ledgered as
 *     a 'tea'-class entry through the audited path (app/slices/day.ts).
 *   - The Still Room: cordial set to steep → +1 key on the sill at dawn,
 *     granted beside Fern's morning key when the manor is built
 *     (app/slices/manor.ts). This is the one that gives the padlock arc its
 *     prepared-ascent feel: a green room drafted on a quiet Tuesday is what
 *     opens the third landing on Wednesday.
 *
 * Read from the audited event spine (yesterday's `room-drafted` events), so
 * there is no new save field and no new place for the promise to be lost.
 */
export interface CarryOverEffect {
  steps?: number;
  keys?: number;
  /** Named on the card face, so the investment is legible before she buys it. */
  promise: string;
  /** Read back at dawn, as prose. */
  dawnLine: string;
}

export const CARRY_OVER_EFFECTS: Record<string, CarryOverEffect> = {
  'larder': {
    steps: 2,
    promise: 'dough set to rise · +2 steps tomorrow',
    dawnLine: 'The Larder’s dough rose overnight.',
  },
  'still-room': {
    keys: 1,
    promise: 'cordial set to steep · a key tomorrow',
    dawnLine: 'The Still Room left a key on the sill.',
  },
};

/** What yesterday's drafted cards pay into this morning. */
export function carryOverFrom(cardIds: readonly string[]): {
  steps: number;
  keys: number;
  lines: string[];
} {
  let steps = 0;
  let keys = 0;
  const lines: string[] = [];
  for (const id of cardIds) {
    const effect = CARRY_OVER_EFFECTS[id];
    if (!effect) continue;
    steps += effect.steps ?? 0;
    keys += effect.keys ?? 0;
    if (!lines.includes(effect.dawnLine)) lines.push(effect.dawnLine);
  }
  return { steps, keys, lines };
}

/** Day 1, draft #1 — tutorial disguised as RNG (AAA 4.5, slot 1 playable now). */
export const SCRIPTED_FIRST_DRAFT: readonly string[] = ['library', 'kitchen', 'darkroom'];
