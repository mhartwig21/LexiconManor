/**
 * kind → view registry (ARCHITECTURE §2, conflict rule 2).
 *
 * Same fence protocol as engine/rooms/registry.ts: one line per room inside
 * YOUR fence only, alphabetical by kind. Views are React components rendered
 * by RoomHost; they receive { puzzle, state, tier, dispatch } and NEVER import
 * the store for economy — all step/gem effects flow through the adapter's
 * RoomEvents, applied by the room slice.
 *
 * A3 views live in ui/rooms/anchor/*, A4/A5 views in ui/rooms/micro/*.
 * Per-module CSS is imported by the view module itself (conflict rule 3).
 */

import type { ComponentType } from 'react';
import type { RoomPuzzleKind } from '../../engine/rooms/room-puzzle';
import type { Tier } from '../../engine/types';

/** Props every room view receives from RoomHost. */
export interface RoomViewProps<P = unknown, S = unknown, A = unknown> {
  puzzle: P;
  state: S;
  tier: Tier;
  dispatch: (action: A) => void;
}

// <<A3:imports>> anchors — alphabetical: forgotten-word, hive, twistle, word-web
import ForgottenWordView from './anchor/ForgottenWordView';
import HiveView from './anchor/HiveView';
import TwistleView from './anchor/TwistleView';
import WordWebView from './anchor/WordWebView';
// <<end A3:imports>>
// <<A4:imports>> micro batch 1 — alphabetical: anagram, cipher, ladder
// <<end A4:imports>>
// <<A5:imports>> micro batch 2 — alphabetical: category, crossword, rhyme
// <<end A5:imports>>

const VIEWS: Partial<Record<RoomPuzzleKind, ComponentType<RoomViewProps>>> = {
  // <<A3:entries>> anchors — alphabetical: forgotten-word, hive, twistle, word-web
  'forgotten-word': ForgottenWordView as unknown as ComponentType<RoomViewProps>,
  'hive': HiveView as unknown as ComponentType<RoomViewProps>,
  'twistle': TwistleView as unknown as ComponentType<RoomViewProps>,
  'word-web': WordWebView as unknown as ComponentType<RoomViewProps>,
  // <<end A3:entries>>
  // <<A4:entries>> micro batch 1 — alphabetical: anagram, cipher, ladder
  // <<end A4:entries>>
  // <<A5:entries>> micro batch 2 — alphabetical: category, crossword, rhyme
  // <<end A5:entries>>
};

/** Undefined until the owning agent lands the view — RoomHost shows a fallback. */
export function getRoomView(kind: RoomPuzzleKind): ComponentType<RoomViewProps> | undefined {
  return VIEWS[kind];
}
