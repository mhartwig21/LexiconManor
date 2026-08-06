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
import type { RoomPuzzleKind } from '../../engine/rooms/room-puzzle';
import type { ManorStore } from '../store';
import type { SaveV2 } from '../save';
import {
  advanceVolume, applyGuess, findLetter, fragmentForSolveChannel, letterGrants,
  nextFragmentForRoom, normalizeGuess, openedLetterFlag, reservedTestimonyIds,
  solveChannelFiledToday, solveChannelFor, solvedFlag,
} from '../../engine/volume';
import { nextUninterpreted, viewedFragmentFlag } from '../../engine/journal';
import { atSanctumDoor } from '../../engine/manor/grid';
import { DIALOGUE_FILES } from '../../engine/dialogue/content';
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
   * Record that these fragments have actually been DISPLAYED to the player —
   * the only thing that retires an unread marker (AAA 11.20). Write-once
   * `vol.<id>.viewed-<fragmentId>` flags, the same shape as the letters'
   * opened flags, so the state survives the day roll and a force-quit.
   *
   * Called by the journal sheet with `displayedFragmentIds(tab)` — never by a
   * navigation or focus edge. Ids that are not filed yet are ignored, and the
   * whole call is a no-op once everything passed is already viewed (so the
   * sheet may call it on every render without churning the save).
   */
  markFragmentsViewed(fragmentIds: readonly string[]): void;

  /**
   * A7 ADDITIVE (consumed by A1's mystery-room flow; also my pity channel):
   * file the next fragment on the volume's deterministic drip for a room
   * category (prefers matching sourceRoomCategory, falls back to the lowest
   * unfound revealOrder — AAA 4.14). Returns the filed fragment id for the
   * "found a fragment" moment, or null when the volume is fully filed.
   */
  collectFragmentForRoom(category: RoomCategory): string | null;
  /**
   * A7 ADDITIVE — THE SOLVE CHANNEL (AAA 4.14 / 11.17, MANOR_DESIGN §6).
   *
   * The word games' payment into the mystery: a solved puzzle room hands over
   * the lowest unfound fragment on its channel (the Study a definition line,
   * every other puzzle room a lintel engraving — engine/volume.solveChannelFor),
   * once per day per channel. Returns the filed id, or null when the channel is
   * empty, valved, or the room paid nothing.
   *
   * Exposed rather than private because AAA 11.17 wants "a test that drives
   * the award path", and because a lifecycle that wants to force the check
   * should not have to fake a store notification (the meta slice's precedent).
   * In normal play NOTHING calls it by hand: the spine watcher below does.
   */
  collectFragmentForSolve(kind: RoomPuzzleKind): string | null;
  /**
   * A7 ADDITIVE (consumed by the Sanctum epilogue, after the ceremony):
   * roll the manor onto the next authored volume, if one exists. The closed
   * volume's journal stays readable forever (archived by volumeId).
   */
  beginNextVolume(): void;
}

