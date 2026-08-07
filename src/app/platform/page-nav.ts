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
 */

import { useEffect } from 'react';

/** The published token. `ui/theme/tokens.css` declares the 0px default. */
export const PAGE_NAV_FLOOR = '--page-nav-floor';

/**
 * Publish `selector`'s bottom edge as `--page-nav-floor` for as long as the
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
export function usePageNavBand(selector: string): void {
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
      const floor = box && box.width > 0 && box.height > 0 ? Math.ceil(box.bottom) : 0;
      if (floor === published) return;
      published = floor;
      root.style.setProperty(PAGE_NAV_FLOOR, `${floor}px`);
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
      root.style.removeProperty(PAGE_NAV_FLOOR);
    };
  }, [selector]);
}
