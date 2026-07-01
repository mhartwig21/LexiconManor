import type { GlyphDef, PerkDef, AchievementDef, Rarity, RunState, GameMode } from './types';
import type { Rng } from './rng';
import { pickWeighted } from './rng';
import { GLYPH_SLOTS } from './types';

/**
 * Glyph catalog, ported from the original game's effect registry.
 * Effects are pure data; `useGlyph` below is the single interpreter.
 */
export const GLYPHS: GlyphDef[] = [
  // Common
  { id: 'vitality', name: 'Glyph of Vitality', rarity: 'common', effect: { type: 'heal_mind', value: 1 }, description: 'Restore 1 mind point.' },
  { id: 'focus', name: 'Glyph of Focus', rarity: 'common', effect: { type: 'reveal_hint', value: 1 }, description: 'Reveal one hint.' },
  { id: 'minor-fortune', name: 'Glyph of Minor Fortune', rarity: 'common', effect: { type: 'score_multiplier', value: 10 }, description: '+10% score on the next puzzle.' },
  { id: 'patience', name: 'Glyph of Patience', rarity: 'common', effect: { type: 'time_extension', value: 15 }, modes: ['hive', 'forgotten-word'], description: '+15 seconds on timed challenges.' },
  // Uncommon
  { id: 'resilience', name: 'Glyph of Resilience', rarity: 'uncommon', effect: { type: 'damage_shield', value: 1 }, description: 'Block the next mind point loss.' },
  { id: 'clarity', name: 'Glyph of Clarity', rarity: 'uncommon', effect: { type: 'reveal_hint', value: 2 }, description: 'Reveal two hints.' },
  { id: 'fortune', name: 'Glyph of Fortune', rarity: 'uncommon', effect: { type: 'score_multiplier', value: 20 }, description: '+20% score on the next puzzle.' },
  { id: 'renewal', name: 'Glyph of Renewal', rarity: 'uncommon', effect: { type: 'heal_mind', value: 2 }, description: 'Restore 2 mind points.' },
  { id: 'temporal-flow', name: 'Glyph of Temporal Flow', rarity: 'uncommon', effect: { type: 'time_extension', value: 30 }, modes: ['hive', 'forgotten-word'], description: '+30 seconds on timed challenges.' },
  // Rare
  { id: 'decay', name: 'Glyph of Decay', rarity: 'rare', effect: { type: 'instant_solve', value: 1 }, description: 'Instantly solve the current puzzle. Costs 1 mind point.' },
  { id: 'steadfast', name: 'Glyph of Steadfast', rarity: 'rare', effect: { type: 'damage_shield', value: 2 }, description: 'Block the next 2 mind point losses.' },
  { id: 'great-fortune', name: 'Glyph of Great Fortune', rarity: 'rare', effect: { type: 'score_multiplier', value: 35 }, description: '+35% score on the next puzzle.' },
  { id: 'restoration', name: 'Glyph of Restoration', rarity: 'rare', effect: { type: 'heal_mind', value: 3 }, description: 'Restore 3 mind points.' },
  // Epic
  { id: 'momentum', name: 'Glyph of Momentum', rarity: 'epic', effect: { type: 'entropy_immunity', value: 2 }, modes: ['hive', 'twistle'], description: 'Entropy cannot rise for the next 2 puzzles.' },
  { id: 'aegis', name: 'Glyph of the Aegis', rarity: 'epic', effect: { type: 'damage_shield', value: 3 }, description: 'Block the next 3 mind point losses.' },
  { id: 'phase', name: 'Glyph of Phase', rarity: 'epic', effect: { type: 'skip_puzzle', value: 1 }, description: 'Skip the current puzzle without penalty.' },
];

export const PERKS: PerkDef[] = [
  { id: 'mind-guardian', name: 'Mind Guardian', rarity: 'common', effect: { type: 'bonus_starting_mind', value: 1 }, description: 'Begin each run with +1 mind point.', unlockedBy: 'five-nodes' },
  { id: 'expanding-mind', name: 'Expanding Mind', rarity: 'legendary', effect: { type: 'max_mind_boost', value: 1 }, description: 'Your maximum mind points increase by 1.', unlockedBy: 'boss-slayer' },
  { id: 'iron-focus', name: 'Iron Focus', rarity: 'rare', effect: { type: 'entropy_immunity', value: Infinity }, modes: ['hive'], description: 'Entropy never rises in Hive Builder.', unlockedBy: 'entropy-master' },
  { id: 'lexical-proximity', name: 'Lexical Proximity', rarity: 'rare', effect: { type: 'word_web_proximity', value: 1 }, modes: ['word-web'], description: 'Wrong Word Web guesses reveal how close you were.', unlockedBy: 'first-web' },
];

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'five-nodes', name: 'Wayfarer', description: 'Complete 5 nodes.', condition: { kind: 'nodes_completed', count: 5 } },
  { id: 'boss-slayer', name: 'Boss Slayer', description: 'Defeat your first boss.', condition: { kind: 'bosses_defeated', count: 1 } },
  { id: 'entropy-master', name: 'Entropy Master', description: 'Score 40+ in Hive Builder without raising entropy.', condition: { kind: 'hive_score_no_entropy', score: 40 } },
  { id: 'first-web', name: 'Web Weaver', description: 'Complete your first Word Web.', condition: { kind: 'mode_wins', mode: 'word-web', count: 1 } },
  { id: 'perfectionist', name: 'Perfectionist', description: 'Win 3 puzzles with zero wrong attempts.', condition: { kind: 'perfect_clears', count: 3 } },
  { id: 'loop-closer', name: 'Loop Closer', description: 'Complete a full run.', condition: { kind: 'runs_completed', count: 1 } },
];

