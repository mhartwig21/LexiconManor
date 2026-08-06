/**
 * app/platform/boot.ts — OWNER: A8 (Platform).
 *
 * One idempotent entry point wiring the whole platform layer, called once
 * from main.tsx. Everything initialized here is a progressive enhancement:
 * the game runs complete without any of it (R.4 for audio; SW/IDB likewise).
 */

import './platform.css';
import { initViewport } from './viewport';
import { initPersistence } from './persistence';
import { registerServiceWorker } from '../pwa';
import { startMusicDirector } from '../music/director';
import { loadPools } from '../pools';

let booted = false;

/**
 * U.1: pressed state from pointerdown on EVERY tappable, not iOS Safari's
 * conditional :active heuristics. One capture-phase delegate covers hexes,
 * tiles, letter keys, seals, choices and buttons alike; components style
 * `.is-pressed` (platform.css ships the base ink-darken + translate, rooms
 * layer richer specs like the hex scale-spring on the same class).
 */
function initPressedState(): void {
  // Round-4: `.hex`/`.tile` were speculative names that no shipped room ever
  // used. The real tappables are all real <button>s (hive cells, web tiles,
  // twistle cells, cipher letters, crossword squares/keys/clues, choices,
  // seals) — plus anything that opts in with [data-pressable] or an ARIA
  // button role. Every one of them now carries a `.is-pressed` rule in its
  // own module CSS, so the bespoke press spec fires from pointerdown rather
  // than from iOS Safari's late/absent :active (round-3 platform major).
  const PRESSABLE = 'button, [role="button"], a[href], [data-pressable]';
  const pressed = new Map<number, Element>();

  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target instanceof Element ? e.target.closest(PRESSABLE) : null;
      if (!target || target.closest('[disabled], [aria-disabled="true"]')) return;
      target.classList.add('is-pressed');
      pressed.set(e.pointerId, target);
    },
    { capture: true, passive: true },
  );

  const release = (e: PointerEvent) => {
    const el = pressed.get(e.pointerId);
    if (!el) return;
    el.classList.remove('is-pressed');
    pressed.delete(e.pointerId);
  };
  // Capture phase: touch implicitly pointer-captures the pressed element, so
  // pointerup/cancel always retarget it even when the finger slid off.
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  window.addEventListener('blur', () => {
    for (const el of pressed.values()) el.classList.remove('is-pressed');
    pressed.clear();
  });
}

export function bootPlatform(): void {
  if (booted || typeof window === 'undefined') return;
  booted = true;

  initViewport();
  initPressedState();
  initPersistence();
  registerServiceWorker();
  startMusicDirector();

  // AAA 9.6/7.3: content pools are code-split out of the eager bundle
  // (app/pools.ts). Warm them right after first paint — double-rAF lands
  // after the first committed frame — so the day-start gate that awaits
  // loadPools() almost never actually waits. Fire-and-forget: failures
  // surface at the awaited gate, not here.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => void loadPools().catch(() => {}));
  });

  // Pinch-zoom never reaches the page (AAA 7.11); boards additionally set
  // touch-action:none locally. `gesturestart` is the Safari-only pinch event.
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // Portrait-please screen (AAA 7.10) — shown purely via CSS media query.
  const rotate = document.createElement('div');
  rotate.className = 'platform-rotate';
  rotate.textContent = 'The manor reads best held upright — turn your device to portrait, dear.';
  document.body.appendChild(rotate);
}
