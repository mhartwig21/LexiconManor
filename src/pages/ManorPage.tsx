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
import { cellKey, deweyCell, neighbor, roomAt, rowTier, sameCell } from '../engine/manor/grid';
import { isDoorLocked, KEY_COST } from '../engine/manor/locks';
import { parlorHostFor } from '../engine/manor/parlor';
import type { CharacterId } from '../engine/types';
import BlueprintSheet from '../ui/blueprint/BlueprintSheet';
import CabinetSheet from '../ui/blueprint/CabinetSheet';
import DraftModal from '../ui/blueprint/DraftModal';
import DialogueScene from '../ui/dialogue/DialogueScene';
import { plateSeenFlag, unseenKeepsakes, unseenPlates } from '../ui/moment/mantel';
import UnreadMark from '../ui/journal/UnreadMark';
import SealedMark from '../ui/journal/SealedMark';
import { useJournalUnread } from '../ui/journal/useJournalUnread';
import '../ui/blueprint/blueprint.css';
import './front-step.css';

const ROMAN = ['', 'I', 'II', 'III'];

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
        <div className="bp-foot__where">
          <span className="bp-foot__room">{playerCard?.name ?? 'The Grounds'}</span>
          {manor && (
            <span className="bp-foot__tier">tier {ROMAN[rowTier(manor.playerCell.row)]}</span>
          )}
        </div>
        <div className="bp-foot__actions">
          {isPuzzleHere && exploring && (
            <button
              className="bp-btn bp-btn--seal"
              onClick={() => manor && enterRoom(cellKey(manor.playerCell))}
            >
              Enter
            </button>
          )}
          {parlorHost && exploring && !visiting && (
            <button className="bp-btn" onClick={() => setVisiting(parlorHost)}>
              Call on {parlorHost === 'bramble' ? 'Mrs. Bramble'
                : parlorHost.charAt(0).toUpperCase() + parlorHost.slice(1)}
            </button>
          )}
          {atDewey && exploring && !petted && (
            <button className="bp-btn" onClick={onPetDewey}>Pet Dewey · 1 step</button>
          )}
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
