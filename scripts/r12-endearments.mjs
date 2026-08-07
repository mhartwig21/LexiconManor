/**
 * ROUND 12 — THE ENDEARMENT BUDGET (deferred minor, AAA 5.x voice distinctness).
 *
 * Three of the four speaking characters addressed the player as "dear":
 * Bramble 9, Ellery 12, Posy 14 — 35 vocatives across the cast, all the same
 * word. A term of address is the cheapest and loudest voice marker there is,
 * and when the housekeeper, the ghost librarian and the postmistress all reach
 * for the same one, the cast reads as one writer doing three accents.
 *
 * The budget, one disjoint set per voice:
 *   Mrs. Bramble (housekeeper)  → "pet"
 *   Ellery (ghost librarian)    → "dear"
 *   Posy (postmistress)         → "love", and "dear heart" for the two tender ones
 *   Fern / the Portrait / Dewey → none (already true; Fern's "petal" is a flower)
 *
 * Where a swap would have stacked a tic inside one node, the endearment is
 * dropped instead — the line is usually better without it.
 *
 * Adjectival uses are NOT endearments and are left alone:
 *   Ellery "every rule of conservation I hold dear"
 *   Posy   "You're becoming rather dear to this household" and the graph pun
 *          "Everything's pointing up and to the dear" that it sets up
 *   Posy   "wrapped in love", "we love him anyway"
 *   Posy   "One step for a pet" (petting the cat)
 *
 * Run: node scripts/r12-endearments.mjs   (idempotent-checked: it asserts each
 * `from` appears exactly once, so a second run fails loudly rather than
 * silently no-opping.)
 */

import { readFileSync, writeFileSync } from 'node:fs';

const EDITS = {
  'content/authored/dialogue/bramble.json': [
    // "dear" → "pet" (her word)
    ['You’ll get used to it, dear.', 'You’ll get used to it, pet.'],
    ['Shelves hold grudges, dear, but', 'Shelves hold grudges, pet, but'],
    ['Open, dear. I dusted past', 'Open, pet. I dusted past'],
    ['That’s not comfort, dear, that’s policy.', 'That’s not comfort, pet, that’s policy.'],
    ['Timing, dear, is everything in this house.', 'Timing, pet, is everything in this house.'],
    ['knock twice and bring a bucket, there’s a dear.', 'knock twice and bring a bucket, pet.'],
    // "love" is Posy's; this one is Bramble's warmest line, so it takes hers.
    ['Put it in your journal, love.', 'Put it in your journal, pet.'],
    // dropped rather than swapped — two "pet"s would have landed in one breath
    ['You’re doing the very same face, dear.', 'You’re doing the very same face.'],
    ['Those paths tangle when you’re tired, dear — they comb out easy',
      'Those paths tangle when you’re tired — they comb out easy'],
    ['which is odd, dear, because the east windows', 'which is odd, because the east windows'],
  ],

  'content/authored/dialogue/posy.json': [
    // "dear" → "love" (hers, and it already lives in her vocabulary)
    ['Both count as settling in, dear.', 'Both count as settling in, love.'],
    ['Keep writing, dear.', 'Keep writing, love.'],
    ['Fifty years at this counter, dear, and I know clean work',
      'Fifty years at this counter, love, and I know clean work'],
    ['except to say: sit down, dear.', 'except to say: sit down, love.'],
    ['You’re franked, dear — official', 'You’re franked, love — official'],
    ['No pressure, dear. Well — postal pressure.', 'No pressure, love. Well — postal pressure.'],
    ['that’s what the guess is, dear, a reply', 'that’s what the guess is, love, a reply'],
    ['Off you go, dear.', 'Off you go, love.'],
    ['Unfinished isn’t undelivered, dear.', 'Unfinished isn’t undelivered, love.'],
    ['Yours gets thicker by the week, dear.', 'Yours gets thicker by the week, love.'],
    ['Nothing’s lost here, dear.', 'Nothing’s lost here, love.'],
    // dropped: a second address in the same node, and one node that already
    // plays "love" three times as a noun.
    ['Redraft, dear. The best correspondents', 'Redraft. The best correspondents'],
    ['Empires of correspondence, dear, held together by string',
      'Empires of correspondence, held together by string'],
  ],

  // Ellery is unchanged: "dear" is now hers alone.
};

let total = 0;
for (const [file, edits] of Object.entries(EDITS)) {
  let text = readFileSync(file, 'utf-8');
  for (const [from, to] of edits) {
    const n = text.split(from).length - 1;
    if (n !== 1) {
      console.error(`✗ ${file}: expected 1 match, found ${n} for:\n    ${from}`);
      process.exit(1);
    }
    text = text.replace(from, to);
    total++;
  }
  JSON.parse(text); // still valid JSON before it touches disk
  writeFileSync(file, text);
  console.log(`✓ ${file}: ${edits.length} edits`);
}
console.log(`${total} endearments rebalanced.`);
