/**
 * U.1 pressed-state helper — OWNER: A3.
 *
 * iOS Safari applies `:active` late (or not at all) on touch, so every
 * tappable in the anchor rooms gets an `.is-pressed` class toggled
 * synchronously from `pointerdown` — the squash lands within one frame of the
 * finger touching glass. `:active` stays in the CSS as a desktop fallback
 * only. The class is toggled directly on the element (no React state), so no
 * render pass sits between touch and feedback.
 */

import type * as React from 'react';

export interface PressExtras<T extends HTMLElement> {
  /** Runs on pointerdown, after the pressed class lands (e.g. letter insert). */
  down?: (e: React.PointerEvent<T>) => void;
  /** Runs on pointerup/leave/cancel, after the pressed class clears. */
  up?: (e: React.PointerEvent<T>) => void;
}

/** Spread onto any element: `<button {...pressProps()} onClick={…}>`. */
export function pressProps<T extends HTMLElement>(extra?: PressExtras<T>) {
  const release = (e: React.PointerEvent<T>) => {
    e.currentTarget.classList.remove('is-pressed');
    extra?.up?.(e);
  };
  return {
    onPointerDown: (e: React.PointerEvent<T>) => {
      e.currentTarget.classList.add('is-pressed');
      extra?.down?.(e);
    },
    onPointerUp: release,
    onPointerLeave: release,
    onPointerCancel: release,
  };
}
