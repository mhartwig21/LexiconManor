/**
 * app/platform/persistence.ts — OWNER: A8 (Platform).
 *
 * The save is the product (AAA 7.17–7.20). Layers on top of the store's
 * per-mutation localStorage persist (app/store.ts, architect-owned):
 *
 *  - Flush points: `visibilitychange: hidden` + `pagehide` (NEVER
 *    `beforeunload` — iOS does not reliably fire it) force a synchronous
 *    localStorage write plus an IndexedDB mirror write.
 *  - Dual-write: every flush and a debounced trail of normal mutations mirror
 *    the SaveV2 blob into IndexedDB. If localStorage comes up empty or
 *    corrupt at boot (Safari eviction, private-mode weirdness), the mirror is
 *    restored and the app reloads once.
 *  - `navigator.storage.persist()` requested at first save; result +
 *    `estimate()` exposed via `getStorageDebugInfo()` for the hidden debug
 *    panel (Chronicles page).
 *  - Quota degradation: a failed save write surfaces a visible warning toast,
 *    never a silent loss.
 */

import { useManorStore, selectSave } from '../store';
import { persistSave, SAVE_KEY, type SaveV2 } from '../save';
import { showPlatformToast } from './toast';

const DB_NAME = 'lexicon-manor';
const DB_STORE = 'kv';
const MIRROR_KEY = 'save-mirror';
const RESTORE_GUARD = 'll-mirror-restored';

let started = false;
let persistGranted: boolean | null = null;
let persistRequested = false;
let mirrorTimer: ReturnType<typeof setTimeout> | null = null;
let warnedThisSession = false;

// --- Tiny IndexedDB promise wrapper (no deps) ------------------------------

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DB_STORE)) {
          req.result.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbWrite(value: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, MIRROR_KEY);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); resolve(false); };
      tx.onabort = () => { db.close(); resolve(false); };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

async function idbRead(): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(MIRROR_KEY);
      req.onsuccess = () => { db.close(); resolve(typeof req.result === 'string' ? req.result : null); };
      req.onerror = () => { db.close(); resolve(null); };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

// --- Save plumbing ---------------------------------------------------------

function currentSave(): SaveV2 {
  return selectSave(useManorStore.getState());
}

/** True when the localStorage copy parses as a v2 save. */
function localSaveHealthy(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && (parsed as { version?: unknown }).version === 2;
  } catch {
    return false;
  }
}

/** Verify the last write actually landed; warn visibly if storage is failing. */
function verifyWrite(json: string): void {
  let ok = false;
  try {
    ok = localStorage.getItem(SAVE_KEY) === json;
  } catch {
    ok = false;
  }
  if (!ok && !warnedThisSession) {
    warnedThisSession = true;
    showPlatformToast({
      message: 'The manor cannot save your journal — device storage may be full.',
      variant: 'warn',
      actionLabel: 'Dismiss',
    });
  }
}

/** Synchronous localStorage write + async IDB mirror. The flush-point path. */
export function flushSave(): void {
  const save = currentSave();
  persistSave(save); // architect-owned writer (already try/caught)
  const json = JSON.stringify(save);
  verifyWrite(json);
  void idbWrite(json);
  requestPersistOnce();
}

function scheduleMirror(): void {
  if (mirrorTimer !== null) return;
  mirrorTimer = setTimeout(() => {
    mirrorTimer = null;
    void idbWrite(JSON.stringify(currentSave()));
  }, 2000);
}

function requestPersistOnce(): void {
  if (persistRequested) return;
  persistRequested = true;
  try {
    void navigator.storage?.persist?.().then(
      (granted) => { persistGranted = granted; },
      () => { persistGranted = null; },
    );
  } catch {
    /* unsupported */
  }
}

/**
 * Boot-time recovery: localStorage empty/corrupt but the IndexedDB mirror has
 * a real save → restore and reload once (guarded so a truly-fresh install
 * never loops). Runs after the store has already hydrated empty; the reload
 * re-hydrates from the restored key.
 */
async function maybeRestoreFromMirror(): Promise<void> {
  if (localSaveHealthy()) return;
  if (sessionStorage.getItem(RESTORE_GUARD)) return;
  const mirrored = await idbRead();
  if (!mirrored) return;
  try {
    const parsed: unknown = JSON.parse(mirrored);
    if (typeof parsed !== 'object' || parsed === null) return;
    if ((parsed as { version?: unknown }).version !== 2) return;
    sessionStorage.setItem(RESTORE_GUARD, '1');
    localStorage.setItem(SAVE_KEY, mirrored);
    location.reload();
  } catch {
    /* mirror unreadable — nothing to restore */
  }
}

export interface StorageDebugInfo {
  persistGranted: boolean | null;
  usage: number | null;
  quota: number | null;
  saveBytes: number;
  mirrorHealthy: boolean;
}

/** For the hidden debug panel (AAA 7.18). */
export async function getStorageDebugInfo(): Promise<StorageDebugInfo> {
  let usage: number | null = null;
  let quota: number | null = null;
  try {
    const est = await navigator.storage?.estimate?.();
    usage = est?.usage ?? null;
    quota = est?.quota ?? null;
  } catch {
    /* unsupported */
  }
  const mirror = await idbRead();
  return {
    persistGranted,
    usage,
    quota,
    saveBytes: JSON.stringify(currentSave()).length,
    mirrorHealthy: mirror !== null,
  };
}

export function initPersistence(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  // Flush points (AAA 7.17): hidden + pagehide, never beforeunload.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
  window.addEventListener('pagehide', () => flushSave());

  // Debounced IDB mirror trailing normal mutations (localStorage is already
  // written per-mutation by the store subscription).
  useManorStore.subscribe(() => scheduleMirror());

  requestPersistOnce();
  void maybeRestoreFromMirror();
}
