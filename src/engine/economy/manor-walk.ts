/**
 * THE GRID-TRUE WALKER — OWNER: A2 (Economy/Day). Pure TS, seeded, replayable.
 *
 * ═══ ROUND 24 — THE CAMPAIGN INSTRUMENT COULD NOT SEE THE MANOR ═══════════
 *
 * For twenty-three rounds `simulateDay` tracked a SCALAR ROW (1..6) and a step
 * budget. It never held a `Cell`, never called `resolveDoors`, never asked
 * `sealsItself`, never had a frontier and never had a neighbour:
 *
 *     grep -cE "sealsItself|draftTargets|resolveDoors|neighbor\(" \
 *       src/engine/economy/simulate.ts   →   0
 *
 * Three consequences, each of which invalidated published numbers:
 *
 *   1. **No change to the deck's GEOMETRY could move a single published 4.10
 *      band.** Door layouts, the rigid rotation, the sealed-room bounty, the
 *      dead-end rebalance of round 22 — the campaign model was blind to all of
 *      it, because a row is not a floorplan. Every band in AAA 4.10 was a
 *      ledger-on-a-storey number.
 *   2. **The evening could not STRAND.** A scalar row always has somewhere to
 *      go, so `scripts/review-metrics.ts` printed *"unspent budget 0.0%"* on
 *      every day. On the real 5×7 a manor closes: every room she can walk back
 *      to has its doors on outer walls or on neighbours' blank plaster, and the
 *      evening ends with steps still in her hand.
 *   3. **The landing gate was a proxy.** `landingDraft` rolled a hypothetical
 *      offer at the middle landing cell on a FRESH manor whenever the scalar
 *      row hit 6 — a manor
 *      with no rooms in it, so `eligibleCards`' deck thinning, the wing term
 *      and the actual entry direction were all wrong up there. The real gate is
 *      `atSanctumDoor(manor)`, and it can only be asked of a manor.
 *
 * This module is the manor half of the day: the frontier, the walk, the
 * padlock, the offer and the choice, all on a real `ManorState`. `simulateDay`
 * keeps the ledger, the clock, the seal and the knowledge curve; it now asks
 * this module where she is and what she was offered.
 *
 * ── THE LIVE FUNCTIONS THIS CALLS, AND WHY EACH ONE MATTERS ───────────────
 *   `createManor`      the same 5×7 the game builds, entrance + sealed Sanctum
 *   `draftTargets`     the frontier: doors of HER room into empty cells
 *   `doorsConnect`     the walk: two rooms connect only if both drew the door
 *   `isDoorLocked`     the padlock, per (daySeed, cell) — not a per-row coin
 *   `rollCards`        the real 3-card offer, real streams, real thinning
 *   `resolveDoors`     the rigid rotation the card face draws
 *   `sealsItself`      whether the plan she is looking at walls her in
 *   `atSanctumDoor`    the gate the blueprint, the journal and the Sanctum use
 *
 * Nothing here re-implements any of them.
 */

import type { Cell, Dir, ManorState, PlacedRoom, RoomCard, Tier } from '../types';
import type { RoomPuzzleKind } from '../rooms/room-puzzle';
import {
  atSanctumDoor,
  cellKey, doorsConnect, neighbor, opensOntoSanctum, opposite, resolveDoors,
  roomAt, rowTier, sealsItself,
} from '../manor/grid';
import { isDoorLocked, KEY_COST, type LockView } from '../manor/locks';
import { rollCards, type DraftRollCtx } from '../manor/drafting';
import { UTILITY_EFFECTS } from '../manor/deck';
import { ROOM_SIZE, solvePayout } from './steps';

// ---------------------------------------------------------------------------
// The frontier
// ---------------------------------------------------------------------------

/** One place she could draft tonight, and what it costs her to get there. */
export interface FrontierDoor {
  /** The placed room she must be standing in to open it. */
  from: Cell;
  /** The door of that room (also her heading through it — orientation). */
  dir: Dir;
  /** The empty cell the offer would fill. */
  cell: Cell;
  /** Padlocked today (`isDoorLocked`, per daySeed and cell). */
  locked: boolean;
  /** Cells she must walk THROUGH to stand at `from`, in order, excluding her own. */
  walk: readonly Cell[];
}

