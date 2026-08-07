/**
 * ROOM SESSION PERSISTENCE — "the save is the product", applied to the board
 * the player is standing in front of. (REVIEW_AA §5.3.)
 *
 * ═══ THE DEFECT ═══
 * Board state lived in `RoomHost`'s `useState` and nowhere else, while the step
 * penalties it charged went straight into the save. Verified by the editor:
 * solve a group in the Library, pay −4 in wrong-group penalties (20 → 16),
 * reload, and you get sixteen unsolved tiles AND 16 steps. On a phone PWA whose
 * front page promises "Nothing here can be lost" — and iOS evicts backgrounded
 * tabs as a matter of routine — that is the product breaking its own promise
 * mid-puzzle.
 *
 * ═══ WHERE THE PROGRESS LIVES ═══
 * On the PlacedRoom, at its cellKey, inside `manor` — which `store.selectSave`
 * already persists whole. Three consequences fall out for free and they are the
 * reason this is not a new top-level save field:
 *
 *   1. keyed by cellKey BY CONSTRUCTION (§5.3's requirement), not by a parallel
 *      map that can drift out of step with the grid;
 *   2. it dies with the manor at night (`slices/day.endDay` sets `manor: null`),
 *      so yesterday's half-finished Conservatory cannot haunt today's cell 2,3.
 *      No sweeper, no TTL, no stale-key class of bug;
 *   3. `tests/reset.test.ts`'s frozen SAVE_SHAPE key list — the thing that keeps
 *      the fresh-start path honest as the save grows — stays true without
 *      needing a ruling, because the field it guards has not changed.
 *
 * The field is added to `PlacedRoom` by MODULE AUGMENTATION rather than by
 * editing `engine/types.ts`, which is architect-owned and shared with every
 * other agent. It is a request to fold `session?: RoomSessionSnapshot` into the
 * interface proper at the next architect pass; until then this is the same
 * declaration in a file its owner owns, and it costs nothing at runtime.
 *
 * ═══ HOW A ROOM KIND CANNOT SILENTLY FORGET TO PERSIST ITS STATE ═══
 * The snapshot stores the adapter's ENTIRE state object, verbatim and opaquely.
 * There is no field list, no per-kind serialiser, no `pick()` of "the important
 * bits" anywhere on this path — nothing in the persistence layer knows that a
 * hive has `foundWords` or that a sudoku has `pencilOrder`. A kind that grows a
 * field tomorrow persists it tonight, by construction, because omission is not
 * expressible.
 *
 * That buys total coverage but moves the risk: an adapter could store something
 * JSON cannot carry (a Set, a Map, `undefined`, NaN, a class instance) and the
 * loss would be silent. So the invariant is stated — ADAPTER STATE IS JSON DATA
 * — and pinned by `tests/room-session.test.ts`, which drives EVERY kind in
 * `ROOM_PUZZLE_KINDS` through a scripted board and asserts
 * `jsonFaithful(state)`. Its drill table is a TOTAL `Record<RoomPuzzleKind, …>`,
 * so a kind added to the union fails `tsc` until someone writes its drill. Both
 * halves of "cannot forget" are therefore compiler- or test-enforced rather
 * than remembered.
 *
 * ═══ AND WHEN THE SHAPE CHANGES ANYWAY ═══
 * Every adapter declares `stateVersion`. A snapshot written under a different
 * envelope version, a different `stateVersion`, a different kind, or naming a
 * puzzle no longer in the pool is DISCARDED and the room opens fresh. Losing a
 * board to a version bump is a bad day; restoring a half-parsed one into a
 * reducer that no longer understands it is a crash on the player's phone.
 */

import type { PlacedRoom, Tier } from '../types';
import type { RoomContext, RoomPuzzleAdapter, RoomPuzzleKind } from './room-puzzle';

/**
 * Envelope version — the shape of THIS record, not of the adapter state it
 * carries (that is `stateVersion`). Bump only when the fields below change.
 */
export const ROOM_SESSION_ENVELOPE = 1;

export interface RoomSessionSnapshot {
  /** `ROOM_SESSION_ENVELOPE` at write time. */
  v: number;
  kind: RoomPuzzleKind;
  /** The board actually played — not necessarily what `select()` would pick now. */
  puzzleId: string;
  tier: Tier;
  /** `adapter.stateVersion` at write time. */
  stateVersion: number;
  /** The adapter's whole state, verbatim. Deliberately `unknown` here. */
  state: unknown;
  /** Host session flags (RoomHost owns these; the adapter does not). */
  done: boolean;
  solvedOnce: boolean;
}

/**
 * In-room progress, parked on the room it belongs to. Augmented rather than
 * declared in `engine/types.ts` — see the header. Optional forever: a save
 * written before this existed, and every non-puzzle room, simply has none.
 */
declare module '../types' {
  interface PlacedRoom {
    session?: RoomSessionSnapshot;
  }
}

/** What `RoomHost` holds while the player is in the room. */
export interface RoomSession {
  puzzle: unknown;
  state: unknown;
  done: boolean;
  /**
   * A `solved` event has been applied at least once this session, even though
   * the adapter may still be running (the Conservatory keeps the hive on the
   * table after Full Bloom — AAA 1.12).
   */
  solvedOnce: boolean;
}

export function snapshotRoomSession(
  adapter: RoomPuzzleAdapter,
  tier: Tier,
  session: RoomSession,
): RoomSessionSnapshot {
  return {
    v: ROOM_SESSION_ENVELOPE,
    kind: adapter.kind,
    puzzleId: adapter.puzzleId(session.puzzle),
    tier,
    stateVersion: adapter.stateVersion,
    state: session.state,
    done: session.done,
    solvedOnce: session.solvedOnce,
  };
}

