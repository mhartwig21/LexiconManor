/**
 * ═══ THE WORD GAME AS THE WORST-LOOKING CARD ON THE TABLE (round 46) ═══════
 *
 * **THE MEASUREMENT THIS FILE EXISTS FOR, and it is the owner's, arriving as a
 * number.** The cold read of 12 Aug: *"not one of three blind players entered a
 * Gallery."* Two were offered one and declined, and the grader named the cause —
 * the card advertises **+1** beside cards advertising **+5**. Three consecutive
 * rounds of Gallery craft (the accept-list, the grid, the studies) were
 * invisible to a stranger because nobody chose the room.
 *
 * `tests/draft-dominance.test.ts` could not see it. `isDominated` reads two
 * axes — the door plan and what a card PAYS — and answers *"does this offer
 * have a right answer on its face"*. It never asks WHICH card is on the bottom,
 * so an offer where the word game is beaten by all three rivals and an offer
 * where the word game wins are the same event to it. This file asks the other
 * question.
 *
 * ── WHAT IS MEASURED, EXACTLY ─────────────────────────────────────────────
 *
 * A card's **reward face** is every `+N <noun>` clause the draft card actually
 * paints, read off the shipped renderers and nothing else:
 *
 *   - `CARD_PREVIEWS[card.id]` — a utility card's ONLY statement of its numbers
 *     (round 33 moved it into the stake register for exactly that reason);
 *   - `draftCardStake(card, tier, { pageOnSolve })` — the puzzle and mystery
 *     rooms' line;
 *   - `SEALED_ROOM_BOUNTY.stamp` or `doorPlanWords(onward)` — whichever the
 *     card prints in that slot; the sealing stamp carries a `+1 gem`.
 *
 * One card **OUTBIDS** another when it is ≥ on every axis either of them
 * prints and > on at least one. Two shares are computed from that, and BOTH are
 * printed every run:
 *
 *   - **the gate** — `outbid`: of the offers where a word room sits beside at
 *     least one card that ASKS NOTHING of her (a utility, parlor or mystery
 *     room), the share where some word room is outbid by every one of them.
 *     This is the owner's sentence, counted.
 *   - **the residue** — `faceBottom`: the share where some word room is outbid
 *     by every rival, word rooms included. This one barely moves, and it is
 *     printed so the headline cannot be read as a claim about the wage. A
 *     Conservatory outbidding a Gallery is `solvePayout` working.
 *
 * **TWO THINGS ARE DELIBERATELY NOT IN EITHER, and the metric's name says so.**
 * The LENGTH clause (`effortLabel`) is on the card and is not a gain — it is
 * what the room costs her evening — and a metric that let a room count its own
 * shortness as a reward would answer "is any card outbid" with "no" on the
 * Gallery every time and could never fail. The DOOR PLAN is the other axis
 * `isDominated` already reads, and this file is the complement of that one, not
 * a second opinion about it.
 *
 * ── THE DAY IS MODELLED, BECAUSE THE PAGE CLAUSE IS VALVED ────────────────
 *
 * A solved room files a page once per channel per day (`solveChannelPage`), so
 * the clause is on the card at the top of an evening and off it afterwards.
 * The walk below therefore carries the two channels through the evening the way
 * the game does — the Study has its own, every other room shares the lintel —
 * rather than measuring a permanently generous card. What that costs is
 * published beside the headline and is most of what the headline is: the event
 * happens on **0.0%** of offers where the clause is printed and **9.5%** where
 * it is not. The card is not the residue; the valve is.
 */
import { describe, expect, it } from 'vitest';
import { CARD_PREVIEWS, SEALED_ROOM_BOUNTY } from '../src/engine/manor/deck';
import { deckFor } from '../src/engine/manor/deck';
import { draftCardStake } from '../src/engine/economy/preview';
import { doorPlanWords } from '../src/ui/blueprint/doorplan';
import { rollCards } from '../src/engine/manor/drafting';
import {
  cellKey, createManor, draftTargets, onwardDoors, resolveDoors, rowTier, sealsItself,
} from '../src/engine/manor/grid';
import { solveChannelFor } from '../src/engine/volume';
import { createRng } from '../src/engine/rng';
import type { Cell, ManorState, RoomCard, Tier } from '../src/engine/types';

