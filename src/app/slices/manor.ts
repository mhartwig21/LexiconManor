/**
 * Manor slice — OWNER: A1 (Manor). Interface frozen by the architect;
 * A1 implements against engine/manor/{grid,deck,drafting}.ts.
 *
 * Owns the grid, the player token, currencies, and the draft flow.
 * Draft rng streams are per-cell (createRng(hash(daySeed, cellKey, drawIndex)))
 * so a reroll at door A never perturbs door B (AAA 4.8).
 *
 * PADLOCKS (the arc the shipped game was missing — the simulated economy has
 * always been gated on rows 4–6, the live one was not, which is precisely the
 * owner's "way too easy, I reached the Forgotten Word on day one"): draft
 * doors into the upper storeys can be locked (engine/manor/locks.ts, rates in
 * engine/economy/steps.ts `DOOR_LOCKS`). Locked-door contract, end to end:
 *   - the padlock is DRAWN before she walks to it (BlueprintSheet);
 *   - no key → the door will not open and NO step is charged (AAA 4.6);
 *   - a key → the draft opens for the usual step, and the key is spent on
 *     placement, so cancelling still costs only that step.
 *
 * Session bookkeeping (per-cell draw indices, the offered-and-declined set,
 * AAA 4.3/4.8) lives at module scope, deliberately NOT persisted: losing the
 * anti-repeat memory to a tab close is cosmetic; the save shape stays frozen.
 */

import type { StateCreator } from 'zustand';
import type { Cell, Currencies, Dir, DraftOffer, ManorState, PlacedRoom } from '../../engine/types';
import type { ManorStore } from '../store';
import type { SaveV2 } from '../save';
import {
  canMoveTo, cellKey, createManor, deweyCell, draftTargets, hashSeed, neighbor,
  resolveDoors, roomAt, roomSeed, rowTier, sameCell,
} from '../../engine/manor/grid';
import { carryOverFrom, deckFor, UTILITY_EFFECTS } from '../../engine/manor/deck';
import { deweyProphecy, rollOffer } from '../../engine/manor/drafting';
import { isDoorLocked, KEY_COST } from '../../engine/manor/locks';
import {
  climbKey, fernMorningKeys, keyAccessFor, moveAt, STEP_TABLE,
} from '../../engine/economy/steps';
import { getRoomAdapter } from '../../engine/rooms/registry';
import { createRng } from '../../engine/rng';

export interface ManorSlice {
  manor: ManorState | null;
  currencies: Currencies;
  draftOffer: DraftOffer | null;

