/**
 * app/platform/viewport.ts — OWNER: A8 (Platform).
 *
 * VisualViewport → CSS custom properties (ARCHITECTURE §9, AAA 7.9).
 * The iOS keyboard does NOT resize the layout viewport, only the visual one;
 * entry rows that must ride above the keyboard consume these vars:
 *
 *   --vv-height   the visual viewport height in px (falls back to 100dvh)
 *   --kb-inset    px of layout viewport hidden by the keyboard (0 when closed)
 *
 * Also stamps `kb-open` on <html> so views can compress/hide chrome while
 * typing. Nothing here is load-bearing: without VisualViewport (old browsers)
 * the vars simply stay at their CSS fallbacks.
 */

let started = false;

export function initViewport(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  const root = document.documentElement;
  const vv = window.visualViewport;

  const apply = () => {
    const height = vv ? vv.height : window.innerHeight;
    // Keyboard inset: how much of the layout viewport the keyboard covers.
    const inset = vv
      ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      : 0;
    root.style.setProperty('--vv-height', `${Math.round(height)}px`);
    root.style.setProperty('--kb-inset', `${Math.round(inset)}px`);
    root.classList.toggle('kb-open', inset > 60);
  };

  if (vv) {
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
  }
  window.addEventListener('orientationchange', () => {
    // iOS reports stale sizes for a beat after rotation.
    setTimeout(apply, 250);
  });
  window.addEventListener('resize', apply);
  apply();
}
