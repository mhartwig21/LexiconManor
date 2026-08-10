/**
 * StepMeter — OWNER: A2 (Economy/Day).
 *
 * The tension instrument: a candle whose wax burns down against the day's
 * starting total, a tabular-nums counter, and a floating ±N for every ledger
 * entry (AAA 4.9). Tension is legible from presentation alone — the flame
 * gutters when the day runs low — with no alarm colors and no shake (R.3):
 * spending reads as spending. Wax red appears only on mistake deltas, which
 * are the mistake state itself (AAA 6.15).
 *
 * ROUND 26: every float now says WHY (COMPREHENSION.md fix 1 — the reason word
 * lives in ui/chrome/step-reasons.ts, which is where the argument is written
 * down and where the copy is unit-tested).
 */

import { useEffect, useRef, useState } from 'react';
import { useManorStore } from '../../app/store';
import { dayStartTotal, stepsRemaining } from '../../engine/economy/steps';
import type { StepReason } from '../../engine/types';
import { reasonWord } from './step-reasons';

interface Float {
  id: number;
  delta: number;
  reason: StepReason;
  /** The reason, in a word — see `reasonWord`. */
  why: string;
  /** Position in its batch; a cascade so three at once are three, not a smudge. */
  order: number;
}

const FLOAT_MS = 1150;
/** Each float in a batch waits this much longer than the one before it. */
const FLOAT_STAGGER_MS = 130;

function floatClass(reason: StepReason, delta: number): string {
  if (reason === 'mistake') return 'chr-float--mistake';
  if (reason === 'tea' || reason === 'snack') return 'chr-float--warm';
  return delta >= 0 ? 'chr-float--gain' : 'chr-float--spend';
}

