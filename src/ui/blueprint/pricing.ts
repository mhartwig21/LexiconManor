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
import {
  WING_CHARACTER_WORDS, WING_NAMES, type WingCharacter, type WingId,
} from '../../engine/manor/wings';

/**
 * ── WHERE THIS DOOR GOES (round 20, REVIEW_AA §4 / §5.7) ───────────────────
 *
 * The review, on the three doors out of the Entrance Hall: *"two read 'Draft a
 * room on the ground floor — 1 step' and one 'on the half landing.' Then the
 * half-landing door opened a modal headed 'Three floorplans for the ground
 * floors.' The labels still tell you nothing about the decision, and one of
 * them is wrong."*
 *
 * Both halves are answered here. **Wrong**: the modal's heading took its words
 * from `TIER_LABELS[tier]`, which is a three-row BAND ("the ground floors"),
 * while the door label took its words from `rowName`, which is a STOREY ("the
 * half landing") — two vocabularies for one place, and the modal's was the
 * coarser. There is one now, and it is `rowName`'s. **Nothing about the
 * decision**: the three doors differ in exactly one respect — the WING each one
 * opens into (engine/manor/wings.ts) — so that is what the label leads with,
 * followed by what the papers remember that wing for when they remember
 * anything.
 */
export function wingWords(wing: WingId, character?: WingCharacter): string {
  return character
    ? `${WING_NAMES[wing]}, ${WING_CHARACTER_WORDS[character]}`
    : WING_NAMES[wing];
}

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

export function draftLabel(
  fromRow: number, toRow: number, wing?: WingId, character?: WingCharacter,
): string {
  const place = wing
    ? `into ${wingWords(wing, character)}, on ${rowName(toRow)}`
    : `on ${rowName(toRow)}`;
  return `Draft a room ${place} — ${draftPriceWords(fromRow, toRow)}`;
}

/** The padlocked-door variant: the key comes first, the price still gets said. */
export function lockedDraftLabel(
  fromRow: number, toRow: number, keyCost: number, hasKey: boolean,
  wing?: WingId, character?: WingCharacter,
): string {
  const key = `${keyCost} key`;
  const price = draftPriceWords(fromRow, toRow);
  const place = wing
    ? `into ${wingWords(wing, character)}, on ${rowName(toRow)}`
    : `on ${rowName(toRow)}`;
  return hasKey
    ? `Unlock this door and draft a room ${place} — ${key}, ${price}`
    : `Padlocked door ${place} — you will want ${key}; ${price} once it opens`;
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

/**
 * ── THE LANDING'S ANSWER (round-13 blocker, AAA 4.6 / 4.16 / 11.7) ─────────
 *
 * THE REFUSAL AT THE TOP WAS NOT SILENT — IT WAS WRONG. Driven at 390×844:
 * standing at (2,5) in a room whose doors are S+E, the Sanctum was simply not
 * tappable — `.bp-sanctumhit` was absent, with nothing drawn to say why — and
 * `/sanctum` printed "…only from the landing at the top of the stairs — you
 * will have to climb to it" while she was standing on that exact landing,
 * having just paid 22+ steps for it. Nothing in the game — copy, blueprint or
 * card face — had ever stated that the LANDING ROOM must open north.
 *
 * So the most expensive tap in the campaign now answers, on the surface she is
 * looking at, and it answers the true thing: the climb was not wasted, the
 * PLAN was wrong, and the remedy is a plan that opens north — which the draft
 * card now stamps (`sanctumDraftStamp`). Same shape as the padlock's answer
 * above, and deliberately so: one metaphor per verb (AAA 6.16). Nothing is
 * spent here either.
 */
/**
 * Length budget, same as `LOCKED_REFUSAL_LINES`: the drawn note ground is 324
 * user units and the sheet lays out ~1 unit per CSS px, so a line must stay
 * inside ~48 characters at the 16px body serif or it clips (AAA 1.5/6.6).
 * `tests/grid.test.ts` pins it.
 */
export const LANDING_REFUSAL_LINES: readonly string[] = [
  'This room turns its back on the Sanctum.',
  'Still no door north out of this one.',
  'Up here, take a plan that opens north.',
];

export function landingRefusalLine(attempt: number): string {
  const lines = LANDING_REFUSAL_LINES;
  return lines[Math.max(0, Math.floor(attempt)) % lines.length]!;
}

/** The accessible name for the Sanctum when the landing room seals it off. */
export const LANDING_SEALED_LABEL =
  'The Sanctum — this room has no north door, so it cannot be reached from here';

/** What assistive tech hears; the drawn line is terse, this one states the gate. */
export function landingRefusalAnnouncement(attempt: number): string {
  return `${landingRefusalLine(attempt)} You are on the Sanctum landing, but the room ` +
    'you drafted here drew no north door, so its sealed door stays shut. ' +
    'A plan that opens north will reach it. Nothing was spent.';
}

/** The card-face stamp for a plan drafted into the Sanctum landing (AAA 4.6). */
export function sanctumDraftStamp(opensNorth: boolean): string {
  return opensNorth ? 'Opens onto the Sanctum' : 'Turns its back on the Sanctum';
}
