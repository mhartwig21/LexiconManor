/**
 * The Library's acknowledged-herring sentence. OWNER: A3.
 *
 * Split out of `WordWebView.tsx` in round 12 so the copy can be asserted
 * without mounting React: it is the one line AAA 2.10 [BEAT] is actually
 * about, it is priced at −2 steps, and it had been printing a thread the
 * player was never following (see the `doubled-letter` note below).
 *
 * AAA 2.10 [BEAT] — printed when ≥3 of her four tiles sat inside one planted
 * trap. The bar's own example ("they *do* all rhyme, don't they?") is
 * informative BECAUSE it names the relation; the round-6 line ("They do keep
 * company, don't they? But no.") named neither the words nor the thread, and
 * fired on guesses that had never touched the trap.
 */

import type { WordWebHerringMatch } from '../../../engine/rooms/adapters/word-web';

/** "an R", "a B" — by the letter's spoken name, not its spelling. */
export function anArticle(letter: string): string {
  return 'AEFHILMNORSX'.includes(letter) ? 'an' : 'a';
}

export function herringLine(h: WordWebHerringMatch): string {
  // Naming all four by name overflows the reserved slot at 390px, and when all
  // four ARE the trap the count says it better anyway.
  const subject = h.matched.length >= 4 ? 'All four of these' : h.matched.join(', ');
  switch (h.relation) {
    case 'rhyme':
      return `${subject} do rhyme. But no.`;
    case 'shared-affix':
      return h.detail
        ? `${subject} carry “${h.detail}”. But no.`
        : `${subject} share their letters. But no.`;
    case 'hidden-string':
      // Round 11: the cross-category trap gets its own sentence. It is not
      // "these share an edge" — it is "this one is hiding your group inside
      // it", which is the actual thing she nearly deduced.
      return h.detail
        ? `${subject} hide “${h.detail}”. But no.`
        : `${subject} hide the same letters. But no.`;
    case 'doubled-letter':
      /**
       * ROUND 12 — NAME THE LETTER. The generator used to bucket every word
       * containing any doubled letter into one relation, so this line went out
       * as "CURRENT, FURROW, KEEP double a letter" — a property roughly a
       * third of English has, and a grouping no Connections player has ever
       * chased. 52 of the 55 shipped doubled-letter traps had NO doubled
       * letter in common (web-2's ran CHILLY/GIRAFFE/MILLER/STAFF/THRILL/
       * WILLOW), so a −2-step guess bought noise dressed as an insight: the
       * round-6 misinformation defect wearing a tighter gate. The trap must
       * share the SAME pair now and carries it, so the room names a thread she
       * could genuinely have been following and can check on the tiles.
       */
      return h.detail
        ? `${subject} all double ${anArticle(h.detail[0]!)} ${h.detail[0]}. But no.`
        : `${subject} double the same letter. But no.`;
    case 'semantic':
      return `${subject} keep company. But no.`;
  }
}
