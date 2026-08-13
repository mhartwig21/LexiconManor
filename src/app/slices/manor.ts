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
  canMoveTo, cellKey, createManor, deweyCell, draftTargets, neighbor,
  resolveDoors, roomAt, roomSeed, rowTier, sameCell, sealsItself,
} from '../../engine/manor/grid';
import {
  carryOverFrom, deckFor, SEALED_ROOM_BOUNTY, UTILITY_EFFECTS,
} from '../../engine/manor/deck';
import { deweyProphecy, rollOffer } from '../../engine/manor/drafting';
import { rememberedWings, type WingCharacters } from '../../engine/manor/wings';
import { isDoorLocked, KEY_COST, type LockView } from '../../engine/manor/locks';
import { doorsHeldOpen, sanctumAnswered } from '../../engine/manor/tube';
import {
  climbKey, fernMorningKeys, keyAccessFor, moveAt, sanctumMercyArmed, sanctumPlanWarmth,
  surveyEveningsIn, teaLandingPour, STEP_TABLE, TEA_POUR,
} from '../../engine/economy/steps';
import { sealedFragmentIds } from '../../engine/volume';
import { getRoomAdapter } from '../../engine/rooms/registry';

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
  // Fern's arc (KEY_SUPPLY.fernMorningKeysByPoints — indexed by RAW POINTS,
  // never by rank; see the indexing contract at the top of economy/steps.ts):
  // the padlock's answer to Bramble's
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

/**
 * What yesterday left steeping, in full (steps, keys, prose) — the same
 * derivation `startDay` and `ensureManor` bank, exposed so the morning card
 * can NAME the numbers it is handing her (AAA 4.9/11.15) instead of only
 * describing them.
 */
export function dawnCarryOver(
  s: Pick<ManorStore, 'day' | 'recentEvents'>,
): { steps: number; keys: number; lines: string[] } {
  const today = s.day?.day;
  if (today === undefined) return { steps: 0, keys: 0, lines: [] };
  return carryOverFrom(
    s.recentEvents
      .filter((e) => e.day === today - 1 && e.event.type === 'room-drafted')
      .map((e) => (e.event as { cardId: string }).cardId),
  );
}

/** Prose for the morning: what the manor left out for her overnight. */
export function dawnCarryOverLines(
  s: Pick<ManorStore, 'day' | 'recentEvents'>,
): string[] {
  return dawnCarryOver(s).lines;
}

/**
 * ── THE LANDING ARC, LIVE (round-13 blocker; engine/economy/steps.ts) ──────
 *
 * The second gate of AAA 4.10e is ACCESS, and it had neither an arc nor a
 * floor: `atSanctumDoor` needs the plan drafted on the landing to draw a north
 * door, ~28% of the plans eligible up there do, and nothing in the game moved
 * that number across a six-week campaign. Measured over 400 median-player
 * campaigns, EVERY unfinished one belonged to a player who already knew the
 * word, median 9 evenings and p90 25 between knowing and being let in.
 *
 * Two terms, both derived from state the save ALREADY keeps — no schema change,
 * the same trick `carryOverFrom` uses to cross a night off the event spine:
 *
 *   - WARMTH: evenings she has spent on the top storeys, off
 *     `chronicles.dayRecords[].highestRow` (written every dusk, kept forever).
 *     Earned, strictly progressive, and exactly 0 until she has climbed —
 *     which is why it cannot touch 4.10d's day-1 reach by construction rather
 *     than by tuning.
 *   - MERCY: the access side of AAA 4.14's pity floor. Arms only when she can
 *     already NAME the word (legible pages, never sealed smudges) and has been
 *     up there and turned away before.
 *
 * Both are inert everywhere except the landing — `SANCTUM_LANDING_CELLS`, all
 * three of them since round 37 (engine/manor/drafting.ts reads them only
 * there), so no other draft in the manor changes at all.
 */