// ---------------------------------------------------------------------------
// The face, read off the shipped renderers
// ---------------------------------------------------------------------------

/**
 * ── THE AXES A CARD CAN PRINT A `+N` AGAINST ───────────────────────────────
 *
 * Enumerated rather than inferred, and this is the second thing this file could
 * get wrong without noticing. The first parser took "the word or two after the
 * number" and, on `+1 step on solve`, produced the axis **"step on"** — so a
 * card whose stake line had ONE clause was compared against a card whose line
 * had two on entirely different axes, and every number it printed was noise.
 * A regex that quietly invents an axis is this repo's own failure mode wearing
 * a parser: it agreed with itself perfectly.
 *
 * So a clause is matched against this table, and a clause that matches nothing
 * FAILS A TEST (`every +N clause the shipped deck prints has a named axis`)
 * rather than being dropped or mangled. A new priced clause on a card is gated
 * the day it ships, which is `test:prices`' rule applied to a reward.
 */
const AXES: readonly (readonly [RegExp, string])[] = [
  [/^sealed pages?\b/, 'sealed pages'],
  [/^pages?\b/, 'pages'],
  [/^steps?\s+per\b/, 'steps per later draft'],   // the Dumbwaiter
  [/^steps?\b/, 'steps'],
  [/^keys?\b/, 'keys'],
  [/^gems?\b/, 'gems'],
  [/^per\b/, 'steps per later draft'],            // the Kitchen
  [/^tomorrow\b/, 'steps tomorrow'],              // the Larder's dough
];

/** The axis a `+N …` clause names, or null if this file has never seen it. */
export function axisOf(clause: string): string | null {
  const c = clause.trim().toLowerCase();
  for (const [re, axis] of AXES) if (re.test(c)) return axis;
  return null;
}

/**
 * Every `+N <axis>` the card face paints, summed by axis. A clause runs from
 * its number to the next `·` — the separator every one of these surfaces uses —
 * so `+1 step on solve` and `+1 step` are the same axis and `+1 sealed page` is
 * not the same axis as `+1 page` (round 10: a mystery room's page arrives
 * smudged and the card may not promise a reading it does not hand over).
 */
export function faceGains(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const re = /\+(\d+)\s+([^·]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const axis = axisOf(m[2] ?? '');
    if (axis === null) continue;                  // gated by its own test below
    out.set(axis, (out.get(axis) ?? 0) + Number(m[1]));
  }
  return out;
}

/** Every `+N …` clause in a face, whether this file can name it or not. */
export function faceClauses(text: string): string[] {
  return [...text.matchAll(/\+(\d+)\s+([^·]*)/g)].map((m) => m[2] ?? '');
}

/** Does `a` outbid `b` — ≥ on every noun either prints, > on at least one? */
export function outbids(a: Map<string, number>, b: Map<string, number>): boolean {
  let strict = false;
  for (const noun of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(noun) ?? 0;
    const y = b.get(noun) ?? 0;
    if (x < y) return false;
    if (x > y) strict = true;
  }
  return strict;
}

interface FaceCard {
  card: RoomCard;
  tier: Tier;
  gains: Map<string, number>;
  isPuzzle: boolean;
  steps: number;
  /** The composed card face, kept so the axis manifest can walk it. */
  text: string;
}

type Offer = FaceCard[];

/**
 * The three faces at one door, composed the way `DraftModal` composes them.
 * `pageOpen` is the store's `pageOnSolve` answer for that card's channel.
 */
function facesAt(
  cards: readonly RoomCard[], dir: Parameters<typeof resolveDoors>[1],
  manor: ManorState, cell: Cell, pageOpen: (card: RoomCard) => boolean,
): Offer {
  const tier = rowTier(cell.row);
  return cards.map((card) => {
    const doors = resolveDoors(card, dir, manor, cell);
    const plan = sealsItself(doors, dir, manor, cell)
      ? SEALED_ROOM_BOUNTY.stamp
      : doorPlanWords(onwardDoors(doors, dir, manor, cell));
    const stake = draftCardStake(card, tier, { pageOnSolve: pageOpen(card) });
    const text = [CARD_PREVIEWS[card.id] ?? '', plan, stake?.label ?? ''].join(' · ');
    const gains = faceGains(text);
    return {
      card, tier, gains,
      isPuzzle: card.category === 'puzzle' && Boolean(card.puzzleKind),
      steps: gains.get('steps') ?? 0,
      text,
    };
  });
}

