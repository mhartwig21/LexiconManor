/**
 * Save persistence — v2 schema (ARCHITECTURE §10). Architect-owned shell;
 * A8 owns the migrations implementation + frozen-fixture test and the
 * platform persistence hardening (dual-write, flush points) in app/platform/.
 *
 * Same localStorage key as v1 on purpose: the wife's live save must migrate
 * in place. `migrate()` copies the raw v1 blob to a backup key before any
 * v2 write can overwrite it.
 */

import type {
  CharacterId, Currencies, DayRecord, DayState, ManorState, StepLedger, VolumeState,
} from '../engine/types';
import type { GameEventType, RecordedEvent } from '../engine/events';
import type { RoomPuzzleKind } from '../engine/rooms/room-puzzle';
import { ROOM_PUZZLE_KINDS } from '../engine/rooms/room-puzzle';
import type { RunRecord } from '../engine/types';
import { VIEWED_BACKFILL_FLAG } from '../engine/journal';
import { freshVolumeState } from '../engine/volume';
import { migrate } from './migrations';

export const SAVE_KEY = 'lexicon-loop-save-v2';
export const V1_BACKUP_KEY = 'lexicon-loop-save-v1-backup';

/**
 * EVERY localStorage key the manor owns. The fresh-start path clears this list
 * rather than a hand-written pair, so a key added here is erased by
 * construction and cannot become the one ghost that survives a factory reset.
 */
export const OWNED_LOCAL_KEYS: readonly string[] = [SAVE_KEY, V1_BACKUP_KEY];

export interface SettingsV2 {
  soundEnabled: boolean;
  reducedMotion: boolean;
  musicEnabled: boolean;
  /** Open question AAA §10.4 — `navigator.audioSession.type = 'playback'`. */
  muteSwitchBypass: boolean;
}

export interface JournalSave {
  seenNodeIds: string[];
  flags: string[];                                // per docs/flags.md
  affinities: Record<CharacterId, number>;
  dailyTalked: CharacterId[];                     // pacing valves, reset at night
  dailyGifted: CharacterId[];
}

export interface EventsSave {
  recent: RecordedEvent[];                        // day-stamped, cleared at dusk
  counters: Partial<Record<GameEventType, number>>; // lifetime, persist forever
}

export interface ChroniclesSave {
  /** v1 run history preserved verbatim for the Chronicles archive. */
  runHistoryV1?: RunRecord[];
  /** v1 perk/loadout state parked pending the glyph decision (AAA §10.1). */
  legacyPerks?: { unlockedPerkIds: string[]; activePerkLoadout: string[] };
  dayRecords: DayRecord[];
}

/** The entire persisted save — one versioned object in localStorage. */
export interface SaveV2 {
  version: 2;
  profileName: string;
  day: DayState | null;                           // null = between days
  /**
   * The night's floorplan — and, since REVIEW_AA §5.3, the work done inside it.
   * In-room progress is parked on `manor.rooms[cellKey].session` (see
   * engine/rooms/room-session.ts) rather than in a top-level field, so it is
   * keyed by cellKey by construction and is cleared by the nightly `manor: null`
   * reset without a sweeper. `migrations.migrateRoomSessions` prunes any
   * snapshot this build can no longer honour before the app ever reads one.
   */
  manor: ManorState | null;                       // resets nightly
  ledger: StepLedger;
  currencies: Currencies;
  volume: VolumeState;
  journal: JournalSave;
  events: EventsSave;
  cabinet: { unlockedCardIds: string[] };
  chronicles: ChroniclesSave;
  /**
   * The keepsake shelf (engine/achievements.KEEPSAKES) — the manor's permanent
   * progress layer. Field name kept from v1 so the wife's live save migrates in
   * place; the CONTENTS are manor keepsake ids, and `migrations.backfillKeepsakes`
   * prunes any v1 roguelike id that rides in and backfills what the save has
   * already deserved. Awarded by `app/slices/meta.syncEarnedRewards` (AAA 11.17).
   */
  earnedAchievementIds: string[];
  seenPuzzleIds: Record<RoomPuzzleKind, string[]>;
  settings: SettingsV2;
}

export function emptySeenPuzzleIds(): Record<RoomPuzzleKind, string[]> {
  const out = {} as Record<RoomPuzzleKind, string[]>;
  for (const k of ROOM_PUZZLE_KINDS) out[k] = [];
  return out;
}

export function createEmptySaveV2(profileName: string): SaveV2 {
  return {
    version: 2,
    profileName,
    day: null,
    manor: null,
    ledger: { budget: 0, entries: [] },
    currencies: { gems: 0, keys: 0, bookmarks: 1 }, // one starter bookmark in the coat pocket
    volume: {
      volumeId: 'volume-1',
      day: 0,
      foundFragmentIds: [],
      interpretedFragmentIds: [],
      guesses: [],
      status: 'active',
    },
    journal: {
      seenNodeIds: [],
      // A save born under this build has nothing that predates the unread
      // flags, so the migration's one-time "everything filed is taken as read"
      // sweep must never run on it — otherwise the first reload after finding a
      // fragment would quietly mark it viewed (AAA 11.20). Stamped at birth.
      flags: [VIEWED_BACKFILL_FLAG],
      affinities: { bramble: 0, ellery: 0, posy: 0, fern: 0, dewey: 0, portrait: 0 },
      dailyTalked: [],
      dailyGifted: [],
    },
    events: { recent: [], counters: {} },
    cabinet: { unlockedCardIds: [] },
    chronicles: { dayRecords: [] },
    earnedAchievementIds: [],
    seenPuzzleIds: emptySeenPuzzleIds(),
    settings: { soundEnabled: true, reducedMotion: false, musicEnabled: true, muteSwitchBypass: false },
  };
}

