/**
 * DRAFT SHAPE DIAGNOSTIC — REVIEW_AA §5.7 ("make drafting a decision").
 *
 * The review's charge, in numbers: *"7 of 30 cards can ONLY be dead ends and 13
 * can roll one; the manor comes out a corridor… after four drafts both
 * reviewers had a vertical column."* This script is the instrument that
 * measures each half of that sentence off the LIVE deck and the LIVE
 * `rollCards`, so a deck edit moves the numbers instead of the argument.
 *
 * Run: `npx tsx scripts/draft-shape.ts`
 *
 *   (1) DECK GEOMETRY — cards whose every plan is a dead end; plans by shape.
 *   (2) THE OFFER — of the three cards behind a real door, how many keep the
 *       path alive? (0 live = the offer the review is complaining about.)
 *   (3) THE LANDING — the AAA 4.10d rates: share of tier-3-eligible plans that
 *       open north, and share of real offers at (2,5) containing one.
 *   (4) THE FOOTPRINT — walk a plausible player through a whole evening and
 *       measure the manor she ends up with: columns touched, bounding box,
 *       and the share of evenings that end as a one-column chimney.
 */

import type { Cell, Dir, ManorState, RoomCard } from '../src/engine/types';
import { MANOR_COLS } from '../src/engine/types';
import { BASE_DECK, deckFor } from '../src/engine/manor/deck';
import {
  cardOpensOntoSanctum, cellKey, createManor, draftTargets, neighbor, resolveDoors,
  roomAt, sealsItself, SANCTUM_LANDING_MID,
} from '../src/engine/manor/grid';
import { rollCards } from '../src/engine/manor/drafting';
import { wingCharacterOf, wingOf, WING_NAMES } from '../src/engine/manor/wings';
import {
  DOMINANCE_GATE, isDominated, shapeOf, type CardShape,
} from '../src/engine/economy/manor-walk';
import {
  PROFILE_DECENT, PROFILE_SKILLED, simulateDays,
} from '../src/engine/economy/simulate';
import { createRng } from '../src/engine/rng';

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// ── (1) deck geometry ──────────────────────────────────────────────────────
function shapeName(layout: readonly Dir[]): string {
  const key = [...layout].sort().join('');
  return ({
    N: 'dead-end', NS: 'corridor', EN: 'corner-L', NW: 'corner-R',
    ENW: 'tee', ENS: 'fork-L', NSW: 'fork-R', ENSW: 'cross',
  } as Record<string, string>)[key] ?? key;
}