/**
 * ── THE EVENT THIS FILE COUNTS, and it is the owner's sentence ─────────────
 *
 * > *"A utility room hands you +5 and asks nothing. A word room asks five
 * >  minutes of thought and hands you +1 plus a page of the mystery… The card
 * >  prints the one number where they are least comparable and stays silent on
 * >  everything else."*
 *
 * So the comparison is against the cards that ASK NOTHING: a utility, parlor or
 * mystery room is drafted and pays, with no puzzle in it. `OUTBID` is true when
 * a puzzle card sits beside at least one of them and is outbid on its reward
 * face by EVERY one of them — the card face saying, to a stranger reading it,
 * "there is nothing here the easy card does not also give you."
 *
 * **A WORD ROOM BEATEN BY ANOTHER WORD ROOM IS NOT THIS EVENT, deliberately.**
 * The Conservatory pays +5 for fourteen minutes and the Gallery +1 for a
 * minute and a quarter; that is the wage doing exactly what round 22 built it
 * to do, and the card states the length clause beside it. Counting it here
 * would make the metric a complaint about the wage, which is the one thing this
 * round may not touch. It is measured and printed all the same
 * (`faceBottomOfAll`), so the exclusion is visible rather than assumed.
 */
const asksNothing = (c: FaceCard): boolean => !c.isPuzzle;

function wordRoomOutbid(offer: Offer): boolean {
  const idle = offer.filter(asksNothing);
  if (idle.length === 0) return false;
  return offer.some((c) => c.isPuzzle && idle.every((o) => outbids(o.gains, c.gains)));
}

/** Is some puzzle card outbid by EVERY other card, word rooms included? */
function wordRoomIsFaceBottom(offer: Offer): boolean {
  return offer.some((c) => c.isPuzzle
    && offer.length > 1
    && offer.every((o) => o === c || outbids(o.gains, c.gains)));
}

/** Does some puzzle card in this offer print the page clause? */
function offerPrintsPage(offer: Offer): boolean {
  return offer.some((c) => c.isPuzzle && (c.gains.get('pages') ?? 0) > 0);
}

/** Does a puzzle card print the STRICT lowest step figure in the offer? */
function wordRoomLowestSteps(offer: Offer): boolean {
  const low = Math.min(...offer.map((c) => c.steps));
  const atLow = offer.filter((c) => c.steps === low);
  return atLow.length === 1 && atLow[0]!.isPuzzle;
}

// ---------------------------------------------------------------------------
// The evening, walked on the real grid, with the two channels carried through it
// ---------------------------------------------------------------------------

interface WalkedOffer { offer: Offer; index: number }

function walkEvening(
  seed: number, rooms: number, deck: readonly RoomCard[], pagesOn: boolean,
): WalkedOffer[] {
  const rng = createRng((seed ^ 0x5eed) >>> 0);
  let manor: ManorState = createManor(seed);
  const out: WalkedOffer[] = [];
  const path: Cell[] = [{ ...manor.playerCell }];
  // The day's two channels, spent the way `collectFragmentForSolve` spends them.
  const spent = new Set<string>();
  const pageOpen = (card: RoomCard): boolean => {
    if (!pagesOn) return false;
    if (card.category !== 'puzzle' || !card.puzzleKind) return false;
    return !spent.has(solveChannelFor(card.puzzleKind).id);
  };
  for (let i = 0; i < rooms; i++) {
    const targets = draftTargets(manor);
    if (targets.length === 0) break;
    targets.sort((a, b) => (b.cell.row - a.cell.row) || (rng() - 0.5));
    const { dir, cell } = targets[0]!;
    const cards = rollCards(deck, manor, cell,
      { gems: 2, declinedLastDraft: [], drawIndex: 0, entryDir: dir });
    out.push({ offer: facesAt(cards, dir, manor, cell, pageOpen), index: i });
    const doorsOf = (c: RoomCard) => resolveDoors(c, dir, manor, cell);
    const pick = cards.find((c) => !sealsItself(doorsOf(c), dir, manor, cell)) ?? cards[0]!;
    // The walker solves what it takes (draft-dominance's walk does the same),
    // so a puzzle room it lays spends that room's channel for the rest of the
    // evening — which is exactly when the card stops promising a page.
    if (pick.category === 'puzzle' && pick.puzzleKind) {
      spent.add(solveChannelFor(pick.puzzleKind).id);
    }
    manor = {
      ...manor,
      rooms: {
        ...manor.rooms,
        [cellKey(cell)]: {
          cardId: pick.id, cell, doors: doorsOf(pick),
          solved: true, kind: (pick.puzzleKind ?? pick.category) as never,
        },
      },
      playerCell: { ...cell },
    };
    path.push({ ...cell });
    while (draftTargets(manor).length === 0 && path.length > 1) {
      path.pop();
      manor = { ...manor, playerCell: { ...path[path.length - 1]! } };
    }
    if (draftTargets(manor).length === 0) break;
  }
  return out;
}

