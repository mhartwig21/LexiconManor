/**
 * Room slice — OWNER: A3 (Anchor rooms), reviewed against AAA §0.3 per adapter.
 * Interface frozen by the architect.
 *
 * The economy boundary of the RoomPuzzle contract: adapters emit RoomEvents,
 * THIS slice maps them to step/gem/fragment effects via the STEP_TABLE and the
 * day slice's ledger. Views never import the store for economy.
 */

import type { StateCreator } from 'zustand';
import type { Tier } from '../../engine/types';
import type { RoomEvent, RoomOutcome } from '../../engine/rooms/room-puzzle';
import { getRoomAdapter } from '../../engine/rooms/registry';
import type { ManorStore } from '../store';
import type { SaveV2 } from '../save';
// The single tunable STEP_TABLE (AAA 4.9) — swapped in by A2 for the
// provisional const, per the handoff comment that stood here. Values are
// identical: weight 1 → −2 (tier 3 −3), weight 2 doubles; micro +3,
// anchor +6/+7/+8 by tier; perfect +2. Hints price through the mistake row.
import { solveKeys, STEP_TABLE } from '../../engine/economy/steps';
import type { RoomSessionSnapshot } from '../../engine/rooms/room-session';

export interface RoomSlice {
  /** Enter the room at cellKey: sets day.activeRoom (puzzleId pinned at placement). */
  enterRoom(cellKey: string): void;
  /** Step back out to the blueprint without resolving the puzzle. */
  leaveRoom(): void;
  /**
   * Host-level abandon — works for every kind, zero per-game code, costs
   * nothing beyond steps already spent, copy-framed "leave it for tomorrow"
   * (AAA 4.13). Emits 'room-abandoned'.
   */
  abandonRoom(): void;
  /**
   * The single seam between adapters and the economy: map mistake weights and
   * solve payouts through STEP_TABLE, apply rewards, mark rooms solved,
   * emit 'room-solved' / 'fragment-found' onto the spine.
   */
  applyRoomEvents(events: RoomEvent[], outcome: RoomOutcome): void;
  /**
   * Park the room host's live session on the PlacedRoom at `cellKey`, so a
   * reload (or an iOS tab eviction) returns the exact board, the exact
   * progress, and the steps already paid for it (REVIEW_AA §5.3). Called on
   * every dispatch; the store persists after every mutation, so "saved" means
   * saved, not "saved on the way out".
   */
  saveRoomSession(cellKey: string, snapshot: RoomSessionSnapshot): void;
}