function deckGeometry() {
  const deck = BASE_DECK;
  const pureDeadEnds = deck.filter((c) => c.doorLayouts.every((l) => l.length === 1));
  const canRoll = deck.filter((c) => c.doorLayouts.some((l) => l.length === 1));
  const shapes = new Map<string, number>();
  let plans = 0;
  for (const c of deck) {
    for (const l of c.doorLayouts) {
      plans += 1;
      shapes.set(shapeName(l), (shapes.get(shapeName(l)) ?? 0) + 1);
    }
  }
  console.log(`(1) DECK GEOMETRY — ${deck.length} cards, ${plans} plans`);
  console.log(`    cards that can ONLY be dead ends : ${pureDeadEnds.length}  [${pureDeadEnds.map((c) => c.id).join(', ')}]`);
  console.log(`    cards that can ROLL a dead end   : ${canRoll.length}`);
  const deadPlans = shapes.get('dead-end') ?? 0;
  console.log(`    dead-end plans / all plans       : ${deadPlans}/${plans} = ${pct(deadPlans / plans)}`);
  console.log(`    plans by shape                   : ${[...shapes].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
}

// ── a plausible evening: a walker that prefers to climb ────────────────────
interface WalkResult {
  manor: ManorState;
  offers: number[];         // live-card count per offer seen
  shapes: number[];         // distinct post-rotation door-sets per offer
  /** Both dominance axes, per card, per offer (engine/economy/manor-walk.ts). */
  cardShapes: CardShape[][];
  rooms: number;
}

function walkAnEvening(
  seed: number, rooms: number, deck: readonly RoomCard[], useWings: boolean,
): WalkResult {
  const rng = createRng((seed ^ 0x5eed) >>> 0);
  let manor = createManor(seed);
  const offers: number[] = [];
  const shapesPerOffer: number[] = [];
  const cardShapes: CardShape[][] = [];
  const path: Cell[] = [{ ...manor.playerCell }];
  let placed = 0;
  for (let i = 0; i < rooms; i++) {
    const targets = draftTargets(manor);
    if (targets.length === 0) break;
    // She prefers a door that climbs; among equals, a coin.
    targets.sort((a, b) => (b.cell.row - a.cell.row) || (rng() - 0.5));
    const { dir, cell } = targets[0]!;
    const cards = rollCards(deck, manor, cell, {
      gems: 2, declinedLastDraft: [], drawIndex: 0, entryDir: dir,
      wings: useWings ? wingCharacterOf(manor) : undefined,
    });
    const live = cards.filter(
      (c) => !sealsItself(resolveDoors(c, dir, manor, cell), dir, manor, cell),
    );
    offers.push(live.length);
    shapesPerOffer.push(
      new Set(cards.map((c) => resolveDoors(c, dir, manor, cell).join(''))).size,
    );
    cardShapes.push(cards.map((c) => shapeOf(c, dir, manor, cell)));
    // She takes a live card when one is offered (the card face tells her).
    const pick = live.length > 0 ? live[Math.floor(rng() * live.length)]! : cards[0]!;
    const doors = resolveDoors(pick, dir, manor, cell);
    manor = {
      ...manor,
      rooms: {
        ...manor.rooms,
        [cellKey(cell)]: {
          cardId: pick.id, cell, doors, solved: true,
          kind: (pick.puzzleKind ?? pick.category) as never,
        },
      },
      playerCell: { ...cell },
    };
    placed += 1;
    path.push({ ...cell });
    // A sealed room costs her the walk BACK DOWN THE PATH SHE CAME — steps are
    // the whole economy, so she retreats one room at a time to the nearest door
    // she can still open, never teleports to the far side of the house. (This
    // is the modelling choice that decides whether a chimney shows up at all:
    // an evening that can re-enter the Entrance Hall for free spreads sideways
    // for free, and no reviewer's evening did.)
    while (draftTargets(manor).length === 0 && path.length > 1) {
      path.pop();
      manor = { ...manor, playerCell: { ...path[path.length - 1]! } };
    }
    if (draftTargets(manor).length === 0) break;
  }
  return { manor, offers, shapes: shapesPerOffer, cardShapes, rooms: placed };
}

function offerAndFootprint(
  deck: readonly RoomCard[], useWings: boolean, samples = 1200, roomsPerDay = 7,
) {
  const liveHist = [0, 0, 0, 0];
  const shapeHist = [0, 0, 0, 0];
  let offerCount = 0;
  const allShapes: CardShape[][] = [];
  const widths: number[] = [];
  const aspects: number[] = [];
  let chimneys = 0;
  let sealed = 0;
  let placements = 0;
  for (let seed = 1; seed <= samples; seed++) {
    const walked = walkAnEvening(seed, roomsPerDay, deck, useWings);
    const { manor, offers, shapes } = walked;
    for (const n of offers) { liveHist[Math.min(3, n)]! += 1; offerCount += 1; }
    for (const n of shapes) shapeHist[Math.min(3, n)]! += 1;
    for (const o of walked.cardShapes) allShapes.push(o);
    const cols = new Set<number>();
    const rowsTouched = new Set<number>();
    for (const r of Object.values(manor.rooms)) {
      if (r.cardId === 'sanctum') continue;
      cols.add(r.cell.col);
      rowsTouched.add(r.cell.row);
      if (r.cardId !== 'entrance-hall') {
        placements += 1;
        // a placed room with no live onward door at all
        const onward = r.doors.filter((d) => {
          const n = neighbor(r.cell, d);
          if (!n) return false;
          const there = roomAt(manor, n);
          return !there || there.doors.includes(({ N: 'S', S: 'N', E: 'W', W: 'E' } as Record<Dir, Dir>)[d]);
        });
        if (onward.length <= 1) sealed += 1;
      }
    }
    widths.push(cols.size);
    aspects.push(cols.size / Math.max(1, rowsTouched.size));
    if (cols.size <= 1) chimneys += 1;
  }
  widths.sort((a, b) => a - b);
  console.log(`\n(2) THE OFFER — live (non-sealing) cards per 3-card offer, ${offerCount} real offers` +
    `  [wings ${useWings ? 'ON' : 'off'}]`);
  for (let n = 0; n <= 3; n++) {
    console.log(`    ${n} live card${n === 1 ? ' ' : 's'} : ${pct(liveHist[n]! / offerCount)}`);
  }
  console.log(`    >=2 non-sealing cards (the RETIRED headline): ${pct((liveHist[2]! + liveHist[3]!) / offerCount)}`);
  console.log(`    offers whose 3 plans are all the SAME shape: ${pct(shapeHist[1]! / offerCount)}` +
    `  ·  3 distinct shapes: ${pct(shapeHist[3]! / offerCount)}`);
  reportDominance(allShapes, `walker, wings ${useWings ? 'ON' : 'off'}`);
  console.log(`\n(4) THE FOOTPRINT — ${samples} evenings of ${roomsPerDay} drafts`);
  console.log(`    columns touched: median ${widths[Math.floor(widths.length / 2)]}  mean ${(widths.reduce((a, b) => a + b, 0) / widths.length).toFixed(2)}  max ${widths[widths.length - 1]}`);
  console.log(`    width/height of the footprint: mean ${(aspects.reduce((a, b) => a + b, 0) / aspects.length).toFixed(2)}`);
  console.log(`    evenings that end a ONE-COLUMN CHIMNEY: ${pct(chimneys / samples)}`);
  console.log(`    placed rooms with no onward door at all: ${pct(sealed / placements)}`);
}

// ── (3) the landing (AAA 4.10d) ────────────────────────────────────────────
function landingRates(deck: readonly RoomCard[], samples = 4000) {
  const entry: Dir = 'N';
  const eligible = deck.filter((c) => c.tierRange[0] <= 3 && 3 <= c.tierRange[1]);
  // per-PLAN rate, over the real layout hash across many days
  let plans = 0;
  let opens = 0;
  for (let seed = 0; seed < 600; seed++) {
    const m = createManor(seed);
    for (const c of eligible) {
      plans += 1;
      if (cardOpensOntoSanctum(c, entry, m, SANCTUM_LANDING_MID)) opens += 1;
    }
  }
  let offers = 0;
  let withNorth = 0;
  for (let seed = 0; seed < samples; seed++) {
    const m = createManor(seed);
    const cards = rollCards(deck, m, SANCTUM_LANDING_MID, {
      gems: 2, declinedLastDraft: [], drawIndex: 0, entryDir: entry,
    });
    offers += 1;
    if (cards.some((c) => cardOpensOntoSanctum(c, entry, m, SANCTUM_LANDING_MID))) withNorth += 1;
  }
  console.log(`\n(3) THE LANDING (AAA 4.10d) — entered from below, ${eligible.length} tier-3-eligible cards`);
  console.log(`    plans that open north (per card-day) : ${pct(opens / plans)}   [published 27.7%]`);
  console.log(`    bare offers containing one           : ${pct(withNorth / offers)}   [round 13: 60.8% · round 35: 63.4% · round 36: 71.2%]`);
}

// ── (5) wings ──────────────────────────────────────────────────────────────
function wingSanity() {
  const cols: number[] = [];
  for (let c = 0; c < MANOR_COLS; c++) cols.push(c);
  console.log(`\n(5) WINGS — ${cols.map((c) => `col ${c} → ${WING_NAMES[wingOf(c)]}`).join(' · ')}`);
}

// ── (2b) THE DOMINANCE RATE — what replaced "79.2% of offers have a real
// choice" (round 24) ───────────────────────────────────────────────────────
//
// THE OLD HEADLINE DID NOT MEASURE WHAT ITS NAME SAID. It was
// `(liveHist[2] + liveHist[3]) / offerCount`, where "live" meant only
// `!sealsItself(...)` — the share of offers holding two or more cards that do
// not INSTANTLY wall you in. Three identical corridors score 3 and counted as
// "a real choice". It never once asked whether the three cards DIFFER, which is
// the entire question REVIEW_AA §5.7 asks.
//
// The dominance rate asks it. A card weakly dominates when it is >= every other
// card on BOTH axes the game prints on its face — FRONTIER (onward doors into
// empty cells, post-rotation, `resolveDoors`) and STEPS (what the room can pay,
// `solvePayout` / `UTILITY_EFFECTS`). An offer holding such a card has a right
// answer written on it; 1 − dominance is the share of offers where she has to
// give something up.
//
// The permutation NULL beside it is the scale: pair each offer's frontier
// vector with a DIFFERENT offer's step vector, and any correlation between
// "keeps the house open" and "pays well" is destroyed by construction. A deck
// whose real rate sits at or above its own null is a deck that pairs the two —
// i.e. one where the geometry decision and the economy decision are the same
// decision, and only one of them is really being made.
function reportDominance(offers: CardShape[][], label: string) {
  if (offers.length === 0) return;
  const real = offers.filter((o) => isDominated(o)).length / offers.length;
  const rng = createRng(0xd01a);
  const order = offers.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = order[i]!; order[i] = order[j]!; order[j] = t;
  }
  let nullHits = 0;
  for (let i = 0; i < offers.length; i++) {
    const frontierFrom = offers[i]!;
    const stepsFrom = offers[order[i]!]!;
    const n = Math.min(frontierFrom.length, stepsFrom.length);
    const mixed: CardShape[] = [];
    for (let k = 0; k < n; k++) mixed.push({ ...frontierFrom[k]!, steps: stepsFrom[k]!.steps });
    if (isDominated(mixed)) nullHits += 1;
  }
  const spreadZero = offers.filter(
    (o) => new Set(o.map((c) => c.frontier)).size === 1,
  ).length / offers.length;
  const oneCategory = offers.filter(
    (o) => new Set(o.map((c) => c.card.category)).size === 1,
  ).length / offers.length;
  console.log(`\n(2b) THE DOMINANCE RATE [${label}] — ${offers.length} offers`);
  console.log(`    a card weakly dominates on BOTH axes : ${pct(real)}` +
    `   [target <${pct(DOMINANCE_GATE.target)} · ratchet <=${pct(DOMINANCE_GATE.ratchet)}]`);
  console.log(`    permutation null (axes re-paired)    : ${pct(nullHits / offers.length)}`);
  console.log(`    frontier spread is ZERO              : ${pct(spreadZero)}`);
  console.log(`    all three cards ONE category         : ${pct(oneCategory)}`);
}

// ── (2c) …and the same number on the evenings the PLAYER really has. The
// walker above is a climb-preferring probe; `simulateDays` is the day model,
// grid-true since round 24, with its own budget, retreats and preferences. If
// the two disagreed by much, one of them would not be playing this game.
function realPlayDominance() {
  console.log('\n(2c) DOMINANCE ON REAL EVENINGS (simulateDays, grid-true)');
  for (const profile of [PROFILE_DECENT, PROFILE_SKILLED]) {
    const days = simulateDays(profile, 1500, 0xd01a + profile.name.length);
    const offers = days.reduce((t, d) => t + d.offers, 0);
    const dominated = days.reduce((t, d) => t + d.dominatedOffers, 0);
    console.log(`    ${profile.name.padEnd(8)} ${pct(dominated / offers)}   (${offers} offers over 1500 evenings)`);
  }
}

deckGeometry();
offerAndFootprint(deckFor([]), false);
offerAndFootprint(deckFor([]), true);
realPlayDominance();
landingRates(deckFor([]));
wingSanity();
