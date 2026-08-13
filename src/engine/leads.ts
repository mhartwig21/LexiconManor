/**
 * LEADS — how the house tells you where to look. OWNER: A6 (Dialogue) × A7
 * (Mystery). Pure TS: no React, no DOM, no store.
 *
 * ═══ THE OWNER'S RULING, 13 AUG (docs/LEADS.md) ════════════════════════════
 *
 *   *"I am okay with a hint saying... draft the library, the old codger left an
 *    important document on the shelves there, worth a read... and the player
 *    then saying oh shit, I need to go to the library and solve it. But then
 *    also getting the reward and seeing the connection."*
 *
 * The distinction the whole thing rests on:
 *
 *   A card printing `+1 page`  — the GAME telling you a RULE, before you played.
 *   A LEAD                     — a PERSON telling you about a PLACE, right now,
 *                                in the fiction.
 *
 * A lead creates intent. It does not describe a payout, it does not generalise,
 * and it does not survive as a rule — it sends her somewhere ONCE. The rule
 * stays hers to deduce; round 49's attribution closes the loop when the page
 * arrives ("The Library gives up an engraving", and "Taken out of the Library"
 * in the journal afterwards).
 *
 * ═══ WHAT THIS FILE IS FOR: HONESTY, MADE STRUCTURAL ═══════════════════════
 *
 * The ruling's fourth clause is the one that can be enforced by code rather
 * than by care: *"A lead must be honest. If Ellery says the shelves hold
 * something, drafting the Library that day must actually pay. A character who
 * is wrong is worse than a character who is silent"* — this project already
 * retired a line of Dewey prophecy for exactly that.
 *
 * So a lead is not merely authored copy that happens to name a room. It is a
 * node whose ID NAMES A CARD, and two mechanisms hold it to that name:
 *
 *   1. `withHonestLeads` — a lead is removed from the pool the selector sees
 *      unless the room it names CAN pay a page right now. The gate is on the
 *      pool, not on the line, so an ineligible lead loses its turn to ordinary
 *      content rather than leaving a hole in the conversation.
 *   2. `leadCardSpokenToday` — once she has been sent somewhere, the house keeps
 *      its promise. The named room's solve pays its channel page even if the
 *      day's valve was spent elsewhere in between (app/slices/journal.ts). Only
 *      the VALVE is waived; a channel with nothing left in it still pays
 *      nothing, which is why (1) checks the stock as well.
 *
 * Between them the dishonest case is not "rare", it is unreachable: (1) refuses
 * to say it and (2) makes it true if it was said.
 *
 * ═══ WHAT A LEAD MUST NOT BE ═══════════════════════════════════════════════
 * Each of these has a precedent in this repo, and `content/validate-dialogue.ts`
 * fails the build on the first three:
 *   · a payout figure, a rate or a mechanic ("solve any word game to file a
 *     page") — a lead line may not carry a numeral at all;
 *   · an interface nudge written in the house voice — that is the same
 *     announcement in a costume, so a lead may only live on a trigger a
 *     CONVERSATION is mounted on (`morning` / `parlor`), never on a rendered
 *     family (`selectTaggedLine` surfaces are excluded by prefix);
 *   · a repeatable tip that becomes a checklist — every lead is `once: true`.
 *     If she can predict it, it has become a rule.
 *
 * ═══ THE ID GRAMMAR ════════════════════════════════════════════════════════
 *   `<character>.lead.<cardId>.<slug>`   e.g. `ellery.lead.library.shelves`
 * The card id is the third dot segment. Deck ids are kebab with no dots
 * (`linen-closet`, `counting-house`), so the split is exact — and the validator
 * checks the id against the live deck, so a lead pointing at a room that does
 * not exist, or at one that cannot pay a page, is a build failure rather than a
 * character being wrong in front of the player.
 */

import type { RecordedEvent } from './events';
import type { DialogueFile, DialogueNode } from './dialogue/schema';
import { cardById, deckFor } from './manor/deck';
import type { VolumeDef, VolumeState } from './types';
import { fragmentForSolveChannel, solveChannelFor } from './volume';

/** The segment that makes a node a lead. */
export const LEAD_INFIX = '.lead.';

/**
 * The card a lead node names, or null for any other node.
 * `ellery.lead.library.shelves` → `library`.
 */
export function leadCardId(nodeId: string): string | null {
  const parts = nodeId.split('.');
  if (parts.length < 4 || parts[1] !== 'lead') return null;
  return parts[2] || null;
}

export function isLeadNode(node: { id: string }): boolean {
  return leadCardId(node.id) !== null;
}

/** Every lead in a file, in authored order. */
export function leadNodes(file: DialogueFile): DialogueNode[] {
  return file.nodes.filter(isLeadNode);
}

/**
 * Which rooms may be led to at all — every card in the live deck that pays a
 * page when it is solved. Derived from the deck and the room's own channel, so
 * a new puzzle card is leadable the day it ships and a card that stops being a
 * puzzle stops being leadable, with nothing to remember.
 */
export function leadableCardIds(unlockedCardIds: readonly string[] = []): string[] {
  return deckFor(unlockedCardIds)
    .filter((c) => c.category === 'puzzle' && c.puzzleKind)
    .map((c) => c.id);
}