export function loadSave(): SaveV2 {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return createEmptySaveV2('Player');
    return migrate(JSON.parse(raw));
  } catch {
    return createEmptySaveV2('Player');
  }
}

/**
 * WRITE SUSPENSION — the lock that makes a reset survive its own teardown.
 *
 * The store persists after EVERY mutation (store.ts) and `platform/persistence`
 * flushes on `pagehide`, which is exactly the event a reset's `location.reload()`
 * fires. Without this lock the sequence is: clear the keys → reload → pagehide →
 * flushSave writes the still-live in-memory store straight back into
 * localStorage AND the IndexedDB mirror → the app boots with everything the
 * player just erased. Suspension is deliberately ONE-WAY for the lifetime of the
 * document (`resumeSaveWrites` exists for tests only): once a reset has been
 * committed, nothing this page still holds is worth writing down.
 */
let writesSuspended = false;

export function suspendSaveWrites(): void {
  writesSuspended = true;
}

/** Tests only — a fresh document for each case. */
export function resumeSaveWrites(): void {
  writesSuspended = false;
}

export function saveWritesSuspended(): boolean {
  return writesSuspended;
}

/**
 * The unconditional writer. Used by the reset path to lay down the save it
 * INTENDED (the fresh volume) after suspension has closed the ordinary door.
 */
export function writeSaveNow(save: SaveV2): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (err) {
    // A8: surface QuotaExceededError etc. with a visible degradation (AAA 7.20).
    console.error('Failed to persist save', err);
  }
}

export function persistSave(save: SaveV2): void {
  if (writesSuspended) return;
  writeSaveNow(save);
}

/** Remove every key the manor owns. The factory-reset half of a fresh start. */
export function clearOwnedLocalKeys(): void {
  try {
    for (const key of OWNED_LOCAL_KEYS) localStorage.removeItem(key);
  } catch (err) {
    console.error('Failed to clear the save keys', err);
  }
}

/**
 * A FRESH MYSTERY ON THE SAME HOUSEHOLD (MANOR_DESIGN §9).
 *
 * The player-facing scope of the fresh-start control: roll onto a new volume,
 * end the run, and keep everything §9 says persists forever. It is deliberately
 * the SAME shape as the natural progression — `endDay('volume-solved')`'s
 * nightly resets (manor, gems, keys, ledger, day, pacing valves) composed with
 * the volume machine's own `freshVolumeState`, which is what `advanceVolume`
 * delegates to. Nothing here is a parallel definition of "a new volume"; it is
 * the existing two halves called on demand instead of at a ceremony.
 *
 * KEPT, per §9: character affinity and dialogue-seen · the floorplan cabinet ·
 * chronicles/stats (day records, the v1 archive, parked perks) · keepsakes ·
 * the lifetime event counters the keepsake shelf is derived from · household
 * settings · profile name · bookmarks (gift currency crosses nights, day.ts) ·
 * `seenPuzzleIds` (the house remembers which crosswords you have already done —
 * a genuine volume roll does not forget them either).
 *
 * CLEARED: the volume itself, and every `vol.<nextVolumeId>.*` flag. That last
 * filter is the ghost-marker guard: those flags carry sealed / legible /
 * viewed / glanced / opened-letter / made-out-day / solved state keyed by
 * fragment id, so re-opening a volume the player has closed before would
 * otherwise inherit a journal already marked read and letters already opened.
 * Flags for OTHER volumes survive untouched — a closed volume's archive is
 * meant to stay readable forever.
 */
export function newVolumeSave(save: SaveV2, nextVolumeId: string): SaveV2 {
  const volPrefix = `vol.${nextVolumeId}.`;
  return {
    version: 2,
    profileName: save.profileName,
    // The run is over (day.ts endDay's nightly resets, applied at once).
    day: null,
    manor: null,
    ledger: { budget: 0, entries: [] },
    currencies: { gems: 0, keys: 0, bookmarks: save.currencies.bookmarks },
    volume: freshVolumeState(nextVolumeId, 0),
    journal: {
      seenNodeIds: [...save.journal.seenNodeIds],
      flags: save.journal.flags.filter((f) => !f.startsWith(volPrefix)),
      affinities: { ...save.journal.affinities },
      dailyTalked: [],
      dailyGifted: [],
    },
    // Day-stamped events are run state and go; the lifetime counters are the
    // keepsake shelf's evidence and stay (endDay keeps them too).
    events: { recent: [], counters: { ...save.events.counters } },
    cabinet: { unlockedCardIds: [...save.cabinet.unlockedCardIds] },
    chronicles: { ...save.chronicles, dayRecords: [...save.chronicles.dayRecords] },
    earnedAchievementIds: [...save.earnedAchievementIds],
    seenPuzzleIds: { ...save.seenPuzzleIds },
    settings: { ...save.settings },
  };
}

/** Export/import as a "save code" — also the Safari-tab ↔ installed-app bridge (AAA 7.19). */
export function exportSaveCode(save: SaveV2): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(save))));
}

export function importSaveCode(code: string): SaveV2 | null {
  try {
    return migrate(JSON.parse(decodeURIComponent(escape(atob(code.trim())))));
  } catch {
    return null;
  }
}