/**
 * Is this snapshot safe to hand back to THIS adapter? Shape, envelope, kind and
 * state version, checked before anything reaches a reducer. `migrations.ts`
 * uses the same predicate to prune saves at load, so the app never carries a
 * record it would refuse to use.
 */
export function isUsableSnapshot(
  snap: unknown,
  adapter: RoomPuzzleAdapter | undefined,
): snap is RoomSessionSnapshot {
  if (!adapter || typeof snap !== 'object' || snap === null) return false;
  const s = snap as Partial<RoomSessionSnapshot>;
  return (
    s.v === ROOM_SESSION_ENVELOPE &&
    s.kind === adapter.kind &&
    s.stateVersion === adapter.stateVersion &&
    typeof s.puzzleId === 'string' &&
    s.puzzleId.length > 0 &&
    typeof s.done === 'boolean' &&
    typeof s.solvedOnce === 'boolean' &&
    s.state !== undefined
  );
}

/**
 * Rehydrate a saved board, or `null` if it cannot be honoured — an unknown
 * puzzle id (the pool was regenerated under her), a stale state version, a
 * `restore` that threw. `null` means "open the room fresh", never "crash".
 */
export function restoreRoomSession(
  adapter: RoomPuzzleAdapter | undefined,
  snap: unknown,
  ctx: RoomContext,
): RoomSession | null {
  if (!adapter || !isUsableSnapshot(snap, adapter)) return null;
  try {
    const puzzle = adapter.find(snap.puzzleId);
    if (puzzle === undefined) return null;
    const state = adapter.restore ? adapter.restore(puzzle, snap.state, ctx) : snap.state;
    return { puzzle, state, done: snap.done, solvedOnce: snap.solvedOnce };
  } catch {
    return null;
  }
}

/**
 * THE ONE ENTRY POINT the room host uses: restore what was saved, else open the
 * pinned board, else select one.
 *
 * The fallback order matters and it is also half of the §5.4 story. The board a
 * cell shows is pinned at PLACEMENT (`PlacedRoom.puzzleId`), so re-opening a
 * room reaches for that id FIRST rather than re-running `select()` — which is
 * seen-aware, and would therefore hand back a different board the moment the
 * old one was marked seen. That re-roll is exactly the second half of the
 * re-solve exploit (§5.4): solve → marked seen → the cell quietly restocks.
 * `select()` remains the last resort, for a save whose pin predates the adapter
 * or names a board the pool no longer ships.
 */
export function openRoomSession(opts: {
  adapter: RoomPuzzleAdapter | undefined;
  /** `manor.rooms[cellKey].session`. */
  snapshot: unknown;
  /** `PlacedRoom.puzzleId` — the board pinned when the card was played. */
  pinnedPuzzleId: string | undefined;
  ctx: RoomContext;
  seenIds: readonly string[];
}): { session: RoomSession; restored: boolean } | null {
  const { adapter, snapshot, pinnedPuzzleId, ctx, seenIds } = opts;
  if (!adapter) return null;

  const restored = restoreRoomSession(adapter, snapshot, ctx);
  if (restored) return { session: restored, restored: true };

  const pinned = pinnedPuzzleId ? adapter.find(pinnedPuzzleId) : undefined;
  const puzzle = pinned ?? adapter.select({ tier: ctx.tier, seed: ctx.seed, seenIds: [...seenIds] });
  return {
    session: { puzzle, state: adapter.start(puzzle, ctx), done: false, solvedOnce: false },
    restored: false,
  };
}

/**
 * One step of the room loop, as a pure function: reduce, then re-derive the two
 * host flags. Lives here rather than inline in `RoomHost` so the reload tests
 * drive the SAME code the host does — a persistence test that re-implements the
 * host's bookkeeping proves only that the test agrees with itself.
 */
export function advanceRoomSession(
  adapter: RoomPuzzleAdapter,
  session: RoomSession,
  action: unknown,
): { session: RoomSession; events: ReturnType<RoomPuzzleAdapter['reduce']>['events']; outcome: ReturnType<RoomPuzzleAdapter['reduce']>['outcome'] } {
  const { state, events, outcome } = adapter.reduce(session.puzzle, session.state, action);
  return {
    session: {
      puzzle: session.puzzle,
      state,
      done: outcome.status !== 'active',
      solvedOnce: session.solvedOnce || events.some((e) => e.type === 'solved'),
    },
    events,
    outcome,
  };
}

/** Read the snapshot off a placed room without every caller knowing the field. */
export function sessionSnapshotOf(placed: PlacedRoom | undefined): unknown {
  return placed?.session;
}

// ---------------------------------------------------------------------------
// The invariant: adapter state is JSON data
// ---------------------------------------------------------------------------

/**
 * True when `value` survives `JSON.parse(JSON.stringify(value))` unchanged —
 * i.e. when storing it verbatim loses nothing. A `Set`, a `Map`, a `Date`, an
 * explicit `undefined` property, `NaN` or `Infinity` all fail here, which is
 * the whole point: the opaque snapshot cannot notice such a loss on its own, so
 * the per-kind test does it instead.
 */
export function jsonFaithful(value: unknown): boolean {
  return deepEqual(value, JSON.parse(JSON.stringify(value)) as unknown);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  // A Set/Map/Date round-trips to `{}` or a string; the prototype check catches
  // the cases where the key walk below would find nothing to disagree about.
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}