/**
 * Every door into an empty cell she can reach from where she stands, with the
 * real walk to it.
 *
 * BFS over `doorsConnect`, which is the only movement rule the live game has
 * (`canMoveTo` is this predicate plus adjacency). So a room whose plan sealed
 * itself is genuinely a cul-de-sac here, a chimney genuinely costs the walk
 * back down, and an evening with an empty result is an evening that has
 * nowhere left to go — the ending a scalar row cannot have.
 */
export function reachableFrontier(manor: ManorState): FrontierDoor[] {
  const startKey = cellKey(manor.playerCell);
  const prev = new Map<string, { cell: Cell; from: string }>();
  const order: Cell[] = [manor.playerCell];
  const seen = new Set<string>([startKey]);
  for (let i = 0; i < order.length; i++) {
    const here = order[i]!;
    for (const dir of (roomAt(manor, here)?.doors ?? [])) {
      if (!doorsConnect(manor, here, dir)) continue;
      const next = neighbor(here, dir);
      if (!next) continue;
      const key = cellKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      prev.set(key, { cell: next, from: cellKey(here) });
      order.push(next);
    }
  }
  /** The cells she walks INTO on the way to `cell` (never her own). */
  const pathTo = (cell: Cell): Cell[] => {
    const out: Cell[] = [];
    let key = cellKey(cell);
    while (key !== startKey) {
      const step = prev.get(key);
      if (!step) return out;             // unreachable (cannot happen: BFS tree)
      out.unshift(step.cell);
      key = step.from;
    }
    return out;
  };

  const out: FrontierDoor[] = [];
  for (const stand of order) {
    const room = roomAt(manor, stand);
    if (!room) continue;
    const walk = pathTo(stand);
    for (const dir of room.doors) {
      const cell = neighbor(stand, dir);
      if (!cell || roomAt(manor, cell)) continue;
      out.push({ from: stand, dir, cell, locked: false, walk });
    }
  }
  return out;
}

/** The same list, with each door's padlock read off the live predicate. */
export function frontierWithLocks(
  manor: ManorState, view?: LockView,
): FrontierDoor[] {
  return reachableFrontier(manor).map(
    (d) => ({ ...d, locked: isDoorLocked(manor, d.cell, view) }),
  );
}

/**
 * Sanity: the frontier at her own feet must be exactly `draftTargets`, which is
 * what the live blueprint offers. Exported so the test suite can assert the two
 * cannot drift (a walker that invents a door the game will not open is the
 * round-13 defect wearing a floorplan).
 */
export function localFrontier(manor: ManorState): FrontierDoor[] {
  return frontierWithLocks(manor).filter((d) => d.walk.length === 0);
}

// ---------------------------------------------------------------------------
// THE OFFER'S SHAPE — the dominance measurement (REVIEW_AA §5.7)
// ---------------------------------------------------------------------------

/**
 * ═══ WHY "79.2% OF OFFERS HAVE A REAL CHOICE" WAS NOT A MEASUREMENT ═══════
 *
 * `scripts/draft-shape.ts` published that headline as
 *
 *     (liveHist[2] + liveHist[3]) / offerCount     where live = !sealsItself
 *
 * i.e. *the share of offers containing two or more cards that do not instantly
 * wall you in*. **It never once asked whether the three cards DIFFER.** Three
 * identical corridors score 3 live and count as a "real choice"; so does an
 * offer of three cards that are the same shape, the same payout and the same
 * category. A name that does not match what it measures is the exact failure
 * this repo's own standing rule forbids ("1.75× wage spread" was the last one).
 *
 * ── WHAT REPLACES IT: THE DOMINANCE RATE ──────────────────────────────────
 *
 * A draft is a DECISION when the cards trade off. It is not one when some card
 * is at least as good as every other on every axis she can read before she
 * spends — then there is a right answer on the card face and the other two are
 * decoration. The two axes are the two things the game itself prints on a card
 * (`ui/blueprint/DraftModal.tsx`), and nothing else:
 *
 *   FRONTIER — how many onward doors into empty cells the plan leaves, drawn
 *     post-rotation by the same `resolveDoors` the card face draws. This is
 *     "does this keep the house open", the Blue Prince axis REVIEW_AA §5.7 is
 *     about.
 *   STEPS — what the room can pay, through the same `solvePayout` /
 *     `UTILITY_EFFECTS` the ledger pays out of. This is "does this buy me the
 *     evening".
 *
 * A card WEAKLY DOMINATES an offer when it is ≥ every other card on BOTH axes.
 * The dominance rate is the share of offers containing such a card, and it is
 * the honest complement of the old headline: 1 − dominance is the share of
 * offers where she must actually give something up.
 */
