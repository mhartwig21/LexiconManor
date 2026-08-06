/**
 * Journal/mystery slice — OWNER: A7 (Mystery). Interface frozen by the
 * architect; A7 implements against engine/{journal,volume}.ts and
 * content/authored/volumes/*.
 *
 * The journal itself is pure derivation (engine/journal.ts) over
 * volume.foundFragmentIds — this slice owns the VolumeState machine.
 *
 * Persistence notes (no save-schema changes needed):
 *   - opened letters are write-once `vol.<id>.opened-<letterId>` flags
 *     (docs/flags.md `vol.*` pattern — set only by this machine)
 *   - letter *arrival* is pure derivation (engine/volume.ts arrivedLetters)
 *     over day number, fragments found, and the chronicles' drought record
 */

import type { StateCreator } from 'zustand';
import type { RoomCategory, VolumeState } from '../../engine/types';
import type { ManorStore } from '../store';
import type { SaveV2 } from '../save';
import {
  advanceVolume, applyGuess, letterGrants, nextFragmentForRoom, normalizeGuess,
  openedLetterFlag, solvedFlag,
} from '../../engine/volume';
import { nextUninterpreted } from '../../engine/journal';
import { getVolumeContent, nextVolumeContent } from '../content/volumes';

export interface JournalSlice {
  volume: VolumeState;

  /** File a fragment forever; auto-groups + cross-refs are derived. */
  fileFragment(fragmentId: string): void;
  /** Ellery's affinity service. Accepts a fragment id or 'next' (the first
   *  found-but-uninterpreted fragment) — DialogueEffects.interpretFragment. */
  interpretFragment(fragmentId: string): void;
  /**
   * The daily Sanctum guess: normalize, check accepted[]. Wrong → sympathetic
   * 'sanctum-guess-wrong' with closeness metadata; right → 'volume-solved' →
   * night sequence → advanceVolume. One guess per day, never a penalty.
   */
  guessAtSanctum(guess: string): void;
  /** Overnight letters from Posy: micro-puzzles + side-quest chains. */
  openLetter(letterId: string): void;

  /**
   * A7 ADDITIVE (consumed by A1's mystery-room flow; also my pity channel):
   * file the next fragment on the volume's deterministic drip for a room
   * category (prefers matching sourceRoomCategory, falls back to the lowest
   * unfound revealOrder — AAA 4.14). Returns the filed fragment id for the
   * "found a fragment" moment, or null when the volume is fully filed.
   */
  collectFragmentForRoom(category: RoomCategory): string | null;
  /**
   * A7 ADDITIVE (consumed by the Sanctum epilogue, after the ceremony):
   * roll the manor onto the next authored volume, if one exists. The closed
   * volume's journal stays readable forever (archived by volumeId).
   */
  beginNextVolume(): void;
}

export const createJournalSlice =
  (initial: SaveV2): StateCreator<ManorStore, [], [], JournalSlice> =>
  (set, get) => ({
    volume: initial.volume,

    fileFragment: (fragmentId) => {
      const v = get().volume;
      if (v.foundFragmentIds.includes(fragmentId)) return;
      // Only file fragments the current volume actually defines — a stale id
      // (e.g. from an old letter after a volume roll) must never corrupt state.
      const content = getVolumeContent(v.volumeId);
      if (content && !content.fragments.some((f) => f.id === fragmentId)) return;
      set({ volume: { ...v, foundFragmentIds: [...v.foundFragmentIds, fragmentId] } });
      get().recordEvent({ type: 'fragment-found', fragmentId });
      // Pity bookkeeping (AAA 4.14) is pure derivation: the drought counter
      // reads the chronicles' DayRecords (engine/volume.fragmentDroughtDays).
    },

    interpretFragment: (fragmentId) => {
      const v = get().volume;
      const content = getVolumeContent(v.volumeId);
      if (!content) return;
      const id = fragmentId === 'next' ? nextUninterpreted(content, v) : fragmentId;
      if (!id) return;
      if (!v.foundFragmentIds.includes(id) || v.interpretedFragmentIds.includes(id)) return;
      if (!content.fragments.some((f) => f.id === id)) return;
      set({ volume: { ...v, interpretedFragmentIds: [...v.interpretedFragmentIds, id] } });
      get().recordEvent({ type: 'fragment-interpreted', fragmentId: id });
    },

    guessAtSanctum: (guess) => {
      const v = get().volume;
      const content = getVolumeContent(v.volumeId);
      if (!content) return;
      const day = get().day?.day ?? v.day;
      const { state, result } = applyGuess(content, v, guess, day);
      if (result.kind === 'gate' || result.kind === 'empty') return;
      set({ volume: state });
      if (result.kind === 'wrong') {
        // Consumes only the daily guess; journaled so she can see her own
        // elimination history; the Portrait's sigh keys off closeness (4.17).
        get().recordEvent({
          type: 'sanctum-guess-wrong',
          guess: result.guess,
          closeness: result.closeness,
        });
      } else {
        get().setFlag(solvedFlag(content.id));
        get().recordEvent({ type: 'volume-solved', volumeId: content.id });
        // The night sequence (Sanctum epilogue → endDay('volume-solved') →
        // beginNextVolume) is driven by the Sanctum UI so the ceremony plays
        // before anything rolls over.
      }
    },

    openLetter: (letterId) => {
      const v = get().volume;
      const content = getVolumeContent(v.volumeId);
      if (!content) return;
      const letter = content.letters.find((l) => l.id === letterId);
      if (!letter) return;
      const flag = openedLetterFlag(v.volumeId, letterId);
      if (get().flags.includes(flag)) return; // already opened (write-once)
      // Resolve grants BEFORE filing (a pity letter grants the next unfound).
      const grants = letterGrants(content, letter, v);
      get().setFlag(flag);
      for (const fid of grants) get().fileFragment(fid);
      get().recordEvent({ type: 'letter-opened', letterId });
    },

    collectFragmentForRoom: (category) => {
      const v = get().volume;
      const content = getVolumeContent(v.volumeId);
      if (!content) return null;
      const frag = nextFragmentForRoom(content, v, category);
      if (!frag) return null;
      get().fileFragment(frag.id);
      return frag.id;
    },

    beginNextVolume: () => {
      const v = get().volume;
      if (v.status !== 'solved') return;
      const next = nextVolumeContent(v.volumeId);
      if (!next) return; // no further volume authored yet — archive stands
      const day = get().day?.day ?? v.day;
      set({ volume: advanceVolume(next, day) });
    },
  });

/** Convenience re-export for UI callers (keeps imports on the slice seam). */
export { normalizeGuess };
