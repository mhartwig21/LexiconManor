/**
 * Dialogue selection — OWNER: A6 (Dialogue). The Hades rules, encoded
 * (BENCHMARKS §5, ARCHITECTURE §5, AAA 5.3/5.4/5.9):
 *
 *   1. Pacing valve: one substantive conversation per character per day. If
 *      the valve is spent, any non-idle query retargets the idle pool — the
 *      valve is surfaced with a warm idle line, never silence or a grey button.
 *   2. Filter by trigger, evaluate conditions, drop seen `once` nodes and
 *      nodes cooling down (seen on the recent stream within cooldownDays).
 *   3. Highest priority wins. Ties between `once` nodes break by file order
 *      (deterministic, AAA 5.4). Ties inside an all-repeatable pool rotate
 *      deterministically by (day, visits-today) so idle lines vary without
 *      randomness.
 *   4. Never silence (Supergiant's rule): an exhausted slot falls back to the
 *      idle pool; an exhausted idle pool relaxes the seen-today filter —
 *      an out-of-date or repeated line beats no line at all.
 */

import type { DialogueQuery } from '../events';
import type { DialogueChoice, DialogueFile, DialogueNode } from './schema';
import { evaluateAll } from './conditions';
import { leadCardId } from '../leads';

/** How a pool is narrowed. Both defaults are the ordinary scene selection. */
interface PickOptions {
  /**
   * Include `chainOnly` nodes and ignore the trigger. A chain member is
   * reached by its PARENT, not by a slot, so the slot it happens to be filed
   * under says nothing about whether it may play (see `gotoPrefix`).
   */
  chain?: boolean;
  /**
   * ── ONE ROTATION STEP PER DAY, NOT PER VISIT (round 25) ──────────────────
   *
   * The tie-break below advances by (day, visits-today) so that WALKING UP TO
   * somebody twice in an afternoon does not get the same idle line twice. A
   * QUOTED line has no visits: the night digest and the Sanctum door render an
   * authored line into a surface the player did not choose to open, once, and
   * the visit counter is then nothing but jitter — it is the count of
   * conversations she happened to have earlier in the day.
   *
   * Measured: five consecutive empty evenings, driven by clicking at 375x667,
   * printed the SAME goodnight on nights 1 and 2 out of a pool of four,
   * because day 1's introduction spent two dialogue-seen events and day 2's
   * morning spent one, and (0+2)%4 = (1+1)%4. Two identical bedtimes in a row
   * is the most visible repeat there is. Stable rotation walks the pool one
   * step a day, so a pool of four cannot repeat inside four nights.
   */
  stableRotation?: boolean;
}

/** How many dialogue-seen events this character has today (visit counter). */
function seenTodayCount(q: DialogueQuery): number {
  return q.recentEvents.filter(
    (r) => r.event.type === 'dialogue-seen' && r.event.character === q.character && r.day === q.day,
  ).length;
}

function seenWithinDays(q: DialogueQuery, nodeId: string, days: number): boolean {
  return q.recentEvents.some(
    (r) => r.event.type === 'dialogue-seen' && r.event.nodeId === nodeId && r.day >= q.day - days,
  );
}

function eligible(node: DialogueNode, q: DialogueQuery, opts: PickOptions = {}): boolean {
  if (opts.chain) {
    if (!node.chainOnly) return false;
  } else {
    if (node.chainOnly) return false;
    if (node.trigger !== q.slot) return false;
  }
  if (node.once && q.seen.has(node.id)) return false;
  if (node.cooldownDays !== undefined && seenWithinDays(q, node.id, node.cooldownDays)) return false;
  return evaluateAll(node.conditions, q);
}

