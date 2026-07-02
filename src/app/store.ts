import { create } from 'zustand';
import type { GameMode, NodeResult, SaveFile } from '../engine/types';
import { generateLevelMap, type LevelMap, type MapNode } from '../engine/map';
import { completeNode, loseMindPoints, startRun, toRunRecord } from '../engine/run';
import { addGlyph, rollGlyphDrop } from '../engine/effects';
import { checkAchievements, computeLifetimeTotals, perksUnlockedBy } from '../engine/achievements';
import { createRng } from '../engine/rng';
import { IMPLEMENTED_MODES } from './content';
import { loadSave, persistSave } from './save';

/**
 * The single client-side store: wraps the pure engine, owns the SaveFile,
 * and persists after every mutation. Components never touch localStorage
 * or engine state directly — they call store actions.
 */

export interface LastNodeOutcome {
  nodeId: string;
  won: boolean;
  score: number;
  glyphEarned: string | null;
  achievementsEarned: string[];
  perksUnlocked: string[];
  leveledUp: boolean;
  runWon: boolean;
}

interface GameStore {
  save: SaveFile;
  lastOutcome: LastNodeOutcome | null;

  currentMap: () => LevelMap | null;
  startNewRun: () => void;
  abandonRun: () => void;
  enterNode: (nodeId: string) => void;
  leaveNode: () => void;
  /** A wrong attempt inside a puzzle: costs mind points (shields absorb first). */
  applyWrongAttempt: () => void;
  /** Voluntary mind-point spend (e.g. restoring a faded Hive letter). Returns false if unaffordable. */
  spendMindPoint: () => boolean;
  /** The active node was won; fold results into the run and roll rewards. */
  finishNode: (input: { mode: GameMode; puzzleId: string; baseScore: number; wrongAttempts: number; durationMs: number }) => void;
  /** The active node was lost outright (out of guesses etc.) — costs 1 MP. */
  failNode: () => void;
  markPuzzleSeen: (mode: GameMode, puzzleId: string) => void;
  clearOutcome: () => void;
}

function mutate(set: (partial: Partial<GameStore>) => void, save: SaveFile, extra?: Partial<GameStore>) {
  persistSave(save);
  set({ save, ...extra });
}

/** If the active run just ended (defeat/victory), fold it into history. */
function foldFinishedRun(save: SaveFile, perksUnlocked: string[] = []): void {
  if (!save.activeRun || save.activeRun.status === 'active') return;
  save.runHistory = [
    ...save.runHistory,
    toRunRecord(save.activeRun, save.activeRunResults, {
      endedAt: Date.now(),
      glyphsEarned: save.activeRunGlyphs,
      perksUnlocked,
    }),
  ];
  save.activeRun = null;
  save.activeRunResults = [];
  save.activeRunGlyphs = [];
}

