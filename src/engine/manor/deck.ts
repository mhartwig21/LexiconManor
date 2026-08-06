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
  { id: 'study', name: 'The Study', category: 'puzzle', puzzleKind: 'forgotten-word',
    doorLayouts: [DEAD_END], tierRange: [2, 3], gemCost: 2, rarity: 'rare' },

  // Micro-rooms (30-90s; A4/A5 land the adapters — cards ship now)
  { id: 'vestibule', name: 'The Vestibule', category: 'puzzle', puzzleKind: 'anagram',
    doorLayouts: [CORRIDOR, CROSS], tierRange: [1, 2], gemCost: 0, rarity: 'common' },
  { id: 'staircase', name: 'The Staircase', category: 'puzzle', puzzleKind: 'ladder',
    doorLayouts: [CORRIDOR], tierRange: [1, 3], gemCost: 0, rarity: 'common' },
  { id: 'darkroom', name: 'The Darkroom', category: 'puzzle', puzzleKind: 'cipher',
    doorLayouts: [DEAD_END, CORNER], tierRange: [1, 3], gemCost: 0, rarity: 'common' },
  { id: 'linen-closet', name: 'The Linen Closet', category: 'puzzle', puzzleKind: 'crossword',
    doorLayouts: [DEAD_END], tierRange: [1, 2], gemCost: 0, rarity: 'common' },
  { id: 'music-room', name: 'The Music Room', category: 'puzzle', puzzleKind: 'rhyme',
    doorLayouts: [CORNER, TEE], tierRange: [1, 3], gemCost: 0, rarity: 'common' },
  { id: 'pantry', name: 'The Pantry', category: 'puzzle', puzzleKind: 'category',
    doorLayouts: [CORNER], tierRange: [1, 2], gemCost: 0, rarity: 'common' },
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
 * Cabinet-unlockable extras (unlockedBy = achievement/quest ids other agents
 * award via meta.unlockCard). Kept tiny until Posy's quest chains land.
 */
export const UNLOCKABLE_CARDS: readonly RoomCard[] = [
  { id: 'winter-garden', name: 'The Winter Garden', category: 'puzzle', puzzleKind: 'hive',
    doorLayouts: [CROSS], tierRange: [1, 3], gemCost: 0, rarity: 'unusual', unlockedBy: 'posy-quest-1' },
  { id: 'map-room', name: 'The Map Room', category: 'mystery',
    doorLayouts: [CORNER], tierRange: [1, 3], gemCost: 1, rarity: 'unusual', unlockedBy: 'posy-quest-2' },
];

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
  'vestibule': 'Letters out of order',
  'staircase': 'One word becomes another',
  'darkroom': 'A phrase in cipher',
  'linen-closet': 'A crossword folded small',
  'music-room': 'Rhymes on a stand',
  'pantry': 'Name the shelf, fill the shelf',
  'kitchen': '+6 steps · +2 per green room drafted after',
  'larder': '+5 steps',
  'boot-room': '+3 steps',
  'gem-vault': '+2 gems',
  'key-cabinet': '+1 key',
  'dumbwaiter': '+1 step per room drafted after it',
  'still-room': '+1 gem · +2 steps',
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
 * the deed that fills it). Ids are awarded by other agents via meta.unlockCard.
 */
export const UNLOCK_QUEST_NAMES: Record<string, string> = {
  'posy-quest-1': "Posy's first favor",
  'posy-quest-2': "Posy's second favor",
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

/** Applied once when the room is drafted; compounding hooks fire on later drafts. */
export const UTILITY_EFFECTS: Record<string, UtilityEffect> = {
  'kitchen': { steps: 6, compounding: 'utility', compoundSteps: 2,
    toast: 'Something warm from the oven. +6 steps' },
  'larder': { steps: 5, toast: 'Bread, cheese, and a stolen minute. +5 steps' },
  'boot-room': { steps: 3, toast: 'Dry socks. Remarkable. +3 steps' },
  'gem-vault': { gems: 2, toast: 'Two gems, cold and bright' },
  'key-cabinet': { keys: 1, toast: 'A key, filed under someday' },
  'dumbwaiter': { compounding: 'any', compoundSteps: 1,
    toast: 'It rattles helpfully at every new room' },
  'still-room': { gems: 1, steps: 2, toast: 'Cordial and a gem. +2 steps' },
};

/** Day 1, draft #1 — tutorial disguised as RNG (AAA 4.5, slot 1 playable now). */
export const SCRIPTED_FIRST_DRAFT: readonly string[] = ['library', 'kitchen', 'vestibule'];