export default function StepMeter() {
  const ledger = useManorStore((s) => s.ledger);
  // The morning card is a full-screen scene painted over the header: a float
  // spawned under it is a float nobody sees (measured — `elementFromPoint` at
  // the header's centre returns `.chr-scene` all through the morning phase).
  // So dawn's batch WAITS for the card to be dismissed, then floats on the
  // blueprint where her eyes are (AAA 11.13: transience is capped by
  // attention, not by a timer alone).
  const covered = useManorStore((s) => s.day?.phase === 'morning');
  // The day number is what actually tells a fresh ledger from a busy one — see
  // the reset branch below.
  const dayNumber = useManorStore((s) => s.day?.day ?? 0);
  const steps = stepsRemaining(ledger);
  const startTotal = Math.max(1, dayStartTotal(ledger));
  const ratio = Math.max(0, Math.min(1, steps / startTotal));

  // Guttering when the evening is close — either fraction or absolute band.
  const band =
    steps <= Math.max(6, startTotal * 0.15) ? 'guttering'
    : ratio <= 0.5 ? 'waning'
    : 'bright';

  // A floating ±N for each new ledger entry (max 3 per batch to stay calm).
  const [floats, setFloats] = useState<Float[]>([]);
  const seenCount = useRef(ledger.entries.length);
  const seenDay = useRef(dayNumber);
  const nextId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const entries = ledger.entries;
    // ── A NEW DAY IS NOT "NOTHING HAPPENED" (round-7 defect). ──────────────
    // This branch used to swallow the campaign's headline payment: `startDay`
    // appends Bramble's tea (up to +13), the day-1 welcome pot and yesterday's
    // carry-over INSIDE the same tick that resets the ledger, so the new day's
    // entry list was SHORTER than yesterday's and the whole dawn batch was
    // classified as "fresh ledger, a new day, no floats". Measured: 0 of 30
    // samples over 3s carried a `.chr-float` at a dawn whose ledger held
    // [['tea', 13]] — the single largest step grant in the game, silent.
    //
    // The reset is keyed on THE DAY NUMBER, not on the entry count. A count
    // watermark cannot see a dawn whose ledger happens to be the same length
    // as last night's (day 1 ends on one 'tea' entry and day 2 opens on one:
    // measured, and still silent after the first attempt at this fix). The day
    // number moves exactly once per dawn and nothing else moves it.
    if (dayNumber !== seenDay.current || entries.length < seenCount.current) {
      seenDay.current = dayNumber;
      seenCount.current = 0;      // every dawn grant is hers to see
    }
    if (entries.length === seenCount.current) return;
    if (covered) return;   // held until the morning card is dismissed; re-runs then
    const fresh = entries.slice(seenCount.current).slice(-3);
    seenCount.current = entries.length;
    // Read imperatively, not as a selector: the room a mistake was made in is
    // wanted at SPAWN time only, and subscribing the bar to every room in the
    // manor would re-render the chrome on every placement for one word.
    const rooms = useManorStore.getState().manor?.rooms;
    const spawned = fresh
      .filter((e) => e.delta !== 0)
      .map((e, i) => ({
        id: nextId.current++,
        delta: e.delta,
        reason: e.reason,
        why: reasonWord(e, e.roomKey ? rooms?.[e.roomKey]?.kind : undefined),
        order: i,
      }));
    if (spawned.length === 0) return;
    setFloats((f) => [...f, ...spawned]);
    const ids = spawned.map((s) => s.id);
    // Each batch expires on its own timer — a new batch must never cancel an
    // older batch's removal (mistake → solve inside 1.2s is the common case).
    // The last of a staggered batch starts latest, so the sweep waits for it.
    timers.current.push(
      setTimeout(
        () => setFloats((f) => f.filter((fl) => !ids.includes(fl.id))),
        FLOAT_MS + (spawned.length - 1) * FLOAT_STAGGER_MS,
      ),
    );
  }, [ledger.entries, covered, dayNumber]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Candle geometry: wax height tracks the burn-down.
  const waxMax = 20;
  const waxH = 3 + ratio * waxMax;
  const waxY = 30 - waxH;

  return (
    <div className={`chr-steps chr-steps--${band}`} aria-live="polite">
      <svg
        className="chr-steps__candle"
        width="20"
        height="34"
        viewBox="0 0 20 34"
        role="img"
        aria-label={`${steps} steps left of ${startTotal}`}
      >
        {/* flame sits on the wick, above the current wax line */}
        <ellipse className="chr-steps__flame" cx="10" cy={waxY - 4.5} rx="2.6" ry="4.2" />
        <line x1="10" y1={waxY} x2="10" y2={waxY - 2.5} stroke="var(--ink-soft)" strokeWidth="1" />
        <rect className="chr-steps__wax" x="5" y={waxY} width="10" height={waxH} rx="1.5" />
        {/* the candle dish */}
        <line x1="2" y1="31" x2="18" y2="31" stroke="var(--ink-faint)" strokeWidth="1.5" />
      </svg>
      {/* ROUND 8: this wrapper carries a class and `white-space: nowrap` (see
          chrome.css). Unclassed, it was free to reflow "12 steps" onto two
          lines the moment the flex row was squeezed — which is exactly what
          happened at 375x667, making .chr-steps 53.3px, the bar 59.3px, and
          --chrome-h a lie on every surface that clears itself by it. */}
      <div className="chr-steps__read">
        {/* key retriggers the tick pulse on every change */}
        <span key={steps} className="chr-steps__count chr-steps__count--tick tabular-nums">
          {steps}
        </span>
        <span className="chr-steps__label"> steps</span>
      </div>
      {floats.map((f) => (
        <span
          key={f.id}
          className={`chr-float ${floatClass(f.reason, f.delta)}`}
          style={f.order ? { animationDelay: `${f.order * FLOAT_STAGGER_MS}ms` } : undefined}
        >
          <span className="chr-float__n tabular-nums">
            {f.delta > 0 ? `+${f.delta}` : `−${-f.delta}`}
          </span>
          {f.why ? <span className="chr-float__why"> {f.why}</span> : null}
        </span>
      ))}
    </div>
  );
}