const walkAll = (pagesOn: boolean): WalkedOffer[] => {
  const deck = deckFor([]);
  const out: WalkedOffer[] = [];
  for (let seed = 1; seed <= 900; seed++) {
    for (const o of walkEvening(seed, 7, deck, pagesOn)) out.push(o);
  }
  return out;
};

/** The shipped card face. */
const FACES = walkAll(true);
/**
 * THE RED PROOF, and it is not a mock: this is the round-45 card face, which is
 * the same `draftCardStake` called the way every caller called it before this
 * round — with no page clause. It is also a state the shipped game reaches
 * every evening, the moment both channels have paid.
 */
const ROUND45 = walkAll(false);

const withPuzzle = (all: readonly WalkedOffer[]) =>
  all.filter((w) => w.offer.some((c) => c.isPuzzle));
/** The population the headline is a share of: a word room offered beside at
 *  least one card that asks nothing of her. */
const contested = (all: readonly WalkedOffer[]) =>
  withPuzzle(all).filter((w) => w.offer.some(asksNothing));

const rateOf = (
  all: readonly WalkedOffer[],
  pool: (a: readonly WalkedOffer[]) => WalkedOffer[],
  hit: (o: Offer) => boolean,
) => {
  const p = pool(all);
  return p.length === 0 ? 0 : p.filter((w) => hit(w.offer)).length / p.length;
};

const outbidRate = (all: readonly WalkedOffer[]) => rateOf(all, contested, wordRoomOutbid);
const faceBottomRate = (all: readonly WalkedOffer[]) =>
  rateOf(all, withPuzzle, wordRoomIsFaceBottom);
const lowestStepsRate = (all: readonly WalkedOffer[]) =>
  rateOf(all, withPuzzle, wordRoomLowestSteps);

/**
 * ── THE GATE ──────────────────────────────────────────────────────────────
 *
 * A RATCHET, the same shape as `DOMINANCE_GATE.ratchet` and 4.10h's four wage
 * spreads: it may fall and may never rise. It is set at the measured value plus
 * the same one-point allowance those carry, and it is proved RED on the face
 * this round replaced rather than only ever having been seen green.
 */
export const WORD_ROOM_FACE_GATE = {
  /**
   * ROUND 46 — measured **7.5%** on the shipped face over 4,845 contested
   * offers, against **11.3%** on the face this round replaced. The test prints
   * both every run, plus the split that explains them, so no number here can go
   * stale in the reassuring direction.
   *
   * **IT IS NOT ZERO, AND THE SPLIT IS WHY — 0.0% where the page clause is
   * PRINTED, 9.5% where it is not.** Where the card says the thing, the event
   * this gate counts does not happen at all; the whole of what is left is the
   * VALVE. A page is filed once per channel per day (`solveChannelPage`), so
   * after the evening's lintel engraving lands, every ordinary word room's card
   * says what it said in round 45 and only the Study — which carries a channel
   * of its own — still promises one.
   *
   * **THE NEXT LEVER IS NAMED RATHER THAN DEFERRED, and it is not the card.**
   * `creditSolve` also pays `decipherYield(tier)` — 1 / 2 / 3 SEALED pages made
   * out, on every solve, unvalved, needing only a backlog — and the card is
   * silent about it. That clause would be true all evening and would scale with
   * the storey, which is a real difference between two word rooms. It needs a
   * second live predicate (is the backlog non-empty) and a second clause on a
   * stake line that already wraps at 375×667, so it is a round of its own.
   */
  outbid: 0.08,
} as const;

