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

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { getRoomAdapter } from '../../engine/rooms/registry';
import { getRoomView } from './registry';
import { useManorStore } from '../../app/store';
// Per-room integer seed — the ONE source of truth, shared with the manor
// slice's puzzleId pinning at placement (integration: replaced the private
// bit-identical copy that lived here).
import { roomSeed } from '../../engine/manor/grid';
// §5.3 — the board and the work done on it survive a reload. The decision of
// "restore what was saved / open the pinned board / select a new one" is a pure
// function so it can be tested without a browser; the host only wires it up.
import {
  advanceRoomSession, openRoomSession, sessionSnapshotOf, snapshotRoomSession,
  type RoomSession,
} from '../../engine/rooms/room-session';
// Read-only: the room needs to know a campaign seal is on glass so it can get
// its own celebration out from under it (see --room-moment-clear below).
import { momentQueue } from '../moment/queue';
// Round-4 ergonomics: the shell-fit contract (stage scrolls, footer pinned,
// no double-counted safe areas). See room-host.css for the why.
import './room-host.css';

/**
 * The live session. `solvedOnce` — a `solved` event has been applied at least
 * once even though the adapter may still be running (the Conservatory keeps the
 * hive on the table after Full Bloom, AAA 1.12) — drives the footer's PRIMARY
 * "step back out": once the room has paid, leaving is the finished action, not
 * an abandonment. Both flags are part of the saved snapshot, so a reload lands
 * on the same footer she left.
 */
type Session = RoomSession;