export function landingArcFor(
  s: Pick<ManorStore, 'chronicles' | 'volume' | 'flags'>,
): { sanctumPlanWarmth: number; sanctumMercy: boolean } {
  const surveyed = surveyEveningsIn(s.chronicles.dayRecords);
  const sealed = sealedFragmentIds(s.volume.volumeId, s.flags);
  const legible = s.volume.foundFragmentIds.filter((id) => !sealed.has(id)).length;
  // ROUND 17 (REVIEW_AA §5.2): once the word has been SPOKEN — down the hall's
  // speaking tube or at the door — the house stops gambling with her. The
  // landing's mercy slot is armed outright and its plans are as good as they
  // ever get, because the only thing left in the volume is the walk up to say
  // it to his face. Inert on every day before that, so 4.10d is untouched.
  const answered = sanctumAnswered(s.volume.volumeId, s.flags);
  return {
    sanctumPlanWarmth: answered ? 1 : sanctumPlanWarmth(surveyed),
    sanctumMercy: answered || sanctumMercyArmed(surveyed, legible),
  };
}

/**
 * THE PADLOCK VIEW (round 17). One derivation, read by every surface that
 * draws or charges a lock — the draft gate below, the blueprint's drawn
 * padlocks, ManorPage's key line and the draft modal's — so a door cannot be
 * shut in one place and open in another (the round-13 `atSanctumDoor` lesson,
 * applied before the same defect gets a second chance).
 */
/**
 * ── THE PAPERS' MEMORY OF THE FLOORPLAN (round 20, REVIEW_AA §5.7) ─────────
 *
 * The review, against Blue Prince: *"the North wing is a spatial argument you
 * conduct against the grid across dozens of runs, and the knowledge you
 * accumulate is permanent even though the house is not… Lexicon Manor's
 * floorplan is a corridor generator with a price list."*
 *
 * This is the seam that answers it, and it is deliberately the SAME shape as
 * `landingArcFor` above: a pure derivation off `chronicles.dayRecords`, which
 * the save already keeps, handed to the drafting engine as a WEIGHT. A wing she
 * has ended the same way on two evenings draws true tomorrow — so the manor
 * still resets at dusk while *where things are kept in it* does not.
 */
export function wingsFor(s: Pick<ManorStore, 'chronicles'>): WingCharacters {
  return rememberedWings(s.chronicles.dayRecords);
}

