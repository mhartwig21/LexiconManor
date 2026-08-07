/**
 * page-nav — OWNER: A8 (platform). One measurement, published as one token.
 *
 * THE DEFECT THIS EXISTS TO END (round-11 major, AAA 11.2 / 11.19)
 * The moment seal is a fixed layer mounted outside the router, so it clears the
 * shell by tokens: `--chrome-h` (the fixed bar) plus `--tap-target` (the back
 * row every sheet screen puts under it). That describes /chronicles, /sanctum
 * and the rooms exactly. It does not describe the JOURNAL, which puts a ribbon
 * of four tabs below the back row — and the seal landed on them. Measured live
 * on /journal: seal box 12,108,366×143; the four tabs' tops at y≈139;
 * `document.elementFromPoint` at each tab's centre returned a node inside
 * `.mom`. The seal is itself tappable and the tabs are the journal's whole
 * navigation, so reaching for "Testimony" put the notice away instead — on the
 * screen the seal's own trace line had just named, for 5.6s per queued grant,
 * and moments QUEUE.
 *
 * THE CONTRACT
 * A route surface that owns a navigation band beneath the back row calls
 * `usePageNavBand(selector)` and the band's FLOOR — the viewport-y of its
 * bottom edge — is published on `:root` as `--page-nav-floor`. Fixed layers
 * take the larger of their own clearance and that floor (see
 * `ui/moment/moment.css`). The token defaults to `0px`, so every surface that
 * does not opt in is untouched and a consumer written against it is inert.
 *
 * WHY A FLOOR AND NOT A HEIGHT (AAA 11.4's real requirement)
 * The obvious token is the band's height, added to the existing clearance. It
 * is not enough, and the journal is the proof: the tabs sit below the volume
 * line as well as the back row, so base(108) + height(44) = 152 lands INSIDE
 * the band (139..183). Any "sum of the rows above it" is a layout copy living
 * in a second file — the exact drift 11.4 forbids. The bottom edge of the real
 * element is the one number that is true whatever the surface stacks above it,
 * and it is read from the live box, never written down.
 *
 * THE ROOMS ARE NOT THIS SHAPE (round 12). A room owns no second band and has
 * no spare glass to publish one from — its board starts at the top of the stage
 * and its sticky key deck runs to the footer. The seal's collision there is
 * answered in the moment module instead (`ui/moment/dock.ts`), not here: there
 * is no floor to measure.
 */

import { useEffect } from 'react';

/** The published token. `ui/theme/tokens.css` declares the 0px default. */
export const PAGE_NAV_FLOOR = '--page-nav-floor';

/**
 * THE SAME CONTRACT, AT THE OTHER END OF THE GLASS (round-15 blocker,
 * AAA 11.2 / 11.4 / 11.5).
 *
 * `--page-nav-floor` describes a band a surface stacks at the TOP. The dusk
 * veil found the band nothing described: the one at the BOTTOM. `.chr-dusk` is
 * deliberately `pointer-events: none` so the blueprint stays live through the
 * ≤4s fade (4.12's walk-but-no-interact grace), and its own `.chr-dusk__skip`
 * is the single interactive island on that layer — pinned 28px off the bottom,
 * i.e. straight on top of the blueprint's nav row. Measured live:
 * skip [129,772,133,44] over Journal [114,788,120,44] at 390x844, and
 * [121,595,133,44] over [109,611,115,44] at 375x667; `elementFromPoint` at the
 * Journal button's centre returned `.chr-dusk__skip` at both, and a DRIVEN
 * click there left `location.hash` unchanged. The digest that follows four
 * seconds later prints "A letter waits unopened in the post tray", so the one
 * screen-second she is most likely to reach for the journal is the one second
 * the control is not hers.
 *
 * The value is the band's CEILING measured up from the viewport's bottom edge
 * — `innerHeight - top` — which is the mirror of the floor's `bottom`, and for
 * the same reason: it is the one number that is true whatever the surface
 * stacks *below* it (its own safe-area padding, a hint line, a home
 * indicator). A fixed layer that wants to stay clear takes
 * `max(own margin, ceiling + gap)`.
 */
export const PAGE_FOOT_CEILING = '--page-foot-ceiling';

/**
 * Publish one edge of `selector`'s live box as `token`, for as long as the
 * calling surface is mounted, and clear it on the way out.
 *
 * Re-measures on: the band resizing (ResizeObserver), the band appearing or
 * being replaced (MutationObserver — the journal renders a no-tabs branch for
 * an unauthored volume, and must publish 0 there), viewport resize, and the
 * iOS visual-viewport resize that the keyboard drives. Every path funnels
 * through one rAF-coalesced read, so a burst of mutations costs one
 * `querySelector` + one `getBoundingClientRect` per frame, and an unchanged
 * measurement writes nothing at all.
 */
function useBandToken(
  selector: string,
  token: string,
  edge: (box: DOMRect) => number,
): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    let band: Element | null = null;
    let frame = 0;
    let published = -1;

    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => schedule())
      : null;

    const measure = () => {
      frame = 0;
      const found = document.querySelector(selector);
      if (found !== band) {
        if (band && observer) observer.unobserve(band);
        band = found;
        if (band && observer) observer.observe(band);
      }
      const box = band?.getBoundingClientRect();
      // A band with no box (unmounted, or a branch that renders none) is not a
      // band: publish 0 so the fixed layers fall back to their own clearance
      // rather than holding a stale floor from the last render (AAA 11.21's
      // "truthful in both directions", applied to geometry).
      const value = box && box.width > 0 && box.height > 0 ? Math.max(0, edge(box)) : 0;
      if (value === published) return;
      published = value;
      root.style.setProperty(token, `${value}px`);
    };

    function schedule() {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    }

    measure();

    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutations.disconnect();
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      root.style.removeProperty(token);
    };
  }, [selector, token, edge]);
}

/** The floor of a TOP band: the viewport-y of its bottom edge. */
const bottomEdge = (box: DOMRect) => Math.ceil(box.bottom);

/**
 * The ceiling of a BOTTOM band, measured UP from the viewport's bottom edge.
 * Deliberately not `top`: a fixed layer pinned with `bottom:` needs the
 * distance from the same origin it is pinned to, and reading it this way means
 * the number stays true whatever the surface stacks *below* the band (its own
 * safe-area padding, a hint line, the home indicator).
 */
const bottomBandCeiling = (box: DOMRect) =>
  Math.ceil((typeof window === 'undefined' ? 0 : window.innerHeight) - box.top);

/**
 * Publish `selector`'s bottom edge as `--page-nav-floor` — a navigation band
 * this surface stacks at the TOP, below the back row (AAA 11.4, round 11).
 */
export function usePageNavBand(selector: string): void {
  useBandToken(selector, PAGE_NAV_FLOOR, bottomEdge);
}

/**
 * Publish `selector`'s ceiling as `--page-foot-ceiling` — a navigation band
 * this surface pins at the BOTTOM of the glass (round 15; see the token's own
 * comment above for the dusk veil that landed on the blueprint's).
 */
export function usePageFootBand(selector: string): void {
  useBandToken(selector, PAGE_FOOT_CEILING, bottomBandCeiling);
}
