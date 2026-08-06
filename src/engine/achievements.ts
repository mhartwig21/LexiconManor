import type { AchievementDef, DayRecord, NodeResult, RunRecord, SaveFile } from './types';
import type { GameEventType } from './events';
import { ACHIEVEMENTS, PERKS } from './effects';

// ===========================================================================
// PART 1 — KEEPSAKES: the manor's permanent-progress layer (AAA 11.17).
// ===========================================================================
//
// Round-7 defect: the Chronicles page advertised a "keepsakes" total and a
// Keepsakes section, and NOTHING could ever fill them. `checkAchievements`
// (part 2, below) had zero call sites anywhere in src/, `meta.earnedAchievementIds`
// had no mutator, and the catalog it checked was the v1 roguelike's — nodes,
// bosses, entropy, runs — concepts that do not exist in the manor. The section
// was structurally always empty: a dead reward class, which AAA 11.17 makes a
// release blocker.
//
// The fix is a manor-native catalog evaluated over facts that PERSIST FOREVER:
// the event spine's lifetime counters (engine/events.ts — never pruned; dusk
// only prunes `recent`), the Chronicles' DayRecords, and the write-once flag
// set. That choice is what makes the same predicate answer identically for the
// live store and for a save file on disk, so `app/migrations.ts` can backfill a
// save written before this shipped and the running game can award mid-day —
// with no third source of truth to drift.
//
// R.3 compliance: every condition is accumulative and unloseable. Nothing here
// can be taken away, nothing counts mistakes, nothing expires at dusk.

/**
 * Everything a keepsake condition may look at. Derived by `keepsakeFacts`
 * from persisted state only — never from day-scoped or session state.
 */
export interface KeepsakeFacts {
  /** Days banked in the Chronicles ledger. */
  daysKept: number;
  /** Lifetime rooms solved (spine counter). */
  roomsSolved: number;
  /** Most rooms solved within one day, ever. */
  bestRoomsSolvedInADay: number;
  /** Pangrams, Full Blooms, Every Petals — the 'room-notable' channel. */
  notableMoments: number;
  fragmentsFiled: number;
  lettersOpened: number;
  volumesSolved: number;
  deweyGreetings: number;
  /** Lifetime affinity rank-ups across the whole household. */
  rankUps: number;
  /** Highest 0-based manor row ever stood on (6 = the Sanctum landing). */
  highestRowEver: number;
  /** Write-once story flags (docs/flags.md). */
  flags: ReadonlySet<string>;
}

export interface KeepsakeDef {
  id: string;
  /** The plain, recognisable name first (AAA 11.7). */
  name: string;
  /**
   * What earns it, said in the house's voice. Shown whether or not it is
   * earned — a keepsake she cannot see the shape of is not a goal, and none
   * of these spoil a puzzle, a fragment, or the word.
   */
  description: string;
  /** Pure predicate. No RNG, no clock, no store. */
  earned(f: KeepsakeFacts): boolean;
}

/**
 * The catalog. Deliberately small (a mantelpiece, not an achievement list) and
 * front-loaded: three are reachable inside a first evening, so the Chronicles
 * section is never a shelf of empty plates on day one, and the long ones are
 * campaign milestones the economy actually produces (AAA 4.10c–e).
 *
 * IDS ARE PERMANENT. They are written into saves; renaming one orphans a
 * keepsake the owner already has on her shelf.
 */