export default function RoomHost() {
  const activeRoom = useManorStore((s) => s.day?.activeRoom ?? null);
  const daySeed = useManorStore((s) => s.day?.daySeed ?? 0);
  const volumeId = useManorStore((s) => s.volume.volumeId);
  const seenIds = useManorStore((s) => (activeRoom ? s.seenPuzzleIds[activeRoom.kind] : undefined));
  const applyRoomEvents = useManorStore((s) => s.applyRoomEvents);
  const abandonRoom = useManorStore((s) => s.abandonRoom);
  const leaveRoom = useManorStore((s) => s.leaveRoom);
  const saveRoomSession = useManorStore((s) => s.saveRoomSession);

  const adapter = activeRoom ? getRoomAdapter(activeRoom.kind) : undefined;
  const View = activeRoom ? getRoomView(activeRoom.kind) : undefined;

  /**
   * ROUND 19 — THE SESSION KNOWS WHICH ROOM IT BELONGS TO.
   *
   * The open effect below keys on `cellKey` ALONE, while the render picks
   * `View`/`adapter` off `activeRoom.kind`. Those two disagree the moment a
   * cell key is re-used for a different kind, and then this component renders
   * one room's view against another room's puzzle — measured live, three
   * different crashes in one walk (`puzzle.outer is not iterable` in the
   * Conservatory, `Cannot read properties of undefined (reading 'status')` in
   * the Counting House, `…(reading 'flatMap')` in the Library). The effect
   * cannot save us on its own: effects run AFTER commit, so the bad render has
   * already happened by the time it could re-open the board.
   *
   * The shipped game does not reach it today — the manor is rebuilt nightly and
   * leaving a room unmounts the host — but "unreachable" is a property of
   * today's call sites, not of this component, and it was one nightly reset
   * with a surviving host away from being a crash on her phone. So the session
   * carries the identity it was opened for, and a session that does not match
   * the room on screen is simply not a session yet.
   */
  const [rawSession, setRawSession] = useState<Session | null>(null);
  const [sessionFor, setSessionFor] = useState<string | null>(null);
  const sessionKey = activeRoom ? `${activeRoom.cellKey}|${activeRoom.kind}` : null;
  const session = rawSession && sessionFor === sessionKey ? rawSession : null;
  const setSession = (next: Session | null) => {
    setRawSession(next);
    setSessionFor(next ? sessionKey : null);
  };

  /**
   * RESUME, don't restart (REVIEW_AA §5.3).
   *
   * The old body of this effect ran `select()` + `start()` unconditionally, so
   * every entry — including the one after a reload — threw away the board and
   * everything done on it while the step penalties it had charged stayed in the
   * ledger. Now: restore the snapshot parked on the PlacedRoom, else open the
   * board PINNED at placement, else select. `openRoomSession` owns that order
   * and is unit-tested; the host's job is to write the result straight back so
   * that even a reload before the first tap returns the same board.
   */
  const cellKey = activeRoom?.cellKey;
  useEffect(() => {
    if (!activeRoom || !adapter) {
      setSession(null);
      return;
    }
    const seed = roomSeed(daySeed, activeRoom.cellKey);
    // Read non-reactively: the snapshot is wanted once, at open. Subscribing to
    // it would re-render the room on every keystroke it writes back.
    const placed = useManorStore.getState().manor?.rooms[activeRoom.cellKey];
    const opened = openRoomSession({
      adapter,
      snapshot: sessionSnapshotOf(placed),
      pinnedPuzzleId: activeRoom.puzzleId || undefined,
      ctx: { tier: activeRoom.tier, seed, volumeId },
      seenIds: seenIds ?? [],
    });
    if (!opened) {
      setSession(null);
      return;
    }
    setSession(opened.session);
    // Park the freshly-opened board immediately: a tab evicted before the first
    // move must come back to THIS puzzle, not to whatever `select()` would pick
    // once the seen-set has moved on.
    if (!opened.restored) {
      saveRoomSession(activeRoom.cellKey, snapshotRoomSession(adapter, activeRoom.tier, opened.session));
    }
    // Round 19: `kind` joins `cellKey` here. A cell re-used for a different
    // room must re-open the board, not keep the old one — see the note on
    // `sessionFor` above for why the render also has to guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- session restarts per cell entry only
  }, [cellKey, activeRoom?.kind]);

  const dispatch = useMemo(
    () => (action: unknown) => {
      if (!adapter || !session || session.done || !activeRoom) return;
      const { session: next, events, outcome } = advanceRoomSession(adapter, session, action);
      setSession(next);
      // Economy first, then the snapshot: `applyRoomEvents` may mark the room
      // solved on the manor, and this write must land on top of that, not be
      // overwritten by it.
      applyRoomEvents(events, outcome);
      saveRoomSession(activeRoom.cellKey, snapshotRoomSession(adapter, activeRoom.tier, next));
    },
    [adapter, session, activeRoom, applyRoomEvents, saveRoomSession],
  );

  /**
   * ROUND 11 (AAA 3.4 / 11.14) — THE WIN AND THE SEAL STOP FIGHTING.
   *
   * Solving a room is the one event guaranteed to fire a Campaign moment, and
   * the moment layer is `position: fixed` at
   * `chrome-h + safe-top + tap-target + 12`, which at 390x844 puts the seal at
   * y 108–226 — exactly across the band where every anchor room prints its
   * verdict headline. Measured: `elementFromPoint` at the centre of
   * `.anch-done__title` ("The gallery is hung.", y 182.5 h 40.6) returned
   * `mom__where`, so the default experience of a Gallery win was the headline
   * *and* the room title illegible behind the card (docs/shots/round11-critic/
   * metrics.json + gallery-won-390x844.png).
   *
   * The seal is not ours to move (src/ui/moment/* is another module, and
   * raising it would only trade one collision for another). What is ours is
   * where the room draws its celebration: while a seal is on glass the room
   * publishes the seal's measured bottom edge as `--room-moment-clear`, and
   * the verdict column starts below it. Measured rather than derived from the
   * token arithmetic because the card's height depends on how many lines the
   * grant's quote runs to. Nothing moves during play — the variable is 0 unless
   * a moment is actually up, and the room only reads it in `.anch--verdict`.
   */
  const moment = useSyncExternalStore(momentQueue.subscribe, momentQueue.getState, momentQueue.getState);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [momentClear, setMomentClear] = useState(0);
  const momentKey = moment.current?.key ?? null;
  useEffect(() => {
    if (!momentKey) {
      setMomentClear(0);
      return;
    }
    const measure = () => {
      const card = document.querySelector('.mom-layer');
      const stage = stageRef.current;
      const done = stage?.querySelector('.anch-done');
      if (!card || !stage || !done) return;
      // The headline is what the hit test lands on, so the headline is what is
      // measured — not the panel's border box, which the clearance (a
      // `padding-top`) does not move.
      const head = stage.querySelector('.anch-done__title') ?? done.firstElementChild ?? done;
      const seal = card.getBoundingClientRect();
      const top = head.getBoundingClientRect().top;
      // Never push the celebration off the bottom of its own stage: a verdict
      // panel that no longer fits is a worse failure than the one being fixed.
      const room = Math.max(0, stage.clientHeight - done.getBoundingClientRect().height - 8);
      // Convergent and idempotent: measured against the clearance already
      // applied, so a second reading after `anch-pop` settles corrects the
      // first rather than doubling or cancelling it.
      setMomentClear((prev) => {
        const next = Math.min(room, Math.max(0, Math.round(prev + (seal.bottom + 8 - top))));
        return Math.abs(next - prev) <= 1 ? prev : next;
      });
    };
    const raf = requestAnimationFrame(measure);
    // …and once more after the stamp animation has settled, in case the card
    // measured mid-transform on the first frame.
    const settled = window.setTimeout(measure, 280);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settled);
    };
    // The verdict can arrive after the seal as well as with it (a queued
    // moment is already on glass when the last group lands), so the room
    // re-measures on both.
  }, [momentKey, session?.done, session?.solvedOnce]);

  if (!activeRoom) return null;

  if (!adapter || !View || !session) {
    /* Room kind not registered yet (its agent hasn't landed).
     *
     * ROUND 8 — this branch was the worst-composed surface in the game: an h2,
     * a line and a button, pushed down by `paddingTop: 18vh`, leaving a 456px
     * featureless band (54% of the glass) underneath them. It is also the one
     * surface a player only ever sees when something has gone wrong, which is
     * exactly when a game must not look abandoned. Same treatment as the
     * journal's empty tabs (ui/journal/journal.css): a drawn mark, a Fell
     * heading, in-voice copy that says what this is and what to do, and the
     * exit ruled off at the foot — so the way out is pinned above the fold
     * (AAA 11.1/11.3) instead of floating in the middle of nothing. */
    return (
      <div className="room-host room-host--unfurnished">
        <div className="rh-void">
          <div className="rh-void__crest" aria-hidden />
          <div className="rh-void__plate">
            <svg className="rh-void__mark" viewBox="0 0 72 72" role="presentation" focusable="false">
              {/* A dust sheet over something with legs. */}
              <path d="M12 46c0-14 10-24 24-24s24 10 24 24z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M12 46q6 6 12 0t12 0 12 0 12 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M20 52v8M52 52v8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M28 34h16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
            </svg>
            <h2 className="rh-void__title">This room is still under dust sheets</h2>
            <p className="rh-void__body">
              The movers left the furniture and took the key with them. Nothing in here
              costs you anything — step back out and the day carries on as it was.
            </p>
          </div>
          <div className="rh-void__foot">
            <button className="btn btn--primary rh-void__exit" onClick={leaveRoom}>
              Step back out
            </button>
            <span className="rh-void__note">No steps spent. The door is exactly where you left it.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="room-host">
      {/* The stage owns the overflow: a room that cannot fit scrolls inside
          this box instead of pushing its buttons off the bottom of the glass
          (round-4 owner report). The footer below always stays visible. */}
      <div
        className="room-host__stage"
        ref={stageRef}
        style={{ '--room-moment-clear': `${momentClear}px` } as CSSProperties}
      >
        <View puzzle={session.puzzle} state={session.state} tier={activeRoom.tier} dispatch={dispatch} />
      </div>
      <div className="room-host__footer">
        {session.done || session.solvedOnce ? (
          <button className="btn btn--primary" onClick={leaveRoom}>Step back out</button>
        ) : (
          /* ROUND 24 (COMPREHENSION, fix 8) — A PROMISE THE MANOR BREAKS.
             This read "Leave it for tomorrow", and there is no tomorrow for
             this room: `endDay` wipes the layout, the gems, the keys and every
             solve state, and session restore only holds within the same day.
             The copy delivered false reassurance at the precise moment a player
             decides to abandon content, and it quietly contradicted the nightly
             reset the game works hard elsewhere to justify in Bramble's voice.
             "Step away" says only what is true: she is leaving, now, for
             nothing. It also pairs with "Step back out" on the solved side, so
             the two exits are one idiom (AAA 6.16). */
          <button className="btn" onClick={abandonRoom}>Step away</button>
        )}
      </div>
    </div>
  );
}