function pick(nodes: DialogueNode[], q: DialogueQuery, opts: PickOptions = {}): DialogueNode | undefined {
  const pool = nodes.filter((n) => eligible(n, q, opts));
  if (pool.length === 0) return undefined;

  const top = Math.max(...pool.map((n) => n.priority));
  let ties = pool.filter((n) => n.priority === top);

  const allRepeatable = ties.every((n) => !n.once);
  if (allRepeatable && ties.length > 1) {
    // Prefer lines not already heard today; if that empties the pool, repeat
    // (better than silence).
    const fresh = ties.filter((n) => !seenWithinDays(q, n.id, 0));
    if (fresh.length > 0) ties = fresh;
    const step = opts.stableRotation ? 0 : seenTodayCount(q);
    const idx = (Math.max(0, q.day - 1) + step) % ties.length;
    return ties[idx];
  }
  return ties[0];
}

/**
 * Select the node to play for this query, or undefined only when the
 * character has no eligible content anywhere (authoring floor failure).
 */
export function selectDialogue(file: DialogueFile, query: DialogueQuery): DialogueNode | undefined {
  // Pacing valve (AAA 5.9): substantive slot spent → idle pool. Only the
  // visiting slots are valved — 'sanctum-after-guess'/'letter'/'night' are
  // forced-context reaction beats and always play (the Portrait's sigh must
  // never be suppressed by "we already talked today").
  const valved = query.slot === 'morning' || query.slot === 'parlor';
  const valveSpent = valved && query.talkedToday.has(query.character);
  const slot = valveSpent ? 'idle' : query.slot;
  const q: DialogueQuery = slot === query.slot ? query : { ...query, slot };

  const node = pick(file.nodes, q);
  if (node) return node;

  // Never silence: fall back to the idle pool.
  if (q.slot !== 'idle') return pick(file.nodes, { ...q, slot: 'idle' });
  return undefined;
}

/**
 * Highest-priority eligible node whose id starts with `prefix` — for surfaces
 * that RENDER an authored line in place rather than playing a scene (the
 * Sanctum door's insufficient-info nudge, AAA 4.16). No pacing valve, no
 * never-silence fallback, no seen-marking: the caller is quoting the
 * character, not spending a conversation with him. Keeps that copy in the
 * authored JSON where a new nudge is one entry and zero code (AAA 5.13).
 */
export function selectTaggedLine(
  file: DialogueFile,
  query: DialogueQuery,
  prefix: string,
): DialogueNode | undefined {
  return pick(file.nodes.filter((n) => n.id.startsWith(prefix)), query, { stableRotation: true });
}

/**
 * ═══ THE LEAD, AND WHY IT DOES NOT COMPETE FOR THE SLOT ════════════════════
 *
 * A lead is somebody mentioning a place as you are leaving (docs/LEADS.md), and
 * the first build of it was a node in the ordinary pools. That was measured and
 * withdrawn, and the measurement is the reason this function exists:
 *
 *   · ABOVE the reaction band, a lead is a gossip that outranks "I heard you
 *     speak at the Sanctum door yesterday" — six reaction-latency cases in
 *     tests/dialogue-content.test.ts went red, which is AAA 5.1 breaking
 *     exactly as `engine/dialogue/whereabouts.ts` recorded it breaking in
 *     round 12.
 *   · BELOW the arc band, a lead is content that never plays: over six
 *     simulated campaigns with a real floorplan the parlor leads fired **zero**
 *     times in twenty-four evenings, because a character with thirteen unseen
 *     reactions and six unseen arcs always has something better to say.
 *
 * There is no third priority, for the same reason the whereabouts aside found
 * no third priority: the conversation's one slot is spoken for by content that
 * is better than a rumour. So a lead does not take the slot. It is `chainOnly`
 * — never dealt as a scene — and the SCENE plays it as a tail once its own
 * lines are done (ui/dialogue/DialogueScene.tsx). Nothing is displaced, no band
 * moves, and the register is the one the ruling asks for: she says her piece,
 * and then, on your way out, she mentions the shelves.
 *
 * Valved to one a day by the caller off the spine (`leadCardsSpokenToday`) so a
 * three-conversation evening is not a quest log.
 */
