/**
 * The single client-side store — ARCHITECT-OWNED SHELL, FROZEN.
 *
 * Slice composition ONLY (ARCHITECTURE §11.1). Agents implement exactly their
 * own slice file in app/slices/; nobody edits this shell or another agent's
 * slice. The store hydrates from the migrated save once at startup and
 * persists a SaveV2 projection after every mutation (A8 layers flush points
 * and the IndexedDB mirror in app/platform/persistence.ts).
 */

import { create } from 'zustand';
import { loadSave, persistSave, type SaveV2 } from './save';
import { createDaySlice, type DaySlice } from './slices/day';
import { createManorSlice, type ManorSlice } from './slices/manor';
import { createRoomSlice, type RoomSlice } from './slices/room';
import { createDialogueSlice, type DialogueSlice } from './slices/dialogue';
import { createJournalSlice, type JournalSlice } from './slices/journal';
import { createMetaSlice, type MetaSlice } from './slices/meta';

export type ManorStore = DaySlice & ManorSlice & RoomSlice & DialogueSlice & JournalSlice & MetaSlice;

const initial = loadSave();

export const useManorStore = create<ManorStore>()((...a) => ({
  ...createDaySlice(initial)(...a),
  ...createManorSlice(initial)(...a),
  ...createRoomSlice(initial)(...a),
  ...createDialogueSlice(initial)(...a),
  ...createJournalSlice(initial)(...a),
  ...createMetaSlice(initial)(...a),
}));

/** Project the live store back into the persisted SaveV2 shape. */
export function selectSave(s: ManorStore): SaveV2 {
  return {
    version: 2,
    profileName: s.profileName,
    day: s.day,
    manor: s.manor,
    ledger: s.ledger,
    currencies: s.currencies,
    volume: s.volume,
    journal: {
      seenNodeIds: s.seenNodeIds,
      flags: s.flags,
      affinities: s.affinities,
      dailyTalked: s.talkedToday,
      dailyGifted: s.giftedToday,
    },
    events: { recent: s.recentEvents, counters: s.counters },
    cabinet: s.cabinet,
    chronicles: s.chronicles,
    earnedAchievementIds: s.earnedAchievementIds,
    seenPuzzleIds: s.seenPuzzleIds,
    openLedger: s.openLedger,
    settings: s.settings,
  };
}

// Persist on every state mutation (AAA 7.17). Zustand notifies after each set().
useManorStore.subscribe((state) => persistSave(selectSave(state)));
