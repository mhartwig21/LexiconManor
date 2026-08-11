/**
 * ═══ THE DAY'S ACCOUNT, IN LINES (COMPREHENSION round 32, fix 2) ═══════════
 * OWNER: A2 (Economy/Day). Pure; no React, no DOM, no store — unit-tested in
 * node (tests/ledger-lines.test.ts) beside its sibling step-reasons.ts.
 *
 * WHY A LEDGER AND NOT ANOTHER LABEL.
 *
 * Round 26 shipped the reason word on every step float (step-reasons.ts) — the
 * fix the previous cold read ranked #1. It is correct, it is routed correctly,
 * and the follow-up cold read proved it MOVED NOBODY. Both blind testers
 * independently reported their step counter moving for reasons they could not
 * see; one logged three separate unexplained movements and marked all three
 * "resolved: never". The words were right. The SURFACE was wrong: a float that
 * lives 1150ms, caps at 3 per batch, staggers by 130ms and spawns in the
 * top-right corner, while the player's eyes are on a puzzle board in the
 * middle of the screen.
 *
 * Two rounds of this project have now put labels on prices and never once
 * given the player a place to LOOK. This module is that place. Nothing here is
 * computed that was not already in the ledger — the same entries, the same
 * `reasonWord` vocabulary the floats use, so the transient and the permanent
 * surface can never disagree about what a charge was called.
 *
 * WHY GROUPED. A day is thirty-odd entries and most of them are the same walk
 * taken again. Ungrouped, the account is a wall the player scrolls (and
 * nothing in this game may scroll at 375x667). Grouped by the word she already
 * saw float, it is eight or nine lines she can add up herself — and adding it
 * up is the point: `budget + Σ deltas = steps remaining`, exactly, with no
 * hidden term. A player who can audit the day stops inventing prices for it.
 */

import type { StepEntry, StepReason } from '../../engine/types';
import { reasonWord } from './step-reasons';

/** One row of the account: every entry that shared a reason word. */
export interface LedgerLine {
  /** Stable React key; `${reason}|${why}`. */
  key: string;
  /** The word the float said — `reasonWord`, unchanged. */
  why: string;
  reason: StepReason;
  /** How many entries folded into this row. Never 0. */
  count: number;
  /** Their signed sum. */
  delta: number;
}

/**
 * Fold a day's entries into the account.
 *
 * Order is FIRST APPEARANCE, not size: the account then reads as the day in
 * the order it happened (the morning's tea, then the walk out, then the room),
 * which is how she remembers it. Sorting by magnitude would put the biggest
 * number first and lose the story.
 *
 * Zero-delta entries are dropped, exactly as `StepMeter` drops them from the
 * float batch: a weight-0 mistake is "free feedback, never ledgered"
 * (economy/steps.ts) and a row reading "not in the hive · 0" would teach the
 * very belief this surface exists to kill.
 *
 * `roomKindOf` resolves a ledger entry's `roomKey` to the room's kind so a
 * mistake can be named by the room's OWN word for it (round 28). Optional:
 * with no resolver the fallback word is used, which is still true.
 */
export function ledgerLines(
  entries: readonly StepEntry[],
  roomKindOf?: (roomKey: string | undefined) => string | undefined,
): LedgerLine[] {
  const order: string[] = [];
  const byKey = new Map<string, LedgerLine>();
  for (const entry of entries) {
    if (entry.delta === 0) continue;
    const why = reasonWord(entry, roomKindOf?.(entry.roomKey));
    const key = `${entry.reason}|${why}`;
    let line = byKey.get(key);
    if (!line) {
      line = { key, why, reason: entry.reason, count: 0, delta: 0 };
      byKey.set(key, line);
      order.push(key);
    }
    line.count += 1;
    line.delta += entry.delta;
  }
  return order.map((key) => byKey.get(key)!);
}

/**
 * The arithmetic the sheet prints, so the panel cannot drift from the candle.
 *
 * `remaining` is `budget + Σ deltas` — the same expression `ledgerTotal` uses
 * — and is deliberately NOT clamped here: the account is an audit, and a
 * clamp is exactly the kind of silent term that made a tester write "+4 solved
 * … total 27 → 23, resolved: never". The chrome clamps for display
 * (`stepsRemaining`); this module reports what the entries actually say, and
 * `tests/ledger-lines.test.ts` pins the two against each other.
 */
export function accountTotals(
  budget: number,
  lines: readonly LedgerLine[],
): { budget: number; gained: number; spent: number; remaining: number } {
  let gained = 0;
  let spent = 0;
  for (const line of lines) {
    if (line.delta > 0) gained += line.delta;
    else spent -= line.delta;
  }
  return { budget, gained, spent, remaining: budget + gained - spent };
}
