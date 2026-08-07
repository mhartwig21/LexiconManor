/**
 * THE CEREMONY GATE — OWNER: the moment layer (src/ui/moment/*).
 *
 * ROUND 12, MEASURED: the first thing the introduction card was photographed
 * next to was the moment layer's own wax seal. Day 1 opens with a letter from
 * Posy waiting in the tray, the watcher announces it the instant the store
 * settles, and the shot at `docs/shots/round12/meeting/` had TWO raised
 * deckle-edged cards with wax discs stacked up the glass — the campaign seal
 * on top, Mrs. Bramble's introduction underneath it. Both were correct on
 * their own terms and together they cancelled: the whole point of the
 * ceremony is that it is unmistakable, and it cannot be that while something
 * built out of the same wax and the same paper is sitting above it.
 *
 * So the layer takes a turn. A full-glass ceremony HOLDS the gate while it is
 * on screen; the seal renders nothing and — the load-bearing half — does not
 * arm its dwell timer, so the grant WAITS rather than expiring behind the card
 * (AAA 11.13: a moment is never timed out into a screen nobody was looking
 * at). The queue is untouched: nothing is dropped, nothing is de-duplicated
 * away, and the seal presses in the moment the card hands off.
 *
 * This is the same shape as `sealDock` next door — a tiny external store the
 * SURFACE publishes into and the LAYER reads — rather than a prop, because the
 * layer is mounted outside the router and has no tree in common with the
 * scene it is deferring to.
 */

let held = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of [...listeners]) l();
}

export const ceremonyGate = {
  /** Is a full-glass ceremony on the glass right now? */
  get: (): boolean => held > 0,

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },

  /**
   * Claim the glass. Returns the release — call it once, on unmount.
   *
   * Counted rather than boolean so an overlapping pair (a card handing off
   * while React still has the outgoing one mounted for a frame) cannot leave
   * the gate stuck open or stuck shut.
   */
  hold(): () => void {
    held += 1;
    if (held === 1) emit();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      held -= 1;
      if (held === 0) emit();
    };
  },

  /** Tests only. */
  reset(): void {
    if (held === 0) return;
    held = 0;
    emit();
  },
};
