/**
 * tests/reset.test.ts — OWNER: A8 (Platform).
 *
 * THE FRESH-START MECHANISM (owner request, round 14: "there's no mechanism to
 * restart the game fresh").
 *
 * Two scopes, and the whole risk is the same in both directions: a reset that
 * MISSES a key leaves a ghost (an unread marker for a fragment that no longer
 * exists, a `seenPuzzleIds` list skewing selection, a v1 blob resurrecting the
 * old game), and a reset that OVER-reaches destroys the permanent progress
 * MANOR_DESIGN §9 promises is unloseable.
 *
 * So this suite enumerates the persistence surface EXHAUSTIVELY and pins both
 * directions field by field:
 *
 *   localStorage : lexicon-loop-save-v2, lexicon-loop-save-v1-backup
 *   sessionStorage: ll-mirror-restored
 *   IndexedDB    : lexicon-manor / kv / save-mirror
 *
 * `SAVE_SHAPE` below is a FROZEN key list. A new SaveV2 field fails this suite
 * until someone states, here, which side of the new-volume line it falls on —
 * which is the only way a reset stays complete as the save grows.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearOwnedLocalKeys,
  createEmptySaveV2,
  emptySeenPuzzleIds,
  newVolumeSave,
  OWNED_LOCAL_KEYS,
  persistSave,
  resumeSaveWrites,
  SAVE_KEY,
  saveWritesSuspended,
  suspendSaveWrites,
  V1_BACKUP_KEY,
  writeSaveNow,
  type SaveV2,
} from '../src/app/save';
import { VIEWED_BACKFILL_FLAG } from '../src/engine/journal';

// --- storage stubs (vitest runs in node — same pattern as migrations.test) --

function installStorage(name: 'localStorage' | 'sessionStorage'): Map<string, string> {
  const map = new Map<string, string>();
  const stub = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
  Object.defineProperty(globalThis, name, { value: stub, configurable: true, writable: true });
  return map;
}

// ---------------------------------------------------------------------------
// The persistence surface, enumerated
// ---------------------------------------------------------------------------

/** Every top-level field of SaveV2. Frozen: adding one must fail here first. */
const SAVE_SHAPE = [
  'version', 'profileName', 'day', 'manor', 'ledger', 'currencies', 'volume',
  'journal', 'events', 'cabinet', 'chronicles', 'earnedAchievementIds',
  'seenPuzzleIds', 'openLedger', 'settings',
] as const;

/** What "Start a new volume" must KEEP (MANOR_DESIGN §9 persists-forever). */
const NEW_VOLUME_KEEPS = [
  'profileName', 'cabinet', 'chronicles', 'earnedAchievementIds', 'seenPuzzleIds',
  'settings',
] as const;

/** What "Start a new volume" must CLEAR (endDay's nightly resets + the volume). */
// ROUND 27 — `openLedger` (engine/rooms/room-bank.ts) is the one field that
// survives the NIGHTLY reset and does not survive a NEW VOLUME, so it is
// stated on this side of the line explicitly. It is a half-solved board in a
// house about to be re-opened around a different mystery: run state, like the
// day, the floorplan and the step ledger.
const NEW_VOLUME_CLEARS = ['day', 'manor', 'ledger', 'volume', 'openLedger'] as const;

/**
 * A save with every field dirtied — one volume solved, another archived, a
 * warm household, a full shelf, a v1 legacy tail. Nothing here is default.
 */
