/**
 * Shared types for the Lexicon Manor engine (v2) — ARCHITECT-OWNED, FROZEN.
 *
 * Everything in src/engine is pure TypeScript with no React or DOM
 * dependencies. Game rules are modeled as (state, action) -> state
 * transitions so they can be unit-tested and replayed deterministically.
 *
 * Layout of this file:
 *   1. LEGACY V1 types — the fork/diamond run-structure era. Kept compiling
 *      because the anchor puzzle engines, achievements/stats, and the frozen
 *      v1 save fixture (migrations) still reference them, and because the
 *      glyph/perk question is open (AAA §10.1). Do not build new code on them.
 *   2. MANOR V2 shared shapes — the frozen cross-agent contract surface.
 *      Logic for these lives in agent-owned modules (engine/manor/*,
 *      engine/economy/*, engine/day.ts, engine/volume.ts, …); the *shapes*
 *      live here so slices, save schema, and events agree. Agents request
 *      changes; they never edit this file.
 */

import type { RoomPuzzleKind } from './rooms/room-puzzle';
import type { DayEndCause } from './events';

// ===========================================================================
// 1. LEGACY V1 (quarantined — see header)
// ===========================================================================

export type GameMode = 'word-web' | 'hive' | 'twistle' | 'forgotten-word';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

// ---------------------------------------------------------------------------
// Puzzle content (produced offline by the content pipeline, shipped as JSON)
// ---------------------------------------------------------------------------

/** NYT Connections-style: 16 words, 4 groups of 4. */
export interface WordWebPuzzle {
  id: string;
  difficulty: Difficulty;
  groups: WordWebGroup[]; // exactly 4
  /** Words that plausibly fit more than one group (UI may highlight them). */
  ambiguousWords?: string[];
}

export interface WordWebGroup {
  theme: string;
  words: string[]; // exactly 4, uppercase
  /** yellow = easiest … purple = trickiest, mirroring NYT color coding. */
  tier: 'yellow' | 'green' | 'blue' | 'purple';
}

/** Spelling Bee-style: 7 letters, center required. */
export interface HivePuzzle {
  id: string;
  difficulty: Difficulty;
  center: string; // single uppercase letter
  outer: string[]; // exactly 6 uppercase letters
  /** A real word using all 7 letters — guaranteed by the generator. */
  pangrams: string[]; // at least 1
  validWords: string[]; // uppercase, >= 4 letters, all contain center
  /** Points needed to win (before per-level adjustments). */
  pointThreshold: number;
  /** Sum of points across all valid words, for tuning/telemetry. */
  totalPoints: number;
}

/** 5x5 grid word search. Words trace king-move-adjacent paths. */
export interface TwistlePuzzle {
  id: string;
  difficulty: Difficulty;
  /** Row-major 5x5 grid of uppercase letters. */
  grid: string[]; // exactly 25 single letters
  /** Words guaranteed findable — verified by the generator's solver. */
  targetWords: string[];
  /** How many words the player must find to win. */
  targetCount: number;
  /** Twist constraints applied to this puzzle. */
  rules: TwistleRules;
}

export interface TwistleRules {
  minLength: number; // usually 4
  /** If true, every submitted word's path must pass through the center tile (index 12). */
  centerRequired: boolean;
}

/** Boss mode: guess an obscure word from a poetic definition. */
export interface ForgottenWordPuzzle {
  id: string;
  word: string; // uppercase
  obscurity: 'common' | 'medium' | 'rare' | 'archaic';
  /**
   * Definitions by clarity. Higher levels/streaks show riddlier text —
   * this implements the clarity scaling the original designed but never built.
   */
  definitions: {
    plain: string;
    poetic: string;
    riddle: string;
  };
  etymology: string;
  /** Usage sentence with the word replaced by a blank. */
  usage: string;
  /** Alternate accepted spellings/forms, uppercase. */
  acceptedAnswers?: string[];
}

// ---------------------------------------------------------------------------
// Glyphs (consumables) & perks (permanent) — data-driven effect registry
// ---------------------------------------------------------------------------

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type EffectType =
  | 'heal_mind' // +value mind points (capped at max)
  | 'damage_shield' // block next `value` mind-point losses
  | 'score_multiplier' // +value% score on next puzzle
  | 'reveal_hint' // reveal `value` hints in the current puzzle
  | 'time_extension' // +value seconds (timed modes/trials)
  | 'entropy_immunity' // hive/twistle: entropy cannot rise for `value` puzzles
  | 'instant_solve' // auto-complete current puzzle, costs 1 mind point
  | 'skip_puzzle' // complete current node without playing, no reward bonus
  | 'bonus_starting_mind' // perk: +value mind points at run start
  | 'max_mind_boost' // perk: +value maximum mind points
  | 'word_web_proximity'; // perk: show how close a wrong guess was

