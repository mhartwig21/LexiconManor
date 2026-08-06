/**
 * Dialogue slice — OWNER: A6 (Dialogue). Interface frozen by the architect;
 * A6 implements against engine/dialogue/{schema,select,conditions}.ts and the
 * authored JSON in content/authored/dialogue/.
 *
 * Flag names follow docs/flags.md (frozen). Selection is a pure function of
 * the DialogueQuery snapshot (engine/events.ts) — Hades rules: forced >
 * event-react > arc > general > idle; stale content never invalidated.
 */

import type { StateCreator } from 'zustand';
import type { CharacterId } from '../../engine/types';
import type { DialogueQuery, DialogueTrigger } from '../../engine/events';
import type { ManorStore } from '../store';
import type { SaveV2 } from '../save';

export interface DialogueSlice {
  seenNodeIds: string[];
  flags: string[];
  affinities: Record<CharacterId, number>;
  talkedToday: CharacterId[];
  giftedToday: CharacterId[];

  /** Snapshot the store into the frozen DialogueQuery shape for the selector. */
  buildDialogueQuery(character: CharacterId, slot: DialogueTrigger): DialogueQuery;
  /** Record a node seen (skip included — skipping records seen + applies effects). */
  markNodeSeen(nodeId: string, character: CharacterId): void;
  /** Write-once flag set, validated against docs/flags.md naming. */
  setFlag(flag: string): void;
  adjustAffinity(character: CharacterId, delta: number): void;
  /** Bookmark gift: one per character per day; emits 'gift-given'. */
  giveGift(character: CharacterId): void;
}

export const createDialogueSlice =
  (initial: SaveV2): StateCreator<ManorStore, [], [], DialogueSlice> =>
  (set, get) => ({
    seenNodeIds: initial.journal.seenNodeIds,
    flags: initial.journal.flags,
    affinities: initial.journal.affinities,
    talkedToday: initial.journal.dailyTalked,
    giftedToday: initial.journal.dailyGifted,

    buildDialogueQuery: (character, slot) => {
      const s = get();
      return {
        day: s.day?.day ?? s.volume.day,
        slot,
        character,
        seen: new Set(s.seenNodeIds),
        flags: new Set(s.flags),
        affinities: s.affinities,
        counters: s.counters,
        recentEvents: s.recentEvents,
        talkedToday: new Set(s.talkedToday),
        giftedToday: new Set(s.giftedToday),
        volumeId: s.volume.volumeId,
        fragmentsFound: s.volume.foundFragmentIds.length,
      };
    },
    markNodeSeen: (nodeId, character) => {
      set((s) => ({
        seenNodeIds: s.seenNodeIds.includes(nodeId) ? s.seenNodeIds : [...s.seenNodeIds, nodeId],
      }));
      get().recordEvent({ type: 'dialogue-seen', nodeId, character });
      // TODO(A6): substantive-vs-idle valve bookkeeping (talkedToday), journal summary line.
    },
    setFlag: (flag) => {
      set((s) => ({ flags: s.flags.includes(flag) ? s.flags : [...s.flags, flag] }));
    },
    adjustAffinity: (_character, _delta) => {
      // TODO(A6): rank thresholds → 'affinity-rank-up' event + bespoke scene flag.
    },
    giveGift: (_character) => {
      // TODO(A6): one per character per day; 'gift-given' event; keepsake on first gift.
    },
  });
