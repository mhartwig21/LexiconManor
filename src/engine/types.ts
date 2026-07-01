/**
 * Shared types for the Lexicon Loop engine.
 *
 * Everything in src/engine is pure TypeScript with no React or DOM
 * dependencies. Game rules are modeled as (state, action) -> state
 * transitions so they can be unit-tested and replayed deterministically.
 */

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