export interface GlyphDef {
  id: string;
  name: string;
  rarity: Rarity;
  effect: { type: EffectType; value: number };
  /** Restrict to specific modes; undefined = usable everywhere. */
  modes?: GameMode[];
  description: string;
}

export interface PerkDef {
  id: string;
  name: string;
  rarity: Rarity;
  effect: { type: EffectType; value: number };
  modes?: GameMode[];
  description: string;
  /** Achievement id that unlocks this perk. */
  unlockedBy: string;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Predicate id evaluated by the achievements module against run history. */
  condition: AchievementCondition;
}

export type AchievementCondition =
  | { kind: 'nodes_completed'; count: number }
  | { kind: 'bosses_defeated'; count: number }
  | { kind: 'perfect_clears'; count: number } // wins with zero wrong attempts
  | { kind: 'mode_wins'; mode: GameMode; count: number }
  | { kind: 'hive_score_no_entropy'; score: number }
  | { kind: 'runs_completed'; count: number };

// ---------------------------------------------------------------------------
// Run & save state
// ---------------------------------------------------------------------------

export interface RunState {
  runId: string;
  seed: number;
  level: number; // 1-based
  mindPoints: number;
  maxMindPoints: number;
  /** Remaining blocked losses from damage_shield effects. */
  shieldCharges: number;
  /** Puzzles remaining under entropy immunity. */
  entropyImmunityCharges: number;
  /** Pending +% score for the next completed puzzle. */
  pendingScoreMultiplier: number;
  glyphInventory: string[]; // glyph ids, max GLYPH_SLOTS
  completedNodeIds: string[];
  currentNodeId: string | null;
  totalScore: number;
  status: 'active' | 'victory' | 'defeat';
  startedAt: number; // epoch ms, supplied by caller
}

/** One finished run, kept forever for the chronicles/stats page. */
export interface RunRecord {
  runId: string;
  startedAt: number;
  endedAt: number;
  outcome: 'victory' | 'defeat' | 'abandoned';
  levelReached: number;
  nodesCompleted: number;
  bossesDefeated: number;
  totalScore: number;
  /** Per-node results for detailed history views. */
  nodeResults: NodeResult[];
  glyphsEarned: string[];
  perksUnlocked: string[];
}

export interface NodeResult {
  nodeId: string;
  mode: GameMode;
  puzzleId: string;
  isBoss: boolean;
  won: boolean;
  score: number;
  wrongAttempts: number;
  durationMs: number;
  level: number;
}