/**
 * THE HONESTY PREDICATE, asked of one card at the moment somebody might say it:
 * IF SHE GOES THERE AND SOLVES IT TONIGHT, IS THERE A PAGE IN IT.
 *
 * ── WHY THIS IS THE CHANNEL'S STOCK AND NOT `solveChannelPage` ─────────────
 *
 * The first build asked `solveChannelPage`, which is round 46's one-decision
 * function — the daily valve, the stock and the testimony reservation in one
 * lookup. It measured badly and the measurement is worth keeping: over six
 * simulated campaigns leads became a MORNING-ONLY channel, one or two a
 * campaign, because she solves a word room early in most evenings and the
 * valve then shuts every word room out of every mouth for the rest of the
 * night. Ellery would have been forbidden to mention the shelves at six o'clock
 * for a reason that has nothing to do with whether anything is on them.
 *
 * The valve is not part of the question because the valve is not part of the
 * answer: a room she has been sent to waives it (`leadCardSpokenToday` →
 * `solveChannelPage({ valveWaived })`, app/slices/journal.ts). What cannot be
 * waived is STOCK — a channel with nothing left in it pays nothing however
 * sincerely somebody points at it — and a testimony a character has reserved,
 * which belongs to a scene rather than to a room. Those two are exactly
 * `fragmentForSolveChannel`, so those two are the question.
 *
 * WHAT IT COSTS, stated rather than absorbed: on an evening where she has
 * already been paid, is then sent somewhere, and goes, the house pays a second
 * page. It is bounded at one a day by the one-lead-a-day valve on the tail
 * (ui/dialogue/DialogueScene.tsx), and `tests/leads.test.ts` measures how often
 * it actually lands and prints the number every run.
 */
export function leadIsPayable(
  cardId: string,
  def: VolumeDef,
  state: VolumeState,
  opts?: { reservedIds?: ReadonlySet<string> },
): boolean {
  if (state.status !== 'active') return false;
  const card = cardById(cardId);
  if (!card || card.category !== 'puzzle' || !card.puzzleKind) return false;
  return fragmentForSolveChannel(def, state, solveChannelFor(card.puzzleKind), opts) !== null;
}

/** Every card that could honestly be led to right now. */
export function payableLeadCardIds(
  def: VolumeDef,
  state: VolumeState,
  opts?: { reservedIds?: ReadonlySet<string>; unlockedCardIds?: readonly string[] },
): Set<string> {
  const out = new Set<string>();
  for (const id of leadableCardIds(opts?.unlockedCardIds ?? [])) {
    if (leadIsPayable(id, def, state, opts)) out.add(id);
  }
  return out;
}

/**
 * The file the selector is allowed to deal from: identical, minus every lead
 * whose room cannot pay right now.
 *
 * Filtering the POOL rather than gating the LINE is deliberate. The selector's
 * never-silence rule (select.ts) means an empty slot falls back to the idle
 * pool; a lead suppressed at render time would have produced a conversation
 * with a hole in it, and a lead suppressed by a condition would have needed the
 * frozen `DialogueQuery` to carry mystery state it does not carry. A filtered
 * file needs neither: every existing selector — `selectDialogue`,
 * `availableChoices`, `resolveChoiceTarget`, `selectAskMenu` — keeps working
 * unchanged, and a lead that may not be said is simply not in the deck of
 * things she can say.
 *
 * Returns the SAME object when nothing is filtered, so the common path
 * allocates nothing and referential identity survives for React.
 */
export function withHonestLeads(
  file: DialogueFile,
  payableCardIds: ReadonlySet<string>,
): DialogueFile {
  let dropped = false;
  const nodes = file.nodes.filter((n) => {
    const card = leadCardId(n.id);
    if (card === null) return true;
    if (payableCardIds.has(card)) return true;
    dropped = true;
    return false;
  });
  return dropped ? { ...file, nodes } : file;
}

/**
 * THE PROMISE, READ BACK OFF THE SPINE — which room she has been sent to today.
 *
 * `dialogue-seen` is day-stamped and lives in the save, so this survives a
 * screen change, a reload and a force-quit, and it resets exactly when the day
 * does. No new save field and no in-memory counter a refresh could hand back —
 * the same reasoning as `solveChannelFiledToday`, which is the valve this
 * waives.
 *
 * Several leads in one day would be a quest log, and the pacing forbids it
 * (docs/LEADS.md "Measuring it"); should one ever land anyway, every room named
 * today keeps its promise, because the alternative is a character who was right
 * being treated as wrong.
 */
export function leadCardsSpokenToday(
  recentEvents: readonly RecordedEvent[],
  day: number,
): Set<string> {
  const out = new Set<string>();
  for (const rec of recentEvents) {
    if (rec.day !== day) continue;
    if (rec.event.type !== 'dialogue-seen') continue;
    const card = leadCardId(rec.event.nodeId);
    if (card) out.add(card);
  }
  return out;
}

/** Has somebody sent her to THIS room today? (The valve waiver's predicate.) */
export function leadCardSpokenToday(
  cardId: string | undefined,
  recentEvents: readonly RecordedEvent[],
  day: number,
): boolean {
  if (!cardId) return false;
  return leadCardsSpokenToday(recentEvents, day).has(cardId);
}
