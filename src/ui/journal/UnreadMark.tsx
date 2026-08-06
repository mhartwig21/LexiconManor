/**
 * UnreadMark — the one wax marker for "there is something here you have not
 * looked at". OWNER: A7 (Mystery). New file on purpose: it is used by the
 * journal AND by the blueprint footer's Journal entrance, and blueprint.css is
 * A1's, so it ships its own unread.css (conflict rule 3) off tokens only.
 *
 * The chain it serves (AAA 11.19): entrance affordance → tab → item. All three
 * levels use this component, fed by the same `journalUnread` derivation, so
 * they cannot disagree.
 *
 * Double-encoding (AAA 11.22 / 6.3): the mark is never hue alone. It is a
 * filled disc in a place nothing else occupies — pinned to the host's top-right
 * corner, or inline immediately after the label — and at the entrance it prints
 * the exact count, a numeral being about as un-hue as an encoding gets. A
 * grayscale screenshot still shows a dark pip with a light "3" in it.
 *
 * Reduced motion (AAA 11.22 / U.3): the mark has no animation at all in any
 * state, so there is nothing for `prefers-reduced-motion` to strip. It does not
 * pulse, fade in, or bounce — it is simply there, or simply not.
 */

import './unread.css';

export interface UnreadMarkProps {
  /** How many unviewed items sit behind this affordance. 0 renders nothing. */
  count: number;
  /** Plural noun for the screen reader: "3 unread fragments". */
  noun: string;
  /** Pin to the host's top-right corner; the host needs `.unread-host`. */
  corner?: boolean;
  /** Print the exact count inside the mark (AAA 11.21 — never an estimate). */
  showCount?: boolean;
}

/**
 * The item-level link in the chain (AAA 11.19): one pip on one unread thing.
 * Same class, therefore the same wax, size, rim and rules as the levels above
 * it — the player learns the mark once.
 */
export function UnreadPip({ label = 'not yet read' }: { label?: string }) {
  return <span className="unread unread--pip" role="img" aria-label={label} />;
}

export default function UnreadMark({ count, noun, corner = false, showCount = false }: UnreadMarkProps) {
  // Truthful in both directions (AAA 11.21): no mark when nothing is unread.
  if (count <= 0) return null;
  return (
    <span
      className={`unread${corner ? ' unread--corner' : ''}${showCount ? ' unread--count' : ''}`}
      role="img"
      aria-label={`${count} unread ${noun}`}
    >
      {showCount && <span className="unread__n" aria-hidden>{count}</span>}
    </span>
  );
}
