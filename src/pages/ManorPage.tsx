/**
 * ManorPage — OWNER: A1 (Manor); integration pass applied.
 *
 * The blueprint is the game's main view AND the home route. The day chrome
 * (DayHeader/StepMeter) and the lifecycle scenes (morning card, dusk veil,
 * night digest) are owned by A2's <GameChrome /> mounted in App.tsx — the
 * provisional day-strip and scene cards that stood here are gone. This page
 * owns only what happens ON the sheet: movement, drafting, room entry, and
 * the character seams (parlor visits, Dewey) via A6's DialogueScene.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useManorStore } from '../app/store';
import { deweyAnswer, deweyPettedToday, ensureManor } from '../app/slices/manor';
import { cardById } from '../engine/manor/deck';
import { cellKey, deweyCell, neighbor, roomAt, sameCell } from '../engine/manor/grid';
import { rowName } from '../engine/economy/steps';
import { isDoorLocked, KEY_COST } from '../engine/manor/locks';
import { parlorHostFor } from '../engine/manor/parlor';
import type { CharacterId } from '../engine/types';
import BlueprintSheet from '../ui/blueprint/BlueprintSheet';
import CabinetSheet from '../ui/blueprint/CabinetSheet';
import DraftModal from '../ui/blueprint/DraftModal';
import DialogueScene from '../ui/dialogue/DialogueScene';
import { plateSeenFlag, unseenKeepsakes, unseenPlates } from '../ui/moment/mantel';
import { useSealDock } from '../ui/moment/dock';
import { usePageFootBand } from '../app/platform/page-nav';
import UnreadMark from '../ui/journal/UnreadMark';
import SealedMark from '../ui/journal/SealedMark';
import { useJournalUnread } from '../ui/journal/useJournalUnread';
import '../ui/blueprint/blueprint.css';
import './front-step.css';


/* ROUND 6 — `useFragmentNote` lived here and is deleted.
 *
 * It announced the core reward of the whole mystery as a 3.2s line in the
 * footer wearing `.bp-foot__dewey` — the cat's flavour class (AAA 11.14) —
 * and it could only ever fire on this screen, from a mount-scoped
 * `useRef(fragmentCount)` cursor. Three of the four grant channels fire
 * somewhere else entirely (behind the dialogue overlay, inside a room, on the
 * journal), and the journal channel was strictly worse than silent: the ref
 * re-initialised at the next mount, so a fragment filed while this page was
 * unmounted was never announced at all (AAA §0.5, escape 3).
 *
 * It is replaced by the always-mounted moment layer (src/ui/moment/*), which
 * reads every campaign grant off the event spine and presses a wax seal into
 * whatever screen the player is actually on. */

/**
 * THE DOORS OFF THE BLUEPRINT — and the top level of every unread chain.
 *
 * A component rather than JSX written twice, because the round-9 blocker was
 * exactly that the no-day branch of this page `return`ed above them: on a fresh
 * save the front step rendered ONE control, ["Begin the first day"], at both
 * 390x844 and 375x667. Audio settings, reduced motion and the save trunk cost
 * infinity taps, and a returning player restoring a save code had to start a
 * day — mutate state — before she could reach the trunk that would overwrite
 * it. AAA 11.8 and 11.26 both name that path specifically. One component, both
 * branches, so a future early return cannot quietly drop the doors again.
 */