describe('the reward face is read off the shipped renderers, never re-derived', () => {
  it('parses every +N clause the card can paint, and singularises the noun', () => {
    expect([...faceGains('+2 steps · +1 key').entries()])
      .toEqual([['steps', 2], ['keys', 1]]);
    // THE DEFECT THIS FILE SHIPPED AND CAUGHT: a one-clause stake line.
    expect(faceGains('+1 step on solve').get('steps')).toBe(1);
    expect(faceGains('+1 sealed page').get('sealed pages')).toBe(1);
    expect(faceGains('+1 sealed page').get('pages')).toBeUndefined();
    expect(faceGains(SEALED_ROOM_BOUNTY.stamp).get('gems')).toBe(1);
    // A card that states no gain states none — the door plan alone is not one.
    expect(faceGains(doorPlanWords(['E', 'W'])).size).toBe(0);
    // …and the utility cards' only statement of their numbers is caught.
    expect(faceGains(CARD_PREVIEWS['gem-vault']!).get('gems')).toBe(2);
    expect(faceGains(CARD_PREVIEWS['kitchen']!).get('steps')).toBe(2);
    expect(faceGains(CARD_PREVIEWS['kitchen']!).get('steps per later draft')).toBe(1);
  });

  it('outbids is weak-dominance with a strict edge, on the printed nouns only', () => {
    const g = (s: string) => faceGains(s);
    expect(outbids(g('+2 steps'), g('+1 step on solve'))).toBe(true);
    expect(outbids(g('+1 step'), g('+1 step'))).toBe(false);          // a tie is not a win
    expect(outbids(g('+2 steps'), g('+1 step · +1 page'))).toBe(false); // no page, no outbid
    expect(outbids(g('+2 steps · +1 page'), g('+1 step · +1 page'))).toBe(true);
  });

  it('names every +N clause the shipped deck actually prints', () => {
    // The manifest gate. A card that grows a new priced clause — or a copy edit
    // that re-words an old one — lands here rather than being silently dropped
    // out of the comparison, which is how a metric goes quietly wrong.
    const unknown = new Set<string>();
    for (const { offer } of FACES) {
      for (const c of offer) {
        for (const clause of faceClauses(c.text)) {
          if (axisOf(clause) === null) unknown.add(`${c.card.id}: “+N ${clause}”`);
        }
      }
    }
    expect([...unknown], 'a card prints a gain this file cannot name').toEqual([]);
  });

  it('composes the same clauses DraftModal composes, page clause included', () => {
    // The one thing this file could get wrong and never notice: reading a face
    // the modal does not paint. So the stake half is asserted against the
    // shipped function at both settings.
    const gallery = deckFor([]).find((c) => c.id === 'gallery')!;
    const open = draftCardStake(gallery, 1, { pageOnSolve: true })!.label;
    const shut = draftCardStake(gallery, 1, { pageOnSolve: false })!.label;
    expect(open).toContain('+1 page');
    expect(shut).not.toContain('page');
    expect(faceGains(open).get('pages')).toBe(1);
    expect(faceGains(shut).get('pages')).toBeUndefined();
  });
});