export interface CardShape {
  card: RoomCard;
  /** Onward doors into EMPTY in-bounds cells after the rigid rotation. */
  frontier: number;
  /** Steps the room can pay — solve wage, refill, or nothing. */
  steps: number;
  /** The plan walls her in (`sealsItself`, the live predicate). */
  seals: boolean;
  /**
   * The plan opens onto the sealed Sanctum — `opensOntoSanctum`, the same
   * predicate `ui/blueprint/DraftModal.tsx` stamps on the card face. False
   * everywhere but the landing, however many north doors a plan draws.
   */
  opensSanctum: boolean;
  /** Post-rotation doors, exactly as the card face draws them. */
  doors: readonly Dir[];
}

/** The step value printed on a card's face, at the tier it would be placed in. */
export function cardStepValue(card: RoomCard, tier: Tier): number {
  if (card.category === 'puzzle' && card.puzzleKind) return solvePayout(card.puzzleKind, tier);
  if (card.category === 'utility') return UTILITY_EFFECTS[card.id]?.steps ?? 0;
  return 0;
}

/** Both axes of one card at one door, read off the live predicates. */
export function shapeOf(
  card: RoomCard, dir: Dir, manor: ManorState, cell: Cell,
): CardShape {
  const doors = resolveDoors(card, dir, manor, cell);
  const came = opposite(dir);
  let frontier = 0;
  for (const d of doors) {
    if (d === came) continue;
    const n = neighbor(cell, d);
    if (!n || roomAt(manor, n)) continue;     // outer wall, or already built
    frontier += 1;
  }
  return {
    card,
    frontier,
    steps: cardStepValue(card, rowTier(cell.row)),
    seals: sealsItself(doors, dir, manor, cell),
    opensSanctum: opensOntoSanctum(doors, cell),
    doors,
  };
}

/** Does some card in this offer weakly dominate on BOTH axes? */
export function isDominated(shapes: readonly CardShape[]): boolean {
  return shapes.some((a) => shapes.every(
    (b) => a.frontier >= b.frontier && a.steps >= b.steps,
  ));
}

/**
 * ── THE PUBLISHED GATE (round 24) ─────────────────────────────────────────
 *
 * `target` — where the deck has to get to. DERIVED, not taken on the critic's
 * word: with three cards and two axes that are FINELY SPREAD and UNRELATED,
 * the same card is top of both by chance exactly 1/3 of the time. 1/3 is
 * therefore the floor a deck with no correlation between geometry and payout
 * reaches; **0.40 is that floor plus a modest allowance for honest ties**, and
 * anything above it means the deck is actively pairing "keeps the house open"
 * with "pays well" and the draft has a right answer on its face. (The critic
 * proposed <40% independently; the derivation is why it is the number and not
 * an opinion.)
 *
 * `ratchet` — where the deck IS, plus a hair. Measured 0.7xx at round 24's
 * HEAD, which is why `target` is an open item and not a passing test: this
 * round built the instrument and is forbidden from touching `deck.ts`. The
 * ratchet is the gate that bites TODAY — a deck edit that makes offers MORE
 * dominated fails `tests/draft-dominance.test.ts` — and it is the number the
 * next round has to walk down to `target`. Same shape as 4.10h/4.10i's
 * ratchets, for the same reason.
 *
 * `nullRate` — the permutation baseline, measured beside the real rate: the
 * dominance you would see if each offer's frontier vector were paired with a
 * DIFFERENT offer's step vector. It is the honest "is this deck worse than
 * chance" reading, and it is what stops the ratchet from being a number with
 * no scale beside it.
 */
