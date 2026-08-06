/**
 * useDeltaFloats — OWNER: A2 (Economy/Day).
 *
 * The StepMeter's floating ±N, generalised so EVERY currency the chrome shows
 * can speak the same sentence (AAA 11.15: "a number that changes silently
 * between glances is indistinguishable from a bug"). Steps get theirs from the
 * audited ledger, entry by entry; gems, keys and bookmarks have no ledger, so
 * theirs come from watching the counter itself.
 *
 * Watching the VALUE rather than an emit site is deliberate. The three
 * currencies are written from five different places (manor.ts's utility
 * payouts and key spends, room.ts's reward events, journal.ts's letters,
 * dialogue.ts's gifts, day.ts's dawn), and 11.10 presumes an emitter whose
 * notice is rendered by exactly one component is broken. A diff cannot be
 * forgotten by a future sixth writer: if the number moves, the number says so.
 *
 * `live` is the one thing a diff cannot infer — the nightly reset zeroes gems
 * and keys (day.ts endDay), and that is bookkeeping, not spending. Callers
 * pass false outside the phases where a change is something she DID.
 */

import { useEffect, useRef, useState } from 'react';

export interface DeltaFloat {
  id: number;
  delta: number;
}

/** Matches the StepMeter's float lifetime — one grammar, one duration. */
export const DELTA_FLOAT_MS = 1150;

export function useDeltaFloats(value: number, live: boolean): DeltaFloat[] {
  const [floats, setFloats] = useState<DeltaFloat[]>([]);
  const previous = useRef(value);
  const nextId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    // First render, no movement, or a change that is not hers to see.
    if (before === value || !live || !Number.isFinite(value - before)) return;
    const float = { id: nextId.current++, delta: value - before };
    setFloats((f) => [...f, float]);
    // Each float expires on its own timer — a second grant inside 1.2s must
    // never cancel the first one's removal (the StepMeter's batch lesson).
    timers.current.push(
      setTimeout(() => setFloats((f) => f.filter((fl) => fl.id !== float.id)), DELTA_FLOAT_MS),
    );
  }, [value, live]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return floats;
}

/** The float's ink, in the StepMeter's established grammar (chrome.css). */
export function deltaFloatClass(delta: number): string {
  return delta >= 0 ? 'chr-float--gain' : 'chr-float--spend';
}

/** "+2" / "−1" — the sign is the double-encoding, not the hue (AAA 6.3). */
export function deltaFloatText(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${-delta}`;
}