export const createJournalSlice =
  (initial: SaveV2): StateCreator<ManorStore, [], [], JournalSlice> =>
  (set, get, api) => {
    /**
     * THE SOLVE-CHANNEL WATCHER (round-8 defect, AAA 11.17 / 4.14).
     *
     * `collectFragmentForRoom` shipped with exactly one caller and
     * `RoomEvent.reward.fragmentId` with none, so violet rooms were the whole
     * of the room→mystery wiring and two authored `sourceRoomCategory:
     * "puzzle"` fragments could never arrive by the route their label names.
     *
     * The award is driven off the AUDITED EVENT SPINE, exactly like the meta
     * slice's keepsake/cabinet watcher and for the same reason recorded there:
     * a checker called from `room.ts`'s solve branch would be one more emitter
     * with one caller — the shape that has now shipped broken three times —
     * and it would also mean this slice reaching into another agent's file.
     * `room-solved` is a counter the watcher already has to read; new solve
     * paths (a future room kind, a scripted solve, a test) pay the mystery
     * automatically, because they all land on the same stream.
     *
     * Cheap identity gate first: the store notifies on every mutation,
     * including per-keystroke room state (AAA 9.4).
     */
    let seenSolves = initial.events.counters['room-solved'] ?? 0;
    api.subscribe((s) => {
      const solves = s.counters['room-solved'] ?? 0;
      if (solves === seenSolves) return;
      seenSolves = solves;
      // The solve must be the thing that JUST landed — the newest entry on the
      // stream, not merely the newest solve in it. A bulk state replacement
      // (an imported save hydrated into a live store, a fixture swap) moves the
      // counter without anything having happened, and this channel files a
      // permanent fragment, so it must not fire on one. (Re-entrancy is closed
      // by the gate above: filing does not move the 'room-solved' counter.)
      const last = s.recentEvents[s.recentEvents.length - 1];
      if (last?.event.type !== 'room-solved') return;
      get().collectFragmentForSolve(last.event.kind);
    });

    return {
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
      // ── THE SECOND GATE (AAA 4.10e, MANOR_DESIGN §7 — round-7 blocker). ──
      // Winning takes BOTH: knowing the word AND standing at the door that
      // day. The door was gated on neither — the journal's "Take it to the
      // Sanctum" button navigated here from anywhere, in any phase, for zero
      // steps, so a fresh save could solve Volume 1 on day 1 at the Entrance
      // Hall with 21 untouched steps. The climb is the other half of the game;
      // it is enforced here, on the model, so a UI regression cannot reopen
      // it. (Reading /sanctum stays free: the Portrait, the elimination list
      // and the nudge are journal-class information, AAA 4.15/4.16.)
      if (!atSanctumDoor(get().manor)) return;
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
      // findLetter also resolves house-written pity letters ('pity-extra-N'),
      // which exist only as derivation, never in the authored letters array.
      const letter = findLetter(content, letterId);
      if (!letter) return;
      const flag = openedLetterFlag(v.volumeId, letterId);
      if (get().flags.includes(flag)) return; // already opened (write-once)
      // Resolve grants BEFORE filing (a pity letter grants the next unfound).
      const grants = letterGrants(content, letter, v);
      get().setFlag(flag);
      for (const fid of grants) get().fileFragment(fid);
      // Posy tucks a bookmark into every letter — the renewable gift-currency
      // source (AAA 5.7; empty-pocket copy in DialogueScene names letters).
      set((s) => ({
        currencies: { ...s.currencies, bookmarks: s.currencies.bookmarks + 1 },
      }));
      get().recordEvent({ type: 'letter-opened', letterId });
    },

    markFragmentsViewed: (fragmentIds) => {
      const v = get().volume;
      const have = new Set(get().flags);
      for (const id of fragmentIds) {
        // Only what the volume has actually filed can be "seen": a stale id
        // must never mint a flag that outlives its fragment.
        if (!v.foundFragmentIds.includes(id)) continue;
        const flag = viewedFragmentFlag(v.volumeId, id);
        if (have.has(flag)) continue;
        have.add(flag);
        get().setFlag(flag); // write-once, validated against docs/flags.md
      }
    },

    collectFragmentForRoom: (category) => {
      const v = get().volume;
      const content = getVolumeContent(v.volumeId);
      if (!content) return null;
      // Testimony promised by a still-unseen character scene steps aside from
      // the room drip so the character actually gets to say it (AAA 4.14) —
      // nextFragmentForRoom ignores the reservation rather than strand a
      // fragment, and the pity/letter channel never skips.
      const reservedIds = reservedTestimonyIds(
        Object.values(DIALOGUE_FILES),
        new Set(get().seenNodeIds),
      );
      const frag = nextFragmentForRoom(content, v, category, { reservedIds });
      if (!frag) return null;
      get().fileFragment(frag.id);
      return frag.id;
    },

    collectFragmentForSolve: (kind) => {
      const v = get().volume;
      if (v.status !== 'active') return null;
      const content = getVolumeContent(v.volumeId);
      if (!content) return null;
      const channel = solveChannelFor(kind);
      const day = get().day?.day ?? v.day;
      // One fragment per day per channel, derived off the spine (never a
      // stored counter a reload could hand back) — engine/volume.
      if (solveChannelFiledToday(content, channel, get().recentEvents, day)) return null;
      const reservedIds = reservedTestimonyIds(
        Object.values(DIALOGUE_FILES),
        new Set(get().seenNodeIds),
      );
      const frag = fragmentForSolveChannel(content, v, channel, { reservedIds });
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
    };
  };

/** Convenience re-export for UI callers (keeps imports on the slice seam). */
export { normalizeGuess };
