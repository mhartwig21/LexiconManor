/**
 * kind → adapter registry (ARCHITECTURE §2, conflict rule 2).
 *
 * REGISTRATION PROTOCOL (frozen):
 *  - Each agent registers ONLY inside their own comment fence, in BOTH the
 *    import section and the entries section.
 *  - One line per room, ordered ALPHABETICALLY BY KIND within the fence.
 *  - Never touch code outside your fence; fences are pre-ordered A3 → A4 → A5
 *    so concurrent one-line inserts auto-merge cleanly.
 *  - Adapters live in `./adapters/<kind>.ts` (A3) or alongside the puzzle
 *    module (A4/A5) — pure TS, zero React/DOM/audio.
 */

import type { RoomPuzzleAdapter, RoomPuzzleKind } from './room-puzzle';

// <<A3:imports>> anchors — alphabetical: forgotten-word, hive, twistle, word-web
import { forgottenWordAdapter } from './adapters/forgotten-word';
import { hiveAdapter } from './adapters/hive';
import { twistleAdapter } from './adapters/twistle';
import { wordWebAdapter } from './adapters/word-web';
// <<end A3:imports>>
// <<A4:imports>> micro batch 1 — alphabetical: cipher
import { cipherAdapter } from '../puzzles/cipher-adapter';
// <<end A4:imports>>
// <<A5:imports>> micro batch 2 — alphabetical: crossword
import { crosswordAdapter } from '../puzzles/crossword-adapter';
// <<end A5:imports>>
// <<SUDOKU:imports>> playtest round — alphabetical: sudoku
import { sudokuAdapter } from '../puzzles/sudoku-adapter';
// <<end SUDOKU:imports>>

const ADAPTERS: Partial<Record<RoomPuzzleKind, RoomPuzzleAdapter>> = {
  // <<A3:entries>> anchors — alphabetical: forgotten-word, hive, twistle, word-web
  'forgotten-word': forgottenWordAdapter as RoomPuzzleAdapter,
  'hive': hiveAdapter as RoomPuzzleAdapter,
  'twistle': twistleAdapter as RoomPuzzleAdapter,
  'word-web': wordWebAdapter as RoomPuzzleAdapter,
  // <<end A3:entries>>
  // <<A4:entries>> micro batch 1 — alphabetical: cipher
  'cipher': cipherAdapter as RoomPuzzleAdapter,
  // <<end A4:entries>>
  // <<A5:entries>> micro batch 2 — alphabetical: crossword
  'crossword': crosswordAdapter as RoomPuzzleAdapter,
  // <<end A5:entries>>
  // <<SUDOKU:entries>> playtest round — alphabetical: sudoku
  'sudoku': sudokuAdapter as RoomPuzzleAdapter,
  // <<end SUDOKU:entries>>
};

/** Undefined until the owning agent lands the adapter — callers must handle it. */
export function getRoomAdapter(kind: RoomPuzzleKind): RoomPuzzleAdapter | undefined {
  return ADAPTERS[kind];
}

export function registeredRoomKinds(): RoomPuzzleKind[] {
  return Object.keys(ADAPTERS) as RoomPuzzleKind[];
}
