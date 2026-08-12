/**
 * DraftModal — OWNER: A1 (Manor).
 *
 * The 3-card draft (MANOR_DESIGN §5, AAA 4.1–4.7): each card shows name,
 * door layout, category (hue + shape glyph — grayscale-safe), tier range,
 * reward preview, and gem cost. Reroll once for 1 gem; backing out costs
 * only the step already spent (AAA 4.6) and is framed as such, never as
 * quitting. Cards are bookplate-composed (BENCHMARKS §6 ex-libris heritage):
 * glyph in frame, name, motto line.
 *
 * THE DOOR DIAGRAM IS THE DECISION (round-9). Since orientation became rigid
 * — the card's 'N' is the wall she came through, everything else follows
 * (engine/manor/grid.ts) — the shape she is being offered is fully decided
 * before she taps, and it is the only thing that answers "does this keep my
 * path alive or seal it". So each card draws the doors `resolveDoors` will
 * actually place, at THIS door, post-rotation, with the entry wall picked out
 * in gilt. Never `doorLayouts[0]`, which was the canonical plan and therefore
 * wrong at three doors out of four.
 */

import type { PointerEvent } from 'react';
import type { Dir, DraftOffer, ManorState, RoomCard } from '../../engine/types';
import {
  isSanctumLanding, layoutFor, neighbor, onwardDoors, opensOntoSanctum, opposite,
  orientLayout, resolveDoors, rowTier, sealsItself,
} from '../../engine/manor/grid';
import { rememberedWings, wingOf, WING_CHARACTER_WORDS, WING_NAMES } from '../../engine/manor/wings';
import { SEALED_ROOM_BOUNTY } from '../../engine/manor/deck';
import { rowName } from '../../engine/economy/steps';
import { isDoorLocked, KEY_COST } from '../../engine/manor/locks';
import { CARD_PREVIEWS } from '../../engine/manor/deck';
import { draftCardStake } from '../../engine/economy/preview';
import { useManorStore } from '../../app/store';
import { RoomGlyph } from './CategoryGlyph';
import { DIR_WORDS, dirList, doorPlanWords } from './doorplan';
import { draftPriceWords, priceWords, sanctumDraftStamp } from './pricing';

const ROMAN = ['', 'I', 'II', 'III'];

function press(e: PointerEvent<Element>) { e.currentTarget.setAttribute('data-pressed', ''); }
function release(e: PointerEvent<Element>) { e.currentTarget.removeAttribute('data-pressed'); }
const pressProps = {
  onPointerDown: press, onPointerUp: release, onPointerLeave: release, onPointerCancel: release,
};

/**
 * Mini door diagram. Shared with the cabinet.
 *
 * ROUND-9 DEFECT this closes: the draft card drew `card.doorLayouts[0]`,
 * PRE-ROTATION — the canonical plan, not the one being offered. A round-5
 * critic already called it "a lie by omission", and once orientation became
 * rigid (engine/manor/grid.ts, THE ORIENTATION CONVENTION) it became the whole
 * decision: the diagram is her only way to read "does this keep my path alive
 * or seal it". So the modal now passes the doors `resolveDoors` will ACTUALLY
 * place — same function, same arguments — and this component only draws them.
 *
 * `entry` marks the wall she is standing at, so the diagram is legible as a
 * position and not just a shape; it also earns the diagram a real accessible
 * name, since the ink is now load-bearing rather than decorative. Omitted (the
 * cabinet, drawing CANONICAL plans with no door to stand at) it falls back to
 * 'N', which is not a guess — 'N' is the entry door by definition of the
 * vocabulary, so the same gilt tick means the same thing on both surfaces.
 */
