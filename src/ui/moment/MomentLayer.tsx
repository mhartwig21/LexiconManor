/**
 * THE MOMENT — the layer. OWNER: the moment layer (src/ui/moment/*).
 *
 * A wax seal presses into whatever page the player is looking at. It is
 * screen-agnostic by construction: mounted once, outside the router, above
 * every game surface (blueprint, room, dialogue overlay, journal, draft,
 * lifecycle scene) and under the paper material and the platform layer.
 *
 * The bar it answers (AAA §11):
 *   11.11 — fires where the player actually is, whatever screen that is
 *   11.13 — queued, not timed out into an empty room; 5.6s on glass, and it
 *           waits rather than expires if the layer mounts late
 *   11.14 — a reward NEVER dresses as flavour: this is display type, wax, a
 *           raised sheet and a seal, sharing no rule with `.bp-foot__dewey`
 *           (the cat's purr) or with the rooms' `.anch-toast` mistake line
 *   11.12 — every moment names its own persistent trace ("Filed in the
 *           Journal · Testimony"), so a missed one is still recoverable
 *   6.19  — the whole card is the dismiss target (≫44pt)
 *   U.3   — transform/opacity only; reduced motion (system OR the in-game
 *           setting that drives `.chr--reduced`) strips the stamp
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useManorStore } from '../../app/store';
import { sfx } from '../../app/sound';
import { momentDwellMs, momentHolds } from './moments';
import { momentQueue } from './queue';
import { sealDock } from './dock';
import { ceremonyGate } from './ceremony';
import { useOverlayOpen } from '../chrome/overlay-watch';
import { retireBootstrapLayer } from './mount';
import { installMomentWatch } from './watch';
import './moment.css';

/**
 * On glass long enough to read a line of found poetry, then it retires itself;
 * celebrations stay tap-skippable (U.2). The dwell now depends on whether
 * anything is waiting behind it — see `momentDwellMs` in moments.ts for the
 * round-12 reasoning (and for why the "hold" half of hold/release is declined).
 * Re-exported so nothing that imported the constant from the layer breaks.
 */
export { MOMENT_MS, MOMENT_QUEUED_MS } from './moments';

/**
 * How long a HELD seal is on the glass before her next touch can put it away.
 * Not a dwell — the card stays until she acts — only a guard so the trailing
 * half of a double-tap cannot dismiss a card that has just landed.
 */
const HOLD_ARM_MS = 600;

/**
 * Walk to the address the card just named. Written against the hash directly
 * rather than through `useLocation()` because this layer has TWO mount paths
 * (App.tsx's, inside the Router, and mount.tsx's self-bootstrapped root on
 * document.body, outside it) — and a router hook is only correct in one of
 * them. The app routes on the hash (App.tsx `useHashLocation`), so the hash IS
 * the router's input; wouter picks the change up from `hashchange`.
 */
function walkTo(route: string): void {
  if (typeof window === 'undefined') return;
  if (window.location.hash === `#${route}`) return;
  window.location.hash = `#${route}`;
}

