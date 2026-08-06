/**
 * BackLink — the one way home, on every full-screen page.
 *
 * Owner bug (round 5, real play): "Can we make sure there's always a way to
 * get back to the blueprint/map from the journal? Right now I can't figure
 * out how to go back." Two faults, not one:
 *   1. the per-page back buttons were the FAINTEST thing on the page
 *      (border:none; background:none; --ink-soft at --text-sm) and were
 *      labelled purely poetically ("Put it down"), so they did not read as
 *      navigation at all; and
 *   2. on the journal and the chronicles they sat UNDER the fixed chrome bar
 *      (chrome.css .chr-header, z-index 40, opaque) — invisible and, worse,
 *      un-tappable. Verified with a hit test: elementFromPoint at the
 *      button's centre returned `.chr-retire`.
 * In the installed PWA there is no browser back button, so that is a genuine
 * strand. The page owners now clear --chrome-h; this component fixes the
 * affordance.
 *
 * Shape: a plate, top-LEFT of the header, where a back control is expected.
 * The RECOGNISABLE word leads ("The manor") and the house's voice follows as
 * a quieter subtitle ("Put it down"), so it is legible as navigation first
 * and cozy second — the flavour never has to carry the meaning.
 *
 * NEW FILE on purpose: chrome.css is owned by A2, so this ships its own
 * back-link.css (conflict rule 3) and consumes tokens.css only — both themes
 * come free, no new tokens.
 */

import { useLocation } from 'wouter';
import { sfx } from '../../app/sound';
import './back-link.css';

export interface BackLinkProps {
  /** Route to return to. Default: the manor blueprint, which is home. */
  to?: string;
  /** The recognisable word. Leads, and is never poetic. */
  label?: string;
  /** Optional second line in the house's voice (e.g. "Put it down"). */
  flavour?: string;
  /** Extra class for per-page placement only (never for restyling). */
  className?: string;
}

export default function BackLink({
  to = '/',
  label = 'The manor',
  flavour,
  className,
}: BackLinkProps) {
  const [, navigate] = useLocation();
  return (
    <button
      type="button"
      className={`backlink${className ? ` ${className}` : ''}`}
      aria-label={flavour ? `${label} — ${flavour}` : label}
      onClick={() => {
        sfx.tap();
        navigate(to);
      }}
    >
      {/* currentColor so it inherits --ink in both themes; rounded caps to
          match the hand-inked feel of the rest of the house. */}
      <svg
        className="backlink__chevron"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M15 5 L8 12 L15 19" />
      </svg>
      <span className="backlink__text">
        <span className="backlink__label">{label}</span>
        {flavour ? <span className="backlink__flavour">{flavour}</span> : null}
      </span>
    </button>
  );
}
