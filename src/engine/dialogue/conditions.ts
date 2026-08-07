/**
 * Dialogue condition evaluation — OWNER: A6 (Dialogue).
 *
 * Pure functions of (condition, DialogueQuery). No store, no DOM, no time —
 * everything the conditions may see is inside the frozen snapshot.
 */

import type { DialogueQuery } from '../events';
import { sealedFragmentIds } from '../volume';
import type { DialogueCondition } from './schema';

/**
 * ROUND 11 — "she reads English, not smudges", applied to the gates.
 *
 * Every authored `fragmentCount` condition counted pages the player cannot
 * read: four sealed smudges retired the Portrait's thin-file nudge and unlocked
 * Ellery's reading offer for someone with no readable line in the journal.
 *
 * ROUND 7 (verifier) — the count is now a REAL FIELD on the frozen snapshot
 * (`DialogueQuery.fragmentsLegible`, architect-granted), not a per-evaluation
 * flag scan. To keep one definition and no drift there is exactly one
 * derivation — `deriveLegibleFragmentCount` below, called once by
 * `app/slices/dialogue.ts` when it builds the snapshot — and exactly one read
 * path, `legibleFragmentCount`, which now just answers the field. A query is
 * only ever built by the slice, so the two can never disagree; a test that
 * hand-builds one states the number it means, which is the honest thing for a
 * fixture to do.
 */
export function deriveLegibleFragmentCount(
  volumeId: string,
  flags: Iterable<string>,
  fragmentsFound: number,
): number {
  // Sealed fragments are write-once `vol.<id>.sealed-<frag>` flags minus
  // `legible-` ones (engine/volume.ts), and every sealed id is by construction
  // a filed one (`fileFragment` sets the flag only as it files) — so the
  // subtraction is exact rather than an estimate.
  const sealed = sealedFragmentIds(volumeId, flags);
  return Math.max(0, fragmentsFound - sealed.size);
}

/** What she can actually READ — the quantity `fragmentsLegible` gates on. */
export function legibleFragmentCount(q: DialogueQuery): number {
  return q.fragmentsLegible;
}

/** Dot-path lookup into an event payload ("closeness.repeat" etc.). */
function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function inBand(value: number, gte?: number, lte?: number): boolean {
  if (gte !== undefined && value < gte) return false;
  if (lte !== undefined && value > lte) return false;
  return true;
}

export function evaluateCondition(cond: DialogueCondition, q: DialogueQuery): boolean {
  switch (cond.kind) {
    case 'flag':
      return q.flags.has(cond.flag);
    case 'affinity':
      return inBand(q.affinities[cond.character] ?? 0, cond.gte, cond.lte);
    case 'event': {
      const within = cond.withinDays ?? 1;
      return q.recentEvents.some((rec) => {
        if (rec.event.type !== cond.event) return false;
        if (rec.day < q.day - within) return false;
        if (cond.where) {
          for (const [path, want] of Object.entries(cond.where)) {
            if (getPath(rec.event, path) !== want) return false;
          }
        }
        if (cond.whereGte) {
          for (const [path, min] of Object.entries(cond.whereGte)) {
            const got = getPath(rec.event, path);
            if (typeof got !== 'number' || got < min) return false;
          }
        }
        return true;
      });
    }
    case 'counter':
      return inBand(q.counters[cond.event] ?? 0, cond.gte, cond.lte);
    case 'fragmentCount':
      return inBand(q.fragmentsFound, cond.gte, cond.lte);
    case 'fragmentsLegible':
      return inBand(legibleFragmentCount(q), cond.gte, cond.lte);
    case 'day':
      return inBand(q.day, cond.gte, cond.lte);
    case 'seen':
      return q.seen.has(cond.node);
    case 'volume':
      return q.volumeId === cond.id;
    case 'not':
      return !evaluateCondition(cond.cond, q);
  }
}

export function evaluateAll(conds: DialogueCondition[] | undefined, q: DialogueQuery): boolean {
  if (!conds || conds.length === 0) return true;
  return conds.every((c) => evaluateCondition(c, q));
}