export function lockViewFor(s: Pick<ManorStore, 'volume' | 'flags'>): LockView {
  return { heldOpen: doorsHeldOpen(s.volume.volumeId, s.flags) };
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
    Partial<Pick<ManorStore, 'affinities' | 'chronicles'>>,
): boolean {
  const manor = s.manor;
  if (!manor) return false;
  const sess = sessionFor(manor.daySeed);
  return deweyProphecy(deckFor(s.cabinet.unlockedCardIds), manor, {
    gems: s.currencies.gems,
    declinedLastDraft: sess.declined,
    drawIndexFor: (key) => sess.drawIndex[key] ?? 0,
    keyAccess: keyAccessFor(s.affinities?.fern ?? 0),
    // The prophecy rolls the SAME offers the real drafts will (round 20: the
    // wing term included, or the cat would be honest about a deck the house
    // no longer has).
    wings: rememberedWings(s.chronicles?.dayRecords ?? []),
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
        // ROUND 19: the padlock reads the LOCK VIEW, so a volume she has already
        // named (down the tube, §5.2) walks up through open doors. `lockViewFor`
        // has existed since round 17 and was passed to nobody — the third
        // half-landed limb of the same mechanic, and the one that made the
        // model's post-answer win days fiction.
        if (isDoorLocked(manor, target.cell, lockViewFor(get())) && get().currencies.keys < KEY_COST) return;
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
            // The landing arc (round 13). Inert at every cell but the three
            // that make up the landing (round 37).
            ...landingArcFor(get()),
            // The wings (round 20). Inert until the papers remember one.
            wings: wingsFor(get()),
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
        const needsKey = isDoorLocked(manor, target, lockViewFor(get()));
        if (needsKey && get().currencies.keys < KEY_COST) return;
        if (card.gemCost > 0 && !get().spendGems(card.gemCost)) return;
        if (needsKey && !get().spendKeys(KEY_COST)) return;

        const key = cellKey(target);
        // ORIENTATION (round-9 owner defect): the card's 'N' is the door she
        // walked in through, and the plan turns rigidly to suit — a pure
        // function of the card, the day, the cell and her heading, with no rng
        // at all. The draft card face drew this exact call before she chose
        // (ui/blueprint/DraftModal.tsx), so what she saw is what is placed.
        const doors = resolveDoors(card, draftOffer.atDoor, manor, target);
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
        // ── THE SEALED ROOM PAYS (REVIEW_AA §5.7, deck.ts SEALED_ROOM_BOUNTY).
        // Asked of the manor as it stood BEFORE the placement and with the same
        // heading the card face drew with, so the stamp she read on the card and
        // the gem she is handed are the same computation — the round-9 ruling
        // about `resolveDoors`, applied to the other half of the same decision.
        // ── BRAMBLE CARRIES THE POT UP (round 23, REVIEW_AA §5.10). ───────
        // Her arc is the same size it has always been; what moved is where she
        // sets it down. The cup was at the door (engine/day.ts `beginDay`); the
        // rest of the pot is waiting on the second landing — the first storey
        // above the tier-1 band and the last one below a padlock — so the
        // friendship funds the climb it is about instead of slackening a ground
        // floor that already charges two steps a room.
        //
        // Once per evening, and the LEDGER is what remembers: it is rebuilt at
        // dawn, so a stamped entry cannot go stale and no save field is added.
        // 'tea' entries are not re-priced by `priceEntry` (only 'move' is), so
        // the roomKey is free to be a marker.
        if (target.row >= TEA_POUR.landingRow0
          && !get().ledger.entries.some((e) => e.roomKey === TEA_POUR.key)) {
          const pot = teaLandingPour(get().affinities?.bramble ?? 0);
          if (pot > 0) {
            get().applyStepEntry({
              reason: 'tea', delta: pot, at: Date.now(), roomKey: TEA_POUR.key,
            });
          }
        }
        const sealed = sealsItself(doors, draftOffer.atDoor, manor, target);
        if (sealed) {
          set((s) => ({
            currencies: { ...s.currencies, gems: s.currencies.gems + SEALED_ROOM_BOUNTY.gems },
          }));
        }
        get().recordEvent({
          type: 'room-drafted', cellKey: key, cardId: card.id, category: card.category, sealed,
        });
        applyDraftEffects(placed, manor);
        // Mystery rooms yield their clue the moment she steps in: the volume's
        // deterministic drip (A7's collectFragmentForRoom, AAA 4.14). The UI
        // reads the resulting 'fragment-found' event for the found-it moment.
        //
        // ROUND 10 (owner: "solving them needs to matter"): what she carries
        // out is the DOCUMENT, not yet the reading — `collectFragmentForRoom`
        // files it sealed. Hers forever from this step, never required for
        // anything, and made out later by finishing a word game
        // (app/slices/journal.ts `creditSolve`). Nothing about this branch is
        // conditional on solving: the cozy promise is that entering is always
        // enough to KEEP it.
        //
        // ROUND 49 — the card id rides with it, so the leaf remembers which
        // violet room she was standing in when it landed. The seal and the
        // journal both name it (engine/volume.ts `pageFromRoomFlag`); nothing
        // about the drip itself moves.
        if (card.category === 'mystery') get().collectFragmentForRoom('mystery', card.id);
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
              ...landingArcFor(get()),
              wings: wingsFor(get()),
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
