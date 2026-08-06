/**
 * Dialogue slice — OWNER: A6 (Dialogue). Interface frozen by the architect;
 * A6 implements against engine/dialogue/{schema,select,conditions}.ts and the
 * authored JSON in content/authored/dialogue/.
 *
 * Flag names follow docs/flags.md (frozen). Selection is a pure function of
 * the DialogueQuery snapshot (engine/events.ts) — Hades rules: forced >
 * event-react > arc > general > idle; stale content never invalidated.
 *
 * A6 ADDITIVE MEMBER (consumed only by ui/dialogue/*): `applyDialogueEffects`
 * — applies a node/choice effects block atomically (affinity deltas, flag
 * sets, Ellery's fragment interpretation with 'next' resolution). Skipping a
 * conversation applies effects too (AAA 5.10), so the UI needs exactly one
 * entry point.
 */

import type { StateCreator } from 'zustand';
import type { CharacterId } from '../../engine/types';
import type { DialogueQuery, DialogueTrigger } from '../../engine/events';
import type { DialogueEffects } from '../../engine/dialogue/schema';
import { isSubstantive } from '../../engine/dialogue/schema';
import { getDialogueFile } from '../../engine/dialogue/content';
import { findNode } from '../../engine/dialogue/select';
import { rankFor } from '../../engine/dialogue/affinity';
import { FLAG_REGEX } from '../../engine/dialogue/validate';
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

  /** A6 additive (ui/dialogue only): apply a node/choice effects block. */
  applyDialogueEffects(effects: DialogueEffects | undefined): void;
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
      const node = findNode(getDialogueFile(character), nodeId);
      set((s) => ({
        seenNodeIds: s.seenNodeIds.includes(nodeId) ? s.seenNodeIds : [...s.seenNodeIds, nodeId],
        // Pacing valve (AAA 5.9): a substantive (non-idle) top-level node
        // spends the one-conversation-per-character-per-day slot. chainOnly
        // continuations belong to the same conversation; idle lines are free.
        talkedToday:
          node && isSubstantive(node) && !node.chainOnly && !s.talkedToday.includes(character)
            ? [...s.talkedToday, character]
            : s.talkedToday,
      }));
      get().recordEvent({ type: 'dialogue-seen', nodeId, character });
      // Journal side (AAA 5.10): the one-line `summary` is derivable from
      // seenNodeIds + authored JSON — A7's journal reads it, nothing stored.
    },

    setFlag: (flag) => {
      if (!FLAG_REGEX.test(flag)) {
        console.warn(`setFlag rejected (docs/flags.md grammar): "${flag}"`);
        return;
      }
      set((s) => ({ flags: s.flags.includes(flag) ? s.flags : [...s.flags, flag] }));
    },

    adjustAffinity: (character, delta) => {
      if (delta === 0) return;
      const before = get().affinities[character] ?? 0;
      const after = Math.max(0, before + delta);
      if (after === before) return;
      set((s) => ({ affinities: { ...s.affinities, [character]: after } }));
      const rank = rankFor(after);
      if (rank > rankFor(before)) {
        // Bespoke rank-up scenes are authored nodes conditioned on the new
        // affinity band (AAA 5.7) — the event is for reactions elsewhere.
        get().recordEvent({ type: 'affinity-rank-up', character, rank });
      }
    },

    giveGift: (character) => {
      if (character === 'dewey') return; // gifts are for people (and paintings)
      if (get().giftedToday.includes(character)) return; // valve (AAA 5.9)
      // Bookmarks are a scarce, sourced currency (AAA 5.7): when the shared
      // Currencies shape carries `bookmarks` (architect request pending in
      // the A6 report), a gift consumes one and cannot be given at zero.
      // Until the field lands, gifting stays ungated rather than falsely
      // locked — the UI gate in DialogueScene mirrors this exactly.
      const bookmarks = (get().currencies as { bookmarks?: number }).bookmarks;
      if (bookmarks !== undefined) {
        if (bookmarks <= 0) return;
        set((s) => ({
          currencies: { ...s.currencies, bookmarks: bookmarks - 1 } as typeof s.currencies,
        }));
      }
      set((s) => ({ giftedToday: [...s.giftedToday, character] }));
      // First gift → sys flag the bespoke keepsake scene keys off (AAA 5.7).
      get().setFlag(`sys.first-gift.${character}`);
      get().adjustAffinity(character, 1);
      get().recordEvent({ type: 'gift-given', character });
    },

    applyDialogueEffects: (effects) => {
      if (!effects) return;
      for (const [who, delta] of Object.entries(effects.affinity ?? {})) {
        get().adjustAffinity(who as CharacterId, delta ?? 0);
      }
      for (const flag of effects.setFlags ?? []) get().setFlag(flag);
      if (effects.interpretFragment) {
        const v = get().volume;
        const id =
          effects.interpretFragment === 'next'
            ? v.foundFragmentIds.find((f) => !v.interpretedFragmentIds.includes(f))
            : effects.interpretFragment;
        if (id) get().interpretFragment(id);
      }
    },
  });
