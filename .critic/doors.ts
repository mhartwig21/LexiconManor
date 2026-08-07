import { BASE_DECK, deckFor } from '../src/engine/manor/deck';
import { categoryWeight, RARITY_WEIGHTS, rollCards } from '../src/engine/manor/drafting';
import { createManor, rowTier, SANCTUM_DOOR_CELL, resolveDoors, cellKey } from '../src/engine/manor/grid';

const row0 = SANCTUM_DOOR_CELL.row;
const tier = rowTier(row0);
console.log('landing cell', SANCTUM_DOOR_CELL, 'tier', tier);

// A) weighted share of eligible cards whose placement (entered from the south, entryDir 'N') has a north door
for (const entryDir of ['N','E','W'] as const) {
  let w=0, wN=0;
  for (let seed=0; seed<400; seed++){
    const manor = createManor(seed);
    for (const card of BASE_DECK) {
      if (card.tierRange[0] > tier || tier > card.tierRange[1]) continue;
      const weight = categoryWeight(card.category, row0) * RARITY_WEIGHTS[tier][card.rarity];
      const doors = resolveDoors(card, entryDir, manor, SANCTUM_DOOR_CELL);
      w += weight;
      if (doors.includes('N')) wN += weight;
    }
  }
  console.log(`entryDir ${entryDir}: P(north door) = ${(100*wN/w).toFixed(1)}%`);
}

// B) realistic: roll a real 3-card offer at the landing, ask if ANY offered card gives a north door
let anyN=0, trials=0, bestPick=0;
const deck = deckFor([]);
for (let seed=0; seed<3000; seed++){
  const manor = createManor(seed);
  const cards = rollCards(deck, manor, SANCTUM_DOOR_CELL, { gems: 2, declinedLastDraft: [], drawIndex: 0, keyAccess: 1 });
  trials++;
  const withN = cards.filter(c => resolveDoors(c, 'N', manor, SANCTUM_DOOR_CELL).includes('N'));
  if (withN.length>0) anyN++;
  bestPick += withN.length / cards.length;
}
console.log(`\nreal 3-card offer at the landing (entered from below): at least one card opens north on ${(100*anyN/trials).toFixed(1)}% of offers; mean share of the offer that does = ${(100*bestPick/trials).toFixed(1)}%`);
