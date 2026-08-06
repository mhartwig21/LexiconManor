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
import type { DialogueFile, DialogueNode } from './schema';
import { evaluateAll } from './conditions';

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

function eligible(node: DialogueNode, q: DialogueQuery): boolean {
  if (node.chainOnly) return false;
  if (node.trigger !== q.slot) return false;
  if (node.once && q.seen.has(node.id)) return false;
  if (node.cooldownDays !== undefined && seenWithinDays(q, node.id, node.cooldownDays)) return false;
  return evaluateAll(node.conditions, q);
}

function pick(nodes: DialogueNode[], q: DialogueQuery): DialogueNode | undefined {
  const pool = nodes.filter((n) => eligible(n, q));
  if (pool.length === 0) return undefined;

  const top = Math.max(...pool.map((n) => n.priority));
  let ties = pool.filter((n) => n.priority === top);

  const allRepeatable = ties.every((n) => !n.once);
  if (allRepeatable && ties.length > 1) {
    // Prefer lines not already heard today; if that empties the pool, repeat
    // (better than silence).
    const fresh = ties.filter((n) => !seenWithinDays(q, n.id, 0));
    if (fresh.length > 0) ties = fresh;
    const idx = (Math.max(0, q.day - 1) + seenTodayCount(q)) % ties.length;
    return ties[idx];
  }
  return ties[0];
}

/**
 * Select the node to play for this query, or undefined only when the
 * character has no eligible content anywhere (authoring floor failure).
 */
export function selectDialogue(file: DialogueFile, query: DialogueQuery): DialogueNode | undefined {
  // Pacing valve (AAA 5.9): substantive slot spent → idle pool.
  const valveSpent = query.talkedToday.has(query.character);
  const slot = valveSpent && query.slot !== 'idle' ? 'idle' : query.slot;
  const q: DialogueQuery = slot === query.slot ? query : { ...query, slot };

  const node = pick(file.nodes, q);
  if (node) return node;

  // Never silence: fall back to the idle pool.
  if (q.slot !== 'idle') return pick(file.nodes, { ...q, slot: 'idle' });
  return undefined;
}

/** Find a node by id (goto resolution). */
export function findNode(file: DialogueFile, id: string): DialogueNode | undefined {
  return file.nodes.find((n) => n.id === id);
}