export const DOMINANCE_GATE = {
  target: 0.40,
  /**
   * ROUND 36: 0.70 -> 0.41. The deck round landed (engine/manor/deck.ts's
   * ROUND-36 REBALANCE plus drafting.ts's two draft rules) and the rate fell
   * from 67.0% to 34.9% on the walker and to 37.4-39.0% on the day model across
   * four seeds. The gate sits a point above the strictest reading, so `target`
   * is now a floor the deck stands on rather than a destination it is walking
   * toward - and `tests/draft-dominance.test.ts` proves this gate RED against
   * the round-35 draw (58.4%) rather than only ever having seen it green.
   */
  ratchet: 0.41,
} as const;

// ---------------------------------------------------------------------------
// The choice
// ---------------------------------------------------------------------------

/** What a drafted room turns out to be, from the economy's point of view. */
export type WalkRoomKind = 'micro' | 'anchor' | 'utility' | 'parlor' | 'mystery';

/** The kind of the card she actually took — no longer a draw from a mix. */
export function kindOfCard(card: RoomCard): WalkRoomKind {
  if (card.category === 'puzzle') {
    return card.puzzleKind ? ROOM_SIZE[card.puzzleKind] : 'anchor';
  }
  return card.category as WalkRoomKind;
}

/** The room she met, or undefined for a card that is not a puzzle. */
export function puzzleKindOfCard(card: RoomCard): RoomPuzzleKind | undefined {
  return card.category === 'puzzle' ? card.puzzleKind : undefined;
}

/** Place the chosen card and step through — the live `chooseDraftCard` shape. */
export function placeAndEnter(
  manor: ManorState, card: RoomCard, dir: Dir, cell: Cell,
): ManorState {
  const placed: PlacedRoom = {
    cardId: card.id,
    cell,
    doors: resolveDoors(card, dir, manor, cell),
    solved: false,
    kind: (card.puzzleKind ?? card.category) as PlacedRoom['kind'],
  };
  return {
    ...manor,
    rooms: { ...manor.rooms, [cellKey(cell)]: placed },
    playerCell: { ...cell },
  };
}

/** Walk one cell — the live `moveTo`. Callers ledger `moveAt(cell.row)`. */
export function stepInto(manor: ManorState, cell: Cell): ManorState {
  return { ...manor, playerCell: { ...cell } };
}

/** Roll the real offer behind a frontier door. */
export function offerAt(
  deck: readonly RoomCard[], manor: ManorState, door: FrontierDoor,
  ctx: Omit<DraftRollCtx, 'entryDir'>,
): RoomCard[] {
  return rollCards(deck, manor, door.cell, { ...ctx, entryDir: door.dir });
}

/** Both axes for a whole offer, at the door it was rolled behind. */
export function shapesOf(
  cards: readonly RoomCard[], manor: ManorState, door: FrontierDoor,
): CardShape[] {
  return cards.map((c) => shapeOf(c, door.dir, manor, door.cell));
}

/**
 * Is she at the Sanctum door — THE live gate, asked of a real manor.
 *
 * ROUND 28: this was a second implementation of `atSanctumDoor`
 * (manor/grid.ts), copied line for line into a module that already imports
 * from that file, and every ACCESS band the simulator publishes rests on it.
 * Two copies of one rule is a lie waiting for the day someone edits one of
 * them: the round-13 lesson in grid.ts's own comment is that this predicate
 * has a THIRD meaning (on the landing, but the drafted room drew no north
 * door), and a copy is exactly how a house ends up shut in one place and open
 * in another. The name stays — `simulate.ts` binds a local `atSanctumDoor`
 * for the latched day and would shadow the import — but there is now one
 * function, and the simulator asks the game's own question.
 */
export const standsAtSanctumDoor: (manor: ManorState) => boolean = atSanctumDoor;

/** Keys a door asks for (0 when it is open today). */
export function keyCostOf(door: FrontierDoor): number {
  return door.locked ? KEY_COST : 0;
}