export function DoorDiagram({
  doors, entry: entryProp, size = 26, silent = false,
}: { doors: readonly Dir[]; entry?: Dir; size?: number; silent?: boolean }) {
  const tick: Record<Dir, string> = {
    N: 'M12 1v5', S: 'M12 23v-5', W: 'M1 12h5', E: 'M23 12h-5',
  };
  const entry = entryProp ?? (doors.includes('N') ? 'N' : undefined);
  const onward = doors.filter((d) => d !== entry);
  const label = entry
    ? `Doors: you enter from the ${DIR_WORDS[entry]}` +
      (onward.length > 0
        ? `, and it opens ${dirList(onward)}`
        : ' — no other door: this room seals itself')
    : `Doors: ${dirList(doors) || 'none'}`;
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} className="bp-doorsdiag"
      /* `silent` is for the DRAFT CARD, which since round 31 prints the plan in
         words on the card face beside this diagram. The button's accessible
         name is composed from its text, so leaving the label on would make a
         screen reader hear the plan twice, in two different vocabularies. The
         Cabinet, which prints no such line, keeps the label. */
      {...(silent
        ? { 'aria-hidden': true as const }
        : { role: 'img', 'aria-label': label })}
    >
      <rect x={6.5} y={6.5} width={11} height={11} rx={1.5} />
      {doors.map((d) => (
        <path
          key={d}
          d={tick[d]}
          className={`bp-doorsdiag__door${d === entry ? ' bp-doorsdiag__door--entry' : ''}`}
        />
      ))}
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
  /**
   * The house these cards are being laid into — it decides the padlock and,
   * since round 9, the door orientation the cards draw. Optional and defaulted
   * to the live store exactly like `keyCost`, so the page stays unchanged; a
   * bare render (tests, the critic harness) can hand one in, because zustand's
   * server snapshot reports the INITIAL state and would otherwise leave the
   * diagrams guessing.
   */
  manor?: ManorState;
  onChoose(cardId: string): void;
  onReroll(): void;
  onCancel(): void;
}

