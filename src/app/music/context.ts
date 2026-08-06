/**
 * app/music/context.ts — lazy singleton AudioContext + iOS lifecycle glue.
 * OWNER: A8 (Platform). The only place an AudioContext is ever constructed.
 *
 * Rules encoded (ARCHITECTURE §8, AAA 7.14–7.16, 8.12, R.4):
 *  - Created lazily; unlocked by a user gesture on `pointerup`/`touchend`
 *    (NEVER `touchstart` — iOS requires the gesture to complete).
 *  - Nothing anywhere waits on AudioContext state. Every resume() is
 *    fire-and-forget; the game is complete fully silent.
 *  - Interrupted-state recovery: `statechange` + `visibilitychange` retry
 *    resume() and re-arm a one-time gesture listener as a fallback.
 *  - Sample-rate-flip defense: repeated resume failure or a detected render
 *    stall tears the context down (`hardRestart`); graph.ts rebuilds
 *    idempotently against the fresh context on the next unlock gesture.
 *  - `navigator.audioSession.type = 'playback'` only behind the
 *    muteSwitchBypass settings toggle (open question AAA §10.4).
 */

type ContextListener = (ctx: AudioContext) => void;

let ctx: AudioContext | null = null;
let unlockArmed = false;
let lifecycleArmed = false;
let resumeFailures = 0;

const readyListeners = new Set<ContextListener>();
const teardownListeners = new Set<() => void>();
const suspendListeners = new Set<() => void>();
const resumeListeners = new Set<ContextListener>();

export function isAudioSupported(): boolean {
  return typeof window !== 'undefined' && typeof AudioContext !== 'undefined';
}

/** The live context, or null. Never blocks, never throws. */
export function currentContext(): AudioContext | null {
  return ctx && ctx.state !== 'closed' ? ctx : null;
}

/**
 * Get-or-create the context. Safe to call from inside a user-gesture handler
 * (sfx does this); outside a gesture the context may sit suspended until the
 * armed unlock listener fires — which is fine, nothing waits on it.
 */
export function ensureContext(): AudioContext | null {
  if (!isAudioSupported()) return null;
  if (!ctx || ctx.state === 'closed') {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
    armLifecycle();
  }
  if (ctx.state !== 'running') tryResume();
  return ctx;
}

function notifyReady(ac: AudioContext): void {
  for (const fn of readyListeners) fn(ac);
}

function tryResume(): void {
  const ac = ctx;
  if (!ac || ac.state === 'closed') return;
  ac.resume().then(
    () => {
      resumeFailures = 0;
      notifyReady(ac);
      for (const fn of resumeListeners) fn(ac);
    },
    () => {
      resumeFailures += 1;
      // iOS can wedge a context after route/sample-rate flips. Two straight
      // failures → burn it down and rebuild fresh on the next gesture.
      if (resumeFailures >= 2) hardRestart();
      else armUnlock();
    },
  );
}

/** One-time gesture unlock: pointerup/touchend only (iOS rule). */
export function armUnlock(): void {
  if (unlockArmed || !isAudioSupported()) return;
  unlockArmed = true;
  const handler = () => {
    unlockArmed = false;
    window.removeEventListener('pointerup', handler, true);
    window.removeEventListener('touchend', handler, true);
    ensureContext();
  };
  window.addEventListener('pointerup', handler, true);
  window.addEventListener('touchend', handler, true);
}

function armLifecycle(): void {
  if (lifecycleArmed || typeof document === 'undefined') return;
  lifecycleArmed = true;

  document.addEventListener('visibilitychange', () => {
    const ac = currentContext();
    if (!ac) return;
    if (document.visibilityState === 'hidden') {
      for (const fn of suspendListeners) fn();
      void ac.suspend().catch(() => undefined);
    } else {
      tryResume();
    }
  });

  // statechange fires on iOS 'interrupted' (calls, Siri, lock screen).
  const watchState = () => {
    const ac = ctx;
    if (!ac) return;
    ac.addEventListener('statechange', () => {
      const state = ac.state as AudioContextState | 'interrupted';
      if (state === 'interrupted' || (state === 'suspended' && document.visibilityState === 'visible')) {
        tryResume();
        armUnlock(); // gesture fallback if the silent retry is refused
      }
    });
  };
  watchState();
}

/**
 * Tear down and prepare for a clean rebuild (sample-rate flip / wedged
 * context). graph.ts caches per-context, so a fresh context gets a fresh
 * graph automatically. Fire-and-forget; next gesture re-creates.
 */
export function hardRestart(): void {
  const old = ctx;
  ctx = null;
  resumeFailures = 0;
  for (const fn of teardownListeners) fn();
  if (old && old.state !== 'closed') void old.close().catch(() => undefined);
  armUnlock();
}

/** fn fires whenever a context reaches running (including after rebuilds). */
export function onContextReady(fn: ContextListener): () => void {
  readyListeners.add(fn);
  const ac = currentContext();
  if (ac && ac.state === 'running') fn(ac);
  return () => readyListeners.delete(fn);
}

/** fn fires when the app is hidden (schedulers should pause). */
export function onAudioSuspend(fn: () => void): () => void {
  suspendListeners.add(fn);
  return () => suspendListeners.delete(fn);
}

/** fn fires on resume-from-hidden (schedulers fast-forward, no backlog burst). */
export function onAudioResume(fn: ContextListener): () => void {
  resumeListeners.add(fn);
  return () => resumeListeners.delete(fn);
}

/** fn fires when the context is being torn down (drop node references). */
export function onContextTeardown(fn: () => void): () => void {
  teardownListeners.add(fn);
  return () => teardownListeners.delete(fn);
}

/** AAA 7.16 / §10.4 — ring-switch bypass is a deliberate, toggleable choice. */
export function applyAudioSessionPolicy(bypassMuteSwitch: boolean): void {
  try {
    const session = (navigator as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = bypassMuteSwitch ? 'playback' : 'auto';
  } catch {
    /* older iOS / non-iOS: no-op */
  }
}