export const createRoomSlice =
  (_initial: SaveV2): StateCreator<ManorStore, [], [], RoomSlice> =>
  (set, get) => ({
    enterRoom: (cellKey) => {
      const { manor, day } = get();
      if (!manor || !day) return;
      const placed = manor.rooms[cellKey];
      if (!placed) return;
      const kind = placed.kind;
      // Parlor/utility/mystery rooms have their own flows (A1/A6/A7).
      if (kind === 'parlor' || kind === 'utility' || kind === 'mystery') return;
      const row = placed.cell.row;
      const tier: Tier = row <= 2 ? 1 : row <= 4 ? 2 : 3; // row-band pressure (§3)
      set({
        day: { ...day, activeRoom: { cellKey, kind, puzzleId: placed.puzzleId ?? '', tier } },
      });
      // NOTE: the −1 move step is charged by A1's moveTo, not here.
    },

    leaveRoom: () => {
      const day = get().day;
      if (day) set({ day: { ...day, activeRoom: null } });
    },

    abandonRoom: () => {
      const day = get().day;
      const active = day?.activeRoom;
      if (active) {
        const placed = get().manor?.rooms[active.cellKey];
        // Already solved this session (or ended some other way): just leave —
        // never record a spurious abandonment on the spine.
        if (!placed?.solved) {
          get().recordEvent({ type: 'room-abandoned', cellKey: active.cellKey, kind: active.kind });
        }
      }
      if (day) set({ day: { ...get().day!, activeRoom: null } });
    },

    /**
     * In-room progress rides on the PlacedRoom it belongs to, inside `manor`,
     * which `store.selectSave` already persists whole — so this needs no new
     * top-level save field, is keyed by cellKey by construction, and is cleared
     * by the nightly `manor: null` reset without a sweeper. The reasoning, and
     * the reason the snapshot is opaque, are in engine/rooms/room-session.ts.
     */
    saveRoomSession: (cellKey, snapshot) => {
      const manor = get().manor;
      const placed = manor?.rooms[cellKey];
      if (!manor || !placed) return;
      set({ manor: { ...manor, rooms: { ...manor.rooms, [cellKey]: { ...placed, session: snapshot } } } });
    },

    applyRoomEvents: (events, outcome) => {
      const active = get().day?.activeRoom;
      if (!active) return;
      const { cellKey, kind, tier } = active;
      const now = Date.now();
      const size = getRoomAdapter(kind)?.size ?? 'anchor';

      for (const ev of events) {
        switch (ev.type) {
          case 'mistake':
          case 'hint': {
            if (ev.weight === 0) break; // free feedback moment (AAA R.1 / 3.2)
            get().applyStepEntry({
              // Hints ledger under their own reason (integration: StepReason
              // gained 'hint') but price through the same mistake row.
              reason: ev.type,
              delta: STEP_TABLE.mistake(ev.weight, tier),
              at: now,
              roomKey: cellKey,
            });
            break;
          }
          case 'progress': {
            // Big in-room moments characters react to (AAA 5.1 / 1.17).
            if (ev.detail === 'pangram' || ev.detail === 'every-petal' || ev.detail === 'tier-up:Full Bloom') {
              get().recordEvent({ type: 'room-notable', kind, note: ev.detail });
            }
            break;
          }
          case 'solved': {
            // ── §5.4 — A ROOM IS PAID FOR ONCE. ──────────────────────────
            // This branch used to SET `solved: true` four lines below and
            // never READ it, which made the room re-payable for ever. The
            // loop the editor drove: solve (+8 and a key) → `markPuzzleSeen`
            // → reload → `selectByTier` filters the board it has just seen
            // out of the pool → the same cell, same seed, restocks with a
            // DIFFERENT board → solve → paid again. Keys are the padlock
            // currency gating the entire climb, so the exploit did not merely
            // print steps: it unlocked a Sanctum the review measures at three
            // weeks away.
            //
            // Two things now close it, and both are wanted independently:
            // §5.3 restores the solved board instead of restocking the cell,
            // and this guard makes a second payout unexpressible even if some
            // future path manages to hand the room a fresh puzzle. Emit
            // NOTHING — not the steps, not the perfect bonus, not the key, not
            // the spine event that would file a second fragment for one solve.
            if (get().manor?.rooms[cellKey]?.solved) break;
            get().applyStepEntry({
              reason: 'solve',
              delta: STEP_TABLE.solve(size, tier),
              at: now,
              roomKey: cellKey,
            });
            if (ev.perfect) {
              get().applyStepEntry({ reason: 'perfect', delta: STEP_TABLE.perfect, at: now, roomKey: cellKey });
            }
            // ── ROUND 10: SOLVING POWERS THE CLIMB (owner directive 3). ─────
            // Keys used to come only off green cards and Fern, so the padlock
            // arc was a drafting-luck arc and playing the word games well
            // bought nothing but steps. A solved room now pays a key by
            // row-band tier (engine/economy/steps.ts `solveKeys`) — tier 2 is
            // the storey directly under the first padlock, so the room she
            // solves is what opens the door above it.
            //
            // Applied HERE, on the one `solved` branch every room kind already
            // routes through, rather than per-adapter: one rate, one audit
            // point, and a room kind registered tomorrow earns keys for free.
            // The chrome's key chip animates the delta like any other currency
            // (AAA 11.15).
            const keys = solveKeys(tier);
            if (keys > 0) {
              set((s) => ({ currencies: { ...s.currencies, keys: s.currencies.keys + keys } }));
            }
            const manor = get().manor;
            const placed = manor?.rooms[cellKey];
            if (manor && placed) {
              set({ manor: { ...manor, rooms: { ...manor.rooms, [cellKey]: { ...placed, solved: true } } } });
            }
            if (active.puzzleId) get().markPuzzleSeen(kind, active.puzzleId);
            get().recordEvent({ type: 'room-solved', cellKey, kind, tier, perfect: ev.perfect });
            break;
          }
          case 'reward': {
            if (ev.gems || ev.keys) {
              set((s) => ({
                currencies: {
                  ...s.currencies,
                  gems: s.currencies.gems + (ev.gems ?? 0),
                  keys: s.currencies.keys + (ev.keys ?? 0),
                },
              }));
            }
            // A specific fragment named by the adapter itself. NOT the
            // room→mystery channel: that is the spine watcher in
            // slices/journal.ts (`collectFragmentForSolve`), and this slice
            // deliberately does NOT call it from the solve branch — double
            // wiring would file two different fragments for one solve. See the
            // rule on RoomEvent.reward in engine/rooms/room-puzzle.ts.
            if (ev.fragmentId) get().fileFragment(ev.fragmentId); // emits 'fragment-found'
            break;
          }
        }
      }

      // Adapter-driven auto-abandon (e.g. the Study out of whispers): record it
      // and mark the puzzle seen — a revealed word must not be farmable later.
      if (outcome.status === 'abandoned') {
        if (active.puzzleId) get().markPuzzleSeen(kind, active.puzzleId);
        get().recordEvent({ type: 'room-abandoned', cellKey, kind });
      }
    },
  });
