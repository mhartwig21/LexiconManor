/**
 * Save migrations (ARCHITECTURE §10). Phase-0 stub landed by the architect so
 * the v1-backup guarantee exists before ANY schema-touching change ships.
 *
 * A8 owns: hardening this table, `tests/migrations.test.ts` with a frozen
 * real v1 fixture, and the dual-write/IndexedDB mirror in app/platform/.
 *
 * v1 → v2 policy (frozen):
 *  - PRESERVE profileName, runHistory (verbatim → chronicles.runHistoryV1),
 *    earnedAchievementIds, seenPuzzleIds (new kinds init []), settings.
 *    (Round 7: `earnedAchievementIds` is now the MANOR KEEPSAKE shelf, so v1
 *    roguelike ids are pruned by `backfillKeepsakes` after the shape migration
 *    — carried across, then dropped as unrenderable. The verbatim v1 blob under
 *    the backup key remains the record of what the old game awarded.)
 *  - PARK unlockedPerkIds/activePerkLoadout → chronicles.legacyPerks (AAA §10.1).
 *  - DROP activeRun* (fork/diamond run state — un-migratable, loses nothing
 *    meaningful).
 *  - Before the v2 save can overwrite the key, the raw v1 blob is copied once
 *    to `lexicon-loop-save-v1-backup`.
 */

import type { GameMode, SaveFile } from '../engine/types';
import type { SaveV2 } from './save';
import { createEmptySaveV2, emptySeenPuzzleIds, V1_BACKUP_KEY } from './save';
import { VIEWED_BACKFILL_FLAG, viewedFragmentFlag } from '../engine/journal';
import { checkKeepsakes, keepsakeFacts, pruneUnknownKeepsakeIds } from '../engine/achievements';
import { getRoomAdapter } from '../engine/rooms/registry';
import { isUsableLedger } from '../engine/rooms/room-bank';
import { isUsableSnapshot } from '../engine/rooms/room-session';
import type { PlacedRoom } from '../engine/types';
import { ROOM_PUZZLE_KINDS, type RoomPuzzleKind } from '../engine/rooms/room-puzzle';

const V1_MODES: readonly GameMode[] = ['word-web', 'hive', 'twistle', 'forgotten-word'];

/** Copy the raw v1 blob to the backup key, once, before anything overwrites it. */
function backupV1Once(v1: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(V1_BACKUP_KEY) !== null) return;
    localStorage.setItem(V1_BACKUP_KEY, JSON.stringify(v1));
  } catch (err) {
    console.error('Failed to back up v1 save', err);
  }
}

function migrateV1toV2(v1: SaveFile): SaveV2 {
  const next = createEmptySaveV2(v1.profileName || 'Player');
  next.chronicles.runHistoryV1 = v1.runHistory ?? [];
  next.chronicles.legacyPerks = {
    unlockedPerkIds: v1.unlockedPerkIds ?? [],
    activePerkLoadout: v1.activePerkLoadout ?? [],
  };
  next.earnedAchievementIds = v1.earnedAchievementIds ?? [];
  const seen = emptySeenPuzzleIds();
  for (const mode of V1_MODES) seen[mode] = v1.seenPuzzleIds?.[mode] ?? [];
  next.seenPuzzleIds = seen;
  next.settings = {
    ...next.settings,
    soundEnabled: v1.settings?.soundEnabled ?? true,
    reducedMotion: v1.settings?.reducedMotion ?? false,
  };
  return next;
}

