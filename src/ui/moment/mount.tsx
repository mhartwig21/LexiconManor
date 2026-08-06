/**
 * Mounting the moment layer — OWNER: the moment layer.
 *
 * The layer must be mounted ONCE, outside the router, for the life of the
 * session. The architect owns App.tsx, so until `<MomentLayer />` sits there
 * (see SHARED-FILE REQUESTS) the layer bootstraps itself into its own root on
 * document.body: a host div appended last, so it stacks above every game
 * surface without any component's tree owning it, and no route change can
 * unmount it. `ensureMomentLayer()` is idempotent and safe to call from any
 * screen's mount effect.
 *
 * When App.tsx does gain `<MomentLayer />`, this file needs no edit: the
 * mounted layer calls `retireBootstrapLayer()` and the bootstrap root removes
 * itself, so the two mount paths can never both be live.
 */

import { createRoot, type Root } from 'react-dom/client';
import MomentLayer from './MomentLayer';
import { installMomentWatch } from './watch';

export const MOMENT_HOST_ID = 'lm-moment-root';

let root: Root | null = null;
let host: HTMLElement | null = null;

export function ensureMomentLayer(): void {
  if (typeof document === 'undefined') return; // node/test environment
  // The watch is the load-bearing half: it must run even in the (impossible,
  // but cheap to insure) case where rendering the layer fails — a queued
  // moment survives to the next mount rather than being lost (AAA 11.13).
  installMomentWatch();
  if (root || document.getElementById(MOMENT_HOST_ID)) return;
  host = document.createElement('div');
  host.id = MOMENT_HOST_ID;
  document.body.appendChild(host);
  root = createRoot(host);
  root.render(<MomentLayer bootstrap />);
}

/** Called by an app-tree-mounted layer so only one instance is ever live. */
export function retireBootstrapLayer(): void {
  if (!root) return;
  const dying = root;
  const dyingHost = host;
  root = null;
  host = null;
  // Deferred: unmounting one root synchronously from another root's effect is
  // a React warning, and this only ever runs during App's first commit.
  setTimeout(() => {
    dying.unmount();
    dyingHost?.remove();
  }, 0);
}