/** The entire persisted save — one versioned object in localStorage. */
export interface SaveFile {
  version: 1;
  profileName: string;
  activeRun: RunState | null;
  /** Node results for the active run (folded into a RunRecord when it ends). */
  activeRunResults: NodeResult[];
  /** Glyph ids earned during the active run, for the chronicle record. */
  activeRunGlyphs: string[];
  runHistory: RunRecord[];
  unlockedPerkIds: string[];
  activePerkLoadout: string[]; // max PERK_SLOTS
  earnedAchievementIds: string[];
  /** Puzzle ids seen across all runs, per mode — no repeats until pool exhausts. */
  seenPuzzleIds: Record<GameMode, string[]>;
  settings: {
    soundEnabled: boolean;
    reducedMotion: boolean;
  };
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const STARTING_MIND_POINTS = 3;
export const BOSS_VICTORY_MIND_BONUS = 2;
export const GLYPH_SLOTS = 4;
export const PERK_SLOTS = 3;
export const FINAL_LEVEL = 3; // beating level 3's boss wins the run

// ===========================================================================
// 2. MANOR V2 shared shapes (FROZEN — the cross-agent contract surface)
// ===========================================================================

/** The cast. Dewey has zero dialogue, forever (AAA 5.6). */
export type CharacterId = 'bramble' | 'ellery' | 'posy' | 'fern' | 'dewey' | 'portrait';

export const CHARACTER_IDS: readonly CharacterId[] = [
  'bramble', 'ellery', 'posy', 'fern', 'dewey', 'portrait',
];

/** Row-band difficulty tier: rows 1–2 / 3–4 / 5–6 → 1 / 2 / 3. */
export type Tier = 1 | 2 | 3;

/** Draft-card category, color-coded + shape-coded on cards (MANOR_DESIGN §5). */
export type RoomCategory = 'puzzle' | 'parlor' | 'utility' | 'mystery';

// --- Manor grid (logic: engine/manor/grid.ts, owned by A1) -----------------

export type Dir = 'N' | 'E' | 'S' | 'W';

/** 5 columns × 7 rows; row 0 = bottom. Entrance (2,0), Sanctum (2,6). */
export interface Cell { col: 0 | 1 | 2 | 3 | 4; row: number /* 0..6 */; }

export const MANOR_COLS = 5;
export const MANOR_ROWS = 7;
export const ENTRANCE_CELL: Cell = { col: 2, row: 0 };
export const SANCTUM_CELL: Cell = { col: 2, row: 6 };

export interface PlacedRoom {
  cardId: string;
  cell: Cell;
  doors: Dir[];                                  // rotation resolved at placement
  solved: boolean;
  kind: RoomPuzzleKind | 'parlor' | 'utility' | 'mystery';
  puzzleId?: string;                             // pinned at placement — re-entry stable
}

export interface ManorState {
  rooms: Record<string /* "col,row" */, PlacedRoom>; // entrance & sanctum pre-placed
  playerCell: Cell;
  daySeed: number;
}

// --- Deck & drafting (logic: engine/manor/{deck,drafting}.ts, owned by A1) --

export interface RoomCard {
  id: string;
  name: string;
  category: RoomCategory;
  puzzleKind?: RoomPuzzleKind;                   // puzzle rooms only
  doorLayouts: Dir[][];                          // legal door sets (pre-rotation)
  tierRange: [Tier, Tier];
  gemCost: number;                               // 0 = common
  rarity: 'common' | 'standard' | 'unusual' | 'rare';
  unlockedBy?: string;                           // floorplan-cabinet unlock id
}

export interface DraftOffer {
  atDoor: Dir;
  from: Cell;
  cards: RoomCard[];                             // always 3
  rerolled: boolean;                             // 1 gem, once per draft
}

// --- Step economy (logic: engine/economy/steps.ts, owned by A2) ------------

export type StepReason =
  | 'day-start' | 'move' | 'mistake' | 'hint' | 'solve' | 'perfect'
  | 'tea' | 'snack' | 'pet-dewey' | 'gift';

export interface StepEntry {
  reason: StepReason;
  delta: number;
  at: number;                                    // epoch ms, caller-supplied
  roomKey?: string;
}

/** Pure, replayable, journal-friendly ledger. Steps never render negative. */
export interface StepLedger { budget: number; entries: StepEntry[]; }

export interface Currencies { gems: number; keys: number; }

// --- Day lifecycle (logic: engine/day.ts, owned by A2) ---------------------

export type DayPhase = 'morning' | 'exploring' | 'dusk' | 'night';

/** The room the player is standing in with an active puzzle session. */
export interface ActiveRoomRef {
  cellKey: string;
  kind: RoomPuzzleKind;
  puzzleId: string;
  tier: Tier;
}

export interface DayState {
  day: number;                                   // 1-based, never resets
  phase: DayPhase;
  daySeed: number;
  activeRoom: ActiveRoomRef | null;
}

// --- Volume mystery (logic: engine/volume.ts + journal.ts, owned by A7) ----

export type FragmentKind = 'definition-line' | 'engraving' | 'testimony';

export interface FragmentDef {
  id: string;
  kind: FragmentKind;
  text: string;
  sourceRoomCategory: RoomCategory;
  group: string;
  revealOrder: number;
}

export interface LetterDef {
  id: string;
  from: CharacterId;
  body: string;
  /** Earliest day it may arrive; A7 may layer richer scheduling on top. */
  earliestDay?: number;
}

export interface VolumeDef {
  id: string;
  answer: string;
  accepted: string[];
  fragments: FragmentDef[];
  letters: LetterDef[];
}

export interface VolumeState {
  volumeId: string;
  day: number;
  foundFragmentIds: string[];                    // persist forever
  interpretedFragmentIds: string[];              // Ellery's service
  guesses: { day: number; guess: string }[];     // gate: one per day
  status: 'active' | 'solved';
}

// --- Chronicles (v2 day records; refresh owned by A8) ----------------------

export interface DayRecord {
  day: number;
  endedAt: number;
  cause: DayEndCause;                            // engine/events.ts
  roomsDrafted: number;
  roomsSolved: number;
  stepsSpent: number;
  fragmentsFound: number;
}