export const KEEPSAKES: readonly KeepsakeDef[] = [
  {
    id: 'first-morning',
    name: 'The First Morning',
    description: 'Keep a day in the manor, from tea to dusk.',
    earned: (f) => f.daysKept >= 1,
  },
  {
    id: 'a-door-opened',
    name: 'A Door Opened',
    description: 'Solve your first room.',
    earned: (f) => f.roomsSolved >= 1,
  },
  {
    id: 'a-line-in-his-hand',
    name: 'A Line in His Hand',
    description: 'File your first clue fragment in the Journal.',
    earned: (f) => f.fragmentsFiled >= 1,
  },
  {
    id: 'the-morning-post',
    name: 'The Morning Post',
    description: 'Break the seal on three of Posy’s letters.',
    earned: (f) => f.lettersOpened >= 3,
  },
  {
    id: 'every-petal',
    name: 'Every Petal',
    description: 'Do something remarkable in a room — a pangram, or Full Bloom.',
    earned: (f) => f.notableMoments >= 1,
  },
  {
    id: 'a-full-days-work',
    name: 'A Full Day’s Work',
    description: 'Solve four rooms between one morning and one dusk.',
    earned: (f) => f.bestRoomsSolvedInADay >= 4,
  },
  {
    id: 'deweys-regard',
    name: 'Dewey’s Regard',
    description: 'Greet the cat on seven separate days.',
    earned: (f) => f.deweyGreetings >= 7,
  },
  {
    id: 'warmly-regarded',
    name: 'Warmly Regarded',
    description: 'Warm the household to you four times over.',
    earned: (f) => f.rankUps >= 4,
  },
  {
    id: 'the-upper-gallery',
    name: 'The Upper Gallery',
    description: 'Climb as far as the upper gallery in a single day.',
    earned: (f) => f.highestRowEver >= 5,
  },
  {
    id: 'a-favour-repaid',
    name: 'A Favour Repaid',
    description: 'Shake the word Posy lost out of the master’s rooms.',
    earned: (f) => f.flags.has('posy.quest1.done'),
  },
  {
    id: 'a-fortnight-of-mornings',
    name: 'A Fortnight of Mornings',
    description: 'Keep fourteen days in the manor.',
    earned: (f) => f.daysKept >= 14,
  },
  {
    id: 'the-word-spoken',
    name: 'The Word Spoken',
    description: 'Say the word aloud at the Sanctum door, and be right.',
    earned: (f) => f.volumesSolved >= 1,
  },
];

export const KEEPSAKE_IDS: ReadonlySet<string> = new Set(KEEPSAKES.map((k) => k.id));

export function keepsakeById(id: string): KeepsakeDef | undefined {
  return KEEPSAKES.find((k) => k.id === id);
}

/** The persisted slices a keepsake evaluation reads. Shape-shared by the live
 *  store projection and by a `SaveV2` on disk — one predicate, two callers. */
export interface KeepsakeSource {
  /** Lifetime per-event-type counters (engine/events.ts — persist forever). */
  counters: Readonly<Partial<Record<GameEventType, number>>>;
  /** The Chronicles ledger (accumulative, unloseable — AAA R.3). */
  dayRecords: readonly DayRecord[];
  /** Write-once story flags. */
  flags: readonly string[];
}

export function keepsakeFacts(src: KeepsakeSource): KeepsakeFacts {
  const c = src.counters ?? {};
  const records = src.dayRecords ?? [];
  let bestRoomsSolvedInADay = 0;
  let highestRowEver = 0;
  for (const r of records) {
    if (r.roomsSolved > bestRoomsSolvedInADay) bestRoomsSolvedInADay = r.roomsSolved;
    if ((r.highestRow ?? 0) > highestRowEver) highestRowEver = r.highestRow ?? 0;
  }
  return {
    daysKept: records.length,
    roomsSolved: c['room-solved'] ?? 0,
    bestRoomsSolvedInADay,
    notableMoments: c['room-notable'] ?? 0,
    fragmentsFiled: c['fragment-found'] ?? 0,
    lettersOpened: c['letter-opened'] ?? 0,
    volumesSolved: c['volume-solved'] ?? 0,
    deweyGreetings: c['dewey-petted'] ?? 0,
    rankUps: c['affinity-rank-up'] ?? 0,
    highestRowEver,
    flags: new Set(src.flags ?? []),
  };
}

/**
 * Newly earned keepsakes — those deserved by `facts` and not already held.
 * Pure and idempotent: calling it on every store mutation is free of side
 * effects and returns `[]` once the shelf has caught up.
 */
export function checkKeepsakes(
  earnedIds: readonly string[],
  facts: KeepsakeFacts,
): KeepsakeDef[] {
  const have = new Set(earnedIds);
  return KEEPSAKES.filter((k) => !have.has(k.id) && k.earned(facts));
}

