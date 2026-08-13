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
 *   - `draftCardStake(card, tier)` — the puzzle and mystery rooms' line;
 *   - `SEALED_ROOM_BOUNTY.stamp` or `doorPlanWords(onward)` — whichever the
 *     card prints in that slot; the sealing stamp carries a `+1 gem`.
 *
 * One card **OUTBIDS** another when it is ≥ on every axis either of them
 * prints and > on at least one. Two shares are computed from that, and BOTH are
 * printed every run:
 *
 *   - **the headline** — `outbid`: of the offers where a word room sits beside
 *     at least one card that ASKS NOTHING of her (a utility, parlor or mystery
 *     room), the share where some word room is outbid by every one of them.
 *     This is the owner's sentence, counted. It was the gate in round 46; as of
 *     round 49 it is published and not gated — see the block below.
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
 * ═══ ROUND 49 — THE RATCHET IS RETIRED, THE MEASUREMENT IS KEPT ═══════════
 *
 * **THIS FILE NO LONGER GATES `outbid`, AND THAT IS A DECISION, NOT A DRIFT.**
 *
 * The owner overruled round 46 on 13 Aug: *"I think we want to keep true to
 * Blue Prince where certain clues about the benefits of rooms aren't
 * immediately apparent. Saying +1 page feeds everything to the player."* The
 * `+1 page` clause is off the card (`engine/economy/preview.ts`), so this
 * file's headline number goes back UP, by design and on purpose — a card that
 * says less loses to a card that says +5, and that is now the intended shape of
 * the draft rather than a defect in it.
 *
 * A ratchet re-tuned to fit the build it now measures is this repo's most
 * common way of lying to itself (STATUS §3.7), and a ratchet left at 0.08
 * against a deliberate 11%+ is a gate that fails for doing the right thing.
 * Neither is honest, so the RATCHET IS GONE and the INSTRUMENT STAYS: every run
 * still prints `outbid`, `faceBottom` and `lowestSteps` over the same 900
 * evenings, so a future round that wants to move the face has its baseline and
 * can see what round 49 cost. **What is measured here is a fact about the deck.
 * What is GATED here is the owner's ruling** — no card in 900 evenings prints a
 * page clause — plus the two properties that were never about the clause: the
 * axis manifest, and the locked wage.
 *
 * The design requirement the retired ratchet stood in for (*a word room must
 * not be invisible to a stranger reading the table*) is not abandoned; it moved
 * to a surface where it can be answered without telling her the rule.
 * `npm run gate:attribution` (tests/round49-attribution-live.mjs) drives real
 * input at both phone sizes and holds every page-granting event to naming its
 * room ON THE GLASS as it lands, and again in the journal afterwards. That is
 * the ATTRIBUTION gate, and it is the one this round is answerable to.
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

