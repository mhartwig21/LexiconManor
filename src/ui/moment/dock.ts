/**
 * THE PLAYFIELD DOCK — where the seal is a NOTICE and not a control.
 * OWNER: the moment layer (src/ui/moment/*).
 *
 * Two surfaces declare it: a ROOM (round 12, below) and the BLUEPRINT
 * (round 15, at `useSealDock` further down). Both are boards; neither has a
 * spare band; on both, a tappable card over the glass eats the tap aimed at
 * what it covers.
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

/**
 * ── ROUND 15 (blocker, AAA 11.2 / 11.27 / 6.19) — THE BLUEPRINT IS A
 *    PLAYFIELD TOO, AND NOBODY RE-PROBED IT AFTER ROUND 12 FIXED THE ROOMS.
 *
 * §0.5 escape 4 in its purest form: "when a fixed layer is retuned for one
 * surface, re-probe EVERY surface it can appear over, including the ones that
 * were clean before the retune." Round 11 recorded "/manor was clean under the
 * same probe" — and it was, because the probe stood on the ground floor, where
 * the seal's band (12,108,366x91 at 390x844) is empty parchment. But the sheet
 * draws row 6 at the TOP of the glass, so the moment she climbs, the manor's
 * own controls move INTO that band.
 *
 * MEASURED (scripts/probe-visual-nav.mjs, live Edge, plate grant on glass):
 *   390x844, standing at (2,5): "Approach the Sanctum" [177,157,64,64] —
 *   `elementFromPoint` at its centre returns `button.mom`.
 *   DRIVEN: a real mouse click at that centre left `location.hash` unchanged
 *   and flipped the seal from present to absent. The tap dismissed the notice
 *   and did not open the Sanctum.
 *   375x667: the two padlocked-door controls [231,162,61,61] / [109,162,61,61]
 *   are covered at their centres too — and those are COSTED (2 keys plus the
 *   row's move price), which 6.19 exempts nothing from.
 *
 * Timing makes it worse, not better: grants queue at 5.6s (4.0s behind a
 * queue) and arriving at the landing is exactly when a plate, a keepsake or a
 * fragment lands, so this fires at the campaign's milestone moment (4.10d)
 * rather than at random.
 *
 * WHY THE DOCK IS UNCONDITIONAL RATHER THAN GEOMETRIC. The obvious patch is
 * "make the seal inert while a live cell is inside its band". That is a
 * condition on a layout, evaluated in a second file, which is the drift 11.4
 * exists to forbid and the exact shape of the escape being closed: the band is
 * empty on the ground floor and full on the landing, so the guard would be
 * green on every screen a critic happens to look at. The blueprint IS a board —
 * from the top of the sheet to the footer, every cell in it is a control or
 * will be one when she reaches it — so it is declared a board once, for good,
 * the same way a room is.
 *
 * WHAT THE BLUEPRINT DOES **NOT** BORROW FROM THE ROOM DOCK: the room's
 * `top` retune. A room has no back row, so its seal moves UP to sit directly
 * under the bar. The blueprint's glass is sheet all the way to the same place,
 * so moving the card up would only cover a different row of cells for nothing.
 * The blueprint keeps the shell's ordinary clearance and changes only agency —
 * which is what 11.27 says the rule is actually about.
 */

/** Which kind of playfield is under the seal right now, if any. */
export type SealDockKind = 'room' | 'board';

/**
 * Every mounted declaration, not a single flag: during a route swap React can
 * run the incoming surface's effect before the outgoing one's cleanup, and a
 * last-writer-wins boolean would leave the dock stuck on (or off) for the rest
 * of the session. A room outranks a board because it also moves the card.
 */
const claims = new Map<symbol, SealDockKind>();
let docked: SealDockKind | null = null;
const listeners = new Set<() => void>();

/** `:root[data-seal-dock]` is what moment.css keys the dock rules off. */
const ATTRIBUTE = 'sealDock';

function republish() {
  let next: SealDockKind | null = null;
  for (const kind of claims.values()) {
    if (kind === 'room') { next = 'room'; break; }
    next = 'board';
  }
  if (next === docked) return;
  docked = next;
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (next) root.dataset[ATTRIBUTE] = next;
    else delete root.dataset[ATTRIBUTE];
  }
  for (const listener of listeners) listener();
}

export const sealDock = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** Snapshot for `useSyncExternalStore` — a string or null, so it is stable. */
  get(): SealDockKind | null {
    return docked;
  },
};

/**
 * Declare this surface a playfield the seal may not take taps from.
 *
 * - `'room'` (the default, round 12): there is no back row to clear, so the
 *   seal ALSO moves up into the band directly under the bar.
 * - `'board'` (round 15, the blueprint): the shell's ordinary clearance is
 *   correct; only the agency changes.
 *
 * Both make the card `pointer-events: none` and render it as a plain box
 * rather than a button, so `document.elementFromPoint` at every cell, door and
 * key returns that CONTROL and a driven tap performs that control's action.
 * The notice retires on its own clock (11.27b) — which `momentDwellMs` already
 * assumes for the player who does not know she can tap — and the reward's own
 * words stay one tap away at the address the card names (11.12).
 *
 * Cleared on unmount, so stepping back out onto a sheet screen restores the
 * seal's ordinary, dismissible geometry in the same frame.
 */
export function useSealDock(kind: SealDockKind = 'room'): void {
  useEffect(() => {
    const token = Symbol('seal-dock');
    claims.set(token, kind);
    republish();
    return () => { claims.delete(token); republish(); };
  }, [kind]);
}
