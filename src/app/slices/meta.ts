/**
 * Meta slice — architect-owned shell; A8 extends for Chronicles refresh,
 * settings surface, and platform toggles. Everything here persists forever.
 */

import type { StateCreator } from 'zustand';
import type { DayRecord } from '../../engine/types';
import type { RoomPuzzleKind } from '../../engine/rooms/room-puzzle';
import type { ManorStore } from '../store';
import type { ChroniclesSave, SaveV2, SettingsV2 } from '../save';

export interface MetaSlice {
  profileName: string;
  cabinet: { unlockedCardIds: string[] };
  chronicles: ChroniclesSave;
  earnedAchievementIds: string[];
  seenPuzzleIds: Record<RoomPuzzleKind, string[]>;
  settings: SettingsV2;

  setProfileName(name: string): void;
  /** Floorplan-cabinet meta unlock: appends a card id to the live deck. */
  unlockCard(cardId: string): void;
  markPuzzleSeen(kind: RoomPuzzleKind, puzzleId: string): void;
  appendDayRecord(record: DayRecord): void;
  toggleSound(): void;
  toggleMusic(): void;
  toggleReducedMotion(): void;
}

export const createMetaSlice =
  (initial: SaveV2): StateCreator<ManorStore, [], [], MetaSlice> =>
  (set) => ({
    profileName: initial.profileName,
    cabinet: initial.cabinet,
    chronicles: initial.chronicles,
    earnedAchievementIds: initial.earnedAchievementIds,
    seenPuzzleIds: initial.seenPuzzleIds,
    settings: initial.settings,

    setProfileName: (name) => set({ profileName: name }),
    unlockCard: (cardId) =>
      set((s) => ({
        cabinet: s.cabinet.unlockedCardIds.includes(cardId)
          ? s.cabinet
          : { unlockedCardIds: [...s.cabinet.unlockedCardIds, cardId] },
      })),
    markPuzzleSeen: (kind, puzzleId) =>
      set((s) =>
        s.seenPuzzleIds[kind].includes(puzzleId)
          ? s
          : { seenPuzzleIds: { ...s.seenPuzzleIds, [kind]: [...s.seenPuzzleIds[kind], puzzleId] } },
      ),
    appendDayRecord: (record) =>
      set((s) => ({ chronicles: { ...s.chronicles, dayRecords: [...s.chronicles.dayRecords, record] } })),
    toggleSound: () =>
      set((s) => ({ settings: { ...s.settings, soundEnabled: !s.settings.soundEnabled } })),
    toggleMusic: () =>
      set((s) => ({ settings: { ...s.settings, musicEnabled: !s.settings.musicEnabled } })),
    toggleReducedMotion: () =>
      set((s) => ({ settings: { ...s.settings, reducedMotion: !s.settings.reducedMotion } })),
  });
