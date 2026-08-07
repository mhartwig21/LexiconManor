/**
 * CabinetSheet — OWNER: A1 (Manor).
 *
 * The Floorplan Cabinet (AAA 4.7): the whole live deck, on one sheet, so the
 * memorizable categories (~5-7 per specialist color, BENCHMARKS §4) have a
 * surface to be memorized FROM. Cards are grouped by category and rendered as
 * the same bookplates the draft uses — per-kind glyph, name, motto, rarity,
 * door layouts, tier range. Unlockable cards not yet earned show as
 * silhouetted plates naming the quest that fills the slot, so Posy's favors
 * visibly pay into a waiting hole rather than a void.
 */

import type { PointerEvent } from 'react';
import type { RoomCard, RoomCategory } from '../../engine/types';
import {
  CARD_PREVIEWS, deckFor, UNLOCK_QUEST_NAMES, UNLOCKABLE_CARDS,
} from '../../engine/manor/deck';
import { RoomGlyph } from './CategoryGlyph';
import { DoorDiagram } from './DraftModal';

const ROMAN = ['', 'I', 'II', 'III'];

const SECTION_ORDER: RoomCategory[] = ['puzzle', 'utility', 'parlor', 'mystery'];

const SECTION_TITLES: Record<RoomCategory, string> = {
  puzzle: 'Puzzle rooms',
  parlor: 'Parlors',
  utility: 'Utility rooms',
  mystery: 'Mystery rooms',
};

function press(e: PointerEvent<Element>) { e.currentTarget.setAttribute('data-pressed', ''); }
function release(e: PointerEvent<Element>) { e.currentTarget.removeAttribute('data-pressed'); }
const pressProps = {
  onPointerDown: press, onPointerUp: release, onPointerLeave: release, onPointerCancel: release,
};

function tierText(card: RoomCard): string {
  return card.tierRange[0] === card.tierRange[1]
    ? `tier ${ROMAN[card.tierRange[0]]}`
    : `tiers ${ROMAN[card.tierRange[0]]}–${ROMAN[card.tierRange[1]]}`;
}

function CabinetCard({ card }: { card: RoomCard }) {
  return (
    // ROUND 8 (verifier): `data-card-id` is load-bearing, not decoration.
    // ManorPage's plate-seen observer (AAA 11.20/11.21) resolves rows to cards
    // so it can retire their markers; it used to match on the printed name,
    // which meant renaming a card silently stopped its marker ever clearing.
    <li
      data-card-id={card.id}
      className={`bp-card bp-card--plate bp-card--${card.category} bp-card--${card.rarity}`}
    >
      <span className="bp-card__glyph">
        <RoomGlyph category={card.category} puzzleKind={card.puzzleKind} size={30} />
      </span>
      <span className="bp-card__body">
        <span className="bp-card__name">{card.name}</span>
        <span className="bp-card__preview">{CARD_PREVIEWS[card.id] ?? ''}</span>
        <span className="bp-card__meta">
          <span className="bp-card__rarity">{card.rarity}</span>
          <span aria-hidden="true"> · </span>
          <span className="bp-card__tiers">{tierText(card)}</span>
          {card.gemCost > 0 && (
            <>
              <span aria-hidden="true"> · </span>
              <span className="bp-card__tiers">{card.gemCost} gem{card.gemCost > 1 ? 's' : ''}</span>
            </>
          )}
        </span>
      </span>
      <span className="bp-card__side">
        {card.doorLayouts.map((doors, i) => <DoorDiagram key={i} doors={doors} />)}
      </span>
    </li>
  );
}

/** A still-locked plate: silhouette only, naming the deed that fills it. */
function LockedCard({ card }: { card: RoomCard }) {
  const quest = (card.unlockedBy && UNLOCK_QUEST_NAMES[card.unlockedBy]) ?? 'a favor not yet done';
  return (
    <li
      data-card-id={card.id}
      className={`bp-card bp-card--plate bp-card--locked bp-card--${card.category}`}
    >
      <span className="bp-card__glyph">
        <RoomGlyph category={card.category} puzzleKind={card.puzzleKind} size={30} />
      </span>
      <span className="bp-card__body">
        <span className="bp-card__name bp-card__name--locked" aria-label="A locked floorplan">
          ⁘ ⁘ ⁘
        </span>
        <span className="bp-card__preview">An empty slot in the cabinet.</span>
        <span className="bp-card__meta">unlocked by {quest}</span>
      </span>
    </li>
  );
}

export interface CabinetSheetProps {
  unlockedCardIds: readonly string[];
  onClose(): void;
}

export default function CabinetSheet({ unlockedCardIds, onClose }: CabinetSheetProps) {
  const deck = deckFor(unlockedCardIds);
  const locked = UNLOCKABLE_CARDS.filter((c) => !unlockedCardIds.includes(c.id));

  return (
    <div
      className="bp-modal"
      role="dialog"
      aria-modal="true"
      aria-label="The floorplan cabinet"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bp-modal__sheet">
        <header className="bp-modal__head">
          <h2 className="bp-modal__title">The Floorplan Cabinet</h2>
          <p className="bp-modal__sub">
            Every plan the house may deal · {deck.length} of {deck.length + locked.length} plates
          </p>
        </header>

        {SECTION_ORDER.map((cat) => {
          const cards = deck.filter((c) => c.category === cat);
          const lockedHere = locked.filter((c) => c.category === cat);
          if (cards.length === 0 && lockedHere.length === 0) return null;
          return (
            <section key={cat} className={`bp-cabinet__section bp-cabinet--${cat}`}>
              <h3 className="bp-cabinet__title">
                <span className="bp-cabinet__swatch" aria-hidden="true" />
                {SECTION_TITLES[cat]}
                <span className="bp-cabinet__count">{cards.length + lockedHere.length}</span>
              </h3>
              <ul className="bp-cabinet__list">
                {cards.map((card) => <CabinetCard key={card.id} card={card} />)}
                {lockedHere.map((card) => <LockedCard key={card.id} card={card} />)}
              </ul>
            </section>
          );
        })}

        <footer className="bp-modal__foot bp-modal__foot--center">
          <button className="bp-btn" {...pressProps} onClick={onClose}>
            Close the cabinet
          </button>
        </footer>
      </div>
    </div>
  );
}
