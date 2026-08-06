/**
 * RoomHost — architect-owned skeleton (ARCHITECTURE §2).
 *
 * The one component that joins the two halves of the RoomPuzzle contract:
 * reads day.activeRoom, looks up adapter + view in the registries, holds the
 * puzzle session state, and pipes
 *   dispatch(action) → adapter.reduce → applyRoomEvents(events, outcome).
 * Views receive { puzzle, state, tier, dispatch } and never touch the store
 * for economy. Abandon lives HERE, host-level, for every kind (AAA 4.13).
 */

import { useEffect, useMemo, useState } from 'react';
import { getRoomAdapter } from '../../engine/rooms/registry';
import { getRoomView } from './registry';
import { useManorStore } from '../../app/store';
// Per-room integer seed — the ONE source of truth, shared with the manor
// slice's puzzleId pinning at placement (integration: replaced the private
// bit-identical copy that lived here).
import { roomSeed } from '../../engine/manor/grid';
// Round-4 ergonomics: the shell-fit contract (stage scrolls, footer pinned,
// no double-counted safe areas). See room-host.css for the why.
import './room-host.css';

interface Session {
  puzzle: unknown;
  state: unknown;
  done: boolean;
  /**
   * A `solved` event has been applied at least once this session, even though
   * the adapter may still be running (the Conservatory keeps the hive on the
   * table after Full Bloom — AAA 1.12). The footer's PRIMARY "step back out"
   * hangs off this, not off `done`: once the room has paid, leaving is the
   * finished action, not an abandonment.
   */
  solvedOnce: boolean;
}

export default function RoomHost() {
  const activeRoom = useManorStore((s) => s.day?.activeRoom ?? null);
  const daySeed = useManorStore((s) => s.day?.daySeed ?? 0);
  const volumeId = useManorStore((s) => s.volume.volumeId);
  const seenIds = useManorStore((s) => (activeRoom ? s.seenPuzzleIds[activeRoom.kind] : undefined));
  const applyRoomEvents = useManorStore((s) => s.applyRoomEvents);
  const abandonRoom = useManorStore((s) => s.abandonRoom);
  const leaveRoom = useManorStore((s) => s.leaveRoom);

  const adapter = activeRoom ? getRoomAdapter(activeRoom.kind) : undefined;
  const View = activeRoom ? getRoomView(activeRoom.kind) : undefined;

  const [session, setSession] = useState<Session | null>(null);

  // (Re)start a session when the player enters a room.
  const cellKey = activeRoom?.cellKey;
  useEffect(() => {
    if (!activeRoom || !adapter) {
      setSession(null);
      return;
    }
    const seed = roomSeed(daySeed, activeRoom.cellKey);
    const puzzle = adapter.select({ tier: activeRoom.tier, seed, seenIds: seenIds ?? [] });
    const state = adapter.start(puzzle, { tier: activeRoom.tier, seed, volumeId });
    setSession({ puzzle, state, done: false, solvedOnce: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- session restarts per cell entry only
  }, [cellKey]);

  const dispatch = useMemo(
    () => (action: unknown) => {
      if (!adapter || !session || session.done) return;
      const { state, events, outcome } = adapter.reduce(session.puzzle, session.state, action);
      setSession({
        puzzle: session.puzzle,
        state,
        done: outcome.status !== 'active',
        solvedOnce: session.solvedOnce || events.some((e) => e.type === 'solved'),
      });
      applyRoomEvents(events, outcome);
    },
    [adapter, session, applyRoomEvents],
  );

  if (!activeRoom) return null;

  if (!adapter || !View || !session) {
    // Room kind not registered yet (its agent hasn't landed) — warm fallback.
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: '18vh' }}>
        <h2>This room is still being furnished</h2>
        <p style={{ opacity: 0.85 }}>Come back once the movers have finished.</p>
        <button className="btn" onClick={leaveRoom}>Step back out</button>
      </div>
    );
  }

  return (
    <div className="room-host">
      {/* The stage owns the overflow: a room that cannot fit scrolls inside
          this box instead of pushing its buttons off the bottom of the glass
          (round-4 owner report). The footer below always stays visible. */}
      <div className="room-host__stage">
        <View puzzle={session.puzzle} state={session.state} tier={activeRoom.tier} dispatch={dispatch} />
      </div>
      <div className="room-host__footer">
        {session.done || session.solvedOnce ? (
          <button className="btn btn--primary" onClick={leaveRoom}>Step back out</button>
        ) : (
          <button className="btn" onClick={abandonRoom}>Leave it for tomorrow</button>
        )}
      </div>
    </div>
  );
}
