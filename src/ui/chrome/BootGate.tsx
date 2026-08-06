/**
 * BootGate — OWNER: A2 (chrome). The screen before the game exists.
 *
 * ROUND 10 (AAA 11.1 / 11.8 / 11.26 — blocker).
 *
 * The boot branch of App.tsx rendered one italic line — "The manor is
 * waking…" — with no controls of any kind, and retried `loadPools()` forever
 * on an 800ms loop. On the happy path that is right: a fetch that lands in
 * 400ms should not be dressed as a problem. On the unhappy one it was the
 * whole application, permanently: the installed PWA has no address bar, no
 * back button and no reload, so a content chunk that never arrived (offline
 * before the service worker had precached, a half-written cache, a bad
 * deploy) left the player looking at a sentence with nothing to tap. She
 * could not even reach the travelling trunk to export the save she still had,
 * which is precisely the recovery path 11.26 says must never charge admission.
 *
 * So the gate has two faces. Waking is unchanged. Stalled — after
 * `BOOT_ATTEMPTS` quiet retries — owes exactly two things, and nothing else:
 *   1. a way to try again ("Knock again"), and
 *   2. a way to the trunk (Chronicles), which App.tsx keeps routable even
 *      while the pools are missing.
 *
 * Copy is house-voice and carries no defeat language (AAA 4.12): the manor is
 * SLOW TO WAKE. It has not broken, and neither has she.
 *
 * Own CSS file per ARCHITECTURE conflict rule 3 (index.css is architect-owned).
 * Consumes tokens.css only, so both themes come free.
 */

import { useLocation } from 'wouter';
import './boot-gate.css';

export interface BootGateProps {
  /** True once the retry budget is spent — swaps the quiet face for the door. */
  stalled: boolean;
  /**
   * Try the house again. App.tsx implements this as a document reload, and it
   * has to: a dynamic import that failed stays failed in the module map for
   * the life of the document, so an in-place retry cannot succeed no matter
   * how many times it is called.
   */
  onRetry: () => void;
}

export default function BootGate({ stalled, onRetry }: BootGateProps) {
  const [, navigate] = useLocation();

  if (!stalled) {
    return (
      <div className="boot" aria-busy="true">
        <p className="boot__waking">The manor is waking&hellip;</p>
      </div>
    );
  }

  return (
    <div className="boot" role="alert">
      <h2 className="boot__title">The manor is slow to wake</h2>
      <p className="boot__line">
        The house cannot find its papers this morning. That is nearly always the
        connection rather than the house — and your journal is still exactly
        where you left it.
      </p>
      <button type="button" className="boot__btn" onClick={onRetry}>
        Knock again
      </button>
      {/* The recognisable word leads; the house's voice is the subtitle
          (AAA 11.7). This is the ONE other door the gate can open, and it is
          the important one: settings, and the save-code trunk (11.26). */}
      <button type="button" className="boot__aside" onClick={() => navigate('/chronicles')}>
        <span className="boot__aside-label">Chronicles</span>
        <span className="boot__aside-sub">settings and the travelling trunk</span>
      </button>
    </div>
  );
}
