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

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useManorStore } from '../app/store';
import { deweyAnswer, deweyPettedToday, ensureManor } from '../app/slices/manor';
import { cardById } from '../engine/manor/deck';
import { cellKey, deweyCell, roomAt, rowTier, sameCell } from '../engine/manor/grid';
import type { CharacterId } from '../engine/types';
import BlueprintSheet from '../ui/blueprint/BlueprintSheet';
import CabinetSheet from '../ui/blueprint/CabinetSheet';
import DraftModal from '../ui/blueprint/DraftModal';
import DialogueScene from '../ui/dialogue/DialogueScene';
import '../ui/blueprint/blueprint.css';

const ROMAN = ['', 'I', 'II', 'III'];

/** Which of the cast keeps each parlor room (MANOR_DESIGN §8 haunts). */
const PARLOR_CHARACTERS: Record<string, CharacterId> = {
  'reading-nook': 'ellery',   // Ellery haunts the reading rooms
  'drawing-room': 'ellery',
  'post-room': 'posy',        // the postmistress
  'greenhouse': 'fern',       // the groundskeeper
  'morning-room': 'bramble',  // tea, of course
};

/** A quiet, self-clearing note above the footer (fragment found, etc.). */
function useFragmentNote(): string | null {
  const fragmentCount = useManorStore((s) => s.counters['fragment-found'] ?? 0);
  const [note, setNote] = useState<string | null>(null);
  const prev = useRef(fragmentCount);
  useEffect(() => {
    if (fragmentCount > prev.current) {
      setNote('A clue fragment, filed to the journal.');
      const t = setTimeout(() => setNote(null), 3200);
      prev.current = fragmentCount;
      return () => clearTimeout(t);
    }
    prev.current = fragmentCount;
  }, [fragmentCount]);
  return note;
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
  const fragmentNote = useFragmentNote();

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
          <h1 className="bp-scene__title">Lexicon Manor</h1>
          <p className="bp-scene__text">
            The gates are open. Somewhere upstairs, a word is missing from
            every dictionary in the house.
          </p>
          <button className="bp-btn bp-btn--seal" onClick={startDay}>Begin the first day</button>
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
    playerRoom?.kind === 'parlor' ? PARLOR_CHARACTERS[playerRoom.cardId] ?? 'bramble' : null;
  const atDewey = Boolean(
    manor && playerRoom && sameCell(manor.playerCell, deweyCell(manor.daySeed)),
  );
  const prophecy = petted && manor ? deweyAnswer({ manor, currencies, cabinet }) : null;

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
          <button className="bp-btn bp-btn--quiet" onClick={() => setCabinetOpen(true)}>
            Cabinet
          </button>
          <button className="bp-btn bp-btn--quiet" onClick={() => navigate('/journal')}>
            Journal
          </button>
          {/* Round 5: /chronicles had no entrance anywhere in the app — sound,
              music, reduced motion, the mute-switch bypass, keepsakes and the
              save trunk all sat behind a URL nobody could reach. It lives with
              its siblings on the blueprint footer now. */}
          <button className="bp-btn bp-btn--quiet" onClick={() => navigate('/chronicles')}>
            Chronicles
          </button>
        </div>
        {fragmentNote && <p className="bp-foot__dewey">{fragmentNote}</p>}
        {atDewey && petted && !visiting && (
          <p className="bp-foot__dewey">
            {prophecy
              ? 'Dewey stretches, then stares meaningfully down the corridor. Something violet hides on this floor.'
              : 'Dewey purrs, unbothered. No violet rooms on this floor today.'}
          </p>
        )}
      </footer>

      {/* The Floorplan Cabinet — the live deck and its locked plates (AAA 4.7) */}
      {cabinetOpen && (
        <CabinetSheet
          unlockedCardIds={cabinet.unlockedCardIds}
          onClose={() => setCabinetOpen(false)}
        />
      )}

      {draftOffer && exploring && (
        <DraftModal
          offer={draftOffer}
          gems={currencies.gems}
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