/**
 * Unread state (AAA 11.20) is persisted as write-once
 * `vol.<volumeId>.viewed-<fragmentId>` flags, the same mechanism the letters'
 * opened-seals already used. Saves written before those flags existed carry no
 * record of what has been read — so on first migration every fragment ALREADY
 * FILED is taken as read, once, and a marker flag records that the sweep ran.
 *
 * Why "taken as read" rather than "taken as unread": the truthful-in-both-
 * directions rule (AAA 11.21) is about the marker matching reality, and the
 * reality for a fortnight-old save is that its owner has read the journal. The
 * alternative opens her live save with a wax dot on every page she wrote,
 * which teaches her in one glance that the dot means nothing. The cost is
 * bounded and one-time: at most the handful of fragments filed in the session
 * immediately before this build lose a marker they were showing under the old
 * (day-scoped, dusk-erased) scheme, which would have expired that night anyway.
 *
 * Runs on EVERY load path (localStorage and importSaveCode) and is idempotent:
 * the marker flag makes it a no-op forever after, so a fragment filed by this
 * build and genuinely unviewed is never swept.
 */
function backfillViewedFragments(save: SaveV2): SaveV2 {
  const flags = save.journal.flags ?? [];
  if (flags.includes(VIEWED_BACKFILL_FLAG)) return save;
  const have = new Set(flags);
  const added: string[] = [];
  for (const id of save.volume.foundFragmentIds ?? []) {
    const flag = viewedFragmentFlag(save.volume.volumeId, id);
    if (have.has(flag)) continue;
    have.add(flag);
    added.push(flag);
  }
  return {
    ...save,
    journal: { ...save.journal, flags: [...flags, ...added, VIEWED_BACKFILL_FLAG] },
  };
}

/**
 * KEEPSAKES (AAA 11.17), on every load.
 *
 * `earnedAchievementIds` is the save field the manor's keepsake shelf lives in
 * — the same field the v1 roguelike used, which is why a migrated save can
 * carry ids like 'five-nodes' that no manor keepsake def matches. Those are
 * dropped: they cannot render, and they would make the Chronicles' "N of 12"
 * count a lie (AAA 11.21). Nothing is destroyed — the raw v1 blob is kept
 * verbatim under `lexicon-loop-save-v1-backup` by `backupV1Once`, and the run
 * archive under `chronicles.runHistoryV1`.
 *
 * Then the shelf is BACKFILLED. Every keepsake condition reads only facts the
 * save already contains (spine counters, the Chronicles ledger, story flags),
 * so a save written before the keepsake system existed is evaluated exactly as
 * the running game would evaluate it — the owner's fortnight-old save opens
 * with the days, rooms, fragments and letters it has always deserved rather
 * than an empty mantelpiece and a request to re-earn them.
 *
 * Idempotent by construction, so it needs no marker flag: it only ever unions
 * in ids that are currently deserved, and `checkKeepsakes` returns nothing once
 * the shelf has caught up.
 */
function backfillKeepsakes(save: SaveV2): SaveV2 {
  const kept = pruneUnknownKeepsakeIds(save.earnedAchievementIds ?? []);
  const won = checkKeepsakes(
    kept,
    keepsakeFacts({
      counters: save.events.counters,
      dayRecords: save.chronicles.dayRecords ?? [],
      flags: save.journal.flags ?? [],
    }),
  ).map((k) => k.id);
  if (won.length === 0 && kept.length === (save.earnedAchievementIds ?? []).length) return save;
  return { ...save, earnedAchievementIds: [...kept, ...won] };
}

/**
 * IN-ROOM PROGRESS (REVIEW_AA §5.3), on every load.
 *
 * The schema step for room sessions. `PlacedRoom.session` was added inside the
 * v2 envelope rather than as a new top-level field (engine/rooms/room-session.ts
 * says why), so a save written before it exists needs no filling in — the field
 * is optional and absent means "no board in progress". What a load DOES owe is
 * the other direction: a save that carries a session the running build can no
 * longer honour.
 *
 * Three ways that happens, all real:
 *   - the build changed an adapter's state shape and bumped its `stateVersion`
 *     (a wrong-shaped state fed back into `reduce` is a crash on her phone);
 *   - the envelope itself changed version;
 *   - the room kind is not registered in this build at all (an agent's adapter
 *     landed, wrote sessions, and was reverted).
 *
 * All three are pruned HERE, once, at the door, rather than being caught
 * defensively at every read: after `migrate()` the app never holds a session
 * record it would refuse to use. The room then opens fresh — a board lost to a
 * version bump is a bad evening; a half-parsed board is a bug report.
 *
 * Idempotent, and it never touches anything else on the PlacedRoom.
 */