function dirtySave(): SaveV2 {
  return {
    version: 2,
    profileName: 'Wren',
    day: {
      day: 7, phase: 'exploring', daySeed: 12345, activeRoom: '2,3', startedAt: 1_700_000_000_000,
    } as unknown as SaveV2['day'],
    manor: { daySeed: 12345, rooms: { '0,0': {} }, playerCell: { col: 2, row: 3 } } as unknown as SaveV2['manor'],
    ledger: { budget: 21, entries: [{ reason: 'move', delta: -1, at: 1 }] } as SaveV2['ledger'],
    currencies: { gems: 4, keys: 2, bookmarks: 5 },
    volume: {
      volumeId: 'volume-1',
      day: 7,
      foundFragmentIds: ['v1-e1', 'v1-t2'],
      interpretedFragmentIds: ['v1-e1'],
      guesses: [{ day: 6, guess: 'WRONG' }],
      status: 'solved',
    },
    journal: {
      seenNodeIds: ['bramble-hello', 'ellery-intro'],
      flags: [
        VIEWED_BACKFILL_FLAG,
        'met.bramble',
        'ellery.quest1.done',
        'sys.first-gift.posy',
        'sys.keepsake.first-day',
        // Volume-scoped families — the ghost risk (docs/flags.md).
        'vol.volume-1.solved',
        'vol.volume-1.viewed-v1-e1',
        'vol.volume-1.glanced-v1-t2',
        'vol.volume-1.sealed-v1-t2',
        'vol.volume-1.legible-v1-e1',
        'vol.volume-1.opened-letter-1',
        'vol.volume-1.made-out-day-6',
        'vol.volume-1.landing-reached',
        // A DIFFERENT volume's archive — must survive a roll onto volume-2.
        'vol.volume-0.solved',
        'vol.volume-0.viewed-v0-e1',
      ],
      affinities: { bramble: 5, ellery: 3, posy: 2, fern: 4, dewey: 0, portrait: 1 },
      dailyTalked: ['bramble'],
      dailyGifted: ['posy'],
    },
    events: {
      recent: [{ day: 7, at: 1, event: { type: 'room-solved' } } as unknown as never],
      counters: { 'room-solved': 12, 'fragment-found': 9, 'day-ended': 6 },
    },
    cabinet: { unlockedCardIds: ['bp-nursery', 'bp-still-room'] },
    chronicles: {
      dayRecords: [{ day: 1, endedAt: 1, cause: 'steps-exhausted' } as unknown as never],
      runHistoryV1: [{ id: 'old-run' } as unknown as never],
      legacyPerks: { unlockedPerkIds: ['p1'], activePerkLoadout: ['p1'] },
    },
    earnedAchievementIds: ['first-day', 'first-fragment'],
    openLedger: {
      v: 1,
      session: {
        v: 1, kind: 'sudoku', puzzleId: 'sudoku-t1-01', tier: 1,
        stateVersion: 99, state: {}, done: false, solvedOnce: false,
      },
      ladderEarned: 0.5,
      day: 6,
    } as unknown as SaveV2['openLedger'],
    seenPuzzleIds: { ...emptySeenPuzzleIds(), hive: ['hive-3'], twistle: ['tw-9'] },
    settings: {
      soundEnabled: false, reducedMotion: true, musicEnabled: false, muteSwitchBypass: true,
    },
  };
}

describe('the persistence surface is fully enumerated', () => {
  it('SaveV2 has exactly the frozen field list', () => {
    expect(Object.keys(createEmptySaveV2('x')).sort()).toEqual([...SAVE_SHAPE].sort());
    expect(Object.keys(dirtySave()).sort()).toEqual([...SAVE_SHAPE].sort());
  });

  it('every field is accounted for by exactly one new-volume rule', () => {
    const ruled = [...NEW_VOLUME_KEEPS, ...NEW_VOLUME_CLEARS];
    // The remainder are the three fields with per-sub-field rules, asserted
    // individually below, plus the schema version.
    const perField = ['version', 'currencies', 'journal', 'events'];
    expect([...ruled, ...perField].sort()).toEqual([...SAVE_SHAPE].sort());
    expect(new Set(ruled).size).toBe(ruled.length);
  });

  it('names every owned localStorage key', () => {
    expect([...OWNED_LOCAL_KEYS].sort()).toEqual(
      ['lexicon-loop-save-v1-backup', 'lexicon-loop-save-v2'],
    );
    expect(OWNED_LOCAL_KEYS).toContain(SAVE_KEY);
    expect(OWNED_LOCAL_KEYS).toContain(V1_BACKUP_KEY);
  });
});

// ---------------------------------------------------------------------------
// Scope 1 — "Start a new volume"
// ---------------------------------------------------------------------------