export const useGameStore = create<GameStore>((set, get) => ({
  save: loadSave(),
  lastOutcome: null,

  currentMap: () => {
    const run = get().save.activeRun;
    if (!run || run.status !== 'active') return null;
    return generateLevelMap({
      seed: run.seed,
      level: run.level,
      // Forgotten Word is boss-only: it's the boss's identity, and its
      // hand-written pool is small enough to reserve for boss fights.
      availableModes: IMPLEMENTED_MODES.filter((m) => m !== 'forgotten-word'),
      bossMode: 'forgotten-word',
    });
  },

  startNewRun: () => {
    const save = { ...get().save };
    // Fold any in-flight run into history as abandoned.
    if (save.activeRun) {
      save.runHistory = [
        ...save.runHistory,
        toRunRecord(save.activeRun, save.activeRunResults, {
          endedAt: Date.now(),
          glyphsEarned: save.activeRunGlyphs,
          perksUnlocked: [],
          abandoned: save.activeRun.status === 'active',
        }),
      ];
    }
    save.activeRun = startRun({
      runId: `run-${Date.now()}`,
      seed: (Math.random() * 2 ** 31) | 0, // seed entropy is fine here; determinism matters *within* a run
      now: Date.now(),
      activePerkIds: save.activePerkLoadout,
    });
    save.activeRunResults = [];
    save.activeRunGlyphs = [];
    mutate(set, save, { lastOutcome: null });
  },

  abandonRun: () => {
    const save = { ...get().save };
    if (!save.activeRun) return;
    save.runHistory = [
      ...save.runHistory,
      toRunRecord(save.activeRun, save.activeRunResults, {
        endedAt: Date.now(),
        glyphsEarned: save.activeRunGlyphs,
        perksUnlocked: [],
        abandoned: save.activeRun.status === 'active',
      }),
    ];
    save.activeRun = null;
    save.activeRunResults = [];
    save.activeRunGlyphs = [];
    mutate(set, save, { lastOutcome: null });
  },

  enterNode: (nodeId) => {
    const save = { ...get().save };
    if (!save.activeRun || save.activeRun.status !== 'active') return;
    save.activeRun = { ...save.activeRun, currentNodeId: nodeId };
    mutate(set, save);
  },

  leaveNode: () => {
    const save = { ...get().save };
    if (!save.activeRun) return;
    save.activeRun = { ...save.activeRun, currentNodeId: null };
    mutate(set, save);
  },

  applyWrongAttempt: () => {
    const save = { ...get().save };
    if (!save.activeRun || save.activeRun.status !== 'active') return;
    save.activeRun = loseMindPoints(save.activeRun, 1);
    foldFinishedRun(save);
    mutate(set, save);
  },

  spendMindPoint: () => {
    const save = { ...get().save };
    const run = save.activeRun;
    // A spend may not reduce you to zero — that would be defeat-by-button.
    if (!run || run.status !== 'active' || run.mindPoints <= 1) return false;
    save.activeRun = { ...run, mindPoints: run.mindPoints - 1 };
    mutate(set, save);
    return true;
  },

  finishNode: (input) => {
    const save = { ...get().save };
    const run = save.activeRun;
    if (!run || run.status !== 'active' || !run.currentNodeId) return;
    const map = get().currentMap();
    const node: MapNode | undefined = map?.nodes.find((n) => n.id === run.currentNodeId);
    if (!node) return;

    const outcome = completeNode(run, {
      nodeId: node.id,
      mode: input.mode,
      puzzleId: input.puzzleId,
      isBoss: node.kind === 'boss',
      baseScore: input.baseScore,
      wrongAttempts: input.wrongAttempts,
      durationMs: input.durationMs,
    });
    save.activeRun = outcome.run;
    save.activeRunResults = [...save.activeRunResults, outcome.result];

    // Glyph drop (guaranteed on bosses).
    const dropRng = createRng(run.seed ^ save.activeRunResults.length);
    const drop = rollGlyphDrop(dropRng, { isBoss: node.kind === 'boss' });
    let glyphEarned: string | null = null;
    if (drop) {
      const added = addGlyph(save.activeRun, drop.id);
      if (added.added) {
        save.activeRun = added.run;
        save.activeRunGlyphs = [...save.activeRunGlyphs, drop.id];
        glyphEarned = drop.id;
      }
    }

    // Achievements & perk unlocks from lifetime totals.
    const totals = computeLifetimeTotals(save.runHistory, save.activeRunResults);
    const newAchievements = checkAchievements(save, totals);
    const achievementIds = newAchievements.map((a) => a.id);
    save.earnedAchievementIds = [...save.earnedAchievementIds, ...achievementIds];
    const newPerks = perksUnlockedBy(achievementIds).filter((p) => !save.unlockedPerkIds.includes(p));
    save.unlockedPerkIds = [...save.unlockedPerkIds, ...newPerks];

    // Run finished? Fold into history.
    foldFinishedRun(save, newPerks);

    mutate(set, save, {
      lastOutcome: {
        nodeId: node.id,
        won: true,
        score: outcome.result.score,
        glyphEarned,
        achievementsEarned: achievementIds,
        perksUnlocked: newPerks,
        leveledUp: outcome.leveledUp,
        runWon: outcome.runWon,
      },
    });
  },

  failNode: () => {
    const save = { ...get().save };
    if (!save.activeRun || save.activeRun.status !== 'active') return;
    const nodeId = save.activeRun.currentNodeId ?? 'unknown';
    save.activeRun = loseMindPoints({ ...save.activeRun, currentNodeId: null }, 1);
    foldFinishedRun(save);
    mutate(set, save, {
      lastOutcome: {
        nodeId, won: false, score: 0, glyphEarned: null,
        achievementsEarned: [], perksUnlocked: [], leveledUp: false, runWon: false,
      },
    });
  },

  markPuzzleSeen: (mode, puzzleId) => {
    const save = { ...get().save };
    if (save.seenPuzzleIds[mode].includes(puzzleId)) return;
    save.seenPuzzleIds = { ...save.seenPuzzleIds, [mode]: [...save.seenPuzzleIds[mode], puzzleId] };
    mutate(set, save);
  },

  clearOutcome: () => set({ lastOutcome: null }),
}));
