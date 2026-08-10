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
  /** 'micro' | 'anchor' for puzzle rooms; null when size is not the story. */
  size: 'micro' | 'anchor' | null;
  /** The meta-row line, e.g. "anchor · +7 steps on solve" or "+1 fragment". */
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
    const parts = [`+${payout} steps`];
    if (keys > 0) parts.push(`+${keys} key${keys === 1 ? '' : 's'}`);
    return {
      size,
      label: `${size} · ${effortLabel(card.puzzleKind, tier)} · ${parts.join(' · ')} on solve`,
    };
  }
  return null;
}
