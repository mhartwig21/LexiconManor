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
import { momentDwellMs } from './moments';
import { momentQueue } from './queue';
import { sealDock } from './dock';
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

export default function MomentLayer({ bootstrap = false }: { bootstrap?: boolean }) {
  const state = useSyncExternalStore(
    momentQueue.subscribe,
    momentQueue.getState,
    momentQueue.getState,
  );
  const reduced = useManorStore((s) => s.settings.reducedMotion);
  const soundOn = useManorStore((s) => s.settings.soundEnabled);
  /** Is the surface underneath a room? (ui/moment/dock.ts — see the render.) */
  const docked = useSyncExternalStore(sealDock.subscribe, sealDock.get, sealDock.get);

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

  useEffect(() => {
    if (!key) return;
    if (soundOn) sfx.glyph(); // strict upgrade only (R.4) — silent play is whole
    const t = setTimeout(() => momentQueue.dismiss(), momentDwellMs(waitingAtLanding.current));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed to the seal, not to the queue behind it
  }, [key, soundOn]);

  if (!current) return null;

  /* ROUND 12 (AAA 11.2 / 11.27) — IN A ROOM THE SEAL IS NOT A CONTROL.
     A room's glass is all playfield, so a tappable card over it swallows the
     taps aimed at what it covers ("Row 1, column 1" dismissed the notice and
     moved no cursor). Docked, the card is `pointer-events: none` (moment.css)
     and is rendered as a plain box rather than a button — a button nobody can
     press, still announcing "Tap to put it away", would be a label that lies.
     Everything else about it is identical. See ui/moment/dock.ts. */
  const inRoom = docked;
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
        </span>
      </span>
    </>
  );

  return (
    <div className={`mom-layer${reduced ? ' mom--reduced' : ''}`} role="status" aria-live="polite">
      {inRoom ? (
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
          className={`mom mom--${current.kind}`}
          onClick={() => momentQueue.dismiss()}
          aria-label={`${current.title}. ${current.where}. Tap to put it away.`}
        >
          {body}
        </button>
      )}
    </div>
  );
}