/**
 * The whole shelf, in catalog order, each marked earned or not — what the
 * Chronicles renders. An unearned keepsake is a named goal, not a blank.
 */
export function keepsakeShelf(
  earnedIds: readonly string[],
): { keepsake: KeepsakeDef; earned: boolean }[] {
  const have = new Set(earnedIds);
  return KEEPSAKES.map((keepsake) => ({ keepsake, earned: have.has(keepsake.id) }));
}

/**
 * Drop ids the catalog no longer knows — v1 roguelike achievements
 * ('five-nodes', 'boss-slayer', …) carried forward by the v1→v2 migration.
 * They can never render (no def, no name) and would inflate the "N of 12"
 * count into a lie (AAA 11.21). The v1 blob still holds them verbatim under
 * `lexicon-loop-save-v1-backup`, so nothing is destroyed.
 */
export function pruneUnknownKeepsakeIds(ids: readonly string[]): string[] {
  return ids.filter((id) => KEEPSAKE_IDS.has(id));
}

// ===========================================================================
// PART 2 — the v1 achievement evaluator (LEGACY, quarantined with effects.ts).
// ===========================================================================
//
// Kept compiling and kept under test (tests/engine.test.ts, which the
// architecture freezes) because the v1 catalog in engine/effects.ts is parked
// pending the glyph/perk decision (AAA §10.1) — not because anything in the
// manor calls it. NOTHING in the manor calls it: keepsakes are part 1.

/**
 * Achievement evaluation over lifetime history (run records + the current
 * run's node results so unlocks fire mid-run, not only at run end).
 */

export interface LifetimeTotals {
  nodesCompleted: number;
  bossesDefeated: number;
  perfectClears: number;
  runsCompleted: number;
  winsByMode: Record<string, number>;
  bestHiveScoreNoEntropy: number;
}

export function computeLifetimeTotals(history: RunRecord[], currentRunResults: NodeResult[]): LifetimeTotals {
  const allResults = [...history.flatMap((r) => r.nodeResults), ...currentRunResults];
  const winsByMode: Record<string, number> = {};
  let perfectClears = 0;
  for (const r of allResults) {
    if (!r.won) continue;
    winsByMode[r.mode] = (winsByMode[r.mode] ?? 0) + 1;
    if (r.wrongAttempts === 0) perfectClears++;
  }
  return {
    nodesCompleted: allResults.filter((r) => r.won).length,
    bossesDefeated:
      history.reduce((s, r) => s + r.bossesDefeated, 0) +
      currentRunResults.filter((r) => r.won && r.isBoss).length,
    perfectClears,
    runsCompleted: history.filter((r) => r.outcome === 'victory').length,
    winsByMode,
    bestHiveScoreNoEntropy: 0, // supplied via checkAchievements opts when a hive game ends
  };
}

/**
 * Return newly earned achievements (not already in the save).
 * `hiveScoreNoEntropy` is the just-finished hive score if entropy stayed 0.
 */
export function checkAchievements(
  save: Pick<SaveFile, 'earnedAchievementIds'>,
  totals: LifetimeTotals,
  opts?: { hiveScoreNoEntropy?: number },
): AchievementDef[] {
  const earned: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (save.earnedAchievementIds.includes(a.id)) continue;
    const c = a.condition;
    const met =
      c.kind === 'nodes_completed' ? totals.nodesCompleted >= c.count
      : c.kind === 'bosses_defeated' ? totals.bossesDefeated >= c.count
      : c.kind === 'perfect_clears' ? totals.perfectClears >= c.count
      : c.kind === 'mode_wins' ? (totals.winsByMode[c.mode] ?? 0) >= c.count
      : c.kind === 'hive_score_no_entropy' ? (opts?.hiveScoreNoEntropy ?? 0) >= c.score
      : c.kind === 'runs_completed' ? totals.runsCompleted >= c.count
      : false;
    if (met) earned.push(a);
  }
  return earned;
}

/** Perks unlocked by a set of achievement ids. */
export function perksUnlockedBy(achievementIds: string[]): string[] {
  return PERKS.filter((p) => achievementIds.includes(p.unlockedBy)).map((p) => p.id);
}
