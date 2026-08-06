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
import { STEP_TABLE } from './steps';

/** What the ui needs to say about a card's payback, already stringified. */
export interface DraftCardStake {
  /** 'micro' | 'anchor' for puzzle rooms; null when size is not the story. */
  size: 'micro' | 'anchor' | null;
  /** The meta-row line, e.g. "anchor · +7 steps on solve" or "+1 fragment". */
  label: string;
}

/**
 * The economy line for a draft card at the target row's tier.
 * - puzzle rooms: "micro · +3 steps on solve" / "anchor · +6/+7/+8 steps on
 *   solve" (value from STEP_TABLE.solve at this tier);
 * - mystery rooms: "+1 fragment" (the clue drips on entry, AAA 4.14);
 * - parlor/utility: null — parlors trade in conversation, and utility cards
 *   already print their own numbers in the card preview line.
 */
export function draftCardStake(
  card: Pick<RoomCard, 'category' | 'puzzleKind'>,
  tier: Tier,
): DraftCardStake | null {
  if (card.category === 'mystery') {
    return { size: null, label: '+1 fragment' };
  }
  if (card.category === 'puzzle' && card.puzzleKind) {
    const size = getRoomAdapter(card.puzzleKind)?.size ?? 'anchor';
    const payout = STEP_TABLE.solve(size, tier);
    return { size, label: `${size} · +${payout} steps on solve` };
  }
  return null;
}
