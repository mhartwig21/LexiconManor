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
 * ═══ ROUND 28 — A ROOM CHARGES FOR MORE THAN ONE THING ═══════════════════
 *
 * The table below used to be keyed by ROOM, and that was the bug the price
 * tag was invented to prevent. The Conservatory prices two different slips —
 * a letter that is not in the hive, and a word that IS all hive letters but
 * skips the centre — and the missing centre is tested first
 * (engine/hive.ts), so `HONEY` on a hive without H floated "−1 not in the
 * hive" beside a toast that said "Missing E". Same for the Counting House,
 * where the commonest charged weighing is one where every figure is TRUE and
 * the float said "wrong number" anyway.
 *
 * So the word is chosen by the room's OWN key for the mistake — the same key
 * its view keys the toast off, carried on the ledger entry (StepEntry.detail).
 * One decision, two surfaces, and `tests/step-reasons.test.ts` drives the real
 * adapters over the real pools to prove the pair agrees for every costed
 * mistake the manor can actually deal.
 *
 * The room's toast, as shipped, is quoted beside each word. That quote is not
 * decoration: the gate greps the view for it, so a toast cannot be rewritten
 * without this line coming up red.
 */
export const MISTAKE_WORD_BY_DETAIL: Record<string, string> = {
  // "Not quite — 3 threads loose." (CrosswordView) — the CHECK is priced, not
  // the letter; the tester who believed each wrong letter cost 2 read this.
  'crossword:checked-wrong': 'wrong fill',
  // "Still murky — 3/16 letters ring true" (CipherView). Was 'dead letter',
  // which named a LETTER for a charge the Darkroom lays on the whole develop
  // — the same false rule in a different room.
  'cipher:murky': 'still murky',
  // "One away…" (WordWebView) — the room says how close, so the candle does.
  'word-web:one-away': 'one away',
  // "No two of these share a thread." (WordWebView)
  'word-web:wrong': 'wrong group',
  // "Bad letters" (HiveView) — a letter the hive does not hold.
  'hive:bad-letters': 'not in the hive',
  // "Missing E" (HiveView). The word IS in the hive; it skipped the centre.
  'hive:missing-center': 'missing centre',
  // "It must cross the marked tile" (TwistleView).
  'twistle:breaks-rule': 'missed the tile',
  // The Study answers on its card, not in a toast: a wrong guess, priced once.
  'forgotten-word:wrong': 'wrong guess',
  // "2 of your 9 figures are astray" (SudokuView).
  'sudoku:balanced-astray': 'figures astray',
  // "The books balance — all 9 of your figures sit true" (SudokuView): the
  // clerk is paid for the ANSWER. Nothing here was wrong, and the float that
  // said so was the room's own contradiction.
  'sudoku:balanced-true': 'the weighing',
};

/**
 * The fallback word, by room — for a ledger entry saved before `detail`
 * existed, and for a room whose costed mistake is a single thing. Never a
 * word that could be false of one of the room's OTHER charges: the
 * Conservatory and the Counting House both name the charge, not the verdict.
 *
 * Unknown or absent room → "wrong", which is still true and still names the
 * thing being charged for.
 */
export const MISTAKE_WORD: Record<string, string> = {
  crossword: 'wrong fill',
  cipher: 'still murky',
  'word-web': 'wrong group',
  hive: 'not a hive word',
  twistle: 'missed the tile',
  'forgotten-word': 'wrong guess',
  sudoku: 'the weighing',
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
    case 'mistake': return (
      (roomKind && entry.detail && MISTAKE_WORD_BY_DETAIL[`${roomKind}:${entry.detail}`])
      || (roomKind && MISTAKE_WORD[roomKind])
      || 'wrong'
    );
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