describe('newVolumeSave — a fresh mystery, the same household', () => {
  const before = dirtySave();
  const after = newVolumeSave(before, 'volume-2');

  it('rolls the mystery onto the next volume, fresh', () => {
    expect(after.volume).toEqual({
      volumeId: 'volume-2',
      day: 0,
      foundFragmentIds: [],
      interpretedFragmentIds: [],
      guesses: [],
      status: 'active',
    });
  });

  it('clears the run: day, manor, ledger', () => {
    expect(after.day).toBeNull();
    expect(after.manor).toBeNull();
    expect(after.ledger).toEqual({ budget: 0, entries: [] });
  });

  it('zeroes the nightly currencies and keeps the gift currency (day.ts endDay)', () => {
    expect(after.currencies).toEqual({ gems: 0, keys: 0, bookmarks: 5 });
  });

  it('KEEPS character affinity', () => {
    expect(after.journal.affinities).toEqual(before.journal.affinities);
  });

  it('KEEPS dialogue-seen', () => {
    expect(after.journal.seenNodeIds).toEqual(before.journal.seenNodeIds);
  });

  it('KEEPS keepsakes, the cabinet, chronicles history and settings', () => {
    expect(after.earnedAchievementIds).toEqual(before.earnedAchievementIds);
    expect(after.cabinet.unlockedCardIds).toEqual(before.cabinet.unlockedCardIds);
    expect(after.chronicles.dayRecords).toEqual(before.chronicles.dayRecords);
    expect(after.chronicles.runHistoryV1).toEqual(before.chronicles.runHistoryV1);
    expect(after.chronicles.legacyPerks).toEqual(before.chronicles.legacyPerks);
    expect(after.settings).toEqual(before.settings);
    expect(after.profileName).toBe('Wren');
  });

  it('KEEPS lifetime counters (the keepsake shelf is derived from them)', () => {
    expect(after.events.counters).toEqual(before.events.counters);
  });

  it('KEEPS seenPuzzleIds — a genuine volume roll does not forget them either', () => {
    expect(after.seenPuzzleIds).toEqual(before.seenPuzzleIds);
  });

  it('drains the day-stamped event stream and the pacing valves', () => {
    expect(after.events.recent).toEqual([]);
    expect(after.journal.dailyTalked).toEqual([]);
    expect(after.journal.dailyGifted).toEqual([]);
  });

  it('KEEPS story flags and the unread-backfill marker', () => {
    for (const f of [
      VIEWED_BACKFILL_FLAG, 'met.bramble', 'ellery.quest1.done',
      'sys.first-gift.posy', 'sys.keepsake.first-day',
    ]) {
      expect(after.journal.flags).toContain(f);
    }
  });

  it('KEEPS the closed volume\'s archive flags', () => {
    expect(after.journal.flags).toContain('vol.volume-1.solved');
    expect(after.journal.flags).toContain('vol.volume-1.viewed-v1-e1');
    expect(after.journal.flags).toContain('vol.volume-0.solved');
  });

  it('leaves NO ghost marker for the volume it rolls INTO', () => {
    const rolled = newVolumeSave(before, 'volume-1'); // re-opening the same volume
    const ghosts = rolled.journal.flags.filter((f) => f.startsWith('vol.volume-1.'));
    expect(ghosts).toEqual([]);
    // and every other volume's archive is untouched
    expect(rolled.journal.flags).toContain('vol.volume-0.viewed-v0-e1');
    expect(rolled.journal.flags).toContain('met.bramble');
  });

  it('never mutates the save it was handed', () => {
    const source = dirtySave();
    const snapshot = JSON.stringify(source);
    newVolumeSave(source, 'volume-2');
    expect(JSON.stringify(source)).toBe(snapshot);
  });

  it('lands a genuinely-fresh household exactly where a new install lands', () => {
    // The strongest form of "no stale state": rolling an untouched save
    // produces the empty save byte for byte.
    const empty = createEmptySaveV2('Player');
    expect(newVolumeSave(empty, 'volume-1')).toEqual(empty);
  });

  it('starts at the day-1 budget (day null → startDay computes day 1)', () => {
    expect(after.day).toBeNull();
    expect(after.volume.day).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scope 2 — "Erase everything"
// ---------------------------------------------------------------------------

describe('erase everything — the factory reset', () => {
  let local: Map<string, string>;
  let session: Map<string, string>;

  beforeEach(() => {
    local = installStorage('localStorage');
    session = installStorage('sessionStorage');
    resumeSaveWrites();
  });

  afterEach(() => {
    resumeSaveWrites();
  });

  it('clears every owned localStorage key, including the v1 backup blob', () => {
    writeSaveNow(dirtySave());
    localStorage.setItem(V1_BACKUP_KEY, '{"version":1}');
    expect(local.size).toBe(2);

    clearOwnedLocalKeys();

    for (const key of OWNED_LOCAL_KEYS) expect(localStorage.getItem(key)).toBeNull();
    expect(local.size).toBe(0);
  });

  it('a cleared key boots as a first-time player', async () => {
    const { loadSave } = await import('../src/app/save');
    writeSaveNow(dirtySave());
    clearOwnedLocalKeys();
    const booted = loadSave();
    expect(booted).toEqual(createEmptySaveV2('Player'));
    expect(booted.volume.foundFragmentIds).toEqual([]);
    expect(booted.earnedAchievementIds).toEqual([]);
    expect(booted.chronicles.dayRecords).toEqual([]);
    expect(booted.journal.affinities).toEqual({
      bramble: 0, ellery: 0, posy: 0, fern: 0, dewey: 0, portrait: 0,
    });
    for (const ids of Object.values(booted.seenPuzzleIds)) expect(ids).toEqual([]);
    // Every marker count reads zero.
    expect(booted.journal.flags.filter((f) => f.startsWith('vol.'))).toEqual([]);
    expect(booted.cabinet.unlockedCardIds).toEqual([]);
    expect(booted.events.counters).toEqual({});
    expect(booted.events.recent).toEqual([]);
  });

  it('resetPersistence clears local + session keys and lays down nothing', async () => {
    const { resetPersistence, OWNED_SESSION_KEYS } = await import('../src/app/platform/persistence');
    writeSaveNow(dirtySave());
    localStorage.setItem(V1_BACKUP_KEY, '{"version":1}');
    for (const k of OWNED_SESSION_KEYS) sessionStorage.setItem(k, '1');

    await resetPersistence(null);

    for (const key of OWNED_LOCAL_KEYS) expect(localStorage.getItem(key)).toBeNull();
    for (const key of OWNED_SESSION_KEYS) expect(sessionStorage.getItem(key)).toBeNull();
    expect(local.size).toBe(0);
    expect(session.size).toBe(0);
  });

  it('resetPersistence lays down exactly the new-volume save when given one', async () => {
    const { resetPersistence } = await import('../src/app/platform/persistence');
    writeSaveNow(dirtySave());
    localStorage.setItem(V1_BACKUP_KEY, '{"version":1}');

    const replacement = newVolumeSave(dirtySave(), 'volume-1');
    await resetPersistence(replacement);

    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!)).toEqual(replacement);
    // The v1 archive goes with the old volume's run — nothing else survives.
    expect(localStorage.getItem(V1_BACKUP_KEY)).toBeNull();
    expect(local.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The lock that makes the reset survive its own teardown
// ---------------------------------------------------------------------------

describe('save-write suspension', () => {
  beforeEach(() => {
    installStorage('localStorage');
    installStorage('sessionStorage');
    resumeSaveWrites();
  });
  afterEach(() => resumeSaveWrites());

  it('persistSave becomes a no-op once suspended, writeSaveNow does not', () => {
    expect(saveWritesSuspended()).toBe(false);
    persistSave(createEmptySaveV2('A'));
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();

    localStorage.removeItem(SAVE_KEY);
    suspendSaveWrites();
    expect(saveWritesSuspended()).toBe(true);

    // This is the pagehide/store-subscription path firing during the reload.
    persistSave(dirtySave());
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();

    // …while the reset's own deliberate write still lands.
    writeSaveNow(createEmptySaveV2('B'));
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).profileName).toBe('B');
  });

  it('flushSave writes nothing after a reset (the pagehide hazard)', async () => {
    const { flushSave, resetPersistence } = await import('../src/app/platform/persistence');
    writeSaveNow(dirtySave());
    await resetPersistence(null);
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();

    // pagehide fires on the reset's own location.reload().
    flushSave();
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  });
});
