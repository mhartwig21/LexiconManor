/**
 * tests/migrations.test.ts — OWNER: A8 (Platform).
 *
 * The wife's live v1 save is irreplaceable (ARCHITECTURE §10): this suite
 * pins the v1→v2 migration against a FROZEN real-shape v1 fixture. Do not
 * regenerate the fixture from live types — its whole point is to stay
 * byte-stable even if the legacy types drift or disappear.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../src/app/migrations';
import {
  createEmptySaveV2,
  exportSaveCode,
  importSaveCode,
  SAVE_KEY,
  V1_BACKUP_KEY,
  type SaveV2,
} from '../src/app/save';
import { ROOM_PUZZLE_KINDS } from '../src/engine/rooms/room-puzzle';

// --- localStorage stub (vitest runs in node) -------------------------------

function installLocalStorage(): Map<string, string> {
  const map = new Map<string, string>();
  const stub = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  (globalThis as { localStorage?: unknown }).localStorage = stub;
  return map;
}

// --- FROZEN v1 fixture (real SaveFile shape as shipped by lexicon-loop v1) --
// Captured 2026-08: profile, two finished runs, perks, seen puzzles, settings.

const V1_FIXTURE = {
  version: 1,
  profileName: 'Meredith',
  activeRun: {
    map: { nodes: [], edges: [] },
    mindPoints: 2,
    level: 2,
    currentNodeId: 'n-7',
    totalScore: 341,
    status: 'active',
    startedAt: 1721000000000,
  },
  activeRunResults: [
    {
      nodeId: 'n-3',
      mode: 'hive',
      puzzleId: 'hive-042',
      isBoss: false,
      won: true,
      score: 55,
      wrongAttempts: 1,
      durationMs: 181000,
      level: 1,
    },
  ],
  activeRunGlyphs: ['glyph-echo'],
  runHistory: [
    {
      runId: 'run-a',
      startedAt: 1720000000000,
      endedAt: 1720003600000,
      outcome: 'victory',
      levelReached: 3,
      nodesCompleted: 11,
      bossesDefeated: 3,
      totalScore: 1204,
      nodeResults: [
        {
          nodeId: 'n-1',
          mode: 'word-web',
          puzzleId: 'ww-007',
          isBoss: false,
          won: true,
          score: 80,
          wrongAttempts: 0,
          durationMs: 240000,
          level: 1,
        },
      ],
      glyphsEarned: ['glyph-echo', 'glyph-lens'],
      perksUnlocked: ['perk-second-wind'],
    },
    {
      runId: 'run-b',
      startedAt: 1720500000000,
      endedAt: 1720501800000,
      outcome: 'defeat',
      levelReached: 2,
      nodesCompleted: 4,
      bossesDefeated: 1,
      totalScore: 322,
      nodeResults: [],
      glyphsEarned: [],
      perksUnlocked: [],
    },
  ],
  unlockedPerkIds: ['perk-second-wind', 'perk-lantern'],
  activePerkLoadout: ['perk-second-wind'],
  earnedAchievementIds: ['five-nodes', 'first-web'],
  seenPuzzleIds: {
    'word-web': ['ww-007', 'ww-012'],
    hive: ['hive-042'],
    twistle: [],
    'forgotten-word': ['fw-003'],
  },
  settings: { soundEnabled: false, reducedMotion: true },
} as const;

let store: Map<string, string>;

beforeEach(() => {
  store = installLocalStorage();
});

describe('v1 → v2 migration', () => {
  it('preserves everything the policy promises', () => {
    const v2 = migrate(JSON.parse(JSON.stringify(V1_FIXTURE)));

    expect(v2.version).toBe(2);
    expect(v2.profileName).toBe('Meredith');

    // Run history preserved VERBATIM under chronicles.runHistoryV1.
    expect(v2.chronicles.runHistoryV1).toEqual(V1_FIXTURE.runHistory);

    // Perk/loadout state parked, not dropped (AAA §10.1 pending).
    expect(v2.chronicles.legacyPerks).toEqual({
      unlockedPerkIds: ['perk-second-wind', 'perk-lantern'],
      activePerkLoadout: ['perk-second-wind'],
    });

    expect(v2.earnedAchievementIds).toEqual(['five-nodes', 'first-web']);

    // Seen puzzles carried; the new kinds initialized empty.
    expect(v2.seenPuzzleIds['word-web']).toEqual(['ww-007', 'ww-012']);
    expect(v2.seenPuzzleIds.hive).toEqual(['hive-042']);
    expect(v2.seenPuzzleIds['forgotten-word']).toEqual(['fw-003']);
    for (const kind of ROOM_PUZZLE_KINDS) {
      expect(v2.seenPuzzleIds[kind]).toBeDefined();
    }
    expect(v2.seenPuzzleIds.cipher).toEqual([]);
    expect(v2.seenPuzzleIds.crossword).toEqual([]);

    // Settings carried; new audio settings default on/off correctly.
    expect(v2.settings.soundEnabled).toBe(false);
    expect(v2.settings.reducedMotion).toBe(true);
    expect(v2.settings.musicEnabled).toBe(true);
    expect(v2.settings.muteSwitchBypass).toBe(false);

    // activeRun* dropped: a fresh manor, no day underway.
    expect(v2.day).toBeNull();
    expect(v2.manor).toBeNull();
    expect(v2.volume.status).toBe('active');
    expect(v2.volume.foundFragmentIds).toEqual([]);
  });

  it('backs the raw v1 blob up before anything can overwrite it — once', () => {
    const raw = JSON.parse(JSON.stringify(V1_FIXTURE));
    migrate(raw);

    const backup = store.get(V1_BACKUP_KEY);
    expect(backup).toBeDefined();
    expect(JSON.parse(backup!)).toEqual(raw);

    // A second migration (e.g. a re-imported old code) must NOT clobber it.
    const other = { ...JSON.parse(JSON.stringify(V1_FIXTURE)), profileName: 'Impostor' };
    migrate(other);
    expect(JSON.parse(store.get(V1_BACKUP_KEY)!).profileName).toBe('Meredith');
  });

  it('survives a missing localStorage (SSR/test) without throwing', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(() => migrate(JSON.parse(JSON.stringify(V1_FIXTURE)))).not.toThrow();
  });
});

describe('v2 → v2 normalization (forward-compat backfill)', () => {
  it('backfills fields added after the save was written', () => {
    const stale = createEmptySaveV2('Meredith') as Partial<SaveV2> & Record<string, unknown>;
    delete stale.events; // pretend the save predates the event spine
    delete (stale.settings as unknown as Record<string, unknown>).muteSwitchBypass;
    delete (stale.seenPuzzleIds as Record<string, unknown>).crossword;

    const v2 = migrate(stale);
    expect(v2.events).toEqual({ recent: [], counters: {} });
    expect(v2.settings.muteSwitchBypass).toBe(false);
    expect(v2.seenPuzzleIds.crossword).toEqual([]);
    expect(v2.profileName).toBe('Meredith');
  });

  it('keeps live v2 data untouched', () => {
    const save = createEmptySaveV2('Meredith');
    save.currencies = { gems: 3, keys: 1, bookmarks: 2 };
    save.volume.foundFragmentIds = ['frag.v1.01'];
    save.journal.affinities.bramble = 2;
    const v2 = migrate(JSON.parse(JSON.stringify(save)));
    expect(v2.currencies).toEqual({ gems: 3, keys: 1, bookmarks: 2 });
    expect(v2.volume.foundFragmentIds).toEqual(['frag.v1.01']);
    expect(v2.journal.affinities.bramble).toBe(2);
  });
});

describe('garbage tolerance', () => {
  it.each([null, undefined, 42, 'nonsense', [], { version: 99 }])('%p → fresh save', (raw) => {
    const v2 = migrate(raw);
    expect(v2.version).toBe(2);
    expect(v2.profileName).toBe('Player');
  });
});

describe('save codes (AAA 7.19 — the storage-container bridge)', () => {
  it('v2 roundtrip through export/import', () => {
    const save = createEmptySaveV2('Meredith');
    save.currencies.gems = 5;
    const back = importSaveCode(exportSaveCode(save));
    expect(back).toEqual(save);
  });

  it('a v1-era save code migrates on import', () => {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(V1_FIXTURE))));
    const back = importSaveCode(code);
    expect(back).not.toBeNull();
    expect(back!.version).toBe(2);
    expect(back!.chronicles.runHistoryV1).toEqual(V1_FIXTURE.runHistory);
  });

  it('rejects a mangled code with null, never a throw', () => {
    expect(importSaveCode('definitely not base64!!')).toBeNull();
  });

  it('never uses the live SAVE_KEY as a side effect of import', () => {
    importSaveCode(exportSaveCode(createEmptySaveV2('Meredith')));
    expect(store.get(SAVE_KEY)).toBeUndefined();
  });
});
