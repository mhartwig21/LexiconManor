/**
 * THE WINGS — OWNER: A1 (Manor). Pure TS, zero React/DOM.
 *
 * ── WHY THIS MODULE EXISTS (REVIEW_AA §5.7 / §7) ───────────────────────────
 *
 * The review's Blue Prince comparison is the sharpest sentence in the
 * document: *"where you place a room IS the problem: dead ends punish you,
 * corridors bank you, the North wing is a spatial argument you conduct against
 * the grid across dozens of runs, and the knowledge you accumulate is permanent
 * even though the house is not. Lexicon Manor's floorplan is a corridor
 * generator with a price list."*
 *
 * It was right, and the reason is structural rather than tuning: **nothing in
 * the game read a room's COLUMN.** `rowTier` made the vertical axis mean
 * difficulty, price and rarity; the horizontal axis meant nothing at all. A
 * room paid exactly the same wherever it stood, so the optimal manor was the
 * shortest path to the top — a chimney — and every evening's floorplan was
 * discarded at dusk with nothing learned.
 *
 * THE ANSWER IS THE HOUSE'S OWN GEOGRAPHY, not a new currency. Five columns,
 * three wings:
 *
 *        col 0   col 1  │ col 2 │  col 3   col 4
 *        └── West Wing ─┘  Stair └─ East Wing ──┘
 *                          Hall
 *
 * and one rule with a night in the middle of it:
 *
 *   1. WITHIN A DAY, what you put in a wing gives that wing a CHARACTER —
 *      two or more rooms of one category, with no tie (`wingCharacterOf`).
 *      That is the placement decision: the Kitchen belongs beside the Larder
 *      if you mean the west of this house to be the working half.
 *   2. ACROSS DAYS, the lexicographer's papers keep the plan. Every evening's
 *      wing characters are written into the day record, and a wing that has
 *      ended the same way on enough evenings is REMEMBERED
 *      (`rememberedWings`) — permanently, gently, and by a margin, so one
 *      stray Tuesday cannot rewrite the house.
 *   3. A REMEMBERED WING DRAWS TRUE. Cards of that category surface more often
 *      behind its doors (`engine/manor/drafting.ts`, `WING_AFFINITY`). The
 *      manor still resets every night; what survives is *where things are kept*
 *      — which is precisely the Blue Prince property the review says we do not
 *      attempt: the house is not permanent, the knowledge of it is.
 *
 * ── THE TWO EXCLUSIONS, AND WHY THEY ARE NOT TIMIDITY ─────────────────────
 *
 * A wing can be argued into **blue or yellow, and nothing else.** Both of the
 * other two were tried, measured through `simulateCampaigns`, and rejected on
 * the numbers rather than on taste:
 *
 * **Violet is never a wing's character.** Violet share is the supply side of
 * the whole mystery-pacing arc — AAA 4.10g publishes it per row (`deckMixAt`:
 * ≈2.0% at row 0 rising to ≈10.5% at row 6) and bounds it below 50% of
 * evenings so violet stays a rare room. A wing that could be argued into "the
 * mystery wing" would move that supply by a lever no published band carries,
 * and it would let a player farm the lexicographer's own drip by geography.
 * His papers are scattered through the whole house; no wing holds him.
 *
 * **Green is never a wing's character either, and this one cost a measurement
 * to learn.** The first build of this module allowed it, and a permanent
 * working wing is a permanent step raise by geography — i.e. a retune of
 * `STEP_TABLE` under another name. Measured at `WING_AFFINITY` 2.4 with the
 * wing modelled as green (`WING_MODEL`, engine/economy/simulate.ts): the median
 * evening fell to **9.7 minutes**, under 4.10b's published 10–15 floor, because
 * green rooms are a ten-second toast where an anchor is three to six minutes;
 * and solve-sourced keys fell **below** Fern's arc for the median player, which
 * inverts the round-10 owner directive *"skill, not just persistence, earns the
 * campaign"* (AAA 4.10d). Softening the multiplier to 1.6 halved the shortfall
 * and did not close it, because the mechanism is the crowding-out and not the
 * size. So the green deck stays exactly where the economy was calibrated with
 * it — a card you find, not a wing you can build. What a wing decides is what
 * the house is FOR, never what it feeds you.
 *
 * Both exclusions are enforced in one place (`WING_CHARACTERS`, read by
 * `dominantCharacter` and by `rememberedWings`) rather than remembered by every
 * caller.
 *
 * ── NO SAVE-SCHEMA CHANGE BEYOND ONE OPTIONAL FIELD ───────────────────────
 *
 * The memory is derived from `chronicles.dayRecords[].wings` — the same trick
 * `surveyEveningsIn` (the landing arc) and `carryOverFrom` (the Larder's dough)
 * use to cross a night. `DayRecord.wings` is optional, so every existing save
 * migrates by doing nothing and simply has no wings remembered yet.
 */