/** The three faces at one door, composed the way `DraftModal` composes them. */
function facesAt(
  cards: readonly RoomCard[], dir: Parameters<typeof resolveDoors>[1],
  manor: ManorState, cell: Cell,
): Offer {
  const tier = rowTier(cell.row);
  return cards.map((card) => {
    const doors = resolveDoors(card, dir, manor, cell);
    const plan = sealsItself(doors, dir, manor, cell)
      ? SEALED_ROOM_BOUNTY.stamp
      : doorPlanWords(onwardDoors(doors, dir, manor, cell));
    const stake = draftCardStake(card, tier);
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

/** Does ANY card in this offer print a page clause? (Round 49: none may.) */
function offerPrintsPage(offer: Offer): boolean {
  return offer.some((c) => (c.gains.get('pages') ?? 0) > 0);
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
  seed: number, rooms: number, deck: readonly RoomCard[],
): WalkedOffer[] {
  const rng = createRng((seed ^ 0x5eed) >>> 0);
  let manor: ManorState = createManor(seed);
  const out: WalkedOffer[] = [];
  const path: Cell[] = [{ ...manor.playerCell }];
  for (let i = 0; i < rooms; i++) {
    const targets = draftTargets(manor);
    if (targets.length === 0) break;
    targets.sort((a, b) => (b.cell.row - a.cell.row) || (rng() - 0.5));
    const { dir, cell } = targets[0]!;
    const cards = rollCards(deck, manor, cell,
      { gems: 2, declinedLastDraft: [], drawIndex: 0, entryDir: dir });
    out.push({ offer: facesAt(cards, dir, manor, cell), index: i });
    const doorsOf = (c: RoomCard) => resolveDoors(c, dir, manor, cell);
    const pick = cards.find((c) => !sealsItself(doorsOf(c), dir, manor, cell)) ?? cards[0]!;
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

const walkAll = (): WalkedOffer[] => {
  const deck = deckFor([]);
  const out: WalkedOffer[] = [];
  for (let seed = 1; seed <= 900; seed++) {
    for (const o of walkEvening(seed, 7, deck)) out.push(o);
  }
  return out;
};

/** The shipped card face. There is only one of it now: round 46's second walk
 *  modelled an evening in which the page clause came and went, and there is no
 *  longer a clause to model. */
const FACES = walkAll();

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
 * ── THE MEASUREMENT, PUBLISHED AND NO LONGER GATED (round 49) ─────────────
 *
 * Round 46 set `outbid: 0.08` as a ratchet against a measured 7.5%. The clause
 * that bought those four points is gone on the owner's ruling, so the number
 * returns to roughly where round 46 found it and the ratchet has nothing
 * honest left to hold: tightening it would fail the build for obeying the
 * owner, and loosening it to fit would be the re-tune this repo calls its most
 * common self-deception. **It is retired.** The rate is printed on every run
 * instead, beside the two shares that never depended on the clause, so the next
 * round to touch the draft face starts from a measured baseline rather than
 * from a memory of one.
 *
 * What is GATED in its place is the RULING, which can only be checked here
 * because this is the only harness that composes the whole shipped face over a
 * real deck: `pages` must not appear as an axis on any card, in any offer, at
 * any tier, across 900 evenings. That gate would have been RED on the commit
 * immediately before this one, which is the strongest red proof available for a
 * deletion — the build it fails is in the git log rather than in a mock.
 */
export const WORD_ROOM_FACE_GATE = {
  /**
   * THE RULING, AS A NUMBER: zero cards may print a page clause.
   *
   * Kept as a named constant rather than inlined as a literal `0` so that the
   * one thing this file now forbids is stated where the retired ratchet used to
   * be, and so a future round re-opening the question has to edit a documented
   * constant rather than a bare assertion.
   */
  pageClauses: 0,
  /**
   * The wage is locked, and this is the share it shows on. A word room prints
   * the strictly lowest step figure on ~20% of offers with a puzzle in them,
   * because a Gallery pays +1 for a minute and a quarter and a Conservatory
   * pays +5 for fourteen minutes. Round 46 measured 19.7% and this round does
   * not move it — the FLOOR below is a floor, not a target, and it exists so
   * that a round which quietly flattened `solvePayout` would be caught here.
   */
  lowestStepsFloor: 0.10,
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

  it('composes the same clauses DraftModal composes', () => {
    // The one thing this file could get wrong and never notice: reading a face
    // the modal does not paint. So the stake half is asserted against the
    // shipped function directly.
    const gallery = deckFor([]).find((c) => c.id === 'gallery')!;
    const label = draftCardStake(gallery, 1)!.label;
    expect(label).toContain('+1 step');
    // Round 49: the prices and the rules of play stay; the mystery's currency
    // comes off. `page` in any form is what the ruling forbids.
    expect(label).not.toMatch(/page/i);
    expect(faceGains(label).get('steps')).toBe(1);
    expect(faceGains(label).get('pages')).toBeUndefined();
  });

  /**
   * THE INSTRUMENT CHECK for the ruling's gate below — labelled as one, because
   * it is not evidence about the build. It only proves the detector can SEE a
   * page clause, so that "no card prints one" is a finding rather than a
   * silence. (The evidence that the detector fires on a real build is the
   * previous commit, where it would have found one on thousands of offers.)
   */
  it('the page-clause detector can find a page clause', () => {
    const faked = faceGains('a long sit · +5 steps · +1 page · +1 key on solve');
    expect(faked.get('pages')).toBe(1);
    expect(offerPrintsPage([{ gains: faked } as unknown as FaceCard])).toBe(true);
    expect(offerPrintsPage([{ gains: faceGains('+5 steps') } as unknown as FaceCard]))
      .toBe(false);
  });
});
describe('THE RULING — no card states what a room is worth to the mystery', () => {
  /**
   * ═══ THE GATE (round 49) ══════════════════════════════════════════════════
   *
   * The owner's line, enforced over the whole shipped deck: a card may print
   * what it COSTS and what it PAYS BACK — steps, keys, gems, the door plan, the
   * length — and may not print what it is worth to the book. `pages` is that
   * axis, and it is the axis the page clause registered on.
   *
   * `+1 sealed page` is deliberately a DIFFERENT axis and is deliberately still
   * allowed: it is a violet room's whole mechanical effect and it hands over a
   * document she cannot read, which is a rule of play rather than a valuation.
   * The parser has separated the two since round 46 and the separation is
   * asserted above.
   */
  it('prints no page clause on any card, in any offer, at any tier', () => {
    const offenders: string[] = [];
    for (const { offer } of FACES) {
      for (const c of offer) {
        if ((c.gains.get('pages') ?? 0) > 0) offenders.push(`${c.card.id}@t${c.tier}: ${c.text}`);
      }
    }
    expect(new Set(offenders).size, offenders.slice(0, 3).join(' | '))
      .toBe(WORD_ROOM_FACE_GATE.pageClauses);
    // …and the population is a real deck, not an empty walk agreeing with
    // itself: the same offers DO print steps, keys, gems and sealed pages.
    const axes = new Set<string>();
    for (const { offer } of FACES) for (const c of offer) for (const k of c.gains.keys()) axes.add(k);
    expect([...axes].sort()).toContain('sealed pages');
    expect([...axes].sort()).toContain('keys');
    expect(axes.has('pages')).toBe(false);
  });

  /**
   * ═══ THE RETIRED RATCHET, STILL MEASURED ═════════════════════════════════
   *
   * Printed every run and asserted on only where the assertion is about
   * something other than the clause. `outbid` is the round-46 headline and it
   * is EXPECTED to sit near its pre-round-46 value now — that is the cost of
   * the ruling, published rather than hidden, so the next round to touch the
   * draft face is arguing with a number instead of a memory.
   */
  it('publishes the face numbers the ruling moved, and the one it did not', () => {
    const pool = contested(FACES);
    expect(pool.length).toBeGreaterThan(4000);
    const outbid = outbidRate(FACES);
    // eslint-disable-next-line no-console
    console.log(
      `[round 49 · RATCHET RETIRED] word room OUTBID BY EVERY ASK-NOTHING CARD`
      + ` ${(100 * outbid).toFixed(1)}% of ${pool.length} contested offers`
      + ` (round 46 measured 7.5% WITH the page clause, 11.3% without)`
      + ` · face-bottom against ALL rivals ${(100 * faceBottomRate(FACES)).toFixed(1)}%`
      + ` · a word room prints the lowest step figure on`
      + ` ${(100 * lowestStepsRate(FACES)).toFixed(1)}%`,
    );
    // The only bound left on it, and it is a sanity bound rather than a
    // ratchet: if this ever read 0% or 100% the walk has stopped walking.
    expect(outbid).toBeGreaterThan(0);
    expect(outbid).toBeLessThan(0.5);
  });

  /**
   * ═══ THE NUMBER THE RULING MAY NOT MOVE ══════════════════════════════════
   *
   * **The wage is locked** — a room is paid for the work it asks for (round 22)
   * — so the share of offers where the word game prints the strictly lowest
   * STEP figure is a fact about `solvePayout` and nothing else. Taking a clause
   * off the card must not have touched it, and a later round that flattened the
   * wage would be caught here rather than in a band six files away.
   */
  it('leaves the locked wage exactly where it was: the +1 is still a +1', () => {
    const now = lowestStepsRate(FACES);
    expect(now, `a word room prints the lowest step figure on ${(100 * now).toFixed(1)}%`)
      .toBeGreaterThan(WORD_ROOM_FACE_GATE.lowestStepsFloor);
  });

  /**
   * ═══ AND THE HALF NO CARD COPY CAN PAY, MEASURED RATHER THAN OMITTED ═════
   *
   * Against ALL rivals — word rooms included — the word game is the bottom card
   * on a fifth of offers, and no clause on the face was ever going to change
   * that: it is a Conservatory outbidding a Gallery, which is fourteen minutes
   * of work paid more than a minute and a quarter. Printed so nobody reads the
   * headline as a claim about the wage gap.
   */
  it('records the residue the card cannot pay: word room against word room', () => {
    expect(faceBottomRate(FACES)).toBeGreaterThan(0.05);
  });
});
