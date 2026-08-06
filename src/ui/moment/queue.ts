/**
 * The moment queue as an observable singleton — OWNER: the moment layer.
 *
 * Deliberately NOT a zustand slice and NOT React state: the queue must outlive
 * every screen, so it cannot be owned by a component (that was the whole
 * defect — a mount-scoped `useRef` cursor in ManorPage). It is a plain
 * external store; the layer reads it with `useSyncExternalStore`, and the
 * watcher pushes into it from a store subscription that starts at boot.
 */

import { advance, enqueue, EMPTY_QUEUE, type Moment, type QueueState } from './moments';

export interface MomentQueue {
  getState(): QueueState;
  subscribe(listener: () => void): () => void;
  /** Announce a grant. Deduped by key; never drops the newest. */
  push(moment: Moment): void;
  /** Tap-to-dismiss / auto-dismiss: promote the next one. */
  dismiss(): void;
  /** Tests only — a fresh manor for each case. */
  reset(): void;
}

export function createMomentQueue(): MomentQueue {
  let state: QueueState = EMPTY_QUEUE;
  const listeners = new Set<() => void>();
  const emit = () => { for (const l of [...listeners]) l(); };
  const commit = (next: QueueState) => {
    if (next === state) return;
    state = next;
    emit();
  };
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    push: (moment) => commit(enqueue(state, moment)),
    dismiss: () => commit(advance(state)),
    reset: () => commit(EMPTY_QUEUE),
  };
}

/** The one queue the app renders. */
export const momentQueue = createMomentQueue();
