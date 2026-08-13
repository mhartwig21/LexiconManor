/**
 * WHERE A PAGE CAME FROM, in the journal's voice — OWNER: A7 (Mystery).
 *
 * ═══ WHY THIS EXISTS (round 49, the owner's ruling of 13 Aug) ══════════════
 *
 * *"I think we want to keep true to Blue Prince where certain clues about the
 *  benefits of rooms aren't immediately apparent. Saying +1 page feeds
 *  everything to the player. But when a page is revealed, the player has to be
 *  able to figure out — oh, this room provided me a page!"*
 *
 * The draft card stopped saying what a room is worth to the mystery
 * (`engine/economy/preview.ts`). The moment of reward is the teachable instant
 * and the moment layer carries it (`ui/moment/moments.ts`); THIS file is the
 * second chance — the page she opens tomorrow morning still says which room
 * produced it, so the rule survives a night's sleep instead of depending on a
 * 5.6-second seal she may have been mid-tap over.
 *
 * ── THE CONFOUNDER THIS COPY HAD TO BEAT ──────────────────────────────────
 * Every fragment already prints an authored `source` line — *"Carved on the
 * Gallery lintel"*, *"Loose in the Study, among his unfinished entries"* — and
 * that is the IN-FICTION origin of the writing, not the room she got it from.
 * A player who solved the Library and read "Carved on the Gallery lintel" was
 * being actively misled about attribution by the one line on the card that
 * looked like an answer. So the provenance is its own sentence, in its own
 * voice, under the source it must not be confused with.
 *
 * ── WHY TWO CLAUSES ───────────────────────────────────────────────────────
 * A page can have two rooms in its history and they teach two different rules:
 * a violet room hands over a torn leaf (`from-`), and a solved word game makes
 * it out (`readby-`). Printing only the first would leave the blocker exactly
 * where `docs/COMPREHENSION.md` found it — nobody learned that solving feeds
 * the book. Printing only the second would credit the Darkroom for a leaf the
 * Archive gave her. Both, in the order they happened, or neither.
 *
 * Nothing is invented: a save written before this round, a letter's enclosure
 * and testimony spoken in a parlor all record no room and print no line.
 */

import { cardById } from '../../engine/manor/deck';
import { pageFromRoom, pageReadByRoom } from '../../engine/volume';

/**
 * `The Long Gallery` → `the Long Gallery`, for use inside a sentence. Every
 * card in the deck is named "The …", and "Taken out of The Long Gallery" reads
 * as a typo rather than as a room.
 */
export function roomInSentence(name: string): string {
  return name.replace(/^The /, 'the ');
}

/** The card's own printed name for a card id, or null if the deck lost it. */
function roomName(cardId: string | null): string | null {
  return (cardId && cardById(cardId)?.name) || null;
}

/**
 * The provenance line for one filed page, or null when nothing recorded a room.
 *
 * Written as a whole sentence rather than assembled at the call site so the
 * Word tab's poem, the Engravings cards and the Testimony cards cannot drift
 * into three different accounts of the same fact.
 */
export function pageWhence(
  volumeId: string, fragmentId: string, flags: Iterable<string>,
): string | null {
  const all = [...flags];
  const from = roomName(pageFromRoom(volumeId, fragmentId, all));
  const readBy = roomName(pageReadByRoom(volumeId, fragmentId, all));
  if (from && readBy && readBy !== from) {
    return `Taken out of ${roomInSentence(from)}, made out in ${roomInSentence(readBy)}.`;
  }
  if (from) return `Taken out of ${roomInSentence(from)}.`;
  if (readBy) return `Made out in ${roomInSentence(readBy)}.`;
  return null;
}

/**
 * The same fact folded into the sealed leaf's own label, so a smudged page
 * gains its attribution WITHOUT gaining a line. The Word tab is the densest
 * surface in the game and round 13 already lost it to repeated instruction
 * ("Solve a room." three times over, pushing the sheet into internal scroll);
 * a torn leaf therefore says who tore it inside the sentence that was already
 * there.
 */
export function sealedLeafLabel(
  volumeId: string, fragmentId: string, flags: Iterable<string>,
): string {
  const from = roomName(pageFromRoom(volumeId, fragmentId, flags));
  return from
    ? `A torn leaf out of ${roomInSentence(from)}, not yet made out.`
    : 'A torn leaf, not yet made out.';
}
