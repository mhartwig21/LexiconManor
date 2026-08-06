/**
 * app/platform/viewport.ts — OWNER: A8 (Platform).
 *
 * VisualViewport → CSS custom properties (ARCHITECTURE §9, AAA 7.9).
 * The iOS keyboard does NOT resize the layout viewport, only the visual one;
 * entry rows that must ride above the keyboard consume these vars:
 *
 *   --vv-height   the visual viewport height in px (falls back to 100dvh)
 *   --kb-inset    px of layout viewport hidden by the keyboard (0 when closed)
 *   --kb-shift    px the shell must rise so the FOCUSED entry row clears the
 *                 keyboard (0 ≤ shift ≤ inset); platform.css consumes it via
 *                 `html.kb-open #root { transform: translateY(-shift) }`
 *
 * Also stamps `kb-open` on <html> so views can compress/hide chrome while
 * typing. The shift is computed here (not per-room CSS) because the shell is
 * position:fixed with page scrolling disabled — Safari's involuntary
 * visual-viewport pan is unreliable inside it, so every room with a real
 * <input> (Sanctum, Study whisper, Pantry, Music Room) gets keyboard
 * avoidance from the platform for free. On dismiss `kb-open` drops and the
 * transform rule disappears — layout snaps clean, no dead space.
 *
 * Nothing here is load-bearing: without VisualViewport (old browsers)
 * the vars simply stay at their CSS fallbacks.
 */

let started = false;
let shiftPx = 0;

const EDITABLE = 'input, textarea, [contenteditable="true"]';

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
    const open = inset > 60;
    root.classList.toggle('kb-open', open);

    // AAA 7.9: ride the focused entry row above the keyboard. Measure how far
    // the focused editable's bottom sits below the visible region (the visual
    // viewport spans offsetTop..offsetTop+height in layout coordinates) and
    // lift the shell by exactly that much, clamped to the keyboard inset.
    // getBoundingClientRect() already reflects the current shift (the
    // transform is on #root, an ancestor), so re-applying converges instead
    // of compounding.
    let next = 0;
    if (open) {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.matches(EDITABLE)) {
        const rect = el.getBoundingClientRect();
        const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
        const needed = rect.bottom + 12 - visibleBottom;
        next = Math.max(0, Math.min(shiftPx + needed, inset));
      }
    }
    shiftPx = Math.round(next);
    root.style.setProperty('--kb-shift', `${shiftPx}px`);
  };

  if (vv) {
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
  }
  // Focus moves between entry rows while the keyboard stays up (no vv resize
  // fires) — recompute on the next frame, and once more after the iOS
  // keyboard/caret animation settles.
  const reapply = () => {
    requestAnimationFrame(apply);
    setTimeout(apply, 250);
  };
  document.addEventListener('focusin', reapply);
  document.addEventListener('focusout', reapply);
  window.addEventListener('orientationchange', () => {
    // iOS reports stale sizes for a beat after rotation.
    setTimeout(apply, 250);
  });
  window.addEventListener('resize', apply);
  apply();
}
