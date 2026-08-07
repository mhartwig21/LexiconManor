/**
 * THE FIRST MEETING — the pure half. OWNER: A6 (Dialogue).
 *
 * OWNER DIRECTIVE (round 12), verbatim: *"im okay with it being random
 * discoveries, though maybe there could be clues for where to find certain
 * peoples. But there needs to be a moment in how the panel is delivered so
 * its clear you've met someone new by whatever the trigger is"*
 *
 * DISCOVERY STAYS RANDOM. Nothing here enumerates a cast, forces an
 * introduction order, or tells the player a household exists before she
 * stumbles on it. What changes is the DELIVERY: the ordinary conversation
 * panel is identical whether Fern is a stranger or a Tuesday, so the ten
 * authored `fern.meet.*` lines — the only ones in the game that can be heard
 * exactly once — arrived wearing a routine visit's clothes.
 *
 * WHY THIS SITS BESIDE THE MOMENT LAYER AND NOT INSIDE IT (ui/moment/*):
 *
 * The moment layer's whole contract is *"a campaign grant happened somewhere
 * you were not looking — here is a receipt, and here is the address where it
 * now lives forever"* (AAA 11.11/11.12): a fixed card in a band above whatever
 * screen the player occupies, dwelling 4–5.6s on its own clock, queued behind
 * other seals. Every one of those properties is wrong for a first meeting:
 *
 *   - She IS looking. The subject of the announcement is the panel directly
 *     underneath it. A seal that says "you have met Fern" while Fern talks is
 *     precisely the toast this round exists to not build.
 *   - There is no elsewhere-trace to name. A fragment goes to the Journal; an
 *     acquaintance goes into the conversation she is already in.
 *   - It would QUEUE. A meeting arrives at the same instant as a parlor
 *     visit's other grants, so the introduction could land fourth, four
 *     seconds each, over a scene that started without it.
 *   - Over /manor the seal is deliberately inert (dock.ts) — and the first
 *     meeting is the one announcement that must be tappable-past.
 *
 * So the ceremony is rendered BY the dialogue surface, as a pre-roll it hands
 * off to (ui/dialogue/MeetingCard.tsx): the frame arrives, the portrait
 * settles into it, the name is written and the wax is pressed, and then the
 * card BECOMES the scene. It borrows the moment layer's vocabulary on purpose
 * — the wax disc with one Latin letterform (AAA 6.3: survives a grayscale
 * screenshot, hue never load-bearing), the raised deckled sheet, the display
 * face at the 22px floor — so it reads as the same CLASS of event without
 * being a second notice layer competing with the first.
 *
 * WHEN IT FIRES. Not "when `met.<c>` is set" — that happens on the LAST line,
 * and the brief requires the ceremony before or as the first line begins. It
 * fires when the node the scene is ABOUT to play is the one that will set the
 * flag. Same write-once state, read one beat earlier; no parallel bookkeeping
 * (and no second flag to migrate). Meet nodes are `once`, so the selector
 * cannot serve one twice and the card cannot fire twice.
 */

import type { CharacterId } from '../types';
import { PRIORITY, type DialogueNode } from './schema';

/**
 * Dewey's meet node. He is narration-only forever (AAA 5.6) and his file
 * carries NO effects at all — the validator forbids them — so there is no
 * `met.dewey` to read and docs/flags.md says there never will be. His
 * write-once state is the node's own `once`, pinned by name here and asserted
 * in tests/dialogue-content.test.ts so it can never drift silently.
 */
export const DEWEY_MEET_NODE = 'dewey.presence.first';

export interface MeetingCardCopy {
  /**
   * The letterform pressed into the wax. One Latin glyph, never an emoji or a
   * dingbat — the same rule the moment layer's seal follows (AAA 6.3).
   */
  sigil: string;
  /** The nameplate, as it will read for the rest of the campaign. */
  name: string;
  /**
   * Their standing in the house, lifted from their own authored first lines
   * so the card cannot drift out of voice. Never a mechanic, never a hint.
   */
  standing: string;
  /**
   * A presence rather than a speaker: the card is written ABOUT them, in the
   * narration register, because they will never introduce themselves. Dewey
   * only — a cat does not give his name.
   */
  narrated?: boolean;
}

export const MEETING_CARDS: Readonly<Record<CharacterId, MeetingCardCopy>> = {
  bramble: {
    sigil: 'B',
    name: 'Mrs. Bramble',
    standing: 'Housekeeper, keeper of keys. The rooms wander; the tea does not.',
  },
  ellery: {
    sigil: 'E',
    name: 'Ellery',
    standing: 'Librarian. The ‘late’ is silent, and so are the shelves.',
  },
  posy: {
    sigil: 'P',
    name: 'Posy',
    standing: 'Postmistress. The house writes letters overnight; she sorts where they land.',
  },
  fern: {
    sigil: 'F',
    name: 'Fern',
    standing: 'Groundskeeper. Ferns all the way down, and the garden is everywhere.',
  },
  dewey: {
    sigil: 'D',
    name: 'Dewey',
    standing: 'He does not give his name. The house supplies it, and he allows it.',
    narrated: true,
  },
  portrait: {
    sigil: 'L',
    name: 'The Portrait',
    standing: 'Lexicographer of this house. All of him the frame could hold.',
  },
};

/**
 * Is this the node that makes the acquaintance?
 *
 * Read off the node's own effects rather than off a table of ids: a meet node
 * is by definition the one that sets `met.<self>`, and the validator already
 * guarantees a file may only set its own (validate.ts `ownsFlag`). Dewey has
 * no effects to read, so his single forced `once` node stands in — asserted
 * against DEWEY_MEET_NODE by the content test rather than trusted.
 */
export function isFirstMeetingNode(character: CharacterId, node: DialogueNode): boolean {
  if (character === 'dewey') {
    return node.id === DEWEY_MEET_NODE && node.once && node.priority >= PRIORITY.forced;
  }
  return (node.effects?.setFlags ?? []).includes(`met.${character}`);
}

/**
 * The card to present before this scene speaks, or null for an ordinary
 * visit. `flags`/`seen` are the belt to the meet node's `once` braces: if the
 * acquaintance is somehow already on the books, the ceremony is skipped and
 * the scene plays plainly.
 */
export function meetingCardFor(
  character: CharacterId,
  node: DialogueNode,
  flags: ReadonlySet<string>,
  seen: ReadonlySet<string>,
): MeetingCardCopy | null {
  if (!isFirstMeetingNode(character, node)) return null;
  if (character === 'dewey' ? seen.has(node.id) : flags.has(`met.${character}`)) return null;
  return MEETING_CARDS[character];
}
