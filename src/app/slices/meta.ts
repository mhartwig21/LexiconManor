/**
 * Meta slice — architect-owned shell; A8 extends for Chronicles refresh,
 * settings surface, and platform toggles. Everything here persists forever.
 *
 * THE PERMANENT-PROGRESS EMITTER (AAA 11.17, round-7 defect).
 *
 * Two reward classes the UI advertised were structurally dead:
 *
 *   1. KEEPSAKES. `engine/achievements.checkAchievements` had zero call sites
 *      in src/, `earnedAchievementIds` had no mutator, and ChroniclesPage's
 *      keepsakes total and section could therefore only ever render 0 / empty.
 *   2. FLOORPLAN UNLOCKS. `unlockCard` had zero call sites, and the two
 *      unlockable cards were gated on ids (`posy-quest-1`) nothing produced.
 *
 * Both are fixed the same structural way the moment layer fixed the fragment
 * notice (AAA §0.5 escape 3 / 11.10): the award is driven by a subscription to
 * the AUDITED EVENT SPINE and the persisted flag set, never by a call site
 * inside whichever slice happened to cause it. A checker called from
 * `room.ts`'s solve branch would be one more emitter with one caller — exactly
 * the shape that shipped broken three times. Here, "day end, room solved,
 * volume solved" are not three hooks: they are three counters the one watcher
 * already reads, along with every other channel now and later.
 *
 * Reachability is asserted by `tests/keepsakes.test.ts`, which drives the award
 * path through the real store (11.17: "a test that drives the award path, not
 * the existence of a checker function").
 */

import type { StateCreator } from 'zustand';
import type { DayRecord } from '../../engine/types';
import type { RoomPuzzleKind } from '../../engine/rooms/room-puzzle';
import type { ManorStore } from '../store';
import type { ChroniclesSave, SaveV2, SettingsV2 } from '../save';
import { checkKeepsakes, keepsakeFacts, pruneUnknownKeepsakeIds } from '../../engine/achievements';
import { cardsUnlockedByFlags } from '../../engine/manor/deck';

export interface MetaSlice {
  profileName: string;
  cabinet: { unlockedCardIds: string[] };
  chronicles: ChroniclesSave;
  /** Earned keepsake ids (engine/achievements.KEEPSAKES). Persist forever. */
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
  /** AAA 7.16: "Play through the ring switch" (audioSession policy toggle). */
  toggleMuteSwitchBypass(): void;

  /**
   * THE MUTATOR (A8 additive). Evaluate the keepsake catalog against the
   * persisted facts and bank anything newly deserved; also fill any cabinet
   * plate whose story flag has been set. Idempotent and pure-input: safe to
   * call on every mutation, a no-op once the shelf has caught up.
   *
   * Called automatically by the spine watcher below — exposed because a
   * lifecycle that wants to force the check (and the test that drives the
   * award path) should not have to fake a store notification.
   */
  syncEarnedRewards(): void;
}

export const createMetaSlice =
  (initial: SaveV2): StateCreator<ManorStore, [], [], MetaSlice> =>
  (set, get, api) => {
    /**
     * Re-entrancy guard: `syncEarnedRewards` writes through `set`, which
     * notifies subscribers — including the watcher that called it. The guard
     * makes the second pass a no-op rather than relying on the (true, but
     * fragile) fact that the checker converges after one round.
     */
    let syncing = false;

    const syncEarnedRewards = () => {
      if (syncing) return;
      syncing = true;
      try {
        const s = get();

        const facts = keepsakeFacts({
          counters: s.counters,
          dayRecords: s.chronicles.dayRecords,
          flags: s.flags,
        });
        const won = checkKeepsakes(s.earnedAchievementIds, facts);
        if (won.length > 0) {
          set({ earnedAchievementIds: [...s.earnedAchievementIds, ...won.map((k) => k.id)] });
        }

        // The cabinet's silhouetted plates, filled by the flag that names them.
        const held = new Set(get().cabinet.unlockedCardIds);
        const due = cardsUnlockedByFlags(s.flags).filter((id) => !held.has(id));
        for (const cardId of due) get().unlockCard(cardId);
      } finally {
        syncing = false;
      }
    };

    /**
     * The watcher. Cheap identity gate first: the store notifies on every
     * mutation (including per-keystroke room state) and re-deriving the facts
     * on each of them would allocate for nothing (AAA 9.4). Only three
     * references can move a keepsake or a plate:
     *
     *   - `counters`      — the spine's lifetime tallies: room solved, volume
     *                       solved, fragment filed, letter opened, notable
     *                       moment, rank-up, the cat greeted.
     *   - `dayRecords`    — appended by `endDay` (day end, the climb's high
     *                       row, the day's best room count).
     *   - `flags`         — Posy's favor and her deputy sash.
     *
     * The same three carry through a reload, so nothing here depends on being
     * mounted, on a screen, or on the player standing anywhere in particular.
     */
    let seen = {
      counters: initial.events.counters as unknown,
      records: initial.chronicles.dayRecords as unknown,
      flags: initial.journal.flags as unknown,
    };
    api.subscribe((s) => {
      const now = {
        counters: s.counters as unknown,
        records: s.chronicles.dayRecords as unknown,
        flags: s.flags as unknown,
      };
      if (
        now.counters === seen.counters && now.records === seen.records && now.flags === seen.flags
      ) return;
      seen = now;
      syncEarnedRewards();
    });

    return {
      profileName: initial.profileName,
      cabinet: initial.cabinet,
      chronicles: initial.chronicles,
      // Legacy v1 achievement ids ('five-nodes', 'boss-slayer', …) carried in
      // by the v1→v2 migration have no def in the manor catalog and would
      // inflate the "N of 12" count (AAA 11.21). migrations.ts prunes on load;
      // this is the belt for a save hydrated by any other path.
      earnedAchievementIds: pruneUnknownKeepsakeIds(initial.earnedAchievementIds),
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
      toggleMuteSwitchBypass: () =>
        set((s) => ({ settings: { ...s.settings, muteSwitchBypass: !s.settings.muteSwitchBypass } })),

      syncEarnedRewards,
    };
  };
