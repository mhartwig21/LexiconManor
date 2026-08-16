/**
 * Blueprint price copy — OWNER: A2 (Economy/Day), rendered by A1's sheet.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * Round-5 audit, AAA 4.6/4.9/4.10: *the price of a step was invisible until
 * after it was charged*. `MOVE_COST_BY_ROW` ranged −1..−5 and nothing in the
 * live UI named it — the sheet drew tier bands that said "graver" and walk
 * targets carried the raw cell key as their accessible name (`Walk 2,5`). On
 * the upper storeys a single mis-tap spent 5 of an 18-step budget with no
 * pre-commit signal, no confirmation and no undo: exactly the surprise charge
 * 4.6 forbids, and the one thing the padlock arc was careful to avoid.
 *
 * ROUND 36 — THE TABLE IS FLAT (docs/THE_CLIMB §1), so the price is now one
 * fact rather than seven. That does not retire this file: a fact she has never
 * been told is still invisible, and "every move costs the same" is a thing she
 * has to be able to READ, not to infer from a column of repeated marks. So the
 * rate card collapses to one stamp per price band (`priceBands`), the spoken
 * name says the band out loud, and every walk target still names its own price
 * in words. What goes silent is the per-target −N: `stampsPrice` compares two
 * storeys and there is nothing left to compare, which is the correct answer to
 * a flat table rather than a shortcoming of it.
 *
 * Every number here is read from `moveAt`, never re-typed, so the sheet and
 * the ledger cannot drift apart.
 */

import { moveAt, rowName, stepWords } from '../../engine/economy/steps';
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

/** "3 steps" / "1 step" — the spoken form. Pluralised in ONE place (round 42). */
export function priceWords(row: number): string {
  return stepWords(-moveAt(row));
}

/**
 * The accessible name for a walk target: where it goes and what it costs.
 * "Walk to the second landing — 3 steps".
 */
export function walkLabel(row: number): string {
  return `Walk to ${rowName(row)} — ${priceWords(row)}`;
}

/**
 * ═══ ROUND 31 — THE MARGIN STOPS BEING A COLUMN OF UNHEADED NUMBERS ═══════
 *
 * A critic captured every word of visible text on the blueprint and came away
 * with four wing names, "ONE ROOM", the title block — and a BARE UNHEADED
 * COLUMN reading −2 −2 −2 −2 −7 −9 −9. Both the rate card and the tier pips
 * carried `aria-hidden="true"`, so not even a screen reader could ask. (Round
 * 36: that column is one −3 now, and `priceBands` is what the ink and this
 * sentence both read, so they cannot disagree about how many marks there are.)
 *
 * The old reasoning for hiding them (round 28) was that every walk target
 * already speaks its own price in `walkLabel`, so a key would be a second
 * telling. That is true of a target she can REACH and false of the sheet: the
 * rate card's whole job is to price the storeys she has NOT reached yet — the
 * climb she is deciding whether to start — and none of those has a target to
 * speak. So both marks are announced now, once each, as a single image apiece
 * rather than as loose numerals, and every number is read from `moveAt`.
 *
 * Rows of equal price are collapsed into one clause, so the seven-row column
 * speaks as the three bands it actually is.
 */
export function priceBands(rows: number): { from: number; to: number; cost: number }[] {
  const bands: { from: number; to: number; cost: number }[] = [];
  for (let row = 0; row < rows; row++) {
    const cost = -moveAt(row);
    const last = bands[bands.length - 1];
    if (last && last.cost === cost) last.to = row;
    else bands.push({ from: row, to: row, cost });
  }
  return bands;
}

export function rateCardLabel(rows: number): string {
  const bands = priceBands(rows);
  const clauses = bands.map(({ from, to, cost }) => (
    from === to
      ? `${rowName(from)}, ${stepWords(cost)}`
      : `${rowName(from)} up to ${rowName(to)}, ${stepWords(cost)}`
  ));
  return `Rate card — what one move costs on each storey: ${clauses.join('; ')}.`;
}