const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 50,
  uncommon: 30,
  rare: 15,
  epic: 4,
  legendary: 1,
};

/** Chance a regular-node victory drops a glyph (bosses always drop). */
export const GLYPH_DROP_CHANCE = 0.6;

export function rollGlyphDrop(rng: Rng, opts: { isBoss: boolean }): GlyphDef | null {
  if (!opts.isBoss && rng() >= GLYPH_DROP_CHANCE) return null;
  return pickWeighted(
    rng,
    GLYPHS.map((g) => ({ item: g, weight: RARITY_WEIGHTS[g.rarity] })),
  );
}

export function glyphById(id: string): GlyphDef {
  const g = GLYPHS.find((g) => g.id === id);
  if (!g) throw new Error(`Unknown glyph: ${id}`);
  return g;
}

export function perkById(id: string): PerkDef {
  const p = PERKS.find((p) => p.id === id);
  if (!p) throw new Error(`Unknown perk: ${id}`);
  return p;
}

export interface GlyphUseResult {
  run: RunState;
  /** Instructions the current puzzle screen must act on. */
  puzzleAction: 'none' | 'reveal_hint' | 'extend_time' | 'instant_solve' | 'skip';
  actionValue: number;
  error?: string;
}

/**
 * Consume a glyph from the run's inventory and apply its run-level effect.
 * Puzzle-level effects (hints, time, solve, skip) are returned as an action
 * for the active mode's state to consume — the interpreter stays mode-agnostic.
 */
export function useGlyph(run: RunState, glyphId: string, currentMode: GameMode): GlyphUseResult {
  const idx = run.glyphInventory.indexOf(glyphId);
  if (idx === -1) return { run, puzzleAction: 'none', actionValue: 0, error: 'not-in-inventory' };
  const glyph = glyphById(glyphId);
  if (glyph.modes && !glyph.modes.includes(currentMode)) {
    return { run, puzzleAction: 'none', actionValue: 0, error: 'wrong-mode' };
  }

  const inventory = [...run.glyphInventory];
  inventory.splice(idx, 1);
  let next: RunState = { ...run, glyphInventory: inventory };
  let puzzleAction: GlyphUseResult['puzzleAction'] = 'none';
  const value = glyph.effect.value;

  switch (glyph.effect.type) {
    case 'heal_mind':
      next.mindPoints = Math.min(next.maxMindPoints, next.mindPoints + value);
      break;
    case 'damage_shield':
      next.shieldCharges += value;
      break;
    case 'score_multiplier':
      next.pendingScoreMultiplier += value;
      break;
    case 'entropy_immunity':
      next.entropyImmunityCharges += value;
      break;
    case 'reveal_hint':
      puzzleAction = 'reveal_hint';
      break;
    case 'time_extension':
      puzzleAction = 'extend_time';
      break;
    case 'instant_solve':
      if (next.mindPoints <= 1) {
        // Refund: cannot pay the cost.
        return { run, puzzleAction: 'none', actionValue: 0, error: 'insufficient-mind' };
      }
      next.mindPoints -= 1;
      puzzleAction = 'instant_solve';
      break;
    case 'skip_puzzle':
      puzzleAction = 'skip';
      break;
    default:
      return { run, puzzleAction: 'none', actionValue: 0, error: 'not-usable' };
  }

  return { run: next, puzzleAction, actionValue: value };
}

/** Add a glyph if there's room; returns unchanged state (and dropped=false) when full. */
export function addGlyph(run: RunState, glyphId: string): { run: RunState; added: boolean } {
  if (run.glyphInventory.length >= GLYPH_SLOTS) return { run, added: false };
  return { run: { ...run, glyphInventory: [...run.glyphInventory, glyphId] }, added: true };
}