function migrateRoomSessions(save: SaveV2): SaveV2 {
  const manor = save.manor;
  if (!manor?.rooms) return save;

  const kinds = new Set<string>(ROOM_PUZZLE_KINDS);
  let changed = false;
  const rooms: Record<string, PlacedRoom> = {};
  for (const [key, placed] of Object.entries(manor.rooms)) {
    if (!placed || placed.session === undefined) {
      if (placed) rooms[key] = placed;
      continue;
    }
    const adapter = kinds.has(placed.kind) ? getRoomAdapter(placed.kind as RoomPuzzleKind) : undefined;
    if (isUsableSnapshot(placed.session, adapter)) {
      rooms[key] = placed;
      continue;
    }
    const { session: _dropped, ...rest } = placed;
    rooms[key] = rest;
    changed = true;
  }
  return changed ? { ...save, manor: { ...manor, rooms } } : save;
}

/**
 * Normalize any raw parsed save (v1, v2, partial, or garbage) into a SaveV2.
 * Every load path — localStorage AND importSaveCode — runs through here.
 */
/**
 * THE OPEN LEDGER, pruned on the same rule as a room session (round 27,
 * engine/rooms/room-bank.ts). A banked board whose adapter has moved on — a
 * bumped `stateVersion`, a regenerated pool that no longer ships the id, an
 * envelope from a future build, a kind that has stopped being bankable — is
 * DROPPED, and the Counting House deals a fresh leaf. Losing a banked grid to
 * a version bump is a bad evening; restoring a half-parsed one into a reducer
 * that no longer understands it is a crash on her phone.
 *
 * Deliberately shares `isUsableLedger` with the live restore path rather than
 * re-checking the fields here: one rule, so the loader and the room can never
 * disagree about what is honourable.
 */
function migrateOpenLedger(save: SaveV2): SaveV2 {
  const ledger = save.openLedger;
  if (!ledger) return save.openLedger === null ? save : { ...save, openLedger: null };
  const kind = (ledger as { session?: { kind?: string } }).session?.kind;
  const adapter = kind && (ROOM_PUZZLE_KINDS as readonly string[]).includes(kind)
    ? getRoomAdapter(kind as RoomPuzzleKind)
    : undefined;
  return isUsableLedger(ledger, adapter) ? save : { ...save, openLedger: null };
}

export function migrate(raw: unknown): SaveV2 {
  return migrateOpenLedger(
    migrateRoomSessions(backfillKeepsakes(backfillViewedFragments(migrateShape(raw)))));
}

function migrateShape(raw: unknown): SaveV2 {
  if (typeof raw !== 'object' || raw === null) return createEmptySaveV2('Player');
  const version = (raw as { version?: unknown }).version;

  if (version === 1) {
    backupV1Once(raw);
    return migrateV1toV2(raw as SaveFile);
  }

  if (version === 2) {
    // Backfill fields added since the save was written (shallow, per section).
    const empty = createEmptySaveV2('Player');
    const v2 = raw as Partial<SaveV2>;
    return {
      ...empty,
      ...v2,
      version: 2,
      currencies: { ...empty.currencies, ...v2.currencies },
      volume: { ...empty.volume, ...v2.volume },
      journal: { ...empty.journal, ...v2.journal },
      events: { ...empty.events, ...v2.events },
      cabinet: { ...empty.cabinet, ...v2.cabinet },
      chronicles: { ...empty.chronicles, ...v2.chronicles },
      seenPuzzleIds: { ...empty.seenPuzzleIds, ...v2.seenPuzzleIds },
      settings: { ...empty.settings, ...v2.settings },
    };
  }

  return createEmptySaveV2('Player');
}