describe('THE GATE — a word game may not be outbid by every card that asks nothing', () => {
  it('holds the ratchet, and prints every number it rests on', () => {
    const pool = contested(FACES);
    expect(pool.length).toBeGreaterThan(4000);
    const outbid = outbidRate(FACES);
    // eslint-disable-next-line no-console
    console.log(
      `word room OUTBID BY EVERY ASK-NOTHING CARD ${(100 * outbid).toFixed(1)}%`
      + ` of ${pool.length} contested offers`
      + ` (round-45 face ${(100 * outbidRate(ROUND45)).toFixed(1)}%)`
      + ` · where the page clause is PRINTED ${(100 * rateOf(FACES, (a) => contested(a).filter((w) => offerPrintsPage(w.offer)), wordRoomOutbid)).toFixed(1)}%`
      + `, where it is not ${(100 * rateOf(FACES, (a) => contested(a).filter((w) => !offerPrintsPage(w.offer)), wordRoomOutbid)).toFixed(1)}%`
      + ` · face-bottom against ALL rivals ${(100 * faceBottomRate(FACES)).toFixed(1)}%`
      + ` (was ${(100 * faceBottomRate(ROUND45)).toFixed(1)}%)`
      + ` · a word room prints the lowest step figure on ${(100 * lowestStepsRate(FACES)).toFixed(1)}%`,
    );
    expect(outbid, `outbid by every ask-nothing card on ${(100 * outbid).toFixed(1)}% of offers`)
      .toBeLessThanOrEqual(WORD_ROOM_FACE_GATE.outbid);
  });

  /**
   * ═══ THE RED PROOF (standing rule: prove the gate goes red) ═══════════════
   *
   * The same 900 evenings, the same deck, the same doors, the same streams —
   * with `draftCardStake` called the way every caller called it before this
   * round. Not a mock and not a flag: it is the shipped function's own default,
   * and it is also the face the game paints later in an evening once the
   * channel has paid.
   */
  it('goes RED on the card face this round replaced', () => {
    const before = outbidRate(ROUND45);
    expect(before, `the round-45 face measures ${(100 * before).toFixed(1)}%`)
      .toBeGreaterThan(WORD_ROOM_FACE_GATE.outbid);
    // …by a margin no seed choice could manufacture.
    expect(before - outbidRate(FACES)).toBeGreaterThan(0.03);
  });

  /**
   * ═══ THE NUMBER THAT DOES NOT MOVE, PUBLISHED BESIDE THE ONE THAT DOES ════
   *
   * The instrument would agree with itself if it only ever reported the thing
   * this round changed. **The wage is locked** — a room is paid for the work it
   * asks for, and that is not up for renegotiation — so the share of offers
   * where the word game prints the strictly lowest STEP figure is exactly what
   * it was, to the offer. The +1 is still a +1. What the round buys is that the
   * +1 is no longer the whole of what the card says.
   */
  it('does NOT move the share where a word room prints the lowest step figure', () => {
    const now = lowestStepsRate(FACES);
    expect(now).toBe(lowestStepsRate(ROUND45));
    expect(now, `a word room prints the lowest step figure on ${(100 * now).toFixed(1)}%`)
      .toBeGreaterThan(0.10);
  });

  /**
   * ═══ AND THE HALF THE CARD CANNOT FIX, MEASURED RATHER THAN OMITTED ═══════
   *
   * Against ALL rivals — word rooms included — the word game is still the
   * bottom card on nearly a fifth of offers, and this round barely moves it.
   * That residue is a Conservatory outbidding a Gallery, which is `solvePayout`
   * doing exactly what round 22 built it to do: fourteen minutes of work is
   * paid more than a minute and a quarter. It is printed here so nobody reads
   * the headline as a claim that the wage gap was closed. It was not, and it is
   * not supposed to be.
   */
  it('records the residue the card cannot pay: word room against word room', () => {
    const all = faceBottomRate(FACES);
    expect(all).toBeGreaterThan(0.05);
    // The page clause is worth something here and it is not worth much.
    expect(all).toBeLessThan(faceBottomRate(ROUND45));
  });

  /**
   * The valve is honest about itself. Where the page clause is PRINTED the
   * event is rare; where it is not, the card is the round-45 card and the rate
   * is the round-45 rate. If these two ever converged, the day model above
   * would have stopped carrying the channels and the headline would be a
   * permanently-generous card rather than the one that ships.
   */
  it('separates cleanly on whether the page clause is printed', () => {
    const withPage = rateOf(FACES,
      (a) => contested(a).filter((w) => offerPrintsPage(w.offer)), wordRoomOutbid);
    const without = rateOf(FACES,
      (a) => contested(a).filter((w) => !offerPrintsPage(w.offer)), wordRoomOutbid);
    expect(withPage).toBeLessThan(without - 0.05);
    expect(withPage).toBeLessThan(0.02);
    // …and the population it separates is a real slice of the evening, not a
    // handful of offers the split could have been read off noise.
    expect(contested(FACES).filter((w) => offerPrintsPage(w.offer)).length)
      .toBeGreaterThan(500);
  });
});
