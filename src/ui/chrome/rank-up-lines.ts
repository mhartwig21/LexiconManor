/**
 * The instant a friendship deepens — OWNER: A2 (Economy/Day), authored copy.
 *
 * ROUND-6 DEFECT. `adjustAffinity` (app/slices/dialogue.ts) recorded
 * 'affinity-rank-up' and left the celebration to an authored node conditioned
 * on the new band. But the pacing valve (AAA 5.9) spends the one substantive
 * conversation per character per day, and the rank-up almost always happens ON
 * that conversation — most often on the gift at the end of it. So the bespoke
 * scene could not fire until TOMORROW, and the instant itself was one pip
 * quietly lighting on a nameplate she was about to close.
 *
 * This is the acknowledgement AT the instant. AAA 5.7 forbids a generic "+1",
 * so there is no generic line here: every character gets a different gesture at
 * every rank, in their own register, and the mechanical fact (which rank, of
 * how many) is carried by the pips already on the nameplate and by the
 * authored scene that still plays tomorrow. Nothing here consumes a node, sets
 * a flag, or touches `talkedToday` — the valve is untouched and the bespoke
 * scene is not spent, only preceded.
 *
 * Register per character: Bramble is hospitality, Ellery is books and lamps,
 * Posy is post, Fern is the garden and the keys, the Portrait is varnish and
 * long memory. Each is a small ACT, not a statement of feeling — she is told
 * what they did, and infers the warmth.
 *
 * (Coordination: the moment layer, src/ui/moment/*, also maps this event to a
 * campaign seal. These lines are exported as a plain table with no chrome
 * dependency precisely so that layer can import them instead of rolling its
 * own generic title — see SHARED-FILE REQUESTS.)
 */

import type { CharacterId } from '../../engine/types';
import { MAX_AFFINITY_RANK } from '../../engine/dialogue/affinity';

export interface RankUpNotice {
  /** Who — scannable in a one-second glance (AAA 11.7). */
  eyebrow: string;
  /** What they did. Bespoke per character AND per rank (AAA 5.7). */
  line: string;
}

/** Display names, kept local so this table has no cross-agent dependency. */
const NAMES: Record<CharacterId, string> = {
  bramble: 'Mrs. Bramble',
  ellery: 'Ellery',
  posy: 'Posy',
  fern: 'Fern',
  dewey: 'Dewey',
  portrait: 'The Portrait',
};

/** Index 0 is rank 1; there are MAX_AFFINITY_RANK ranks above acquaintance. */
const LINES: Record<CharacterId, readonly string[]> = {
  bramble: [
    'Mrs. Bramble pours a second cup without being asked.',
    'The good saucer appears at your place, and no remark is made about it.',
    'She stops calling it “the house”. Somewhere this week it became “ours”.',
    'The kettle stays warm all day now, on the chance that you come through.',
  ],
  ellery: [
    'Ellery turns the reading lamp a few degrees toward your chair.',
    'He marks his page and leaves the book where you are certain to find it.',
    'He begins a sentence with “you’ll like this—” and, for once, is right.',
    'He gives you the key to his own shelf, and makes no ceremony of it.',
  ],
  posy: [
    'Posy writes your name on the front of the envelope instead of the back.',
    'She starts saving you the stamps with the good birds on them.',
    'She tells you which of the letters she read twice before sending on.',
    'She signs off “yours”, and does not cross it out and start again.',
  ],
  fern: [
    'Fern mentions which door sticks, a good few paces before you reach it.',
    'The better trowel is left on your side of the potting bench.',
    'She tells you what she is putting in for next spring, and why.',
    'She hands you her own ring of keys and says nothing at all about it.',
  ],
  portrait: [
    'The Portrait’s eyes follow you a little less like a warning.',
    'He speaks first, which he has not done since the varnish was wet.',
    'He uses your name. The painted room behind him seems warmer for it.',
    'He stops guarding the word, and begins hoping you are the one to find it.',
  ],
  dewey: [
    'Dewey moves four inches closer, which is the highest honour available.',
    'Dewey chooses your lap over the blueprint, briefly, on his own terms.',
    'Dewey brings you something dreadful and sets it down like a gift.',
    'Dewey sleeps where he can see the door and you at the same time.',
  ],
};

/**
 * The instant acknowledgement for a rank-up, or null if the rank is out of
 * range (never render a half-authored moment).
 */
export function rankUpNotice(character: CharacterId, rank: number): RankUpNotice | null {
  if (!Number.isInteger(rank) || rank < 1 || rank > MAX_AFFINITY_RANK) return null;
  const line = LINES[character]?.[rank - 1];
  if (!line) return null;
  return { eyebrow: NAMES[character] ?? 'Someone', line };
}

/** Every authored line in the table — the string-table lint's entry point. */
export function allRankUpLines(): string[] {
  return Object.values(LINES).flat();
}
