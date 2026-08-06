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
import { migrate } from './migrations';

export const SAVE_KEY = 'lexicon-loop-save-v2';
export const V1_BACKUP_KEY = 'lexicon-loop-save-v1-backup';

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
  manor: ManorState | null;                       // resets nightly
  ledger: StepLedger;
  currencies: Currencies;
  volume: VolumeState;
  journal: JournalSave;
  events: EventsSave;
  cabinet: { unlockedCardIds: string[] };
  chronicles: ChroniclesSave;
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
    currencies: { gems: 0, keys: 0 },
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
      flags: [],
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

export function persistSave(save: SaveV2): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (err) {
    // A8: surface QuotaExceededError etc. with a visible degradation (AAA 7.20).
    console.error('Failed to persist save', err);
  }
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