export function selectLead(file: DialogueFile, query: DialogueQuery): DialogueNode | undefined {
  return pick(file.nodes.filter((n) => leadCardId(n.id) !== null), query, { chain: true });
}

/** Find a node by id (goto resolution). */
export function findNode(file: DialogueFile, id: string): DialogueNode | undefined {
  return file.nodes.find((n) => n.id === id);
}

// ---------------------------------------------------------------------------
// Choices (REVIEW_AA §5.11) — the verb menu, and why it is still there in
// week three
// ---------------------------------------------------------------------------

/**
 * The continuation a choice leads to, or undefined for a choice that simply
 * ends the conversation. `goto` names one node; `gotoPrefix` names a FAMILY
 * and lets the salience rules pick today's member — that is the difference
 * between an answer and an answer about this week.
 */
export function resolveChoiceTarget(
  file: DialogueFile,
  query: DialogueQuery,
  choice: DialogueChoice,
): DialogueNode | undefined {
  if (choice.goto) return findNode(file, choice.goto);
  if (choice.gotoPrefix) {
    return pick(file.nodes.filter((n) => n.id.startsWith(choice.gotoPrefix!)), query, { chain: true });
  }
  return undefined;
}

/**
 * The choices a node may actually SHOW right now.
 *
 * Three ways a verb leaves the menu, all of them the authored intent:
 *   1. its own `conditions` do not hold (she has not met the person it is
 *      about; the volume is not far enough along);
 *   2. it leads to a `once` node she has already been told (asking twice is
 *      how a menu turns into a vending machine);
 *   3. it leads to a family with no member eligible today (the evergreen
 *      verbs carry `cooldownDays: 0`, so one answer per day, not four).
 *
 * A choice with no destination at all is never withdrawn — it is a stance,
 * not a door, and stances stay available.
 */
export function availableChoices(
  file: DialogueFile,
  query: DialogueQuery,
  node: DialogueNode,
): DialogueChoice[] {
  return (node.choices ?? []).filter((ch) => {
    if (!evaluateAll(ch.conditions, query)) return false;
    if (!ch.goto && !ch.gotoPrefix) return true;
    const target = resolveChoiceTarget(file, query, ch);
    if (!target) return false;
    if (target.once && query.seen.has(target.id)) return false;
    return true;
  });
}

/**
 * ── THE VERB THAT OUTLIVES THE INTRODUCTIONS (REVIEW_AA §5.11) ─────────────
 *
 * The census that opened this round: 20 choices in the whole game, every one
 * of them inside a first meeting, an arc opener or a quest ask — so after
 * about day five a 22-day campaign contains no decision at all. The fix the
 * review asks for is not plot forks, it is Hades' repeatable verbs, and this
 * is where they mount: the conversation's closing panel offers the character's
 * ask-menu beside Farewell, so EVERY conversation with EVERY character ends on
 * a live choice for the whole volume.
 *
 * It is an ordinary authored node (`<character>.ask.menu`, idle trigger,
 * repeatable) rather than a hard-coded UI list, so a new verb is one JSON
 * entry and zero code (AAA 5.13) — and because it is ordinary, the idle pool
 * can serve it as a scene in its own right too. The slot is ignored on
 * purpose: the closing panel of a MORNING conversation must be able to offer
 * it, and the menu is being quoted by a surface rather than dealt by the
 * pacing valve (the `selectTaggedLine` precedent, AAA 4.16).
 */
export function selectAskMenu(file: DialogueFile, query: DialogueQuery): DialogueNode | undefined {
  const menus = file.nodes.filter((n) => n.id === `${file.character}.ask.menu`);
  if (menus.length === 0) return undefined;
  const menu = menus[0]!;
  if (!evaluateAll(menu.conditions, query)) return undefined;
  if (menu.once && query.seen.has(menu.id)) return undefined;
  return availableChoices(file, query, menu).length > 0 ? menu : undefined;
}
