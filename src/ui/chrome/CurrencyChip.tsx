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
      {floats.map((f) => (
        <span key={f.id} className={`chr-float ${deltaFloatClass(f.delta)}`}>
          {deltaFloatText(f.delta)}
        </span>
      ))}
    </span>
  );
}
