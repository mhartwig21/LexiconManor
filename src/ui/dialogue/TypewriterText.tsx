/**
 * TypewriterText — OWNER: A6 (Dialogue).
 *
 * Hades-feel reveal at 50 cps (inside the 40–60 band, AAA 5.10). Tap handling
 * lives in the parent: pass `instant` to complete the current line at once.
 * Reduced motion (store setting or OS preference) renders text immediately —
 * the pacing tap flow stays identical, only the animation is stripped.
 */

import { useEffect, useRef, useState } from 'react';

export const TYPEWRITER_CPS = 50;

interface TypewriterTextProps {
  text: string;
  /** Jump to the full line (tap 1 of tap-complete / tap-advance). */
  instant?: boolean;
  reducedMotion?: boolean;
  onDone?: () => void;
  className?: string;
}

export default function TypewriterText({
  text, instant, reducedMotion, onDone, className,
}: TypewriterTextProps) {
  const skipAll = instant || reducedMotion;
  const [shown, setShown] = useState(skipAll ? text.length : 0);
  const doneRef = useRef(false);

  // Restart when the line changes.
  useEffect(() => {
    doneRef.current = false;
    setShown(instant || reducedMotion ? text.length : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on new text only
  }, [text]);

  useEffect(() => {
    if (skipAll) {
      setShown(text.length);
      return;
    }
    if (shown >= text.length) return;
    const id = window.setInterval(() => {
      setShown((n) => Math.min(text.length, n + 1));
    }, 1000 / TYPEWRITER_CPS);
    return () => window.clearInterval(id);
  }, [text, shown, skipAll]);

  useEffect(() => {
    if (shown >= text.length && !doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  }, [shown, text, onDone]);

  const complete = shown >= text.length;
  return (
    <p className={className} aria-label={text}>
      <span aria-hidden="true">{text.slice(0, shown)}</span>
      {!complete && <span className="dlg-caret" aria-hidden="true" />}
    </p>
  );
}
