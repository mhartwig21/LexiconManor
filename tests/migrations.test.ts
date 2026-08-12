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
import {
  atSanctumDoor, cellKey, createManor, isSanctumCell, roomAt,
  SANCTUM_CARD_ID, SANCTUM_CELLS, SANCTUM_LANDING_CELLS,
} from '../src/engine/manor/grid';
import { ENTRANCE_CELL, type PlacedRoom } from '../src/engine/types';
import { VIEWED_BACKFILL_FLAG, viewedFragmentFlag } from '../src/engine/journal';

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

    // ROUND 7 (AAA 11.17): `earnedAchievementIds` is now the MANOR KEEPSAKE
    // shelf (engine/achievements.KEEPSAKES), the one field the Chronicles'
    // "N of 12" reads. The v1 roguelike ids have no def in that catalog — they
    // cannot render a name and would make the count a lie (11.21) — so the
    // shape migration still carries them across and `backfillKeepsakes` then
    // drops them. Nothing is destroyed: the raw v1 blob is kept verbatim under
    // the backup key (asserted below) and the runs under chronicles.runHistoryV1.
    expect(v2.earnedAchievementIds).toEqual([]);
    const rawBackup = JSON.parse(store.get(V1_BACKUP_KEY)!) as typeof V1_FIXTURE;
    expect(rawBackup.earnedAchievementIds).toEqual(['five-nodes', 'first-web']);

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

describe('unread viewed-flags backfill (AAA 11.20/11.21)', () => {
  it('takes everything already filed as read, once, on a save that predates the flags', () => {
    const old = createEmptySaveV2('Meredith');
    old.volume.foundFragmentIds = ['v1-d1', 'v1-e1'];
    old.journal.flags = ['met.bramble']; // written before viewed-flags existed

    const v2 = migrate(JSON.parse(JSON.stringify(old)));
    expect(v2.journal.flags).toContain('met.bramble');
    expect(v2.journal.flags).toContain(viewedFragmentFlag('volume-1', 'v1-d1'));
    expect(v2.journal.flags).toContain(viewedFragmentFlag('volume-1', 'v1-e1'));
    expect(v2.journal.flags).toContain(VIEWED_BACKFILL_FLAG);
  });

  it('never runs twice — a fragment filed AFTER the sweep keeps its marker', () => {
    const swept = createEmptySaveV2('Meredith');
    swept.volume.foundFragmentIds = ['v1-d1'];
    swept.journal.flags = [VIEWED_BACKFILL_FLAG];

    const v2 = migrate(JSON.parse(JSON.stringify(swept)));
    // v1-d1 arrived under this build and has not been looked at: no flag.
    expect(v2.journal.flags).not.toContain(viewedFragmentFlag('volume-1', 'v1-d1'));
    expect(v2.journal.flags).toEqual([VIEWED_BACKFILL_FLAG]);
  });

  it('a save born under this build is stamped at birth, so the sweep can never catch it', () => {
    // Otherwise the first reload after finding a fragment would quietly mark
    // it viewed — the marker would clear on something that is not viewing.
    expect(createEmptySaveV2('Meredith').journal.flags).toContain(VIEWED_BACKFILL_FLAG);
  });

  it('a migrated v1 save is stamped too (it has nothing filed to sweep)', () => {
    const v2 = migrate(JSON.parse(JSON.stringify(V1_FIXTURE)));
    expect(v2.journal.flags).toEqual([VIEWED_BACKFILL_FLAG]);
    expect(v2.volume.foundFragmentIds).toEqual([]);
  });

  it('is idempotent across repeated loads', () => {
    const old = createEmptySaveV2('Meredith');
    old.volume.foundFragmentIds = ['v1-d1'];
    old.journal.flags = [];
    const once = migrate(JSON.parse(JSON.stringify(old)));
    const twice = migrate(JSON.parse(JSON.stringify(once)));
    expect(twice.journal.flags).toEqual(once.journal.flags);
  });
});

