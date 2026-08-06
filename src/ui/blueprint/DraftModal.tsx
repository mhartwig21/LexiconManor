/**
 * DraftModal — OWNER: A1 (Manor).
 *
 * The 3-card draft (MANOR_DESIGN §5, AAA 4.1–4.7): each card shows name,
 * door layout, category (hue + shape glyph — grayscale-safe), tier range,
 * reward preview, and gem cost. Reroll once for 1 gem; backing out costs
 * only the step already spent (AAA 4.6) and is framed as such, never as
 * quitting. Cards are bookplate-composed (BENCHMARKS §6 ex-libris heritage):
 * glyph in frame, name, motto line.
 */

import type { PointerEvent } from 'react';
import type { Dir, DraftOffer, RoomCard } from '../../engine/types';
import { neighbor, rowTier } from '../../engine/manor/grid';
import { isDoorLocked, KEY_COST } from '../../engine/manor/locks';
import { CARD_PREVIEWS } from '../../engine/manor/deck';
import { draftCardStake } from '../../engine/economy/preview';
import { useManorStore } from '../../app/store';
import { RoomGlyph } from './CategoryGlyph';

const TIER_LABELS = ['', 'the ground floors', 'the middle landings', 'the high floors'];
const ROMAN = ['', 'I', 'II', 'III'];

function press(e: PointerEvent<Element>) { e.currentTarget.setAttribute('data-pressed', ''); }
function release(e: PointerEvent<Element>) { e.currentTarget.removeAttribute('data-pressed'); }
const pressProps = {
  onPointerDown: press, onPointerUp: release, onPointerLeave: release, onPointerCancel: release,
};

/** Mini door diagram: a card layout; the joiner turns it to fit. Shared with the cabinet. */
export function DoorDiagram({ doors }: { doors: readonly Dir[] }) {
  const tick: Record<Dir, string> = {
    N: 'M12 1v5', S: 'M12 23v-5', W: 'M1 12h5', E: 'M23 12h-5',
  };
  return (
    <svg viewBox="0 0 24 24" width={26} height={26} className="bp-doorsdiag" aria-hidden="true">
      <rect x={6.5} y={6.5} width={11} height={11} rx={1.5} />
      {doors.map((d) => <path key={d} d={tick[d]} className="bp-doorsdiag__door" />)}
    </svg>
  );
}

export interface DraftModalProps {
  offer: DraftOffer;
  gems: number;
  /**
   * Keys this door asks for on placement — 0 for an ordinary door. Optional:
   * defaults to the live manor's padlock roll, so the price is stated even
   * where the page has not been re-wired (AAA 4.6: never a surprise charge).
   */
  keyCost?: number;
  onChoose(cardId: string): void;
  onReroll(): void;
  onCancel(): void;
}

export default function DraftModal({
  offer, gems, keyCost: keyCostProp, onChoose, onReroll, onCancel,
}: DraftModalProps) {
  const target = neighbor(offer.from, offer.atDoor);
  const tier = target ? rowTier(target.row) : 1;
  const manor = useManorStore((s) => s.manor);
  // She only ever gets to see this modal on a padlocked door if she already
  // held the key (the slice refuses free, without charging a step) — so this
  // line is a statement of what CHOOSING costs, not a warning she can fail.
  const keyCost = keyCostProp
    ?? (manor && target && isDoorLocked(manor, target) ? KEY_COST : 0);

  return (
    <div className="bp-modal" role="dialog" aria-modal="true" aria-label="Draft a room">
      <div className="bp-modal__sheet">
        <header className="bp-modal__head">
          <h2 className="bp-modal__title">Beyond this door</h2>
          <p className="bp-modal__sub">
            Three floorplans for {TIER_LABELS[tier]} · tier {ROMAN[tier]}
          </p>
          {keyCost > 0 && (
            <p className="bp-modal__lock">
              <svg viewBox="0 0 14 16" width={12} height={14} aria-hidden="true">
                <path
                  d="M3.4 7.2V4.9a3.6 3.6 0 0 1 7.2 0v2.3"
                  fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"
                />
                <rect
                  x={1.6} y={7.2} width={10.8} height={7.4} rx={1.6}
                  fill="none" stroke="currentColor" strokeWidth={1.5}
                />
              </svg>
              This door was padlocked · placing a room spends{' '}
              {keyCost === 1 ? '1 key' : `${keyCost} keys`}
            </p>
          )}
        </header>

        <div className="bp-modal__cards">
          {offer.cards.map((card: RoomCard) => {
            const affordable = card.gemCost === 0 || gems >= card.gemCost;
            return (
              <button
                key={card.id}
                className={`bp-card bp-card--${card.category} bp-card--${card.rarity}`}
                disabled={!affordable}
                {...pressProps}
                onClick={() => onChoose(card.id)}
              >
                <span className="bp-card__glyph">
                  <RoomGlyph category={card.category} puzzleKind={card.puzzleKind} size={30} />
                </span>
                <span className="bp-card__body">
                  <span className="bp-card__name">{card.name}</span>
                  <span className="bp-card__preview">{CARD_PREVIEWS[card.id] ?? ''}</span>
                  {(() => {
                    const stake = draftCardStake(card, tier);
                    return stake ? <span className="bp-card__stake">{stake.label}</span> : null;
                  })()}
                  <span className="bp-card__meta">
                    <span className="bp-card__rarity">{card.rarity}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="bp-card__tiers">
                      {card.tierRange[0] === card.tierRange[1]
                        ? `tier ${ROMAN[card.tierRange[0]]}`
                        : `tiers ${ROMAN[card.tierRange[0]]}–${ROMAN[card.tierRange[1]]}`}
                    </span>
                  </span>
                </span>
                <span className="bp-card__side">
                  <DoorDiagram doors={card.doorLayouts[0] ?? []} />
                  {card.gemCost > 0 ? (
                    <span className={`bp-card__cost${affordable ? '' : ' bp-card__cost--short'}`}>
                      <svg viewBox="0 0 12 12" width={11} height={11} aria-hidden="true">
                        <path d="M6 1 10.5 5 6 11 1.5 5Z" fill="currentColor" />
                      </svg>
                      {card.gemCost}
                    </span>
                  ) : (
                    <span className="bp-card__free">free</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <footer className="bp-modal__foot">
          <button
            className="bp-btn"
            disabled={offer.rerolled || gems < 1}
            {...pressProps}
            onClick={onReroll}
          >
            {offer.rerolled ? 'Rerolled' : 'Reroll · 1 gem'}
          </button>
          <button className="bp-btn bp-btn--quiet" {...pressProps} onClick={onCancel}>
            Step back
          </button>
        </footer>
      </div>
    </div>
  );
}
