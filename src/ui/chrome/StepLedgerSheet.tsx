/**
 * StepLedgerSheet — OWNER: A2 (Economy/Day). The place to LOOK.
 *
 * Tap the candle and the day's account unrolls beneath it: every charge and
 * every gift the ledger holds, folded onto the reason words the floats already
 * used, with the arithmetic printed so she can add it up herself.
 *
 * The argument for it is written in ledger-lines.ts. The mechanics that matter
 * here are three:
 *
 *   1. IT IS AN OVERLAY, AND SAYS SO. `data-overlay` is the published contract
 *      in ui/chrome/layers.ts: the chrome bar above goes `pointer-events: none`
 *      and DayHeader stops rendering the destructive retire control entirely.
 *      Opening the account may not become a new way to end the day by accident
 *      (AAA 11.5) — the exact defect the layer scale was written for.
 *   2. IT IS PORTALLED TO <body>. Rendered in place it would live INSIDE
 *      `.chr-header`, which its own `data-overlay` had just made inert — the
 *      sheet would open and refuse every tap, including its own Close.
 *   3. IT CLEARS THE BAR BY GEOMETRY, not by luck: `top` reads `--chrome-h`,
 *      the same token every other surface in the app clears itself by, so the
 *      candle it was opened from stays lit and legible above its own account.
 *      Tapping the bar therefore lands on the scrim beneath and closes — the
 *      candle is a toggle in feel as well as in fact.
 *
 * NOTHING MAY SCROLL AT 375x667 (house rule). The rows are folded, not listed,
 * and `tests/step-ledger-live.mjs` measures the real sheet on a real driven
 * day at 375 first and 390 second. `overflow-y: auto` on the list is the
 * safety valve for a pathological day, not the plan.
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useManorStore } from '../../app/store';
import { accountTotals, ledgerLines } from './ledger-lines';

function signed(n: number): string {
  return n > 0 ? `+${n}` : `−${-n}`;
}

export default function StepLedgerSheet({ onClose }: { onClose: () => void }) {
  const ledger = useManorStore((s) => s.ledger);
  const day = useManorStore((s) => s.day?.day ?? 0);
  const rooms = useManorStore((s) => s.manor?.rooms);

  // Escape closes, like every other scene in the house.
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [onClose]);

  const lines = ledgerLines(ledger.entries, (roomKey) => (roomKey ? rooms?.[roomKey]?.kind : undefined));
  const totals = accountTotals(ledger.budget, lines);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="chr-ledger" data-overlay>
      {/* The scrim reaches under the bar as well, so a tap on the candle that
          opened this closes it again — the bar itself is inert while this is
          up, so the tap falls through to here (chrome.css `:has()` block). */}
      <button className="chr-ledger__scrim" aria-label="Close the day’s account" onClick={onClose} />
      <div className="chr-ledger__sheet" role="dialog" aria-modal="true" aria-label="The day’s account">
        <div className="chr-ledger__head">
          <div>
            <h2 className="chr-ledger__title">The day’s account</h2>
            <div className="chr-ledger__sub">Day {day}</div>
          </div>
          <button className="chr-ledger__close" onClick={onClose}>Close</button>
        </div>

        <ul className="chr-ledger__list">
          {/* The base allowance is `ledger.budget`, not an entry — it never
              floated, so it has never once been on the glass. Without it the
              column below does not add up, and an account that does not add up
              is the thing being fixed. */}
          <li className="chr-ledger__row">
            <span className="chr-ledger__why">the morning’s allowance</span>
            <span className="chr-ledger__n tabular-nums chr-ledger__n--gain">
              {signed(totals.budget)}
            </span>
          </li>
          {lines.map((line) => (
            <li className="chr-ledger__row" key={line.key}>
              <span className="chr-ledger__why">
                {line.why}
                {line.count > 1 ? <span className="chr-ledger__times"> ×{line.count}</span> : null}
              </span>
              <span
                className={`chr-ledger__n tabular-nums${
                  line.reason === 'mistake'
                    ? ' chr-ledger__n--mistake'
                    : line.delta >= 0 ? ' chr-ledger__n--gain' : ''
                }`}
              >
                {signed(line.delta)}
              </span>
            </li>
          ))}
        </ul>

        <div className="chr-ledger__total">
          <span className="chr-ledger__why">left to spend</span>
          <span className="chr-ledger__n tabular-nums">{Math.max(0, totals.remaining)}</span>
        </div>

        {/* The one sentence that closes three of the four surviving wrong
            beliefs at once. It is a claim about the LEDGER, not a rule of any
            room, and it is true by construction: a weight-0 mistake is never
            ledgered (economy/steps.ts), so a rejected hive word, a short word,
            a duplicate and a wrong crossword letter are all absent from this
            column BECAUSE they cost nothing. */}
        <p className="chr-ledger__note">Only what is written here was charged.</p>
      </div>
    </div>,
    document.body,
  );
}
