/**
 * Which of the cast keeps each parlor room (MANOR_DESIGN §8 haunts).
 *
 * This table used to live inline in `pages/ManorPage.tsx` behind a
 * `?? 'bramble'` fallback. That fallback was a landmine: Bramble authors ZERO
 * `parlor` nodes (43 morning, 11 idle), so any parlor card missing from the
 * table routed the player to the one host who has nothing to say in a parlor.
 * `selectDialogue`'s never-silence rule caught it (the visit falls back to her
 * idle pool), so it degraded rather than crashing — but the bespoke scene the
 * card promises was silently never written. Same defect shape as the
 * Portrait's unmounted haunt (round-5 finding 1), one layer quieter.
 *
 * It lives in the engine now so `tests/dialogue-mounts.test.ts` can pin
 * exhaustiveness without pulling React in: every `category: 'parlor'` card in
 * the deck must name a host, and every host named must have SOMETHING to say
 * when stood in front of. A new parlor card fails the suite, not the player.
 *
 * KNOWN GAP (round 6): 'morning-room' → bramble is the one entry riding the
 * idle fallback rather than authored `parlor` nodes. Her tea scene belongs in
 * the morning slot, so the Morning Room is arguably mis-cast; either give her
 * a parlor pool or re-host the card.
 */

import type { CharacterId } from '../types';

export const PARLOR_HOSTS: Readonly<Record<string, CharacterId>> = {
  'reading-nook': 'ellery',   // Ellery haunts the reading rooms
  'drawing-room': 'ellery',
  'post-room': 'posy',        // the postmistress
  'greenhouse': 'fern',       // the groundskeeper
  'morning-room': 'bramble',  // tea, of course
};

/**
 * The character standing in this parlor, or null if nobody is.
 *
 * Null is deliberate — a parlor with no registered host offers no visit at
 * all, which is quiet and correct, rather than opening a scene with no lines
 * in it. The test above is what stops null ever being reachable in practice.
 */
export function parlorHostFor(cardId: string): CharacterId | null {
  return PARLOR_HOSTS[cardId] ?? null;
}