/** The pip column's key, spoken: one diamond a tier, and what a tier decides. */
export function tierPipLabel(tier: number, roman: string): string {
  return `${tier} ${tier === 1 ? 'diamond' : 'diamonds'} — this storey draws `
    + `tier ${roman} puzzles`;
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

/**
 * How many keys, in words that agree with themselves. `keyCost` has been 2
 * since round 10 and every call site here said "2 key" — a small wrongness
 * that reads as a typo and is worse than that: it makes the price look like
 * a stray 2 in front of the singular thing she is holding.
 */
export function keyWords(keyCost: number): string {
  return `${keyCost} key${keyCost === 1 ? '' : 's'}`;
}

/** The padlocked-door variant: the key comes first, the price still gets said. */
export function lockedDraftLabel(
  fromRow: number, toRow: number, keyCost: number, hasKey: boolean,
  wing?: WingId, character?: WingCharacter,
): string {
  const key = keyWords(keyCost);
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
 *
 * ═══ ROUND 33 — AND NOW EACH LINE NAMES THE SOURCE (COMPREHENSION 33, fix 6)
 * "What keys are for / how they arrive" has been a [major] blind spot for two
 * cold reads running, and this round it got WORSE, because keys now actually
 * arrive: one tester collected FOUR and lost all four unused, the other earned
 * one and lost it, and both saw the padlock drawn on the map without ever
 * connecting it to the chip in the bar. Naming the remedy was never enough —
 * "it wants a key" tells a player who has one nothing, and a player who has
 * none nowhere to go.
 *
 * So the line says where keys come from, and it says the true thing: a solved
 * room pays them (`solveKeys` — by storey from tier 2 up, and at any tier for
 * a room that asks for real work). That is not a second vocabulary invented
 * for this note: it is the exact promise already stamped on the draft card's
 * own stake line, "+1 key on solve", printed by `draftCardStake` if and only
 * if `solveKeys > 0`. The refusal points at the card, the card keeps the
 * promise, and `tests/steps.test.ts` already pins the card to the table.
 *
 * Same 48-character budget, still pinned by tests/padlock-refusal.test.ts.
 *
 * ═══ ROUND 47 — AND NOW EACH LINE NAMES THE **NUMBER** (owner playtest) ═════
 * Owner, mid-playthrough: *"I have a key in my current run but cannot unlock
 * the door!"* The mechanic was working exactly as written. `DOOR_LOCKS.keyCost`
 * has been **2** since round 10 — and not one surface a sighted player can see
 * had ever said so. The refusal named the remedy and the source and left out
 * the price; the bar chip said "1 key"; the card face promised "+1 key on
 * solve", so one key read as one door; and the ONE place that did state the
 * number — the draft modal's "placing a room spends 2 keys" — sits *behind* the
 * gate it prices, which is to say it is only ever read by a player who no
 * longer needs it. A player holding one key taps the brass, is told keys come
 * off solves, looks at the key in her purse, and concludes the game is broken.
 *
 * That is a straight breach of the owner's standing ruling: STATED ALWAYS =
 * prices and rules of play; NEVER STATED = what a room is worth to the mystery.
 * A padlock's price is a price.
 *
 * So the number is now in the line, in the padlock's own stamp on the sheet
 * (`bp-padlock__cost`, readable without spending a tap, let alone a step), and
 * in the label — and it is INTERPOLATED from `keyCost` at every one of those
 * sites, never typed into the copy, so a retune cannot leave the words lying.
 *
 * And when she is holding SOME keys and not enough, the line says that too,
 * because "you hold 1 of the 2 this wants" is a different sentence from "you
 * have none, here is where they come from" and only one of them answers the
 * tap she actually made.
 *
 * NOT GREEN BY CONSTRUCTION: tests/padlock-refusal.test.ts now drives the LIVE
 * `KEY_COST` rather than the hardcoded `1` every assertion in it used to pass —
 * which is precisely why the suite watched this ship and said nothing.
 */

/** No keys at all: the job is to point at the source, and name the price. */
export const LOCKED_REFUSAL_LINES: readonly ((cost: string) => string)[] = [
  (cost) => `Shut fast. ${cost}, off rooms you solve.`,
  (cost) => `Still shut: ${cost}. Solved rooms hand them over.`,
  (cost) => `The brass wants ${cost}. A solve pays them.`,
];

/**
 * Some keys, and not enough: the job is to say the shortfall out loud. This is
 * the case the owner hit, and the case the old copy could not express at all.
 */
export const LOCKED_SHORTFALL_LINES: readonly ((cost: string, held: number) => string)[] = [
  (cost, held) => `${cost} open this. You hold ${held}. Solve for more.`,
  (cost, held) => `Still ${cost}. You hold ${held} — solve for another.`,
  (cost, held) => `${cost}, and you hold ${held}. A solved room pays.`,
];

/**
 * The refusal line for the `attempt`-th consecutive tap (0-based), at the
 * price this door actually charges and against the purse she actually holds.
 */
export function lockedRefusalLine(attempt: number, keyCost = 1, keysHeld = 0): string {
  const i = Math.max(0, Math.floor(attempt));
  const cost = keyWords(keyCost);
  const lines = keysHeld > 0 ? LOCKED_SHORTFALL_LINES : LOCKED_REFUSAL_LINES;
  const line = lines[i % lines.length]!;
  return keysHeld > 0
    ? (line as (c: string, h: number) => string)(cost, keysHeld)
    : (line as (c: string) => string)(cost);
}

/**
 * What assistive tech hears when the same tap lands. The visible line is
 * short because it sits on a drawing; the spoken one restates the gate in
 * full, because a screen-reader user cannot see the padlock glyph at all.
 */
export function lockedRefusalAnnouncement(
  attempt: number, toRow: number, keyCost: number, keysHeld = 0,
): string {
  const key = keyWords(keyCost);
  return `${lockedRefusalLine(attempt, keyCost, keysHeld)} The door onto ${rowName(toRow)} stays padlocked — ` +
    `it opens with ${key}, and a key is what a solved room pays — any draft card ` +
    'whose face promises a key on solve is one. Nothing was spent.';
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