function Entrances({ onCabinet }: { onCabinet?: () => void }) {
  const [, navigate] = useLocation();
  /** The entrance link of the unread chain (AAA 11.19). Same derivation the
   *  journal's tabs and cards use — one truth, three places it shows. */
  const journalUnread = useJournalUnread();
  const earned = useManorStore((s) => s.earnedAchievementIds);
  const flags = useManorStore((s) => s.flags);
  const unlockedCardIds = useManorStore((s) => s.cabinet.unlockedCardIds);

  // ROUND 9 (AAA 11.12/11.19). The comment that used to stand here justified
  // leaving Chronicles deliberately unmarked because keepsakes "had no live
  // emitter anywhere in the v2 app, so it can never gain a row". That went
  // stale in round 7: app/slices/meta.ts landed the emitter, and round 8 caught
  // `earnedAchievementIds` going [] → ['first-morning'] live with nothing said
  // anywhere in the app. Both permanent-unlock channels now carry the same mark
  // as the journal, against write-once viewed-flags (ui/moment/mantel.ts) —
  // real persisted state, so it survives the day roll and a force-quit (11.20)
  // and is truthful in both directions (11.21).
  const keepsakeUnread = useMemo(() => unseenKeepsakes(earned, flags).length, [earned, flags]);
  const plateUnread = useMemo(
    () => unseenPlates(unlockedCardIds, flags).length, [unlockedCardIds, flags],
  );

  return (
    <>
      {onCabinet && (
        <button className="bp-btn bp-btn--quiet unread-host" onClick={onCabinet}>
          Cabinet
          <UnreadMark
            count={plateUnread}
            noun={plateUnread === 1 ? 'new floorplan' : 'new floorplans'}
            showCount
          />
        </button>
      )}
      <button
        className="bp-btn bp-btn--quiet unread-host"
        onClick={() => navigate('/journal')}
      >
        Journal
        <UnreadMark
          count={journalUnread.total}
          noun={journalUnread.total === 1 ? 'thing in the journal' : 'things in the journal'}
          showCount
        />
        {/* ROUND 13 (AAA 11.19) — THE ENTRANCE LEVEL OF THE SEAL CHAIN.
            The smudge marker existed on the journal's tabs, on every card, in
            the footer rail and on the lifecycle scenes' journal link — and
            nowhere on the blueprint, which is the screen the player stands on
            all day and where the decision the seal is meant to inform (the
            violet door or the puzzle door) is actually taken. Worse than a gap,
            because wax retires on a glance: one look at the smudges dropped the
            entrance count to 0 and the map showed a bare "Journal" with five
            pages still unread. Same `useJournalUnread()` derivation the digest
            link uses, so the four levels cannot disagree. */}
        <SealedMark count={journalUnread.sealed.total} showCount />
      </button>
      {/* Round 5: /chronicles had no entrance anywhere in the app — sound,
          music, reduced motion, the mute-switch bypass, keepsakes and the
          save trunk all sat behind a URL nobody could reach. It lives with
          its siblings on the blueprint footer now, in EVERY phase (11.24). */}
      <button
        className="bp-btn bp-btn--quiet unread-host"
        onClick={() => navigate('/chronicles')}
      >
        Chronicles
        <UnreadMark
          count={keepsakeUnread}
          noun={keepsakeUnread === 1 ? 'keepsake' : 'keepsakes'}
          showCount
        />
      </button>
    </>
  );
}