/**
 * ═══ ROUND 37 — THE SANCTUM GREW, AND A SAVE CAN ARRIVE FROM BEFORE IT ════
 *
 * The chamber was one cell and is three. The manor is rebuilt at every dawn, so
 * the only way the new geometry can arrive wrong is an evening interrupted
 * under the old build: it may hold a DRAFTED room at (1,6) or (3,6), and a
 * manor missing two of its three seals is one where a landing room's north door
 * opens onto an ordinary parlor. `atSanctumDoor` asks the MANOR — that is the
 * round-28 ruling, one predicate, no second copy — so it would answer yes at a
 * door that is not the ending, and the volume would close in a Reading Nook.
 *
 * The migration is therefore verified against the failure it exists to stop,
 * not against its own shape: the assertion below is that `atSanctumDoor` says
 * NO through the impostor, which is an instrument that could disagree with the
 * migration rather than one that shares its assumptions.
 */
describe('the Sanctum suite is restored at the door (round 37)', () => {
  const legacyManor = () => {
    const m = createManor(7);
    const rooms: Record<string, PlacedRoom> = { ...m.rooms };
    // …as the old build wrote it: one seal, and two draftable cells beside it.
    for (const cell of SANCTUM_CELLS) {
      if (cell.col !== 2) delete rooms[cellKey(cell)];
    }
    return { ...m, rooms };
  };

  it('installs a seal in every chamber cell of a pre-round-37 save', () => {
    const save = createEmptySaveV2('Meredith');
    save.manor = legacyManor();
    const out = migrate(JSON.parse(JSON.stringify(save)));
    for (const cell of SANCTUM_CELLS) {
      const seal = roomAt(out.manor!, cell)!;
      expect(seal, `no seal at ${cellKey(cell)}`).toBeDefined();
      expect(seal.cardId).toBe(SANCTUM_CARD_ID);
      expect(seal.doors).toEqual(['S']);
    }
  });

  it('EVICTS a room standing where the chamber now is, and says no at its door', () => {
    const save = createEmptySaveV2('Meredith');
    const manor = legacyManor();
    const west = SANCTUM_CELLS[0]!;                       // (1,6)
    const landing = SANCTUM_LANDING_CELLS[0]!;            // (1,5)
    // The impostor: an ordinary room where the chamber now stands, drawing a
    // south door that would match a landing plan's north one.
    manor.rooms[cellKey(west)] = {
      cardId: 'reading-nook', cell: west, doors: ['S', 'E'], solved: true, kind: 'parlor',
    };
    manor.rooms[cellKey(landing)] = {
      cardId: 'gallery', cell: landing, doors: ['N', 'S'], solved: true, kind: 'twistle',
    };
    manor.playerCell = { ...landing };
    // Before the migration the two doors match and the live gate is FOOLED —
    // which is the whole reason this migration exists, asserted rather than
    // asserted-about.
    save.manor = manor;
    expect(atSanctumDoor(manor)).toBe(true);
    const out = migrate(JSON.parse(JSON.stringify(save)));
    expect(roomAt(out.manor!, west)!.cardId).toBe(SANCTUM_CARD_ID);
    // …and now it is the ending, not a parlor: she is at a real door.
    expect(atSanctumDoor(out.manor!)).toBe(true);
    expect(out.manor!.playerCell).toEqual(landing);
  });

  it('puts her back in the hall if she was standing inside the new chamber', () => {
    const save = createEmptySaveV2('Meredith');
    const manor = legacyManor();
    const east = SANCTUM_CELLS[2]!;                       // (3,6)
    manor.rooms[cellKey(east)] = {
      cardId: 'gallery', cell: east, doors: ['S'], solved: false, kind: 'twistle',
    };
    manor.playerCell = { ...east };
    save.manor = manor;
    const out = migrate(JSON.parse(JSON.stringify(save)));
    expect(isSanctumCell(out.manor!.playerCell)).toBe(false);
    expect(out.manor!.playerCell).toEqual(ENTRANCE_CELL);
  });

  it('leaves a round-37 manor byte-identical, and is idempotent', () => {
    const save = createEmptySaveV2('Meredith');
    save.manor = createManor(11);
    const once = migrate(JSON.parse(JSON.stringify(save)));
    expect(once.manor).toEqual(save.manor);
    const twice = migrate(JSON.parse(JSON.stringify(once)));
    expect(twice.manor).toEqual(once.manor);
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
