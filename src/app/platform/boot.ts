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

let booted = false;

export function bootPlatform(): void {
  if (booted || typeof window === 'undefined') return;
  booted = true;

  initViewport();
  initPersistence();
  registerServiceWorker();
  startMusicDirector();

  // Pinch-zoom never reaches the page (AAA 7.11); boards additionally set
  // touch-action:none locally. `gesturestart` is the Safari-only pinch event.
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // Portrait-please screen (AAA 7.10) — shown purely via CSS media query.
  const rotate = document.createElement('div');
  rotate.className = 'platform-rotate';
  rotate.textContent = 'The manor reads best held upright — turn your device to portrait, dear.';
  document.body.appendChild(rotate);
}