export default function DraftModal({
  offer, gems, keyCost: keyCostProp, manor: manorProp, onChoose, onReroll, onCancel,
}: DraftModalProps) {
  const target = neighbor(offer.from, offer.atDoor);
  const tier = target ? rowTier(target.row) : 1;
  const liveManor = useManorStore((s) => s.manor);
  const manor = manorProp ?? liveManor;
  // THE WINGS (round 20). Selected as a primitive-bearing array off the store,
  // never as a derived object — see BlueprintSheet for what a fresh object per
  // render costs. `rememberedWings` is pure and cheap over 45-ish records.
  const dayRecords = useManorStore((s) => s.chronicles.dayRecords);
  const wing = target ? wingOf(target.col) : null;
  const wingCharacter = wing ? rememberedWings(dayRecords)[wing] : undefined;
  // She only ever gets to see this modal on a padlocked door if she already
  // held the key (the slice refuses free, without charging a step) — so this
  // line is a statement of what CHOOSING costs, not a warning she can fail.
  const keyCost = keyCostProp
    ?? (manor && target && isDoorLocked(manor, target) ? KEY_COST : 0);

  // ── THE CARD TELLS THE TRUTH (round-9 owner defect). ────────────────────
  // Orientation is rigid now (grid.ts THE ORIENTATION CONVENTION), so the
  // room's doors are already decided before she taps: this is the SAME
  // `resolveDoors` call `chooseDraftCard` will make, with the same arguments,
  // which is the only way the diagram cannot drift from the placement. Off the
  // live store (no manor: a bare render) it still turns the canonical plan the
  // right way round, so the entry wall is never drawn wrong.
  const entryWall = opposite(offer.atDoor);
  const doorsOf = (card: RoomCard): Dir[] =>
    manor && target
      ? resolveDoors(card, offer.atDoor, manor, target)
      : orientLayout(layoutFor(card, 0, ''), offer.atDoor);

  // ── THE LANDING DRAFT (round-13 blocker, AAA 4.6/4.16). ─────────────────
  // This is the one door in the game whose choice decides whether a 22-step
  // climb reaches anything: `atSanctumDoor` needs the room laid HERE to draw a
  // north door matching the Sanctum's sealed south one, and over the real deck
  // only ~28% of the plans eligible up here do. The modal named door
  // DIRECTIONS and never once named the Sanctum, so the most expensive tap in
  // the campaign was made blind — and 60.8% of offers even contain a plan that
  // opens it, so it is a real choice being hidden, not a coin the player
  // cannot influence. Every card in a landing offer now says which it is, off
  // the same `resolveDoors` the diagram beside it already draws.
  const atLanding = Boolean(target && isSanctumLanding(target));
  const opensSanctum = (card: RoomCard): boolean =>
    Boolean(target && opensOntoSanctum(doorsOf(card), target));

  // ── THE SEALING PLAN, PRICED (round 20, REVIEW_AA §5.7). ────────────────
  // The diagram has told the truth about a one-door room since round 9, and the
  // review's answer to that was: fine, but *why would she ever take it?* She
  // takes it for the gem. Same `sealsItself` the slice pays off, same manor,
  // same heading — so the stamp is a promise the placement keeps, not a guess.
  const seals = (card: RoomCard): boolean =>
    Boolean(manor && target && sealsItself(doorsOf(card), offer.atDoor, manor, target));

  // ── THE PLAN, IN WORDS (round 31, COMPREHENSION wrong-belief 7). ────────
  // The diagram has been honest since round 9 and unread ever since: 32px of
  // ink whose only statement was an aria-label, beside a bold line naming the
  // wrong attribute. This is the same answer in type — off `onwardDoors`, which
  // `sealsItself` is now the zero of, so the sentence and the gilt stamp below
  // it cannot contradict each other. Off the live store (a bare render) it
  // falls back to the geometry, which is all a manorless card can honestly say.
  const onward = (card: RoomCard): Dir[] => (
    manor && target
      ? onwardDoors(doorsOf(card), offer.atDoor, manor, target)
      : doorsOf(card).filter((d) => d !== entryWall)
  );

  return (
    <div className="bp-modal" role="dialog" aria-modal="true" aria-label="Draft a room">
      <div className="bp-modal__sheet">
        <header className="bp-modal__head">
          <h2 className="bp-modal__title">Beyond this door</h2>
          {/* ROUND 20 (REVIEW_AA §4). This line used to read "Three floorplans
              for the ground floors" over a door onto the HALF LANDING, because
              it took its words from the three-row tier BAND while the door that
              opened it took its words from `rowName`. One vocabulary now, and
              it is the storey's — plus the one fact that actually distinguishes
              this door from the other two out of the same room: the wing. */}
          <p className="bp-modal__sub">
            Three floorplans for {target ? rowName(target.row) : 'this storey'}
            {wing ? `, in ${WING_NAMES[wing]}` : ''} · tier {ROMAN[tier]}
          </p>
          {wing && wingCharacter && (
            <p className="bp-modal__wing">
              His papers keep {WING_NAMES[wing]} as {WING_CHARACTER_WORDS[wingCharacter]}.
            </p>
          )}
          {/* THE TWO PRICES, SAID OUT LOUD (AAA 4.6, round-5 audit). The look
              was being charged at the TARGET storey's rate before the offer
              opened, so a declined look upstairs cost a whole storey while
              this footer promised "step back". Now the door-step is local, the
              climb is charged on the way through, and both numbers are named
              here as well as on the sheet. */}
          {target && (
            <p className="bp-modal__price">
              {draftPriceWords(offer.from.row, target.row)}
            </p>
          )}
          {/* The one sentence that makes the diagrams readable: they are drawn
              as they will be LAID, not as the card was printed. */}
          {/* ROUND 31: the wall she came through used to be named three times,
              once inside each card's door diagram, where only a screen reader
              could hear it. It is the same wall on all three cards, so it is
              said once — here — and each card is left to say the thing that
              actually differs between them: where it lets her go next. */}
          {!atLanding && (
            <p className="bp-modal__orient">
              Each plan is turned to the gilt door at your feet — the{' '}
              {DIR_WORDS[entryWall]} wall
            </p>
          )}
          {/* ══ THE LANDING'S ONE SENTENCE (round 37; was two, round 13 + 31) ══
              The rule nothing in the game had ever stated (round 13): standing
              on the landing is not reaching the Sanctum — the room you lay here
              has to open north onto its sealed door.

              IT IS ONE PARAGRAPH NOW, AND THE THREE-CELL LANDING IS WHY. The
              orientation line above says the plan turns to the wall at her
              feet; this line says only a plan that opens north gets in. At
              every other door in the house those are two facts. At THIS door,
              since the landing became three cells and can be entered from the
              south, the east or the west, they are one fact with two halves:
              which way she came at the landing is what decides which of the
              three offered plans can open north (`resolveDoors` — the rotation
              is rigid). Saying it in two paragraphs said the halves and hid
              the join, and cost this sheet 42px it does not have.

              THE STANDING RULE IS OBEYED, NOT BENT: this states the RULE OF
              PLAY and stops there. It does not tell her which approach is
              better, and it does not tell her that walking one cell along the
              landing deals a different offer. Those are hers to find. */}
          {atLanding && (
            <p className="bp-modal__sanctum">
              Each plan turns to the {DIR_WORDS[entryWall]} wall at your feet.
              Only one that opens {' '}<strong>north</strong> reaches the sealed door.
            </p>
          )}
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
                  {/* ROUND 33. On a puzzle or mystery card this line is
                      flavour and the stake line below carries the numbers. On a
                      UTILITY card `draftCardStake` returns null by design, so
                      this line IS the payout — "+6 steps · +2 per green room
                      drafted after" — and it was being set in the flavour
                      register beside three rivals whose payouts were set in the
                      stake register. A tester priced the Kitchen against the
                      Library and reported that the Kitchen "listed no step
                      reward at all". So where it is the price, it looks like
                      the price. */}
                  <span
                    className={`bp-card__preview${
                      card.category === 'utility' ? ' bp-card__preview--stake' : ''
                    }`}
                  >
                    {CARD_PREVIEWS[card.id] ?? ''}
                  </span>
                  {/* THE DECISION, IN WORDS — printed ABOVE the length/payout
                      line it was being confused with, in the same size and a
                      step darker, so the attribute that decides the climb is
                      never the quieter of the two. A sealing plan says it once:
                      the gilt stamp carries both the dead end and its price. */}
                  {seals(card) ? (
                    <span className="bp-card__seals">{SEALED_ROOM_BOUNTY.stamp}</span>
                  ) : (
                    <span className="bp-card__doors">{doorPlanWords(onward(card))}</span>
                  )}
                  {(() => {
                    const stake = draftCardStake(card, tier);
                    return stake ? <span className="bp-card__stake">{stake.label}</span> : null;
                  })()}
                  {/* THE SANCTUM STAMP (round 13). Double-encoded per AAA 6.3:
                      the words carry it, the modifier class only tints them,
                      and BOTH answers are printed — a card that says nothing
                      beside two that do would read as a rendering gap, not as
                      a plan that seals the door. */}
                  {atLanding && (() => {
                    const opens = opensSanctum(card);
                    return (
                      <span
                        className={`bp-card__sanctum${opens ? ' bp-card__sanctum--opens' : ''}`}
                      >
                        {sanctumDraftStamp(opens)}
                      </span>
                    );
                  })()}
                  {/* ═══ ROUND 33 — THE JARGON ROW IS GONE ═══════════════
                      What stood here was `standard · tiers I–III`: the card's
                      RARITY (how often the deck deals it) and its ELIGIBILITY
                      RANGE (which storeys may ever offer it). Neither is a fact
                      about the room she is being offered, and neither has ever
                      been legible — both blind testers named this row, without
                      being asked, as something they never worked out, and it
                      was the loudest unexplained thing on a card whose most
                      important line (the door plan) had finally started
                      landing. The tier she is actually drafting at is already
                      stated once, at the top, in the storey heading; rarity is
                      still double-encoded in the card's own border (unusual
                      takes a ring, rare takes a gilt one, blueprint.css). And
                      the two lines it made room for are the two that were being
                      pushed off a 667px phone: this card's preview and, on a
                      utility card, the ONLY statement of what it pays. */}
                </span>
                <span className="bp-card__side">
                  <DoorDiagram doors={doorsOf(card)} entry={entryWall} size={32} silent />
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

        {/* ═══ ROUND 33 — WHAT A GEM IS, WHERE IT BITES (fix 6) ═══════════════
            "What gems are for / where they come from" is a [major] blind spot
            unchanged across two cold reads and five testers. One of them ended
            his run at a door where all three cards sealed, with 0 gems, and
            read it as arbitrary — it was a mistake he had made three drafts
            earlier, and nothing on any screen had told him so. The greyed
            `Reroll · 1 gem` is the exact moment a gem would have saved the run,
            and it was disabled and silent.
            Said only when it bites: not while she holds a gem (the button
            speaks for itself), not after a reroll is spent (the offer is
            settled and a price she cannot pay twice is noise). The source is
            the one the deck actually pays on demand — a plan that seals itself
            carries `SEALED_ROOM_BOUNTY.stamp`, "+1 gem", on its own face, so
            the note points at a card in this very offer rather than at a
            system. Round 20 built that trade; nothing had ever named it as the
            way to buy your way out of a bad one.
            ONE LINE at 375x667, deliberately: what a gem BUYS is already on the
            button it sits above ("Reroll · 1 gem"), so the note only has to
            carry the half that was nowhere. */}
        {!offer.rerolled && gems < 1 && (
          <p className="bp-modal__gems">
            No gems yet — a plan that seals itself pays one.
          </p>
        )}
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
            Step back · {priceWords(offer.from.row)}
          </button>
        </footer>
      </div>
    </div>
  );
}
