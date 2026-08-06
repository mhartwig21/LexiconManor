/**
 * The floorplan deck — OWNER: A1 (Manor). Registry touchpoint: deck card ids.
 *
 * RoomCard defs (shape frozen in engine/types.ts). Blue Prince lessons
 * (BENCHMARKS §4 / AAA 4.7): specialist categories stay small and equal enough
 * to memorize (~5-7 each); blue puzzle rooms are the bulk of the deck. The
 * base deck is static; floorplan-cabinet unlocks append ids from the meta
 * slice (deckFor).
 *
 * Door layout vocabulary (pre-rotation; orientation resolved at placement):
 *   dead-end ['N'] · corridor ['N','S'] · corner ['N','E'] ·
 *   tee ['N','E','W'] · cross ['N','E','S','W']
 */

import type { Dir, RoomCard } from '../types';
import { KEY_SUPPLY } from '../economy/steps';

const DEAD_END: Dir[] = ['N'];
const CORRIDOR: Dir[] = ['N', 'S'];
const CORNER: Dir[] = ['N', 'E'];
const TEE: Dir[] = ['N', 'E', 'W'];
const CROSS: Dir[] = ['N', 'E', 'S', 'W'];

// ---------------------------------------------------------------------------
// Puzzle rooms (blue) — the word games, the bulk of the deck
// ---------------------------------------------------------------------------

const PUZZLE_CARDS: RoomCard[] = [
  // Anchors (MANOR_DESIGN §6)
  { id: 'library', name: 'The Library', category: 'puzzle', puzzleKind: 'word-web',
    doorLayouts: [TEE, CORRIDOR], tierRange: [1, 3], gemCost: 0, rarity: 'standard' },
  { id: 'reading-room', name: 'The Reading Room', category: 'puzzle', puzzleKind: 'word-web',
    doorLayouts: [CORNER, DEAD_END], tierRange: [2, 3], gemCost: 1, rarity: 'unusual' },
  { id: 'conservatory', name: 'The Conservatory', category: 'puzzle', puzzleKind: 'hive',
    doorLayouts: [CORNER, CORRIDOR], tierRange: [1, 3], gemCost: 0, rarity: 'standard' },
  { id: 'orangery', name: 'The Orangery', category: 'puzzle', puzzleKind: 'hive',
    doorLayouts: [TEE], tierRange: [2, 3], gemCost: 1, rarity: 'unusual' },
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
    doorLayouts: [DEAD_END, CORNER, CORRIDOR], tierRange: [1, 3], gemCost: 0, rarity: 'common' },
  { id: 'linen-closet', name: 'The Linen Closet', category: 'puzzle', puzzleKind: 'crossword',
    doorLayouts: [DEAD_END, CORNER], tierRange: [1, 3], gemCost: 0, rarity: 'common' },

  // The ledger rooms (sudoku). Playtest round: the owner's expert-baseline
  // request, so BOTH cards draw from a pool with no easy bin — the Counting
  // House spans every row (tier by manor row: rows 1-2 draw technique-tier 1
  // ≈ NYT hard/expert, rows 5-6 draw tier 3 ≈ diabolical), and the Strong
  // Room is the premium upper-row card that never offers anything softer
  // than tier 2. Same anchor pattern as Library/Reading Room.
  { id: 'counting-house', name: 'The Counting House', category: 'puzzle', puzzleKind: 'sudoku',
    doorLayouts: [CORRIDOR, CORNER], tierRange: [1, 3], gemCost: 0, rarity: 'standard' },
  { id: 'strong-room', name: 'The Strong Room', category: 'puzzle', puzzleKind: 'sudoku',
    doorLayouts: [DEAD_END], tierRange: [2, 3], gemCost: 1, rarity: 'unusual' },
];

// ---------------------------------------------------------------------------
// Utility rooms (green) — the economy (fade at higher rows)
// ---------------------------------------------------------------------------

