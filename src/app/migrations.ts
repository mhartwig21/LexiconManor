/**
 * Save migrations (ARCHITECTURE §10). Phase-0 stub landed by the architect so
 * the v1-backup guarantee exists before ANY schema-touching change ships.
 *
 * A8 owns: hardening this table, `tests/migrations.test.ts` with a frozen
 * real v1 fixture, and the dual-write/IndexedDB mirror in app/platform/.
 *
 * v1 → v2 policy (frozen):
 *  - PRESERVE profileName, runHistory (verbatim → chronicles.runHistoryV1),
 *    earnedAchievementIds, seenPuzzleIds (new kinds init []), settings.
 *  - PARK unlockedPerkIds/activePerkLoadout → chronicles.legacyPerks (AAA §10.1).
 *  - DROP activeRun* (fork/diamond run state — un-migratable, loses nothing
 *    meaningful).
 *  - Before the v2 save can overwrite the key, the raw v1 blob is copied once
 *    to `lexicon-loop-save-v1-backup`.
 */

import type { GameMode, SaveFile } from '../engine/types';
import type { SaveV2 } from './save';
import { createEmptySaveV2, emptySeenPuzzleIds, V1_BACKUP_KEY } from './save';

const V1_MODES: readonly GameMode[] = ['word-web', 'hive', 'twistle', 'forgotten-word'];

/** Copy the raw v1 blob to the backup key, once, before anything overwrites it. */
function backupV1Once(v1: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(V1_BACKUP_KEY) !== null) return;
    localStorage.setItem(V1_BACKUP_KEY, JSON.stringify(v1));
  } catch (err) {
    console.error('Failed to back up v1 save', err);
  }
}

function migrateV1toV2(v1: SaveFile): SaveV2 {
  const next = createEmptySaveV2(v1.profileName || 'Player');
  next.chronicles.runHistoryV1 = v1.runHistory ?? [];
  next.chronicles.legacyPerks = {
    unlockedPerkIds: v1.unlockedPerkIds ?? [],
    activePerkLoadout: v1.activePerkLoadout ?? [],
  };
  next.earnedAchievementIds = v1.earnedAchievementIds ?? [];
  const seen = emptySeenPuzzleIds();
  for (const mode of V1_MODES) seen[mode] = v1.seenPuzzleIds?.[mode] ?? [];
  next.seenPuzzleIds = seen;
  next.settings = {
    ...next.settings,
    soundEnabled: v1.settings?.soundEnabled ?? true,
    reducedMotion: v1.settings?.reducedMotion ?? false,
  };
  return next;
}

/**
 * Normalize any raw parsed save (v1, v2, partial, or garbage) into a SaveV2.
 * Every load path — localStorage AND importSaveCode — runs through here.
 */
export function migrate(raw: unknown): SaveV2 {
  if (typeof raw !== 'object' || raw === null) return createEmptySaveV2('Player');
  const version = (raw as { version?: unknown }).version;

  if (version === 1) {
    backupV1Once(raw);
    return migrateV1toV2(raw as SaveFile);
  }

  if (version === 2) {
    // Backfill fields added since the save was written (shallow, per section).
    const empty = createEmptySaveV2('Player');
    const v2 = raw as Partial<SaveV2>;
    return {
      ...empty,
      ...v2,
      version: 2,
      volume: { ...empty.volume, ...v2.volume },
      journal: { ...empty.journal, ...v2.journal },
      events: { ...empty.events, ...v2.events },
      cabinet: { ...empty.cabinet, ...v2.cabinet },
      chronicles: { ...empty.chronicles, ...v2.chronicles },
      seenPuzzleIds: { ...empty.seenPuzzleIds, ...v2.seenPuzzleIds },
      settings: { ...empty.settings, ...v2.settings },
    };
  }

  return createEmptySaveV2('Player');
}
