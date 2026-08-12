/**
 * THE OFFER MIX — what CATEGORY the three cards behind a door turn out to be.
 *
 * THE INSTRUMENT THIS PROJECT DID NOT HAVE, and the reason round 36's win came
 * with an unreported bill. It walks a plausible evening on the real grid and,
 * at every door, rolls the offer TWICE from the same stream on the same manor:
 * once as the game deals it, once with `rollCards` given no heading — which is
 * the shipped round-35 draw and therefore the offer before the draft rules
 * existed. The difference between the two IS the rules' effect on the mix, with
 * the trajectory held fixed, and it is what nothing was measuring.
 *
 * Measured at round 36's HEAD it read puzzle −4.65pp and parlor +3.17pp. Round
 * 40 renormalised the rules per category (`drafting.ts categoryNeutral`) and it
 * reads −0.14pp / +0.12pp, the residue being RULE A's pool edit.
 *
 * Run: `npx tsx scripts/offer-mix.ts`
 */

import type { Cell, ManorState, RoomCard, RoomCategory } from '../src/engine/types';
import { deckFor } from '../src/engine/manor/deck';
import { rollCards } from '../src/engine/manor/drafting';
import {
  cellKey, createManor, draftTargets, resolveDoors, sealsItself,
} from '../src/engine/manor/grid';
import { wingCharacterOf } from '../src/engine/manor/wings';
import { isDominated, shapeOf, type CardShape } from '../src/engine/economy/manor-walk';
import { createRng } from '../src/engine/rng';

const CATS: RoomCategory[] = ['puzzle', 'utility', 'parlor', 'mystery'];
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

interface Tally {
  cards: Record<RoomCategory, number>;
  total: number;
  offers: CardShape[][];
}

function emptyTally(): Tally {
  return {
    cards: { puzzle: 0, utility: 0, parlor: 0, mystery: 0 },
    total: 0,
    offers: [],
  };
}

function walk(
  seed: number, rooms: number, deck: readonly RoomCard[],
  useWings: boolean, live_: Tally, silent: Tally,
): void {
  const rng = createRng((seed ^ 0x5eed) >>> 0);
  let manor: ManorState = createManor(seed);
  const path: Cell[] = [{ ...manor.playerCell }];
  for (let i = 0; i < rooms; i++) {
    const targets = draftTargets(manor);
    if (targets.length === 0) break;
    targets.sort((a, b) => (b.cell.row - a.cell.row) || (rng() - 0.5));
    const { dir, cell } = targets[0]!;
    const wings = useWings ? wingCharacterOf(manor) : undefined;
    const cards = rollCards(deck, manor, cell, { gems: 2, declinedLastDraft: [], drawIndex: 0, entryDir: dir, wings });
    // PAIRED: the same door, the same manor, the same stream, rules silent.
    const was = rollCards(deck, manor, cell, { gems: 2, declinedLastDraft: [], drawIndex: 0, wings });
    for (const c of cards) { live_.cards[c.category] += 1; live_.total += 1; }
    live_.offers.push(cards.map((c) => shapeOf(c, dir, manor, cell)));
    for (const c of was) { silent.cards[c.category] += 1; silent.total += 1; }
    silent.offers.push(was.map((c) => shapeOf(c, dir, manor, cell)));
    const live = cards.filter(
      (c) => !sealsItself(resolveDoors(c, dir, manor, cell), dir, manor, cell),
    );
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
    path.push({ ...cell });
    while (draftTargets(manor).length === 0 && path.length > 1) {
      path.pop();
      manor = { ...manor, playerCell: { ...path[path.length - 1]! } };
    }
    if (draftTargets(manor).length === 0) break;
  }
}

function measure(useWings: boolean, samples = 3000): [Tally, Tally] {
  const deck = deckFor([]);
  const live = emptyTally();
  const silent = emptyTally();
  for (let seed = 1; seed <= samples; seed++) walk(seed, 7, deck, useWings, live, silent);
  return [live, silent];
}

function report(label: string, t: Tally, ref?: Tally): void {
  const dom = t.offers.filter((o) => isDominated(o)).length / t.offers.length;
  const flat = t.offers.filter(
    (o) => new Set(o.map((c) => c.frontier)).size === 1,
  ).length / t.offers.length;
  console.log(`\n${label} — ${t.total} cards over ${t.offers.length} offers`);
  for (const c of CATS) {
    const share = t.cards[c] / t.total;
    const delta = ref ? `   (${((share - ref.cards[c] / ref.total) * 100 >= 0 ? '+' : '')}${(((share - ref.cards[c] / ref.total)) * 100).toFixed(2)}pp)` : '';
    console.log(`    ${c.padEnd(8)} ${pct(share)}${delta}`);
  }
  console.log(`    dominance ${pct(dom)} · frontier flat ${pct(flat)}`);
}

const [liveOff, silentOff] = measure(false);
report('PAIRED, rules SILENT (no heading = the round-35 draw), wings off', silentOff);
report('PAIRED, LIVE (heading, both round-36 rules), wings off', liveOff, silentOff);

const [liveOn, silentOn] = measure(true);
report('PAIRED, rules SILENT, wings ON', silentOn);
report('PAIRED, LIVE, wings ON', liveOn, silentOn);