export default function MomentLayer({ bootstrap = false }: { bootstrap?: boolean }) {
  const state = useSyncExternalStore(
    momentQueue.subscribe,
    momentQueue.getState,
    momentQueue.getState,
  );
  const reduced = useManorStore((s) => s.settings.reducedMotion);
  const soundOn = useManorStore((s) => s.settings.soundEnabled);
  /** Is the surface underneath a playfield? (ui/moment/dock.ts — see render.) */
  const docked = useSyncExternalStore(sealDock.subscribe, sealDock.get, sealDock.get);
  /** …and is a full-screen scene covering that playfield right now? Declared
   *  HERE, with the other hooks, because `if (!current) return null` sits below
   *  and a hook after an early return is React error #310. */
  const overlayOpen = useOverlayOpen();
  /** …and is a full-glass CEREMONY claiming the screen? (ui/moment/ceremony.ts
   *  — measured round 12: the introduction card and this seal landed together
   *  on day 1 and cancelled each other out.) Declared with the other hooks for
   *  the same reason as the line above. */
  const ceremony = useSyncExternalStore(
    ceremonyGate.subscribe, ceremonyGate.get, ceremonyGate.get,
  );

  // The watch belongs to the session, not to this component: it is installed
  // here as a safety net (idempotent) so the layer is never live without it.
  // An instance mounted in the app tree also retires the self-bootstrapped
  // root, so exactly one layer is ever live (see mount.tsx).
  useEffect(() => {
    installMomentWatch();
    if (!bootstrap) retireBootstrapLayer();
  }, [bootstrap]);

  const current = state.current;
  const key = current?.key ?? null;
  const waiting = state.pending.length;

  /* Read when the seal LANDS, never after. A grant that arrives while this one
     is already on glass must not restart its clock — the dwell is a property of
     the moment being shown, and a re-armed timer would hand a burst the longer
     parade the shortening exists to prevent. */
  const waitingAtLanding = useRef(waiting);
  waitingAtLanding.current = waiting;

  /* Is the seal INERT right now — a notice over a playfield rather than a card
     she can press? (ui/moment/dock.ts; the render branch below reads the same
     value.) Declared up here because the dwell depends on it: a card she can
     press is answerable, and an inert notice is not. */
  const inert = docked !== null && !overlayOpen;
  /* THE ONE MOMENT THAT WAITS FOR HER, AND ONLY WHERE IT MUST (round 26).
     `momentHolds` says the dawn letter deserves to be caught; the dock says
     whether it CAN be. Over a playfield the card takes no taps at all, so a
     clock is the only thing that can end it and the reach that used to hit
     nothing hits nothing still — that is the case the hold is for. Where the
     seal is a real control (a sheet screen, or over a conversation) it keeps
     its ordinary dwell: it is already answerable, and a stray tap on the
     dialogue underneath it must not delete an unread reward FASTER than the
     timer would have. */
  const holds = Boolean(current && momentHolds(current) && inert);
  useEffect(() => {
    if (!key) return;
    // A ceremony has the glass: the seal is not shown, so its clock must not
    // run either — the grant WAITS and presses in when the card hands off,
    // rather than expiring behind something the player never saw (AAA 11.13).
    if (ceremony) return;
    if (soundOn) sfx.glyph(); // strict upgrade only (R.4) — silent play is whole
    /* A HELD moment has no clock: it waits for her first touch instead. The
       listener is a READER, never a gate — no preventDefault, no
       stopPropagation — so whatever she reached for still happens and the card
       goes away in the same gesture. It arms a beat after landing so the
       second half of a double-tap cannot delete a card that never finished
       arriving. */
    if (holds) {
      const away = () => momentQueue.dismiss();
      const arm = setTimeout(() => {
        document.addEventListener('pointerdown', away, true);
        document.addEventListener('keydown', away, true);
      }, HOLD_ARM_MS);
      return () => {
        clearTimeout(arm);
        document.removeEventListener('pointerdown', away, true);
        document.removeEventListener('keydown', away, true);
      };
    }
    const t = setTimeout(() => momentQueue.dismiss(), momentDwellMs(waitingAtLanding.current));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed to the seal, not to the queue behind it
  }, [key, soundOn, ceremony, holds]);

  if (!current || ceremony) return null;

  /* ROUND 12 / ROUND 15 (AAA 11.2 / 11.27) — OVER A PLAYFIELD THE SEAL IS NOT
     A CONTROL. A room's glass is all playfield, and so is the BLUEPRINT's once
     she climbs: a tappable card over either swallows the taps aimed at what it
     covers ("Row 1, column 1" dismissed the notice and moved no cursor; a tap
     at "Approach the Sanctum" dismissed it and did not open the door). Docked,
     the card is `pointer-events: none` (moment.css) and is rendered as a plain
     box rather than a button — a button nobody can press, still announcing
     "Tap to put it away", would be a label that lies. Everything else about it
     is identical. See ui/moment/dock.ts. */
  /* ROUND 16 — THE DOCK IS ABOUT THE PLAYFIELD, NOT ABOUT THE ROUTE.
   *
   * Round 15 made the seal inert wherever a playfield is docked, which was
   * right for the board and the rooms and WRONG the moment a full-screen scene
   * is up over one. /manor keeps its dock token while a DialogueScene runs, so
   * a grant made inside a conversation announced itself on a card that could
   * not be tapped — measured live: `elementFromPoint` at the seal's centre
   * returned `DIV.dlg`, so a tap on the notice fell through and ADVANCED the
   * conversation underneath it. That is the round-15 defect with the roles
   * swapped: a tap doing something she did not aim at.
   *
   * There is no board to protect while an overlay covers it, so the seal goes
   * back to being an ordinary tappable card there. The signal is the one the
   * chrome already publishes for exactly this question (ui/chrome/overlay-watch),
   * and moment.css's inert rules carry the matching
   * `:not([data-overlay-open])`. The value itself is computed further up
   * (`inert`), because round 26's held letter needs the same answer before the
   * dwell effect runs. */
  /* ROUND 26 (COMPREHENSION.md fix 2). Where the card is a CONTROL, the
     address it prints is a place she can be taken — the tap files her at the
     trace instead of merely deleting the announcement of it. Where the card is
     docked-inert it is not a control at all, so it makes no such offer and
     prints no chevron: a label that promises a tap nothing will answer is the
     exact defect the dock exists to prevent (ui/moment/dock.ts). */
  const walkable = !inert && Boolean(current.route);
  const body = (
    <>
      <span className="mom__seal" aria-hidden="true">{current.sigil}</span>
      <span className="mom__body">
        <span className="mom__title">{current.title}</span>
        {current.quote && <span className="mom__quote">{current.quote}</span>}
        <span className="mom__where">
          {current.where}
          {waiting > 0 && (
            <span className="mom__waiting tabular-nums">
              {waiting === 1 ? ' · one more thing' : ` · ${waiting} more things`}
            </span>
          )}
          {walkable && <span className="mom__go" aria-hidden="true"> ›</span>}
        </span>
      </span>
    </>
  );

  return (
    <div className={`mom-layer${reduced ? ' mom--reduced' : ''}`} role="status" aria-live="polite">
      {inert ? (
        /* No aria-label: naming is prohibited on a generic box, and the layer
           is already `role="status" aria-live="polite"`, so the title and the
           address are announced from the content itself (the sigil is
           aria-hidden). The button branch keeps its label because a control
           needs an accessible NAME, and that name ends "Tap to put it away" —
           which is only true where the tap does something. */
        <div key={current.key} className={`mom mom--${current.kind}`}>
          {body}
        </div>
      ) : (
        <button
          key={current.key}
          type="button"
          className={`mom mom--${current.kind}${walkable ? ' mom--walkable' : ''}`}
          onClick={() => {
            const route = walkable ? current.route : null;
            momentQueue.dismiss();
            if (route) walkTo(route);
          }}
          aria-label={
            walkable
              ? `${current.title}. ${current.where}. Tap to open it.`
              : `${current.title}. ${current.where}. Tap to put it away.`
          }
        >
          {body}
        </button>
      )}
    </div>
  );
}
