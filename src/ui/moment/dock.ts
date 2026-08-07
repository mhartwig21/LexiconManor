/**
 * THE ROOM DOCK — where the seal is a NOTICE and not a control.
 * OWNER: the moment layer (src/ui/moment/*).
 *
 * ROUND 12 (major, AAA 11.2 / §0.5 escape 4 — the same shape, now in the rooms)
 *
 * `.mom-layer` clears the shell by `--chrome-h` + `--tap-target` + 12: the
 * fixed bar, then the back row that every SHEET screen puts under it. A ROOM
 * has no back row, so the seal parked on the playfield. Measured live at
 * 390×844: Counting House 27/98 cells covered (the whole top three rows),
 * Darkroom 12/57 cipher cells, Linen Closet 6/41 squares, Gallery 5/28 Twistle
 * cells, Conservatory the found-words toggle; at 375×667 the toggle too. And
 * the harm was not the covering, it was the SWALLOWING: driven, a tap aimed at
 * "Row 1, column 1" dismissed the seal and left the cursor exactly where it
 * was, and a tap aimed at "0 found ▾" dismissed the seal and left
 * `aria-expanded="false"`. The tap is eaten — the round-11 defect verbatim, on
 * a surface nobody re-probed after the journal was fixed.
 *
 * WHAT WAS TRIED AND MEASURED FIRST (scripts/probe-seal-geometry.mjs, kept so
 * the next round can re-run it rather than re-derive it):
 *
 *  1. Publish the room's band as `--page-nav-floor`, the round-11 mechanism.
 *     It would push the seal below the stage — i.e. onto `.room-host__footer`,
 *     which holds the room's only exit (AAA 11.1/11.3). Worse than the defect.
 *
 *  2. Dock the seal to the foot, above that footer (the finding's own
 *     suggestion). At 390×844 that lands the card at y 643–761, which is inside
 *     `.room-deck` in four of the seven rooms (hive 711–765, sudoku 560–770,
 *     twistle 598–765, crossword 394–765) — the sticky cluster holding the
 *     on-screen keys and each room's primary verb, i.e. exactly the COSTED
 *     controls 6.19 exempts from nothing. Worse again.
 *
 *  3. Have the room RESERVE a band and lay itself out in what is left, the way
 *     the shell already does for the iOS keyboard. This passes the hit test
 *     everywhere and it is what shipped for an hour — until it was measured.
 *     Every board sizes off `--stage-h`, so the reserve comes out of the board:
 *     at 390×844 the Counting House cell went 43.3 → 35.8 and the hive hex
 *     107.3 → 75.8; at 375×667, where the stage is 551px and the boards are
 *     already at their floor, the ledger cell went **39.7 → 25.8** and the hive
 *     86.1 → 46.1. AAA 6.19(a) exempts that grid from the 44px floor on a
 *     MEASURED number and its footnote says the exemption is "from the number,
 *     never from the measurement"; a notice that shrinks the exempt board by
 *     35% for five seconds is a second defect, not a fix.
 *
 * WHAT SHIPS. In a room the seal stops being a control and becomes a notice:
 * `pointer-events: none`, so `document.elementFromPoint` at every cell and every
 * key returns the CONTROL, and a tap aimed at "Row 1, column 1" moves the
 * cursor to row 1, column 1. Nothing is swallowed, no board loses a pixel, and
 * the seal retires on its own clock (4.0s behind a queue, 5.6s alone) exactly
 * as `momentDwellMs` already assumes for the player who does not know she can
 * tap — the one the escape was written about. It is also drawn shorter there
 * (moment.css drops the quote), because a notice that cannot be tapped away is
 * a notice that should ask for less of the glass. The words themselves stay one
 * tap away at the address the card names, which is what the trace is FOR
 * (11.12).
 *
 * The trade is honest and worth writing down: for those seconds the top band of
 * the board is behind the card and cannot be READ. 6.19(a) already rules that
 * nothing on a board commits anything, so the cost is legibility, not agency,
 * and it is bounded by the dwell. AAA 11.27 is the criterion this answers.
 */

import { useEffect } from 'react';

/** Is a seal-docking surface (a room) on screen right now? */
let docked = false;
const listeners = new Set<() => void>();

/** `:root[data-seal-dock='room']` is what moment.css keys the dock rules off. */
const ATTRIBUTE = 'sealDock';
const VALUE = 'room';

function publish(next: boolean) {
  if (next === docked) return;
  docked = next;
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (next) root.dataset[ATTRIBUTE] = VALUE;
    else delete root.dataset[ATTRIBUTE];
  }
  for (const listener of listeners) listener();
}

export const sealDock = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** Snapshot for `useSyncExternalStore` — a boolean, so it is stable. */
  get(): boolean {
    return docked;
  },
};

/**
 * Declare this surface a room: the seal moves up to the band under the bar
 * (there is no back row to clear) and stops taking taps. Cleared on unmount, so
 * stepping back out restores the seal's ordinary geometry in the same frame.
 */
export function useSealDock(): void {
  useEffect(() => {
    publish(true);
    return () => publish(false);
  }, []);
}
