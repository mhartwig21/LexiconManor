/**
 * SealedMark — the smudge marker. OWNER: A7 (Mystery).
 *
 * The other half of the round-12 vocabulary split (engine/journal.ts). Wax says
 * *you have not looked at this*; this says *this page is yours and the hand is
 * not made out yet*. They are different sentences about different things, and
 * for two rounds they wore the same glyph, which is why an unread count could
 * not clear on viewing (AAA 11.20) and could not match the number of unviewed
 * items (11.21).
 *
 * IT IS NOT AN ALERT, IT IS A PROMISE. So it is deliberately quieter than wax:
 * an unbroken seal drawn in ink rather than a filled wax chip, sitting in a
 * corner wax never uses. Nothing about it says "you have missed something" —
 * it says "there is more in here once you finish a room", which is the round-10
 * loop's own invitation.
 *
 * Double-encoding (AAA 11.22 / 6.3), three ways over, so a grayscale
 * screenshot separates the two markers at a glance:
 *   1. FILL — wax is a solid disc; the seal is an open ring with a bar across
 *      it (the unbroken impression). Solid vs outline survives any palette.
 *   2. INK — wax red vs `--ink-soft`. Hue is the encoding we do NOT rely on.
 *   3. PLACE — on a tab, wax pins to the top-right corner and the seal to the
 *      bottom-right, so the two never share a pixel or a reading.
 *
 * Reduced motion (AAA 11.22 / U.3): like `UnreadMark`, it has no animation in
 * any state — there is nothing for `prefers-reduced-motion` to strip.
 */

import './sealed.css';

export interface SealedMarkProps {
  /** How many filed-but-unmade-out pages sit behind this affordance. 0 renders nothing. */
  count: number;
  /** Screen-reader phrase, PLURAL: "3 pages not yet made out". */
  noun?: string;
  /**
   * The SINGULAR of `noun`, for count === 1. ROUND 16 (AAA 11.7/11.19): the
   * tabs passed a hard-coded plural, so at one sealed page the mark announced
   * "1 lines not yet made out". The default pair below always got this right;
   * only an overriding caller could get it wrong, which is why the choice now
   * lives here rather than at four call sites.
   */
  nounSingular?: string;
  /** Pin to the host's bottom-right corner; the host needs `.unread-host`. */
  corner?: boolean;
  /** Print the exact count inside the mark (AAA 11.21 — never an estimate). */
  showCount?: boolean;
}

/**
 * The item-level link in the seal chain: one ring on one smudged page. Same
 * class family as the mark above it, so the player learns the glyph once and
 * reads it identically on a card, on a tab and at the entrance.
 */
export function SealedPip({ label = 'not yet made out' }: { label?: string }) {
  return <span className="sealed sealed--pip" role="img" aria-label={label} />;
}

export default function SealedMark({
  count, noun, nounSingular, corner = false, showCount = false,
}: SealedMarkProps) {
  // Truthful in both directions (AAA 11.21): no mark when nothing is sealed.
  if (count <= 0) return null;
  const phrase = count === 1
    ? (nounSingular ?? noun ?? 'page not yet made out')
    : (noun ?? 'pages not yet made out');
  return (
    <span
      className={`sealed${corner ? ' sealed--corner' : ''}${showCount ? ' sealed--count' : ''}`}
      role="img"
      aria-label={`${count} ${phrase}`}
    >
      {showCount && <span className="sealed__n" aria-hidden>{count}</span>}
    </span>
  );
}
