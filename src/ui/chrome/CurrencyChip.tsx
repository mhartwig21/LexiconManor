/**
 * CurrencyChip — OWNER: A2 (Economy/Day).
 *
 * One counter in the persistent bar: a shape glyph, a tabular numeral, and its
 * own floating ±N (AAA 11.15). The glyph carries the identity in grayscale
 * (AAA 6.3), the screen-reader unit rides in real text so the polite live
 * region actually has something to announce, and the float speaks the
 * StepMeter's grammar — gains rise in moss, spends fall in soft ink.
 */

import type { ReactNode } from 'react';
import { deltaFloatClass, deltaFloatText, useDeltaFloats } from './useDeltaFloats';

interface Props {
  /** Currency key — becomes the chip modifier class. */
  name: 'gems' | 'keys' | 'bookmarks';
  /** The plain noun, singular and plural ("gem" / "gems") — AAA 11.7. */
  unit: [string, string];
  value: number;
  /** False while a change is bookkeeping rather than something she did. */
  live: boolean;
  /** The shape glyph. */
  children: ReactNode;
}

export default function CurrencyChip({ name, unit, value, live, children }: Props) {
  const floats = useDeltaFloats(value, live);
  const word = value === 1 ? unit[0] : unit[1];

  return (
    <span className={`chr-chip chr-chip--${name}`} role="status" aria-live="polite">
      {children}
      <span className="chr-chip__n tabular-nums">{value}</span>
      <span className="chr-sr"> {word}</span>
      {/* ROUND 26 (COMPREHENSION.md fix 15). The three glyphs are never named
          on screen — one tester worked out gems/keys/bookmarks only by reading
          the accessible text above, and another finished the session believing
          the diamond was a friendship meter. The bar is exactly full at 390 AND
          at 375 (measured: content ends on the right padding at both), so the
          word cannot stand beside the glyph without pushing something off the
          glass. It goes where there IS room and where she is already looking:
          the float. "+1 key" names the chip at the one instant the chip moves,
          and it speaks the step meter's new grammar (a number and its word). */}
      {floats.map((f) => (
        <span key={f.id} className={`chr-float ${deltaFloatClass(f.delta)}`}>
          <span className="chr-float__n tabular-nums">{deltaFloatText(f.delta)}</span>
          <span className="chr-float__why"> {Math.abs(f.delta) === 1 ? unit[0] : unit[1]}</span>
        </span>
      ))}
    </span>
  );
}
