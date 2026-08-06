/**
 * Manor slice — OWNER: A1 (Manor). Interface frozen by the architect;
 * A1 implements against engine/manor/{grid,deck,drafting}.ts.
 *
 * Owns the grid, the player token, currencies, and the draft flow.
 * Draft rng streams are per-cell (createRng(hash(daySeed, cellKey, drawIndex)))
 * so a reroll at door A never perturbs door B (AAA 4.8).
 */

import type { StateCreator } from 'zustand';
import type { Cell, Currencies, Dir, DraftOffer, ManorState } from '../../engine/types';
import type { ManorStore } from '../store';
import type { SaveV2 } from '../save';

export interface ManorSlice {
  manor: ManorState | null;
  currencies: Currencies;
  draftOffer: DraftOffer | null;

  /** Move one cell through a connecting door: −1 step via the ledger. */
  moveTo(cell: Cell): void;
  /** Standing at a door into an empty in-bounds cell → roll a 3-card offer. */
  openDraft(atDoor: Dir): void;
  /** Place the card behind the door and step in. */
  chooseDraftCard(cardId: string): void;
  /** 1 gem, once per draft. */
  rerollDraft(): void;
  /** Back out for only the step already spent (AAA 4.6). */
  cancelDraft(): void;
  /** −1 step, worth it. Reveals whether this row hides a violet room. */
  petDewey(): void;
  spendGems(amount: number): boolean;
  spendKeys(amount: number): boolean;
}

export const createManorSlice =
  (initial: SaveV2): StateCreator<ManorStore, [], [], ManorSlice> =>
  (set, get) => ({
    manor: initial.manor,
    currencies: initial.currencies,
    draftOffer: null,

    moveTo: (_cell) => {
      // TODO(A1): legality via engine/manor/grid.ts; step cost via applyStepEntry.
    },
    openDraft: (_atDoor) => {
      // TODO(A1): engine/manor/drafting.ts — affordability-aware, row-banded,
      // anti-repeat, never-unplaceable (AAA 4.1–4.5).
    },
    chooseDraftCard: (_cardId) => {
      // TODO(A1): place room, pin puzzleId, emit 'room-drafted', enter room.
    },
    rerollDraft: () => {
      // TODO(A1): 1 gem, once per draft, per-cell rng stream.
    },
    cancelDraft: () => set({ draftOffer: null }),
    petDewey: () => {
      // TODO(A1): −1 step, 'dewey-petted' event, violet-row hint.
    },
    spendGems: (amount) => {
      const { gems } = get().currencies;
      if (gems < amount) return false;
      set((s) => ({ currencies: { ...s.currencies, gems: s.currencies.gems - amount } }));
      return true;
    },
    spendKeys: (amount) => {
      const { keys } = get().currencies;
      if (keys < amount) return false;
      set((s) => ({ currencies: { ...s.currencies, keys: s.currencies.keys - amount } }));
      return true;
    },
  });