import type { Cell, DayRecord, ManorState, RoomCategory } from '../types';
import { MANOR_COLS } from '../types';
import { ENTRANCE_CARD_ID, SANCTUM_CARD_ID } from './grid';

export type WingId = 'west' | 'stair' | 'east';

export const WING_IDS: readonly WingId[] = ['west', 'stair', 'east'];

/** The categories a wing can be argued into — see THE TWO EXCLUSIONS, above. */
export type WingCharacter = Extract<RoomCategory, 'puzzle' | 'parlor'>;

export const WING_CHARACTERS: readonly WingCharacter[] = ['puzzle', 'parlor'];

/** What a wing is remembered as, per wing. Absent = not yet remembered. */
export type WingCharacters = Partial<Record<WingId, WingCharacter>>;

/**
 * Which wing a column belongs to. The Stair Hall is the single centre column,
 * because the Entrance Hall and the Sanctum both stand in it: the spine of the
 * house is where you climb, and the two wings are what you climb past.
 */
export function wingOf(col: number): WingId {
  if (col <= 1) return 'west';
  if (col === 2) return 'stair';
  return 'east';
}

/** The columns of a wing — the blueprint draws its bracket from this. */
export function colsOfWing(wing: WingId): number[] {
  const out: number[] = [];
  for (let col = 0; col < MANOR_COLS; col++) if (wingOf(col) === wing) out.push(col);
  return out;
}

/** The name the house uses out loud. */
export const WING_NAMES: Record<WingId, string> = {
  west: 'the West Wing',
  stair: 'the Stair Hall',
  east: 'the East Wing',
};

/** Short form for the blueprint margin, where there is no room for an article. */
export const WING_SHORT_NAMES: Record<WingId, string> = {
  west: 'WEST WING', stair: 'STAIR HALL', east: 'EAST WING',
};

/**
 * What a wing of this character is FOR, in the house's own words. Said on the
 * draft door and on the card sheet, so the three doors out of a room stop
 * reading as three copies of the same sentence (REVIEW_AA §4: *"the labels
 * still tell you nothing about the decision, and one of them is wrong"*).
 */
export const WING_CHARACTER_WORDS: Record<WingCharacter, string> = {
  puzzle: 'the reading half of the house',
  parlor: 'where the household sits',
};

/** One word for the same thing, for the blueprint margin. */
export const WING_CHARACTER_TAGS: Record<WingCharacter, string> = {
  puzzle: 'READING', parlor: 'HOUSEHOLD',
};

// ---------------------------------------------------------------------------
// Today's house
// ---------------------------------------------------------------------------

export type WingTally = Record<WingId, Partial<Record<WingCharacter, number>>>;

function emptyTally(): WingTally {
  return { west: {}, stair: {}, east: {} };
}

/** The category of a placed room, mapped back onto a wing character. */
function characterOfKind(kind: string): WingCharacter | null {
  if (kind === 'parlor') return 'parlor';
  // Green and violet are never a wing's character — see THE TWO EXCLUSIONS.
  if (kind === 'utility' || kind === 'mystery') return null;
  return 'puzzle';                        // every puzzleKind is a blue room
}

/**
 * How many rooms of each character each wing is holding right now. The two
 * pre-placed rooms are excluded: the Entrance Hall and the Sanctum are the
 * house, not the player's argument about it — counting them would hand the
 * Stair Hall a free parlor and a free violet every single morning.
 */