  /** Move one cell through a connecting door: −1 step via the ledger. */
  moveTo(cell: Cell): void;
  /**
   * Standing at a door into an empty in-bounds cell → roll a 3-card offer.
   * A padlocked door (rows 4–6, `engine/manor/locks.ts`) needs a key: without
   * one the offer does not open AND NO STEP IS CHARGED (AAA 4.6).
   */
  openDraft(atDoor: Dir): void;
  /** Place the card behind the door and step in (spends the key, if locked). */
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

// ---------------------------------------------------------------------------
// Session bookkeeping (module scope — see header)
// ---------------------------------------------------------------------------

interface DraftSession {
  daySeed: number;
  /** Per-cell draw index; a reroll advances only that cell's stream. */
  drawIndex: Record<string, number>;
  /** Card ids offered-and-declined in the last draft (AAA 4.3). */
  declined: string[];
}

let session: DraftSession = { daySeed: NaN, drawIndex: {}, declined: [] };

function sessionFor(daySeed: number): DraftSession {
  if (session.daySeed !== daySeed) session = { daySeed, drawIndex: {}, declined: [] };
  return session;
}

/** Captured store handles so page-level helpers can act without an import cycle. */
type SetFn = Parameters<StateCreator<ManorStore, [], [], ManorSlice>>[0];
type GetFn = Parameters<StateCreator<ManorStore, [], [], ManorSlice>>[1];
let storeSet: SetFn | null = null;
let storeGet: GetFn | null = null;

/**
 * Rebuild the manor grid for a fresh day (day.ts integration note: A1 builds
 * when it observes manor === null with a live day). ManorPage calls this on
 * mount/day change; harmless when the manor already exists.
 */
export function ensureManor(): void {
  if (!storeSet || !storeGet) return;
  const s = storeGet();
  const day = s.day;
  if (!day || (day.phase !== 'morning' && day.phase !== 'exploring')) return;
  sessionFor(day.daySeed);
  if (s.manor) return;
  // Fern's arc (KEY_SUPPLY.fernMorningKeys): the padlock's answer to Bramble's
  // tea. A friend of the groundskeeper finds a key left on the sill at dawn —
  // affinity-gated, one conversation a day (AAA 5.9), and it does NOT carry
  // over: the day slice still zeroes keys at night, so every ascent re-earns
  // its way up (MANOR_DESIGN §9). Applied here because the manor slice owns
  // `currencies`, and this is the one moment a fresh manor is built.
  const morning = fernMorningKeys(s.affinities?.fern ?? 0);
  // …and what yesterday left steeping (AAA 4.11 cross-day investment): the
  // Still Room's key on the sill. Read off the audited event spine — dusk
  // keeps the closing day's events, so yesterday's drafts are still legible at
  // dawn — so preparation crosses a night with no new save field to lose.
  const carried = carryOverFrom(
    s.recentEvents
      .filter((e) => e.day === day.day - 1 && e.event.type === 'room-drafted')
      .map((e) => (e.event as { cardId: string }).cardId),
  );
  const dawnKeys = morning + carried.keys;
  storeSet((prev) => ({
    manor: createManor(day.daySeed),
    draftOffer: null,
    currencies: dawnKeys > 0
      ? { ...prev.currencies, keys: prev.currencies.keys + dawnKeys }
      : prev.currencies,
  }));
}

/** Prose for the morning: what the manor left out for her overnight. */
export function dawnCarryOverLines(
  s: Pick<ManorStore, 'day' | 'recentEvents'>,
): string[] {
  const today = s.day?.day;
  if (today === undefined) return [];
  return carryOverFrom(
    s.recentEvents
      .filter((e) => e.day === today - 1 && e.event.type === 'room-drafted')
      .map((e) => (e.event as { cardId: string }).cardId),
  ).lines;
}

/** Has Dewey been petted today? (Derives his reveal state — no extra save shape.) */
export function deweyPettedToday(s: Pick<ManorStore, 'day' | 'recentEvents'>): boolean {
  const today = s.day?.day;
  if (today === undefined) return false;
  return s.recentEvents.some((e) => e.day === today && e.event.type === 'dewey-petted');
}

/** Dewey's answer, shown by the UI once petted today (deterministic). */
export function deweyAnswer(
  // `affinities` is optional so callers that predate the key-access term keep
  // compiling; without it the prophecy simply reads the un-warmed weights.
  s: Pick<ManorStore, 'manor' | 'currencies' | 'cabinet'> &
    Partial<Pick<ManorStore, 'affinities'>>,
): boolean {
  const manor = s.manor;
  if (!manor) return false;
  const sess = sessionFor(manor.daySeed);
  return deweyProphecy(deckFor(s.cabinet.unlockedCardIds), manor, {
    gems: s.currencies.gems,
    declinedLastDraft: sess.declined,
    drawIndexFor: (key) => sess.drawIndex[key] ?? 0,
    keyAccess: keyAccessFor(s.affinities?.fern ?? 0),
  });
}

// ---------------------------------------------------------------------------
// The slice
// ---------------------------------------------------------------------------

export const createManorSlice =
  (initial: SaveV2): StateCreator<ManorStore, [], [], ManorSlice> =>
  (set, get) => {
    storeSet = set;
    storeGet = get;

    /** Utility rooms pay out when drafted; compounding hooks fire on later drafts. */
    const applyDraftEffects = (placed: PlacedRoom, manorBefore: ManorState) => {
      const at = Date.now();
      const key = cellKey(placed.cell);
      const effect = UTILITY_EFFECTS[placed.cardId];
      if (effect) {
        if (effect.steps) {
          get().applyStepEntry({ reason: 'snack', delta: effect.steps, at, roomKey: key });
        }
        if (effect.gems || effect.keys) {
          set((s) => ({
            currencies: {
              ...s.currencies,
              gems: s.currencies.gems + (effect.gems ?? 0),
              keys: s.currencies.keys + (effect.keys ?? 0),
            },
          }));
        }
      }
      // Compounding refunds from rooms already standing (AAA 4.11, BP Nursery):
      // the Kitchen hums for every green room drafted after it; the Dumbwaiter
      // rattles for every room of any stripe.
      for (const room of Object.values(manorBefore.rooms)) {
        const comp = UTILITY_EFFECTS[room.cardId];
        if (!comp?.compounding || !comp.compoundSteps) continue;
        const matches = comp.compounding === 'any' ||
          (comp.compounding === 'utility' && placed.kind === 'utility');
        if (matches) {
          get().applyStepEntry({
            reason: 'snack', delta: comp.compoundSteps, at, roomKey: cellKey(room.cell),
          });
        }
      }
    };

    return {
      manor: initial.manor,
      currencies: initial.currencies,
      draftOffer: null,

      moveTo: (cell) => {
        const { manor, day } = get();
        if (!manor || !day || day.activeRoom) return;
        const exploring = day.phase === 'exploring';
        const duskGrace = day.phase === 'dusk'; // walk-but-no-interact (AAA 4.12)
        if (!exploring && !duskGrace) return;
        if (!canMoveTo(manor, cell)) return;
        set({ manor: { ...manor, playerCell: { ...cell } }, draftOffer: null });
        if (exploring) {
          get().applyStepEntry({
            reason: 'move', delta: STEP_TABLE.move, at: Date.now(), roomKey: cellKey(cell),
          });
        }
      },

      openDraft: (atDoor) => {
        const { manor, day } = get();
        if (!manor || day?.phase !== 'exploring' || day.activeRoom) return;
        if (get().draftOffer) return;
        const target = draftTargets(manor).find((t) => t.dir === atDoor);
        if (!target) return;
        if (get().stepsRemaining() < 1) return; // no step left to reach the door
        // ── The padlock (DOOR_LOCKS, AAA 4.10d). ────────────────────────────
        // Checked BEFORE a single step is ledgered: with no key the door does
        // not open and NOTHING is charged. She saw the padlock on the sheet
        // before she walked (engine/manor/locks.ts `visibleLocks`), so a
        // refusal is a decision she already made — never a surprise charge,
        // never pay-for-nothing (AAA 4.6). The key itself is spent on
        // PLACEMENT, below, so backing out of the offer still costs only the
        // one step, exactly like an unlocked door.
        if (isDoorLocked(manor, target.cell) && get().currencies.keys < KEY_COST) return;
        const sess = sessionFor(manor.daySeed);
        const key = cellKey(target.cell);
        const scripted =
          day.day === 1 && (get().counters['room-drafted'] ?? 0) === 0 &&
          (sess.drawIndex[key] ?? 0) === 0;
        const offer = rollOffer(
          deckFor(get().cabinet.unlockedCardIds), manor,
          manor.playerCell, atDoor, target.cell,
          {
            gems: get().currencies.gems,
            declinedLastDraft: sess.declined,
            drawIndex: sess.drawIndex[key] ?? 0,
            scripted,
            // Fern's arc, supply side (AAA 4.10d): key-bearing cards surface
            // more often as her friendship warms. 0 → weights unchanged.
            keyAccess: keyAccessFor(get().affinities?.fern ?? 0),
          },
        );
        // ── THE WALK TO THE DOOR, PRICED AT *HER* ROW (AAA 4.6). ──────────
        // She has not climbed anywhere yet: she is crossing the floor she is
        // already standing on to look at three cards. So the door-step is
        // ledgered at HER row, not the target's. The climb differential is
        // charged in `chooseDraftCard`, when she actually steps through — so
        // the total for a completed climb is unchanged, while a declined look
        // costs the local rate instead of a whole storey. (Before this,
        // opening and cancelling at an upper-storey door burned 5 of an
        // 18-step budget and the modal's "Step back" promised the opposite.)
        // Even if it was her last step, the offer still opens — dusk is
        // deferred by the day slice until the offer resolves (AAA 4.12/R.3).
        get().applyStepEntry({
          reason: 'move', delta: STEP_TABLE.move, at: Date.now(),
          roomKey: cellKey(manor.playerCell),
        });
        set({ draftOffer: offer });
      },

      chooseDraftCard: (cardId) => {
        const { manor, day, draftOffer } = get();
        if (!manor || !draftOffer || day?.phase !== 'exploring') return;
        const card = draftOffer.cards.find((c) => c.id === cardId);
        if (!card) return;
        const target = neighbor(draftOffer.from, draftOffer.atDoor);
        if (!target || roomAt(manor, target)) return;
        // Padlocked door: the key is spent HERE, on placement — the draft
        // itself was free to look at and free to walk away from (AAA 4.6).
        // Affordability is settled before ANY currency moves, so a card she
        // cannot fully pay for never half-charges her.
        const needsKey = isDoorLocked(manor, target);
        if (needsKey && get().currencies.keys < KEY_COST) return;
        if (card.gemCost > 0 && !get().spendGems(card.gemCost)) return;
        if (needsKey && !get().spendKeys(KEY_COST)) return;

        const key = cellKey(target);
        const doorsRng = createRng(hashSeed(manor.daySeed, key, 0xd0025));
        const doors = resolveDoors(card, draftOffer.atDoor, manor, target, doorsRng);
        const kind: PlacedRoom['kind'] = card.puzzleKind ?? (card.category as PlacedRoom['kind']);

        // Pin the puzzle at placement so re-entry is stable and seen-marking
        // works (RoomHost re-selects with the SAME roomSeed stream).
        let puzzleId: string | undefined;
        if (card.puzzleKind) {
          const adapter = getRoomAdapter(card.puzzleKind);
          if (adapter) {
            const puzzle = adapter.select({
              tier: rowTier(target.row),
              seed: roomSeed(manor.daySeed, key),
              seenIds: get().seenPuzzleIds[card.puzzleKind] ?? [],
            });
            puzzleId = adapter.puzzleId(puzzle);
          }
        }

        const placed: PlacedRoom = { cardId: card.id, cell: target, doors, solved: false, kind, puzzleId };
        const nextManor: ManorState = {
          ...manor,
          rooms: { ...manor.rooms, [key]: placed },
          playerCell: { ...target },
        };
        const sess = sessionFor(manor.daySeed);
        sess.declined = draftOffer.cards.filter((c) => c.id !== card.id).map((c) => c.id);
        set({ manor: nextManor, draftOffer: null });
        // ── THE CLIMB, CHARGED ON THE STEP THROUGH (AAA 4.6 / 4.10). ───────
        // `openDraft` paid the local rate for the walk to the door; this is
        // the difference between her old storey and her new one, keyed
        // "from>to" so the audited `priceEntry` computes it (never the call
        // site). Sum over both entries = moveAt(target row), so a completed
        // climb costs exactly what it always did — only the DECLINED look got
        // cheaper. Lateral and downward moves add nothing (the differential
        // floors at 0 and a zero entry is not a story worth telling).
        const climb = Math.min(0, moveAt(target.row) - moveAt(draftOffer.from.row));
        if (climb < 0) {
          get().applyStepEntry({
            reason: 'move', delta: climb, at: Date.now(),
            roomKey: climbKey(cellKey(draftOffer.from), key),
          });
        }
        get().recordEvent({ type: 'room-drafted', cellKey: key, cardId: card.id, category: card.category });
        applyDraftEffects(placed, manor);
        // Mystery rooms yield their clue the moment she steps in: the volume's
        // deterministic drip (A7's collectFragmentForRoom, AAA 4.14). The UI
        // reads the resulting 'fragment-found' event for the found-it moment.
        if (card.category === 'mystery') get().collectFragmentForRoom('mystery');
        // Step straight into the word game; parlor interiors are dialogue
        // scenes keyed off playerCell (ManorPage), utility pays at draft.
        if (card.puzzleKind) get().enterRoom(key);
      },

      rerollDraft: () => {
        const { manor, day, draftOffer } = get();
        if (!manor || !draftOffer || draftOffer.rerolled || day?.phase !== 'exploring') return;
        const target = neighbor(draftOffer.from, draftOffer.atDoor);
        if (!target) return;
        if (!get().spendGems(1)) return;
        const sess = sessionFor(manor.daySeed);
        const key = cellKey(target);
        // The first offer counts as offered-and-declined (AAA 4.3)…
        sess.declined = draftOffer.cards.map((c) => c.id);
        // …and only THIS cell's stream advances (AAA 4.8).
        const drawIndex = (sess.drawIndex[key] ?? 0) + 1;
        sess.drawIndex[key] = drawIndex;
        set({
          draftOffer: rollOffer(
            deckFor(get().cabinet.unlockedCardIds), manor,
            draftOffer.from, draftOffer.atDoor, target,
            {
              gems: get().currencies.gems, declinedLastDraft: sess.declined, drawIndex,
              keyAccess: keyAccessFor(get().affinities?.fern ?? 0),
            },
          ),
        });
      },

      cancelDraft: () => {
        const { manor, draftOffer } = get();
        if (manor && draftOffer) {
          sessionFor(manor.daySeed).declined = draftOffer.cards.map((c) => c.id);
        }
        set({ draftOffer: null });
      },

      petDewey: () => {
        const s = get();
        const { manor, day } = s;
        if (!manor || day?.phase !== 'exploring' || day.activeRoom) return;
        const den = deweyCell(manor.daySeed);
        if (!sameCell(manor.playerCell, den) || !roomAt(manor, den)) return;
        if (deweyPettedToday(s)) return; // one pet a day; he has standards
        get().applyStepEntry({
          reason: 'pet-dewey', delta: STEP_TABLE.petDewey, at: Date.now(), roomKey: cellKey(den),
        });
        get().recordEvent({ type: 'dewey-petted' });
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
    };
  };
