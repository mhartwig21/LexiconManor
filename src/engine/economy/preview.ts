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
 * - puzzle rooms: "micro · +3 steps on solve" / "anchor · +6/+5/+4 steps on
 *   solve" (value from STEP_TABLE.solve at this tier — note the payouts get
 *   LEANER as you climb after the 2026-08 owner retune, so the card face is
 *   also the warning that a tier-3 room will not pay for the stairs it took
 *   to reach it);
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
    const payout = STEP_TABLE.solve(size, tier);
    // Round 10: the card face states what a solve is worth in FULL, because
    // the solve is now the engine of both arcs — steps back into the day, a
    // key toward the padlocks above (`solveKeys`), and pages made out in the
    // journal. Derived, never hand-copied, so a retune moves every card.
    const keys = solveKeys(tier);
    const parts = [`+${payout} steps`];
    if (keys > 0) parts.push(`+${keys} key${keys === 1 ? '' : 's'}`);
    return { size, label: `${size} · ${parts.join(' · ')} on solve` };
  }
  return null;
}
