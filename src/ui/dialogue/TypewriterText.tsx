/**
 * TypewriterText — OWNER: A6 (Dialogue).
 *
 * Hades-feel reveal at 50 cps (inside the 40–60 band, AAA 5.10). Tap handling
 * lives in the parent: pass `instant` to complete the current line at once.
 * Reduced motion (store setting or OS preference) renders text immediately —
 * the pacing tap flow stays identical, only the animation is stripped.
 *
 * Performance contract (AAA 9.6): the reveal is ONE rAF loop that computes
 * characters-shown from elapsed time and writes `textContent` on a span ref
 * directly — one text-node mutation per frame, zero React renders per
 * character. React state commits exactly once, at line completion (to drop
 * the caret and notify the parent). Because the reveal is time-derived, the
 * delivered cps stays accurate under Low Power Mode's 30fps rAF (AAA 9.3)
 * instead of silently halving the authored speed.
 *
 * Layout contract: the component renders the full line twice — an invisible
 * `ghost` that reserves the finished line's exact height, and a `live` overlay
 * the reveal writes into. That lets the dialogue box be CONTENT-FIT (no more
 * fixed 7.2rem well behind a six-word reaction) while still never reflowing
 * mid-reveal.
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
  const skipAll = !!(instant || reducedMotion);
  const spanRef = useRef<HTMLSpanElement>(null);
  const [complete, setComplete] = useState(skipAll);
  const doneRef = useRef(false);
  // Keep the latest onDone without retriggering the reveal effect.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const span = spanRef.current;
    if (!span) return;

    const finish = () => {
      span.textContent = text;
      setComplete(true);           // single React commit per line
      if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current?.();
      }
    };

    if (skipAll) {
      finish();
      return;
    }

    // Fresh line: reset the imperative reveal (the parent keys this component
    // per line, but stay correct even if `text` changes in place).
    doneRef.current = false;
    setComplete(false);
    span.textContent = '';
    let raf = 0;
    const start = performance.now();
    let shown = -1;
    const tick = (now: number) => {
      const target = Math.min(text.length, Math.floor(((now - start) / 1000) * TYPEWRITER_CPS));
      if (target !== shown) {
        shown = target;
        span.textContent = text.slice(0, shown);
      }
      if (shown >= text.length) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, skipAll]);

  // The box fits its CONTENT (a one-line reaction no longer sits in a
  // 7.2rem well of blank paper) WITHOUT reflowing while the line types: the
  // ghost copy is the full text, laid out and invisible, so it claims the
  // final height on the first frame; the live copy is painted over it and
  // grows inside a box that never moves. One element pair, no measurement,
  // no ResizeObserver.
  return (
    <p className={className} aria-label={text}>
      <span className="dlg-tw" aria-hidden="true">
        <span className="dlg-tw__ghost">{text}</span>
        <span className="dlg-tw__live">
          <span ref={spanRef} />
          {!complete && <span className="dlg-caret" />}
        </span>
      </span>
    </p>
  );
}
