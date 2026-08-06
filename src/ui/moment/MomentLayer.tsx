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

import { useEffect, useSyncExternalStore } from 'react';
import { useManorStore } from '../../app/store';
import { sfx } from '../../app/sound';
import { momentQueue } from './queue';
import { retireBootstrapLayer } from './mount';
import { installMomentWatch } from './watch';
import './moment.css';

/** On glass long enough to read a line of found poetry, then it retires
 *  itself. AAA 11.13's floor is 5s; celebrations stay tap-skippable (U.2). */
export const MOMENT_MS = 5600;

export default function MomentLayer({ bootstrap = false }: { bootstrap?: boolean }) {
  const state = useSyncExternalStore(
    momentQueue.subscribe,
    momentQueue.getState,
    momentQueue.getState,
  );
  const reduced = useManorStore((s) => s.settings.reducedMotion);
  const soundOn = useManorStore((s) => s.settings.soundEnabled);

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

  useEffect(() => {
    if (!key) return;
    if (soundOn) sfx.glyph(); // strict upgrade only (R.4) — silent play is whole
    const t = setTimeout(() => momentQueue.dismiss(), MOMENT_MS);
    return () => clearTimeout(t);
  }, [key, soundOn]);

  if (!current) return null;
  const waiting = state.pending.length;

  return (
    <div className={`mom-layer${reduced ? ' mom--reduced' : ''}`} role="status" aria-live="polite">
      <button
        key={current.key}
        type="button"
        className={`mom mom--${current.kind}`}
        onClick={() => momentQueue.dismiss()}
        aria-label={`${current.title}. ${current.where}. Tap to put it away.`}
      >
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
      </button>
    </div>
  );
}
