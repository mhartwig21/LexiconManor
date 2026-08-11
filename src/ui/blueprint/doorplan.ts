/**
 * The door plan, in words — OWNER: A1 (Manor). Pure TS, no React.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * COMPREHENSION wrong-belief 7, the most expensive one in the blind-play test
 * and the only item on that list a round had never been given a number for:
 *
 *   *"'Anchor' rooms are the ones you can keep building upward from; micro
 *    rooms dead-end you."* — held confidently, and false.
 *
 * Onward growth is decided by the DOOR PLAN, which the card has drawn honestly
 * since round 9 (post-rotation, entry wall in gilt) — and drawn ONLY. It was a
 * 32×32px diagram whose sole statement was an `aria-label`, sitting beside a
 * loud bold line of type naming the wrong attribute ("anchor · five minutes or
 * so"). A sighted player reading the card reads that line and nothing else. So
 * the NYT-games player — the owner's wife's persona — chose on `anchor` for two
 * consecutive days, dead-ended both climbs, and answered the "what did you
 * never figure out at all" question with: *"How to get upstairs. That's the
 * whole game and I never cracked it."*
 *
 * BENCHMARKS §4 (Blue Prince) is the spec: its draft is a decision because the
 * three plans differ in shape and the shape is legible before the tap. Ours had
 * the shape and hid it in an icon. This says it in the house's register, in
 * type of the same weight as the line that was misleading her, and it is
 * derived from `onwardDoors` — the same function `sealsItself` is now defined
 * as the zero of, and the same one the slice places with — so the sentence, the
 * gilt sealing stamp and the room that actually gets laid cannot disagree.
 *
 * NOT a tutorial: COMPREHENSION's standing rule is that this game withholds the
 * word, the definition and what is at the top, and states its PRICES and its
 * RULES OF PLAY. Which doors a plan leaves you is a rule of play.
 */

import type { Dir } from '../../engine/types';

/** Compass words, shared with the diagram's accessible name. */
export const DIR_WORDS: Record<Dir, string> = {
  N: 'north', E: 'east', S: 'south', W: 'west',
};

/** "north, east and west" — a list a person would say out loud. */
export function dirList(dirs: readonly Dir[]): string {
  const words = dirs.map((d) => DIR_WORDS[d]);
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

const COUNT_WORD = ['no', 'One', 'Two', 'Three', 'Four'] as const;

/**
 * The card-face sentence for a plan's onward doors.
 *
 *   []            → "A dead end — no way on from here"
 *   ['E']         → "One way on — east"
 *   ['E','W']     → "Two ways on — east and west"
 *
 * The COUNT leads, because the count is the decision (does my climb survive
 * this room?) and a direction is only useful once she has decided to take it.
 */
export function doorPlanWords(onward: readonly Dir[]): string {
  if (onward.length === 0) return 'A dead end — no way on from here';
  const n = COUNT_WORD[Math.min(onward.length, COUNT_WORD.length - 1)];
  return `${n} way${onward.length === 1 ? '' : 's'} on — ${dirList(onward)}`;
}
