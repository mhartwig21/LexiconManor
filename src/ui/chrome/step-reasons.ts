/**
 * ═══ THE PRICE TAG (COMPREHENSION.md fix 1 — the highest-value label) ═══
 * OWNER: A2 (Economy/Day). Pure; no React, no DOM, no store — the chrome's
 * copy tables live beside it (see rank-up-lines.ts) and are unit-tested in
 * node (tests/step-reasons.test.ts).
 *
 * Three strangers played the live build blind and every one of them finished
 * holding at least one CONFIDENT, WRONG rule about what costs steps: that
 * talking to a character is charged (it is free — only a gift is 1), that a
 * wrong crossword letter costs 2 each (letters are free probes; only the
 * auto-check on a full wrong grid is priced), that the hive charges for
 * guesses (invalid/short/duplicate are weight 0). Two of them started
 * RATIONING CONVERSATIONS in a game whose stated pillar is the characters.
 *
 * The meter had the answer the whole time and threw it away: every ledger
 * entry carries a `reason`, and StepMeter rendered a number and a colour
 * class. So the float now says the word. Nothing is computed that was not
 * already in the ledger — the fix is a label, not a system, and the four false
 * rules above die on the FIRST float the player sees, because a price she can
 * read is a price she stops inventing.
 */

import { CLIMB_KEY_SEP } from '../../engine/economy/steps';
import type { StepEntry } from '../../engine/types';

/**
 * A costed mistake, in the room's own vocabulary. The reason is a single
 * `'mistake'` for all seven rooms, but the entry carries the cell it was made
 * in and the manor knows what stands there — so "−2" becomes "−2 wrong fill"
 * in the Linen Closet and "−1 dead letter" in the Darkroom, which is the
 * difference between a price and a mystery. Unknown or absent room → "wrong",
 * which is still true and still names the thing being charged for.
 *
 * Keyed by `RoomPuzzleKind`; the test walks `ROOM_PUZZLE_KINDS` so a new room
 * cannot ship with a mistake nobody can name.
 */
export const MISTAKE_WORD: Record<string, string> = {
  crossword: 'wrong fill',
  cipher: 'dead letter',
  'word-web': 'wrong group',
  hive: 'not in the hive',
  twistle: 'wrong claim',
  'forgotten-word': 'wrong guess',
  sudoku: 'wrong number',
};

/**
 * The word beside the number. One or two words; never a sentence — it rides a
 * float under a bar that is exactly full at 375px, and a label that overflows
 * is a worse defect than the one it fixes.
 *
 * The switch is exhaustive over `StepReason` on purpose: a new reason added to
 * the ledger fails the typecheck here rather than shipping a silent number.
 */
export function reasonWord(entry: StepEntry, roomKind?: string): string {
  switch (entry.reason) {
    // "from>to" is the climb differential priced on the step through a door
    // (steps.ts `climbKey`); a plain "col,row" is a walk across her own floor.
    // Climbing IS the expense in this economy and the meter should say so.
    case 'move': return entry.roomKey?.includes(CLIMB_KEY_SEP) ? 'climb' : 'walk';
    case 'mistake': return (roomKind && MISTAKE_WORD[roomKind]) || 'wrong';
    case 'hint': return 'hint';
    case 'solve': return 'solved';
    // Named for the rule that earns it, not for the grade: the bonus arrives
    // exactly when no mistake and no hint was costed, and nobody knew that.
    case 'perfect': return 'no mistakes';
    case 'tea': return 'tea';
    case 'snack': return 'refill';
    case 'pet-dewey': return 'Dewey';
    case 'gift': return 'gift';
    case 'day-start': return 'the day';
  }
}