export function wingTallyOf(manor: ManorState | null | undefined): WingTally {
  const tally = emptyTally();
  if (!manor) return tally;
  for (const room of Object.values(manor.rooms)) {
    if (room.cardId === ENTRANCE_CARD_ID || room.cardId === SANCTUM_CARD_ID) continue;
    const character = characterOfKind(room.kind);
    if (!character) continue;
    const wing = wingOf(room.cell.col);
    tally[wing][character] = (tally[wing][character] ?? 0) + 1;
  }
  return tally;
}

/**
 * Rooms of one character in a wing before it has a character at all. Two,
 * deliberately: a single room is an accident, and three is more than a
 * five-to-eight-room evening can spare for two wings at once (AAA 4.10b).
 */
export const WING_CHARACTER_MIN_ROOMS = 2;

/** The dominant character of one wing's tally — a strict lead, or nothing. */
function dominantCharacter(
  counts: Partial<Record<WingCharacter, number>>,
): WingCharacter | undefined {
  let best: WingCharacter | undefined;
  let bestN = 0;
  let tied = false;
  for (const character of WING_CHARACTERS) {
    const n = counts[character] ?? 0;
    if (n > bestN) { best = character; bestN = n; tied = false; }
    else if (n === bestN && n > 0) tied = true;
  }
  if (!best || tied || bestN < WING_CHARACTER_MIN_ROOMS) return undefined;
  return best;
}

/**
 * What this evening's floorplan says each wing is — the thing the day record
 * keeps and the memory is built out of. A wing with no clear majority says
 * nothing, and saying nothing is a perfectly good evening.
 */
export function wingCharacterOf(manor: ManorState | null | undefined): WingCharacters {
  const tally = wingTallyOf(manor);
  const out: WingCharacters = {};
  for (const wing of WING_IDS) {
    const character = dominantCharacter(tally[wing]);
    if (character) out[wing] = character;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The papers' memory
// ---------------------------------------------------------------------------

/**
 * Evenings a wing must have ended the same way before the papers commit, and
 * the margin it must hold over the runner-up.
 *
 * Both are deliberately small. This is a cozy detective game and the memory is
 * a WEIGHT, not a gate (AAA 4.6 — the draft stays a decision): being wrong for
 * a week costs the player a slightly worse offer mix in one wing, and she can
 * argue the house back the same way she argued it here. Two evenings of
 * agreement, one clear ahead of the alternative.
 */
export const WING_MEMORY = {
  eveningsToRemember: 2,
  margin: 1,
} as const;

/**
 * What the lexicographer's papers recall of the floorplan — the one thing in
 * this game that survives the night as a SHAPE rather than as a number.
 *
 * Read straight off the day records the save already keeps, oldest to newest,
 * so there is no new field to lose and a wiped campaign forgets the house
 * exactly as it forgets everything else.
 */
export function rememberedWings(records: readonly DayRecord[]): WingCharacters {
  const evenings: Record<WingId, Partial<Record<WingCharacter, number>>> = emptyTally();
  for (const record of records) {
    const wings = record.wings;
    if (!wings) continue;
    for (const wing of WING_IDS) {
      const character = wings[wing];
      if (!character || !WING_CHARACTERS.includes(character)) continue;
      evenings[wing][character] = (evenings[wing][character] ?? 0) + 1;
    }
  }
  const out: WingCharacters = {};
  for (const wing of WING_IDS) {
    let best: WingCharacter | undefined;
    let bestN = 0;
    let runnerUp = 0;
    for (const character of WING_CHARACTERS) {
      const n = evenings[wing][character] ?? 0;
      if (n > bestN) { runnerUp = bestN; best = character; bestN = n; }
      else if (n > runnerUp) runnerUp = n;
    }
    if (best && bestN >= WING_MEMORY.eveningsToRemember && bestN - runnerUp >= WING_MEMORY.margin) {
      out[wing] = best;
    }
  }
  return out;
}

/** The wing a draft target sits in, as a cell. */
export function wingOfCell(cell: Cell): WingId {
  return wingOf(cell.col);
}
