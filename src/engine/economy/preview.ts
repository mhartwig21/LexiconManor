/**
 * Draft-card economy preview — OWNER: A2 (Economy/Day). Pure TS, no React.
 *
 * AAA 4.10/1.17 (BP benchmark: cards state their mechanical effects): what a
 * room pays back into the day is the single most consequential axis of the
 * draft, so the DraftModal meta row must say it in numbers, not vibes.
 * Everything here is DERIVED from STEP_TABLE + the room-adapter registry, so
 * wife-playtest tuning of steps.ts (or a size change on an adapter) updates
 * every card automatically — no hand-copied numbers on the UI side.
 */

import type { RoomCard, Tier } from '../types';
import { getRoomAdapter } from '../rooms/registry';
import { effortLabel } from './effort';
import { solveKeys, STEP_TABLE } from './steps';

/** What the ui needs to say about a card's payback, already stringified. */
export interface DraftCardStake {
  /**
   * 'micro' | 'anchor' for puzzle rooms; null when size is not the story.
   *
   * ROUND 33: this is still the engine's honest classification and still
   * decides the payout — it is simply no longer PRINTED. See the size-word
   * note on `draftCardStake` below.
   */
  size: 'micro' | 'anchor' | null;
  /** The meta-row line, e.g. "five minutes or so · +6 steps on solve". */
  label: string;
}

/**
 * The economy line for a draft card at the target row's tier.
 * - puzzle rooms: "anchor · a long sit · +12 steps · +1 key on solve" — the
 *   room's own expected LENGTH and its own price, both from the one table
 *   (`ROOM_EFFORT` + `STEP_TABLE.solve`, round 22 / REVIEW_AA §6). Until then
 *   every anchor wore the same face, `+6/+5/+4`, whether it was twenty seconds
 *   or a quarter of an hour, so "the correct strategy is to abandon half of
 *   them on sight" was a lesson only a lost evening could teach. Payouts still
 *   get leaner as you climb, so the face is also the warning that a tier-3 room
 *   will not pay for the stairs it took to reach it;
 * - mystery rooms: "+1 sealed page" (round 10 — the clue still drips on ENTRY
 *   and is hers forever, AAA 4.14, but it arrives undeciphered and a solved
 *   word game is what makes it out, so the card must not promise a reading it
 *   does not hand over);
 * - parlor/utility: null — parlors trade in conversation, and utility cards
 *   already print their own numbers in the card preview line.
 */
export function draftCardStake(
  card: Pick<RoomCard, 'category' | 'puzzleKind'>,
  tier: Tier,
): DraftCardStake | null {
  if (card.category === 'mystery') {
    return { size: null, label: '+1 sealed page' };
  }
  if (card.category === 'puzzle' && card.puzzleKind) {
    const size = getRoomAdapter(card.puzzleKind)?.size ?? 'anchor';
    const payout = STEP_TABLE.solve(size, tier, card.puzzleKind);
    // Round 10: the card face states what a solve is worth in FULL, because
    // the solve is now the engine of both arcs — steps back into the day, a
    // key toward the padlocks above (`solveKeys`), and pages made out in the
    // journal. Derived, never hand-copied, so a retune moves every card.
    const keys = solveKeys(tier, card.puzzleKind);
    // ROUND 22 (REVIEW_AA §6: *"the draft card states the expected time"*).
    // The rooms cost wildly different amounts of a player's evening — twenty
    // seconds in the Gallery against a quarter of an hour in the Conservatory —
    // and the card said nothing about it, so "the correct strategy is to
    // abandon half of them on sight" was a lesson she could only learn by
    // losing evenings to it. It leads the line because it is the first thing
    // she is choosing between, and it is words rather than a stopwatch: this is
    // a cozy game and every room is leavable (AAA 4.13).
    // ROUND 42 — "+1 steps" WAS UNREACHABLE UNTIL IT WASN'T. This read
    // `+${payout} steps`, and it was correct for six rounds because the cozy
    // floor was +4 and no room could ever pay one. Denominated in moves the
    // floor IS 1 (`SOLVE_WAGE.floor`) and five of the seven shipped rooms sit on
    // it, so the commonest card in the deck would have printed "+1 steps".
    // Pluralised off the number, like `moveCostLabel` beside it.
    const parts = [`+${payout} step${payout === 1 ? '' : 's'}`];
    if (keys > 0) parts.push(`+${keys} key${keys === 1 ? '' : 's'}`);
    // ═══ ROUND 33 — THE SIZE WORD COMES OFF (COMPREHENSION 33, fix 5) ═══════
    // Two blind testers, unprompted, named "anchor · micro · standard · common
    // · unusual · tiers I–III" under *what I never figured out*, and the 10 Aug
    // tester before them chose a room ON the size word believing it meant
    // something about the climb. It never did: `size` is the payout band's own
    // name, and the clause immediately beside it — `effortLabel` — already says
    // the thing the player was trying to read off it, in minutes, in English.
    // So the word goes and the minutes stay. Nothing is hidden here: `size`
    // still decides `STEP_TABLE.solve`, and the number that comes out of it is
    // printed two clauses along.
    return {
      size,
      label: `${effortLabel(card.puzzleKind, tier)} · ${parts.join(' · ')} on solve`,
    };
  }
  return null;
}
