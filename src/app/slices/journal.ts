/**
 * Journal/mystery slice — OWNER: A7 (Mystery). Interface frozen by the
 * architect; A7 implements against engine/{journal,volume}.ts and
 * content/authored/volumes/*.
 *
 * The journal itself is pure derivation (engine/journal.ts) over
 * volume.foundFragmentIds — this slice owns the VolumeState machine.
 */

import type { StateCreator } from 'zustand';
import type { VolumeState } from '../../engine/types';
import type { ManorStore } from '../store';
import type { SaveV2 } from '../save';

export interface JournalSlice {
  volume: VolumeState;

  /** File a fragment forever; auto-groups + cross-refs are derived. */
  fileFragment(fragmentId: string): void;
  /** Ellery's affinity service. */
  interpretFragment(fragmentId: string): void;
  /**
   * The daily Sanctum guess: normalize, check accepted[]. Wrong → sympathetic
   * 'sanctum-guess-wrong' with closeness metadata; right → 'volume-solved' →
   * night sequence → advanceVolume. One guess per day, never a penalty.
   */
  guessAtSanctum(guess: string): void;
  /** Overnight letters from Posy: micro-puzzles + side-quest chains. */
  openLetter(letterId: string): void;
}

export const createJournalSlice =
  (initial: SaveV2): StateCreator<ManorStore, [], [], JournalSlice> =>
  (set, get) => ({
    volume: initial.volume,

    fileFragment: (fragmentId) => {
      const v = get().volume;
      if (v.foundFragmentIds.includes(fragmentId)) return;
      set({ volume: { ...v, foundFragmentIds: [...v.foundFragmentIds, fragmentId] } });
      get().recordEvent({ type: 'fragment-found', fragmentId });
      // TODO(A7): pity-timer bookkeeping (AAA 4.14).
    },
    interpretFragment: (_fragmentId) => {
      // TODO(A7): Ellery service — gated by affinity rank.
    },
    guessAtSanctum: (_guess) => {
      // TODO(A7): engine/volume.ts guess flow + closeness metadata (AAA 4.17).
    },
    openLetter: (_letterId) => {
      // TODO(A7): letters state + 'letter-opened' event.
    },
  });
