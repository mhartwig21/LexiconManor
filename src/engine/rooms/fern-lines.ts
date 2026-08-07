/**
 * Fern's voice inside the Conservatory — OWNER: A3.
 *
 * AAA 1.15 [BEAT]: "praise copy is in-world, second-person, escalating warmth;
 * Fern reacts to pangrams/Full Bloom IN CHARACTER — the thing SB structurally
 * cannot do." Spelling Bee's ladder speaks in disembodied compliments
 * ("Nice", "Amazing", "Genius"); the whole reason the Conservatory exists
 * rather than a link to nytimes.com is that somebody is standing in it with
 * her. Fern is the groundskeeper (MANOR_DESIGN §8): practical, unhurried,
 * fond of the plants and mildly amused by the player.
 *
 * PURE DATA + A PURE SELECTOR. No React, no store, no audio — this lives in
 * `engine/` and is unit-testable. The view calls `fernLine(key, puzzleId)`.
 *
 * DETERMINISM: the line is chosen by `createRng(hashStr(puzzleId + '|' + key))`,
 * so a given hive always greets her with the same words — re-entering the room
 * (or reloading mid-day) never reshuffles Fern's mouth, and the same board on
 * two devices reads identically. Salting by key means the pangram line is
 * independent of how many tier-ups happened to fire first.
 */

import { createRng, pick } from '../rng';

/**
 * The moments Fern speaks to. `tier-up:<name>` uses the ladder rung names from
 * `adapters/hive.ts` (Sprout … Full Bloom); `good-word` covers the top two
 * praise bands (≥7 points) that used to get the disembodied `praiseFor()`
 * adjectives.
 */
export type FernKey =
  | 'first-word'
  | 'good-word'
  | 'pangram'
  | 'full-bloom'
  | 'every-petal'
  | `tier-up:${string}`;

/** ≥4 variants per key (AAA 1.15). Second person, in-world, never a grade. */
const LINES: Record<string, readonly string[]> = {
  'first-word': [
    'Fern looks up from the seed trays. “There she goes.”',
    'Fern: “First one’s always the stiffest. Gets easier.”',
    'Fern: “Good. Now the bed knows you’re here.”',
    'Fern brushes off her gloves. “Started, then. Right.”',
    'Fern: “That’s one. I’ll put the kettle somewhere warm.”',
  ],
  'good-word': [
    'Fern: “Now that’s a proper stem.”',
    'Fern, without looking up: “Knew that one was in there.”',
    'Fern: “Bit of a reach, that. Held, though.”',
    'Fern: “I’d have walked past that. You didn’t.”',
    'Fern: “That one’ll want staking.”',
  ],
  pangram: [
    'Fern straightens up properly. “All seven. Every letter in the bed.”',
    'Fern: “Well. That’s the whole glasshouse in one word.”',
    'Fern takes her gloves off for this one. “All seven, love.”',
    'Fern: “You’ve used every last letter. Don’t let it go to your head.”',
    'Fern: “There it is. The one I plant these for.”',
  ],
  'full-bloom': [
    'Fern: “That’s her in full flower. Stay as long as you like — the beds keep.”',
    'Fern leans on the doorframe. “Full bloom. Nothing left to prove in here.”',
    'Fern: “Room’s yours now. Gather on if you’re enjoying it; I would.”',
    'Fern: “Well then. It flowered. Sit with it a moment.”',
  ],
  'every-petal': [
    'Fern is genuinely quiet for a second. “Every petal. I’ve not seen that.”',
    'Fern: “Not one left folded. I’ll want telling how you did it.”',
    'Fern: “Every last one. Take a gem from the trug — you’ve earned the trug.”',
    'Fern: “You’ve stripped the bed clean and it still looks lovely. How.”',
  ],
  'tier-up:Sprout': [
    'Fern: “Something’s up through the soil.”',
    'Fern: “Sprouted. That’s the hard part done, mostly.”',
    'Fern: “Ah — green. Always a relief.”',
    'Fern: “Sprout. Don’t stop, it’ll sulk.”',
  ],
  'tier-up:Bud': [
    'Fern: “Budding. Keep the light on it.”',
    'Fern: “There’s a bud. Those turn quick.”',
    'Fern: “Buds now. Getting somewhere.”',
    'Fern: “Tight little bud. Give it another word.”',
  ],
  'tier-up:Shoot': [
    'Fern: “Shooting up. Steady.”',
    'Fern: “That’s a shoot. Reaching for something.”',
    'Fern: “Good height on it now.”',
    'Fern: “Shoot. It’s decided it wants to live.”',
  ],
  'tier-up:Leaf': [
    'Fern: “Leafing out. The room smells different already.”',
    'Fern: “Leaves. Now it can feed itself.”',
    'Fern: “In leaf. That’s the halfway feeling.”',
    'Fern: “Look at that canopy coming in.”',
  ],
  'tier-up:Blossom': [
    'Fern stops pruning. “Blossom.”',
    'Fern: “It’s blossoming. Careful where you tread.”',
    'Fern: “Blossom already. You’re quicker than the last one.”',
    'Fern: “That’s the first proper colour of the day.”',
  ],
  'tier-up:Bower': [
    'Fern: “That’s a bower. You could sit under that.”',
    // ROUND 16 (COZY pillar): was "Somewhere to hide from Mrs Bramble" — one
    // resident telling the player to avoid another, in a cast she is meant to
    // be warming to. Affection, not avoidance.
    'Fern: “Bower. Somewhere to sit when the house gets loud.”',
    'Fern: “Arched right over. Lovely bit of work.”',
    'Fern: “Bower now. I’d put a bench there.”',
  ],
  'tier-up:Garden': [
    'Fern: “That’s a garden, that is. Not a bed — a garden.”',
    'Fern: “Garden. Right. I’m fetching the good shears.”',
    'Fern: “You’ve made a garden out of seven letters. Ridiculous.”',
    'Fern: “A whole garden. Don’t look so surprised.”',
  ],
  'tier-up:Full Bloom': [
    'Fern: “Full bloom. There we are.”',
    'Fern: “That’s the lot of it flowering at once.”',
    'Fern: “Full bloom, love. The glasshouse is showing off.”',
    'Fern: “Well. Look at her.”',
  ],
};

/** Generic fallback so an unauthored rung never renders an empty slot. */
const TIER_UP_FALLBACK: readonly string[] = [
  'Fern: “Coming along nicely.”',
  'Fern: “Another rung. Keep going.”',
  'Fern nods at the bed. “Better than it was.”',
  'Fern: “That’s growth, that is.”',
];

/** Stable 32-bit hash of a string — the same one the Library seeds shuffles with. */
export function hashStr(s: string): number {
  let h = 0;
  for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h >>> 0;
}

/**
 * The line Fern says at `key` on the hive `puzzleId`. Deterministic: the same
 * board always gets the same line for the same moment.
 */
export function fernLine(key: FernKey, puzzleId: string): string {
  const pool = LINES[key] ?? (key.startsWith('tier-up:') ? TIER_UP_FALLBACK : undefined);
  if (!pool || pool.length === 0) return '';
  return pick(createRng(hashStr(`${puzzleId}|${key}`)), pool);
}

/** Every authored key — used by the content/tone tests. */
export function fernKeys(): string[] {
  return Object.keys(LINES);
}