export default function ManorPage() {
  const [, navigate] = useLocation();
  const day = useManorStore((s) => s.day);
  const manor = useManorStore((s) => s.manor);
  const currencies = useManorStore((s) => s.currencies);
  const draftOffer = useManorStore((s) => s.draftOffer);
  const activeRoomKey = useManorStore((s) => s.day?.activeRoom?.cellKey ?? null);
  const cabinet = useManorStore((s) => s.cabinet);
  const petted = useManorStore((s) => deweyPettedToday(s));

  const startDay = useManorStore((s) => s.startDay);
  const moveTo = useManorStore((s) => s.moveTo);
  const openDraft = useManorStore((s) => s.openDraft);
  const chooseDraftCard = useManorStore((s) => s.chooseDraftCard);
  const rerollDraft = useManorStore((s) => s.rerollDraft);
  const cancelDraft = useManorStore((s) => s.cancelDraft);
  const petDewey = useManorStore((s) => s.petDewey);
  const enterRoom = useManorStore((s) => s.enterRoom);

  /**
   * ROUND 15 (blocker, AAA 11.2 / 11.27 / 6.19 — §0.5 escape 4, a fourth time).
   *
   * THE BLUEPRINT IS A BOARD. The moment seal is fixed and clears the shell by
   * `--chrome-h` + `--tap-target` + 12, which puts it at 12,108,366x91 at
   * 390x844 — empty parchment while she is on the ground floor, which is
   * exactly why round 11 recorded "/manor was clean under the same probe". But
   * the sheet draws row 6 at the TOP of the glass, so the moment she reaches
   * the landing the manor's own controls move into that band. Measured live
   * with a plate grant up, standing at (2,5): "Approach the Sanctum"
   * [177,157,64,64] answered `button.mom` at its centre, and a DRIVEN click
   * there left `location.hash` unchanged and put the notice away — the tap was
   * eaten, on the campaign's milestone screen (4.10d). At 375x667 both
   * padlocked-door controls were covered too, and those are COSTED (2 keys plus
   * the row's move price), which 6.19 exempts nothing from.
   *
   * One line, the same one RoomPage carries, with the kind that says the shell's
   * ordinary clearance is right here and only the AGENCY is wrong:
   * `ui/moment/dock.ts` makes the card `pointer-events: none` so every cell,
   * ghost door and padlock answers as itself and a tap performs its action; the
   * notice retires on its own clock (11.27b) and its words stay one tap away at
   * the address it names (11.12). Declared before the no-day early return, so
   * the front-step branch cannot quietly opt out.
   */
  useSealDock('board');

  /**
   * ROUND 15 (blocker, AAA 11.2 / 11.4 / 11.5) — AND THE OTHER HALF OF THE
   * SAME MEASUREMENT, at the bottom of the glass.
   *
   * `.chr-dusk` is deliberately pointer-transparent so the blueprint stays live
   * during the ≤4s fade (4.12's walk-but-no-interact grace), and its own
   * `.chr-dusk__skip` is the one thing on that layer that takes taps. It was
   * pinned 28px off the bottom — straight on top of this footer's nav row.
   * Measured: skip [129,772,133,44] over Journal [114,788,120,44] at 390x844
   * (and over Chronicles' top-left inset corner); DRIVEN, a click at the
   * Journal entrance's centre left `location.hash` unchanged. The sting is the
   * timing: the digest four seconds later prints "A letter waits unopened in
   * the post tray".
   *
   * The band's ceiling is published from the LIVE element here, exactly as
   * `usePageNavBand` publishes the journal ribbon's floor at the top, so the
   * veil clears whatever this footer actually is rather than a pixel copy of it
   * living in chrome.css (11.4's real requirement).
   *
   * ROUND 39 — AND IT WAS PUBLISHED FROM ONE ROW OF THE PLATE, SO IT CLEARED
   * ONE ROW OF THE PLATE. Round 15 measured the collision against the index
   * tabs, named `.bp-foot__actions`, and fixed exactly that; round 33 then put
   * the storey's own title block ABOVE the tabs, and the skip came down on
   * that instead. Photographed on the first real dusk this gate ever walked:
   * "And so, to bed" drawn straight through "The Grounds" at BOTH shipped
   * sizes. The band a surface pins at the bottom of the glass is the PLATE —
   * its rule, its name, its storey, its deeds and its tabs are one piece of
   * furniture — so the token is taken from `.bp-foot`, and a fourth row added
   * to the title block moves the veil with it instead of being landed on.
   */
  usePageFootBand('.bp-foot');

  /** A character scene on this page: parlor visit or a moment with Dewey. */
  const [visiting, setVisiting] = useState<CharacterId | null>(null);
  /** The Floorplan Cabinet sheet (AAA 4.7): the whole live deck, browsable. */
  const [cabinetOpen, setCabinetOpen] = useState(false);

  /**
   * ROUND 12 (AAA 11.20, major) — THE PLATE MARKER RETIRES ON VIEWING.
   *
   * `openCabinet` used to write `plateSeenFlag` for every unseen plate the
   * instant the sheet mounted. Measured live with 9 plates unlocked: the
   * entrance read "9"; the sheet's scroller is 3238px tall in a 742px window
   * and 6 of 28 rows are on the glass at scroll 0; opening it wrote all 9
   * flags — including The Boot Room, The Still Room and The Counting House,
   * whose rows sit 1500–3000px down and were never displayed to anybody. One
   * open/close and the marker was gone. That is a marker retiring on OPENING,
   * which 11.20 names exactly: "the marker retires when the item has actually
   * been displayed to the player, and persists otherwise".
   *
   * Its sibling channel in the same round got this right and says why:
   * ChroniclesPage's keepsake shelf uses an IntersectionObserver because "the
   * shelf is the third section down, so 'the page rendered' is not 'she looked
   * at it'". The cabinet is the same shape, only twenty times as tall. Two
   * permanent-unlock channels may not disagree about what viewing means.
   *
   * AND THE OTHER HALF OF 11.21: a marker she can never clear is the same
   * defect wearing the opposite coat. An observer alone leaves one — a fling
   * down a 3238px sheet moves in bigger steps than the observer samples, so
   * rows can be jumped clean over and keep their mark forever. A row that has
   * been scrolled off the TOP has demonstrably passed the glass, so it counts
   * as displayed too; the pair is monotone (past-the-top ∪ on-the-glass) and
   * still refuses to mark anything that is only further down the sheet.
   *
   * ROUND 8 (verifier): rows are now matched by `data-card-id`, which
   * CabinetSheet stamps on every plate. This used to match on the row's PRINTED
   * NAME, which worked but meant renaming a card silently stopped its marker
   * ever retiring — a by-name join standing in for an id join. An id that
   * resolves to nothing is skipped rather than guessed at: writing the wrong
   * flag would retire a marker she can never bring back.
   */
  const cabinetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!cabinetOpen) return;
    const host = cabinetRef.current;
    const rows = host?.querySelectorAll('.bp-card--plate:not(.bp-card--locked)');
    if (!host || !rows || rows.length === 0) return;
    const scroller = host.querySelector('.bp-modal__sheet');

    const markSeen = (onGlass: Iterable<Element>) => {
      const s = useManorStore.getState();
      const unseen = new Set(
        unseenPlates(s.cabinet.unlockedCardIds, s.flags).map((c) => c.id),
      );
      if (unseen.size === 0) return;
      const mark = (row: Element) => {
        const id = row.getAttribute('data-card-id');
        if (id && unseen.has(id)) s.setFlag(plateSeenFlag(id));
      };
      for (const row of onGlass) mark(row);
      const top = scroller?.getBoundingClientRect().top;
      if (top === undefined) return;
      for (const row of rows) {
        if (row.getBoundingClientRect().bottom <= top + 1) mark(row);
      }
    };

    // No IntersectionObserver (old engine, jsdom): mark on mount. Erring toward
    // clearing beats a marker she can never clear (11.21's other half) — the
    // same fallback the keepsake shelf takes.
    if (typeof IntersectionObserver === 'undefined') { markSeen(rows); return; }
    const io = new IntersectionObserver(
      (entries) => markSeen(entries.filter((e) => e.isIntersecting).map((e) => e.target)),
      { root: scroller, threshold: 0.15 },
    );
    for (const row of rows) io.observe(row);
    const onScroll = () => markSeen([]);
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      scroller?.removeEventListener('scroll', onScroll);
    };
  }, [cabinetOpen]);

  const openCabinet = () => setCabinetOpen(true);

  /* ROUND 9: the `ensureMomentLayer()` bootstrap that used to live here is
     gone — App.tsx now mounts <MomentLayer /> beside <GameChrome />, outside
     the router. Bootstrapping from THIS page's mount effect meant the campaign
     grant watcher was only installed once the player had visited the manor, so
     a cold deep-link to #/journal adopted its grants silently. The layer must
     outlive every screen, so it may not be owned by one (AAA 11.11/11.13). */

  // A1 builds the grid when a live day has no manor (day-slice integration note).
  const daySeed = day?.daySeed;
  const phase = day?.phase;
  useEffect(() => { ensureManor(); }, [daySeed, phase]);

  // Entering a puzzle room routes to /room.
  useEffect(() => {
    if (activeRoomKey) navigate('/room');
  }, [activeRoomKey, navigate]);

  // Scenes close themselves when the day rolls (dusk mid-visit, etc.).
  useEffect(() => setVisiting(null), [phase]);

  // ---- No day yet (fresh save): the front step ---------------------------
  if (!day) {
    return (
      <div className="bp-page bp-page--card">
        <div className="bp-scene">
          {/* ROUND 8 composition pass (pages/front-step.css): the cover held a
              296px featureless band — 35.1% of the glass — between the plate
              and the doors at the foot. The keyhole is the house's own front
              door, drawn in line, aria-hidden because the title already says
              everything it says. */}
          <svg className="fs-mark" viewBox="0 0 96 120" aria-hidden focusable="false">
            <path d="M14 10h68v100H14z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M22 18h52v84H22z" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
            <circle cx="48" cy="54" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M44 60h8l3 18H41z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M48 26v10M48 88v10" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.55" />
          </svg>
          <h1 className="bp-scene__title">Lexicon Manor</h1>
          <p className="bp-scene__text">
            The gates are open. Somewhere upstairs, a word is missing from
            every dictionary in the house.
          </p>
          <div className="fs-rule" aria-hidden />
          <button className="bp-btn bp-btn--seal" onClick={startDay}>Begin the first day</button>
          <p className="fs-note">
            A day is a walk through the house and back to bed. Nothing here can be
            lost, and nothing waits on a clock.
          </p>
          {/* AAA 11.8 / 11.26 (round-9 blocker). These sat below the early
              return, so the front step shipped with exactly one control. The
              trunk is the RECOVERY path: reaching it must cost no day, no step
              and no scene, which is only true if it is reachable from here. */}
          <div className="bp-scene__row">
            <Entrances />
          </div>
        </div>
      </div>
    );
  }

  const exploring = day.phase === 'exploring';
  const playerRoom = manor ? roomAt(manor, manor.playerCell) : undefined;
  const playerCard = playerRoom ? cardById(playerRoom.cardId) : undefined;
  const isPuzzleHere = Boolean(
    playerRoom && playerRoom.kind !== 'parlor' && playerRoom.kind !== 'utility' &&
    playerRoom.kind !== 'mystery' && !playerRoom.solved,
  );
  const parlorHost: CharacterId | null =
    playerRoom?.kind === 'parlor' ? parlorHostFor(playerRoom.cardId) : null;
  const atDewey = Boolean(
    manor && playerRoom && sameCell(manor.playerCell, deweyCell(manor.daySeed)),
  );
  const prophecy = petted && manor ? deweyAnswer({ manor, currencies, cabinet }) : null;

  /** Was the door this offer stands at padlocked? Drives the modal's key line. */
  const draftTargetLocked = (() => {
    if (!manor || !draftOffer) return false;
    const target = neighbor(draftOffer.from, draftOffer.atDoor);
    return target ? isDoorLocked(manor, target) : false;
  })();

  const onPetDewey = () => {
    petDewey();
    setVisiting('dewey'); // his (wordless) scene — narration beats only
  };

  return (
    <div className="bp-page">
      <main className="bp-sheetwrap">
        {manor && (
          <BlueprintSheet
            manor={manor}
            canEnterCurrent={exploring && isPuzzleHere}
            interactive={exploring && !draftOffer && !visiting && !cabinetOpen}
            keys={currencies.keys}
            onMove={moveTo}
            onOpenDraft={openDraft}
            onEnterRoom={() => manor && enterRoom(cellKey(manor.playerCell))}
            onSanctum={() => navigate('/sanctum')}
          />
        )}
      </main>

      <footer className="bp-foot">
        {/* ═══ ROUND 33 — THE PLATE NAMES THE STOREY (COMPREHENSION 33, fix 7)
            This chip read `tier I`. Both blind testers named the tier
            vocabulary, unprompted, under *what I never figured out*, and
            neither could say what a tier gates; meanwhile both had to INDUCE
            that the map's rows are floors, one of them only near the end of his
            first day, because no surface in the game named the storey he was
            standing on. The blueprint's margin has priced that storey since
            round 5 and its own key now says the number is a move's price
            (`bp-key__line`) — what was missing is the NAME beside it, at the
            place she actually stands. `rowName` is the same vocabulary the
            draft modal's heading, every walk target and the night digest
            already use, so this adds a surface, not a word. */}
        <div className="bp-foot__where">
          <span className="bp-foot__room">{playerCard?.name ?? 'The Grounds'}</span>
          {manor && (
            <span className="bp-foot__tier">{rowName(manor.playerCell.row)}</span>
          )}
        </div>
        {/* ═══ ROUND 33 — THE DEEDS LEAVE THE INDEX (COMPREHENSION 33, fix 12)
            These three buttons — Enter, Call on…, Pet Dewey — are CONTEXTUAL:
            they appear and vanish as she walks. They used to share one wrapping
            flex row with the three INDEX TABS, which are the same three doors
            on every screen of the game, and the tabs are `flex: 1 1 auto`, so
            every arrival and departure of a contextual button re-laid the tabs
            out under the player's thumb. Measured at 375x667 the three tabs
            occupy x 10/117/246 with no deed present and already fill the row
            (346px of 356), so a fourth control does not squeeze them — it wraps
            them onto a second line and moves all three. A blind tester aiming
            at Cabinet mis-tapped into a Sudoku.
            One row each now. The deeds row is only rendered when there is a
            deed, so it costs nothing on the common screen, and the index is
            always the last row of the plate at the same three positions —
            which is what an index is for. */}
        {exploring && (isPuzzleHere || (parlorHost && !visiting) || (atDewey && !petted)) && (
          <div className="bp-foot__deeds">
            {isPuzzleHere && (
              <button
                className="bp-btn bp-btn--seal"
                onClick={() => manor && enterRoom(cellKey(manor.playerCell))}
              >
                Enter
              </button>
            )}
            {parlorHost && !visiting && (
              <button className="bp-btn" onClick={() => setVisiting(parlorHost)}>
                Call on {parlorHost === 'bramble' ? 'Mrs. Bramble'
                  : parlorHost.charAt(0).toUpperCase() + parlorHost.slice(1)}
              </button>
            )}
            {atDewey && !petted && (
              <button className="bp-btn" onClick={onPetDewey}>Pet Dewey · 1 step</button>
            )}
          </div>
        )}
        <div className="bp-foot__actions">
          {/* ROUND 6 — the unread chain used to BREAK right here (AAA 11.19).
              Every marker in the game lived inside the journal: tab dots, card
              markers, letter seals. These buttons — the only doors to all of
              it — were plain quiet buttons, so a player with no reason to open
              the journal never learned that anything had arrived, and a missed
              3-second footer line was the end of it (AAA §0.5, escape 3). The
              counts are exact (11.21), read in grayscale and with reduced
              motion (11.22), and come off the same derivations the tabs and the
              cards use, so the levels cannot disagree. Round 9 extended the
              same treatment to the two permanent-unlock channels. */}
          <Entrances onCabinet={openCabinet} />
        </div>
        {atDewey && petted && !visiting && (
          <p className="bp-foot__dewey">
            {prophecy
              ? 'Dewey stretches, then stares meaningfully down the corridor. Something violet hides on this floor.'
              : 'Dewey purrs, unbothered. No violet rooms on this floor today.'}
          </p>
        )}
      </footer>

      {/* The Floorplan Cabinet — the live deck and its locked plates (AAA 4.7).
          The wrapper is the observer's handle on the sheet (see the marker
          effect above); it draws nothing and lays out nothing. */}
      {cabinetOpen && (
        <div ref={cabinetRef} style={{ display: 'contents' }}>
          <CabinetSheet
            unlockedCardIds={cabinet.unlockedCardIds}
            onClose={() => setCabinetOpen(false)}
          />
        </div>
      )}

      {draftOffer && exploring && (
        <DraftModal
          offer={draftOffer}
          gems={currencies.gems}
          keyCost={draftTargetLocked ? KEY_COST : 0}
          onChoose={chooseDraftCard}
          onReroll={rerollDraft}
          onCancel={cancelDraft}
        />
      )}

      {/* Parlor visits & Dewey moments — A6's scene, over the sheet. */}
      {visiting && (
        <DialogueScene
          character={visiting}
          slot="parlor"
          onClose={() => setVisiting(null)}
        />
      )}
    </div>
  );
}
