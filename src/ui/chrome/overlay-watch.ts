/**
 * overlay-watch — OWNER: A2 (chrome). The "is a modal scene up?" signal.
 *
 * AAA 11.5 says the chrome must not reach through an overlay. Two mechanisms
 * enforce that, deliberately belt-and-braces, because the failure mode is a
 * player ending her own day by accident:
 *
 *   CSS (instant, no JS): chrome.css carries a `:has()` rule that makes
 *     `.chr-header` `pointer-events: none` the moment an overlay is in the
 *     DOM. It needs no framework and cannot lag a frame.
 *   THIS FILE (belt): a MutationObserver stamps `data-overlay-open` on <html>
 *     — which drives the same CSS on any engine without `:has()` — and feeds
 *     `useOverlayOpen()`, so DayHeader stops RENDERING the destructive retire
 *     control at all. A control that is not mounted cannot be hit-tested, so
 *     the guarantee does not rest on a single CSS feature.
 *
 * Why the DOM and not the store: the overlays are mounted from local component
 * state in four agents' files (see OVERLAY_SELECTOR in layers.ts). The store
 * does not know they exist; the document always does.
 *
 * Cost: one observer for the life of the session, childList+subtree only (the
 * typewriter mutates characterData, which we do not observe), coalesced to one
 * `querySelector` per animation frame.
 */

import { useSyncExternalStore } from 'react';
import { OVERLAY_ATTR, OVERLAY_SELECTOR } from './layers';

type Listener = () => void;

const listeners = new Set<Listener>();
let open = false;
let observer: MutationObserver | null = null;
let queued = 0;

function present(): boolean {
  return Boolean(document.querySelector(OVERLAY_SELECTOR));
}

/** Read the DOM, publish the answer. Cheap and idempotent. */
export function syncOverlayState(): boolean {
  if (typeof document === 'undefined') return false;
  const next = present();
  // The attribute is stamped even when nothing subscribed: the CSS fallback
  // for engines without :has() must be correct before React ever renders.
  if (next) document.documentElement.setAttribute(OVERLAY_ATTR, '');
  else document.documentElement.removeAttribute(OVERLAY_ATTR);
  if (next === open) return open;
  open = next;
  for (const fn of listeners) fn();
  return open;
}

function schedule(): void {
  if (queued) return;
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number;
  queued = raf(() => {
    queued = 0;
    syncOverlayState();
  }) as unknown as number;
}

/** Idempotent; safe to call from any mount effect. */
export function installOverlayWatch(): void {
  if (typeof document === 'undefined' || observer) return;
  observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  syncOverlayState();
}

function subscribe(fn: Listener): () => void {
  installOverlayWatch();
  listeners.add(fn);
  // A subscriber that mounts while a scene is already up must not miss it.
  syncOverlayState();
  return () => { listeners.delete(fn); };
}

const snapshot = () => open;
/** Server/test snapshot: nothing is open before there is a document. */
const serverSnapshot = () => false;

/** True while any full-screen modal scene is mounted anywhere in the app. */
export function useOverlayOpen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Test seam: drop the observer and forget the current answer. */
export function resetOverlayWatch(): void {
  observer?.disconnect();
  observer = null;
  listeners.clear();
  open = false;
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute(OVERLAY_ATTR);
  }
}
