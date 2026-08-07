/**
 * GameChrome — OWNER: A2 (Economy/Day).
 *
 * The one persistent frame composed over every route: DayHeader (day numeral,
 * step candle, gems/keys, retire) plus the lifecycle scenes (morning card,
 * dusk veil, night digest). Renders nothing until a day exists — the Home
 * page decides when to call startDay().
 *
 * Mount point: `<GameChrome />` after the route <Switch> in App.tsx
 * (architect-owned — see SHARED-FILE REQUESTS). The chrome is an overlay;
 * it owns no routing and never unmounts across navigation, so the candle
 * and its floats survive room entry/exit.
 */

import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useManorStore } from '../../app/store';
import DayHeader from './DayHeader';
import NoticeRail from './NoticeRail';
import { DuskVeil, MorningCard, NightDigest } from './DayTransitions';
import { installOverlayWatch } from './overlay-watch';
import './chrome.css';

/** The routes a lifecycle scene yields the glass to — one per scene aside. */
const ASIDE_ROUTES = new Set(['/chronicles', '/journal']);

export default function GameChrome() {
  const phase = useManorStore((s) => s.day?.phase ?? null);
  const reduced = useManorStore((s) => s.settings.reducedMotion);
  const [location] = useLocation();

  /**
   * THE ROUTES THE LIFECYCLE SCENES STAND ASIDE FOR (AAA 11.24/11.25, 4.15).
   *
   * The scenes are full-screen and mounted over every route, so a "Chronicles"
   * affordance inside the morning card would have navigated underneath itself
   * and changed nothing on the glass. Settings, reduced motion and the trunk
   * are the one surface the player may be trying to reach BECAUSE of the scene
   * (too loud, too much motion), so /chronicles wins over the card while she is
   * standing on it. The phase is untouched: the scene is exactly where she left
   * it the moment she taps "The manor".
   *
   * ROUND 11 adds /journal for the same reason, one criterion over. 4.15 and
   * 11.12 want any filed document ≤2 taps from anywhere, and the two screens
   * she cannot avoid — the morning card and the night digest — measured NINE
   * taps to the journal entrance. The digest even prints "A letter waits
   * unopened in the post tray" on a surface from which she could not open it.
   * The gate is the mechanism, not a second one: an aside inside a scene is
   * only real if the scene gets out of its way.
   */
  const standAside = ASIDE_ROUTES.has(location);

  // The chrome is painted above every overlay (layers.ts), so it owes the
  // overlays their modality: this watch stamps <html data-overlay-open> the
  // instant a scene mounts and the header goes pointer-inert (AAA 11.5).
  // Idempotent, and installed here rather than in DayHeader so the signal
  // exists before the first day does.
  useEffect(() => { installOverlayWatch(); }, []);

  if (!phase) return null;

  return (
    <div className={reduced ? 'chr--reduced' : undefined}>
      <DayHeader />
      {/* Rides with the header, so a payout line or a warmer friendship lands
          on whichever screen she is standing on (AAA 11.11) — including
          behind a dialogue or draft overlay. Non-interactive throughout. */}
      <NoticeRail />
      {phase === 'morning' && !standAside ? <MorningCard /> : null}
      {/* Dusk is NEVER suppressed: it is the only scene that advances itself,
          and hiding it would strand the day in `dusk` forever. It is also
          unreachable from /chronicles — nothing there can spend a step. */}
      {phase === 'dusk' ? <DuskVeil /> : null}
      {phase === 'night' && !standAside ? <NightDigest /> : null}
    </div>
  );
}
