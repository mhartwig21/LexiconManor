/**
 * WHEREABOUTS — where somebody has got to. OWNER: A6 (Dialogue).
 *
 * OWNER DIRECTIVE, verbatim: *"im okay with it being random discoveries,
 * though maybe there could be clues for where to find certain peoples"*, and,
 * on the source: *"I like Bramble introducing the others too, that's a good
 * idea."*
 *
 * So: discovery stays random, and the clue channel is the housekeeper. She
 * mentions one person she works alongside, in passing, on her way past with
 * the tray — never a roster, never a checklist, never a count of who is left.
 * Nothing in the UI enumerates the cast, and a player who never asks is never
 * told anything she has to act on.
 *
 * ═══ WHY THIS IS RENDERED ON THE MORNING CARD AND NOT PLAYED AS A SCENE ═══
 *
 * The obvious home was a `bramble.where.*` node in her morning pool. It was
 * built, measured, and withdrawn — the measurement is worth keeping, because
 * it is the reason this file exists at all.
 *
 * Her morning plays exactly ONE node. The reaction band (priority 700–720) is
 * 27 nodes deep and gated on yesterday, so over a simulated 22-day campaign a
 * fresh recap is eligible on essentially every morning from day 3 to day 16:
 *
 *   priority 730 (above the recaps) → hints land days 3, 4, 6, 10 — the right
 *     pacing, and it breaks AAA 5.1: six reaction-latency cases regressed,
 *     because gossip outranked "I heard you speak at the Sanctum door
 *     yesterday". The system must see you at the NEXT opportunity, not the one
 *     after the housekeeper has finished talking about the gardener.
 *   priority 690 (below the recaps) → 5.1 is safe and the first Fern hint
 *     lands on day 13, past the median win at day 22 and long past the point
 *     where it could have created any anticipation at all.
 *
 * There is no third number. The morning CONVERSATION is spoken for, and it is
 * spoken for by content that is better than this. The morning CARD — the
 * "Day N" frame she stands on before the conversation — is empty, is hers, is
 * seen every single day, and costs the reaction band nothing.
 *
 * So the lines live in `bramble.json` like all her other lines (validated,
 * typeset, voice-linted with the rest of the corpus) and are RENDERED in place
 * by `selectTaggedLine` rather than played — the same mechanism, and the same
 * reasoning, as the Portrait's door families (AAA 5.13: new copy is one JSON
 * entry and zero code). No pacing valve is spent, nothing is marked seen, and
 * the day's conversation is untouched.
 *
 * ═══ PACING ═══
 *
 * Because nothing is marked seen, the pacing is arithmetic rather than state:
 * one mention every third morning, from day 4. Days 1–3 are silent on purpose
 * — she is still making the player's acquaintance herself, and a house that
 * starts naming its staff on day one has handed over the roster.
 *
 * Between mention mornings the rotation advances, so consecutive mentions are
 * about different people; a name drops out of the rotation the moment she is
 * met (the `not met.<c>` gate is on the authored nodes, so a met character
 * simply has no eligible line and the turn passes to the next). When everyone
 * is met the card is silent forever, with no flag to check and nothing to
 * clean up.
 */

import type { CharacterId } from '../types';

/** The first morning she mentions anybody. */
export const WHEREABOUTS_FIRST_DAY = 4;

/** …and one every this-many mornings after that. */
export const WHEREABOUTS_EVERY = 3;

/**
 * Who the rotation walks, in order. Dewey is absent by design: he has no room
 * to be found in — he turns up where he likes — so there is no whereabouts to
 * hint at, and Bramble already keeps a general line about him
 * (`bramble.gen.dewey-warn`). Mrs. Bramble is absent because she is the one
 * doing the mentioning.
 */
export const WHEREABOUTS_ORDER: readonly CharacterId[] = ['fern', 'ellery', 'posy', 'portrait'];

/** The authored id prefix for one character's whereabouts lines. */
export function whereaboutsPrefix(character: CharacterId): string {
  return `bramble.where.${character}.`;
}

/** Is this a morning she says something about somebody? */
export function isMentionMorning(day: number): boolean {
  return day >= WHEREABOUTS_FIRST_DAY && (day - WHEREABOUTS_FIRST_DAY) % WHEREABOUTS_EVERY === 0;
}

/**
 * The rotation for this morning: who she would mention first, then who she
 * falls back to. The caller walks it and renders the first character with an
 * eligible line (the authored `not met.<c>` gates do the "only the unmet"
 * half), so a met character costs a turn and nothing else.
 *
 * Empty on a morning that is not a mention morning — the card asks once and
 * gets a plain answer.
 */
export function whereaboutsRotation(day: number): readonly CharacterId[] {
  if (!isMentionMorning(day)) return [];
  const turn = Math.floor((day - WHEREABOUTS_FIRST_DAY) / WHEREABOUTS_EVERY);
  const start = turn % WHEREABOUTS_ORDER.length;
  return [...WHEREABOUTS_ORDER.slice(start), ...WHEREABOUTS_ORDER.slice(0, start)];
}
