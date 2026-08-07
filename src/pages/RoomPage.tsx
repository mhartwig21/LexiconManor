import { useEffect } from 'react';
import { useLocation } from 'wouter';
import RoomHost from '../ui/rooms/RoomHost';
import { useManorStore } from '../app/store';
import { useSealDock } from '../ui/moment/dock';
import { usePageFootBand } from '../app/platform/page-nav';

/**
 * The /room route: renders RoomHost for day.activeRoom. Architect-owned glue;
 * the interesting parts live in RoomHost + the per-kind views.
 *
 * Integration: leaving/abandoning a room clears day.activeRoom, so this page
 * walks the player back to the blueprint instead of stranding them on a
 * "no room entered" dead end (A1's shared-file request).
 *
 * ROUND 12 (AAA 11.2 / 11.27, §0.5 escape 4) — `useSealDock()`.
 *
 * The moment layer is fixed and clears the shell by `--chrome-h` plus the back
 * row every SHEET screen puts under the bar. A room has no back row, so the
 * seal landed on the playfield and — because the seal is itself tappable — ATE
 * the taps aimed at what it covered: driven live, a tap aimed at "Row 1, column
 * 1" dismissed the notice and left the cursor where it was. This one line tells
 * the layer it is standing on a room; `ui/moment/dock.ts` carries the fix, the
 * three placements that were measured and rejected first, and what the shipped
 * one costs. It is called before the early return so the dock is declared for
 * every branch this route can render.
 */
export default function RoomPage() {
  const [, navigate] = useLocation();
  const hasActiveRoom = useManorStore((s) => Boolean(s.day?.activeRoom));
  useSealDock();
  /**
   * ROUND 15 — the room's pinned bottom band, published for the same reason the
   * blueprint's is (app/platform/page-nav.ts): `.room-host__footer` holds this
   * surface's only exit, and the dusk veil's skip control is a fixed island
   * pinned to the bottom of the glass. 4.12 says dusk never fires INSIDE an
   * active puzzle, so this is belt-and-braces rather than a measured collision —
   * but a band that is only sometimes published is a band nobody can rely on,
   * and the whole point of the token is that the layer above never has to know
   * which surface it is standing on.
   */
  usePageFootBand('.room-host__footer');

  useEffect(() => {
    if (!hasActiveRoom) navigate('/manor', { replace: true });
  }, [hasActiveRoom, navigate]);

  if (!hasActiveRoom) return null;
  return <RoomHost />;
}
