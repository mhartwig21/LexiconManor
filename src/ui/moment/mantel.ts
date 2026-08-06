/**
 * THE MANTEL — permanent unlocks, and whether she has actually looked at them.
 * OWNER: the moment layer (src/ui/moment/*).
 *
 * ROUND 9 DEFECT (AAA 11.12 / 11.19, major). Round 7 landed the keepsake and
 * floorplan-plate emitters (app/slices/meta.ts `syncEarnedRewards`) and round 8
 * verified they fire: live, `earnedAchievementIds` went [] → ['first-morning']
 * at the day roll and later gained 'a-line-in-his-hand'. And nothing said so.
 * No moment on glass, no line in the night digest, no marker on the Chronicles
 * entrance, no marker on the Cabinet entrance. AAA 11.12's own table files
 * "permanent unlock (room card, keepsake)" as **Campaign class**, which owes a
 * moment on the screen the player is on AND a persistent trace — this class had
 * neither, so the whole 11.19 chain was missing end to end.
 *
 * WHY THIS IS A DERIVED CHANNEL, NOT AN EVENT. The finding's suggested fix was
 * a new spine event out of `syncEarnedRewards`, but `engine/events.ts` is
 * architect-owned and frozen (filed under SHARED-FILE REQUESTS anyway), and the
 * moment layer already has exactly the right precedent: a LETTER ARRIVING emits
 * no event either — it is pure derivation over the save, and watch.ts diffs the
 * tray. Keepsakes and plates are the same shape: both are arrays in the save
 * that only ever grow. Diffing them needs no new event, works identically for a
 * grant that lands mid-day and one banked by a migration, and cannot drift from
 * what the Chronicles page actually renders.
 *
 * THE TRACE (11.12/11.20). Viewing is recorded as write-once `sys.` flags —
 * `sys.keepsake.<id>` and `sys.plate.<cardId>` (docs/flags.md's code-set
 * namespace; filed under SHARED-FILE REQUESTS for the doc's reserved list).
 * Flags persist forever, so the marker survives the day roll and a force-quit
 * and is NOT derived from `recentEvents`, which dusk prunes — that is exactly
 * the recency-badge-wearing-state's-clothes failure 11.20 names.
 */

import { keepsakeById, KEEPSAKES, type KeepsakeDef } from '../../engine/achievements';
import { cardById } from '../../engine/manor/deck';
import type { RoomCard } from '../../engine/types';

/** Write-once "she has seen this keepsake on the shelf". */
export function keepsakeSeenFlag(keepsakeId: string): string {
  return `sys.keepsake.${keepsakeId}`;
}

/** Write-once "she has seen this plate in the cabinet". */
export function plateSeenFlag(cardId: string): string {
  return `sys.plate.${cardId}`;
}

/**
 * Keepsakes banked but never displayed. Unknown ids (a legacy v1 achievement
 * that slipped the prune) are ignored rather than counted: a marker the player
 * can never clear is the other half of 11.21's truthfulness.
 */
export function unseenKeepsakes(
  earnedIds: readonly string[],
  flags: readonly string[],
): KeepsakeDef[] {
  const seen = new Set(flags);
  const out: KeepsakeDef[] = [];
  for (const id of earnedIds) {
    const def = keepsakeById(id);
    if (def && !seen.has(keepsakeSeenFlag(id))) out.push(def);
  }
  return out;
}

/** Cabinet plates filled but never looked at. */
export function unseenPlates(
  unlockedCardIds: readonly string[],
  flags: readonly string[],
): RoomCard[] {
  const seen = new Set(flags);
  const out: RoomCard[] = [];
  for (const id of unlockedCardIds) {
    const card = cardById(id);
    if (card && !seen.has(plateSeenFlag(id))) out.push(card);
  }
  return out;
}

/** "Two keepsakes wait on the mantel." Counted in words, never a badge — the
 *  night digest's own voice (see waitingPostLine in ui/chrome/DayTransitions). */
const COUNT_WORDS = ['no', 'A', 'Two', 'Three', 'Four', 'Five', 'Six'];

export function mantelLine(keepsakes: number, plates: number): string | null {
  const parts: string[] = [];
  if (keepsakes === 1) parts.push('A keepsake you have not looked at sits on the mantel.');
  else if (keepsakes > 1) {
    parts.push(`${COUNT_WORDS[keepsakes] ?? String(keepsakes)} keepsakes sit unlooked-at on the mantel.`);
  }
  if (plates === 1) parts.push('A new floorplan waits in the cabinet.');
  else if (plates > 1) {
    parts.push(`${COUNT_WORDS[plates] ?? String(plates)} new floorplans wait in the cabinet.`);
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

/** The catalog size, for "N of 12" copy that cannot drift from the shelf. */
export const KEEPSAKE_TOTAL = KEEPSAKES.length;
