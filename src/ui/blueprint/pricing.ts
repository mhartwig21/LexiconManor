/**
 * Blueprint price copy — OWNER: A2 (Economy/Day), rendered by A1's sheet.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * Round-5 audit, AAA 4.6/4.9/4.10: *the price of a step was invisible until
 * after it was charged*. `MOVE_COST_BY_ROW` ranges −1..−5 and nothing in the
 * live UI named it — the sheet drew tier bands that said "graver" and walk
 * targets carried the raw cell key as their accessible name (`Walk 2,5`). On
 * the upper storeys a single mis-tap spent 5 of an 18-step budget with no
 * pre-commit signal, no confirmation and no undo: exactly the surprise charge
 * 4.6 forbids, and the one thing the padlock arc was careful to avoid.
 *
 * Blue Prince can leave movement unlabelled because it is a flat 1/room. Ours
 * varies 5× and IS the push-your-luck decision, so every priced target on the
 * sheet names its cost, in ink and in its accessible name.
 *
 * Every number here is read from `moveAt`, never re-typed, so the sheet and
 * the ledger cannot drift apart.
 */

import { moveAt, rowName } from '../../engine/economy/steps';

/** "−3" — the ink stamp on a band or a target. */
export function priceStamp(row: number): string {
  return `−${-moveAt(row)}`;
}

/** "3 steps" / "1 step" — the spoken form. */
export function priceWords(row: number): string {
  const n = -moveAt(row);
  return `${n} step${n === 1 ? '' : 's'}`;
}

/**
 * The accessible name for a walk target: where it goes and what it costs.
 * "Walk to the second landing — 3 steps".
 */
export function walkLabel(row: number): string {
  return `Walk to ${rowName(row)} — ${priceWords(row)}`;
}

/**
 * The accessible name for a draft (ghost) target.
 *
 * Two prices, because there are two moments (AAA 4.6): opening the door is a
 * walk across the floor she is already standing on, priced at HER row, and
 * that is all a declined look ever costs. Stepping through into the new room
 * costs the target row's rate in total. When they are equal — a lateral draft —
 * only one number is spoken.
 */
/**
 * What taking the room actually costs in all: the door-step at her row, plus
 * the climb differential — which floors at 0, so a room DOWNSTAIRS costs the
 * local rate and never advertises a discount it will not give.
 */
export function draftTotal(fromRow: number, toRow: number): number {
  return Math.max(-moveAt(fromRow), -moveAt(toRow));
}

export function draftStamp(fromRow: number, toRow: number): string {
  return `−${draftTotal(fromRow, toRow)}`;
}

/** Stamp a draft target only when taking it costs more than the look does. */
export function stampsDraftPrice(fromRow: number, toRow: number): boolean {
  return draftTotal(fromRow, toRow) !== -moveAt(fromRow);
}

export function draftPriceWords(fromRow: number, toRow: number): string {
  const look = -moveAt(fromRow);
  const total = draftTotal(fromRow, toRow);
  return total === look
    ? priceWords(fromRow)
    : `${priceWords(fromRow)} to look, ${total} in all if you take it`;
}

export function draftLabel(fromRow: number, toRow: number): string {
  return `Draft a room on ${rowName(toRow)} — ${draftPriceWords(fromRow, toRow)}`;
}

/** The padlocked-door variant: the key comes first, the price still gets said. */
export function lockedDraftLabel(
  fromRow: number, toRow: number, keyCost: number, hasKey: boolean,
): string {
  const key = `${keyCost} key`;
  const price = draftPriceWords(fromRow, toRow);
  return hasKey
    ? `Unlock this door and draft a room on ${rowName(toRow)} — ${key}, ${price}`
    : `Padlocked door onto ${rowName(toRow)} — you will want ${key}; ${price} once it opens`;
}

/**
 * Should a target wear a visible price stamp? Only when it differs from the
 * floor she is standing on — a sheet that stamps "−1" on every ground-floor
 * neighbour is noise, and noise is how a real price stops being read.
 */
export function stampsPrice(fromRow: number, toRow: number): boolean {
  return moveAt(toRow) !== moveAt(fromRow);
}

/**
 * ── THE PADLOCK'S ANSWER (AAA 4.16 — never silence at a gate) ───────────────
 *
 * ROUND-6 DEFECT: tapping a padlocked door with no key played a 420ms shrug
 * animation on the lock and said NOTHING. The refusal was correct in every
 * other way — nothing charged, no scolding, the padlock drawn before she ever
 * walked toward it — but a gate that answers a deliberate tap with a wiggle
 * and no words is exactly the silence 4.16 forbids, and it is worse on the
 * quiet end of the range: a player who has not yet learned what the brass
 * shape means gets no way to learn it by trying. (It also read as a possible
 * bug: an animation with no message is indistinguishable from a mis-tap.)
 *
 * So the lock speaks. Briefly, in the house's voice, warm and never scolding
 * (AAA R.3: costs read as spending, never dying — and nothing is spent here
 * at all), and the line CHANGES on a repeat tap so a second try is
 * acknowledged rather than parroted back.
 *
 * Each line names the remedy — a key — because the refusal's whole job is to
 * point at the Key Cabinet, the Boot Room and Fern's dawn key.
 */
export const LOCKED_REFUSAL_LINES: readonly string[] = [
  'Shut fast. It wants a key.',
  'Still shut — a key first, then the door.',
  'The brass holds. Bring a key and it won’t argue.',
];

/** The refusal line for the `attempt`-th consecutive tap (0-based). */
export function lockedRefusalLine(attempt: number): string {
  const lines = LOCKED_REFUSAL_LINES;
  return lines[Math.max(0, Math.floor(attempt)) % lines.length]!;
}

/**
 * What assistive tech hears when the same tap lands. The visible line is
 * short because it sits on a drawing; the spoken one restates the gate in
 * full, because a screen-reader user cannot see the padlock glyph at all.
 */
export function lockedRefusalAnnouncement(attempt: number, toRow: number, keyCost: number): string {
  const key = `${keyCost} key${keyCost === 1 ? '' : 's'}`;
  return `${lockedRefusalLine(attempt)} The door onto ${rowName(toRow)} stays padlocked — ` +
    `it opens with ${key}. Nothing was spent.`;
}