const UTILITY_CARDS: RoomCard[] = [
  { id: 'kitchen', name: 'The Kitchen', category: 'utility',
    doorLayouts: [CORNER, TEE], tierRange: [1, 2], gemCost: 0, rarity: 'standard' },
  { id: 'larder', name: 'The Larder', category: 'utility',
    doorLayouts: [DEAD_END], tierRange: [1, 2], gemCost: 0, rarity: 'common' },
  { id: 'boot-room', name: 'The Boot Room', category: 'utility',
    doorLayouts: [CORRIDOR], tierRange: [1, 1], gemCost: 0, rarity: 'common' },
  { id: 'gem-vault', name: 'The Gem Vault', category: 'utility',
    doorLayouts: [DEAD_END], tierRange: [1, 3], gemCost: 0, rarity: 'unusual' },
  { id: 'key-cabinet', name: 'The Key Cabinet', category: 'utility',
    doorLayouts: [DEAD_END, CORNER], tierRange: [1, 3], gemCost: 0, rarity: 'unusual' },
  { id: 'dumbwaiter', name: 'The Dumbwaiter', category: 'utility',
    doorLayouts: [CORRIDOR], tierRange: [1, 2], gemCost: 1, rarity: 'unusual' },
  { id: 'still-room', name: 'The Still Room', category: 'utility',
    doorLayouts: [CORNER], tierRange: [1, 2], gemCost: 0, rarity: 'common' },
];

// ---------------------------------------------------------------------------
// Parlor rooms (yellow) — a character is here (flows land with A6)
// ---------------------------------------------------------------------------

const PARLOR_CARDS: RoomCard[] = [
  { id: 'reading-nook', name: 'The Reading Nook', category: 'parlor',
    doorLayouts: [DEAD_END, CORNER], tierRange: [1, 3], gemCost: 0, rarity: 'standard' },
  { id: 'post-room', name: 'The Post Room', category: 'parlor',
    doorLayouts: [CORRIDOR], tierRange: [1, 2], gemCost: 0, rarity: 'standard' },
  { id: 'greenhouse', name: 'The Greenhouse', category: 'parlor',
    doorLayouts: [CORNER], tierRange: [1, 3], gemCost: 0, rarity: 'standard' },
  { id: 'morning-room', name: 'The Morning Room', category: 'parlor',
    doorLayouts: [TEE], tierRange: [1, 2], gemCost: 0, rarity: 'unusual' },
  { id: 'drawing-room', name: 'The Drawing Room', category: 'parlor',
    doorLayouts: [CORRIDOR, TEE], tierRange: [2, 3], gemCost: 1, rarity: 'unusual' },
];

// ---------------------------------------------------------------------------
// Mystery rooms (violet) — clue fragments; the reason to climb
// ---------------------------------------------------------------------------

const MYSTERY_CARDS: RoomCard[] = [
  { id: 'archive', name: 'The Archive', category: 'mystery',
    doorLayouts: [DEAD_END], tierRange: [1, 3], gemCost: 0, rarity: 'unusual' },
  { id: 'chart-room', name: 'The Chart Room', category: 'mystery',
    doorLayouts: [CORNER], tierRange: [2, 3], gemCost: 1, rarity: 'unusual' },
  { id: 'observatory', name: 'The Observatory', category: 'mystery',
    doorLayouts: [DEAD_END], tierRange: [2, 3], gemCost: 2, rarity: 'rare' },
  { id: 'bureau', name: 'The Bureau', category: 'mystery',
    doorLayouts: [DEAD_END, CORNER], tierRange: [1, 2], gemCost: 1, rarity: 'rare' },
  { id: 'boxroom', name: 'The Boxroom', category: 'mystery',
    doorLayouts: [DEAD_END], tierRange: [3, 3], gemCost: 2, rarity: 'rare' },
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
    doorLayouts: [CORNER], tierRange: [1, 3], gemCost: 1, rarity: 'unusual', unlockedBy: 'posy.deputy' },
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
  'posy.quest1.done': "Posy's lost word",
  'posy.deputy': "Posy's deputy sash",
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
