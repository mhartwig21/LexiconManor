/**
 * "The house, so far" — OWNER: A2 (Economy/Day).
 *
 * ── THE ARC THE PLAYER COULD NOT SEE (AAA 4.10d / 11.16, round-7 major) ────
 *
 * The campaign has exactly two meta-progressions — Bramble's tea (the step
 * arc) and Fern's friendship (the padlock arc) — and until this panel NOTHING
 * in the shipped UI ever stated that either existed. Bramble's 57 authored
 * nodes mention tea thirteen times and never mention the pot's size; the
 * Chronicles counted days, rooms, fragments and keepsakes and not one word of
 * warmth; the morning card printed a flavour line. The player's experience of
 * the only thing that decides when the Sanctum becomes affordable was "some
 * mornings I have more steps."
 *
 * 11.16 is the rule this answers: a currency or arc she must plan against has
 * to be visible somewhere persistent. So: what the pot is worth now, what buys
 * the next rung, what the sill gives her at dawn, and which cards the cabinet
 * has added. Accumulative and unloseable throughout (R.3) — there is no rank
 * to fall out of, only a house that knows you better.
 */

import { useManorStore } from '../../app/store';
import {
  fernMorningKeys, keyAccessFor, rowName, teaArcPoints, teaBonus, teaLandingPour,
  TEA_ARC, TEA_BY_POINTS, TEA_POUR,
  stepWords,
} from '../../engine/economy/steps';
import { UNLOCKABLE_CARDS } from '../../engine/manor/deck';
import './chrome.css';

/** How many rungs of the pot are behind her (1-indexed, 0 = a plain cup). */
function potRung(points: number): number {
  return Math.min(points, TEA_BY_POINTS.length - 1);
}

export default function HouseSoFar() {
  const day = useManorStore((s) => s.day?.day ?? s.volume.day);
  const bramble = useManorStore((s) => s.affinities.bramble ?? 0);
  const fern = useManorStore((s) => s.affinities.fern ?? 0);
  const unlocked = useManorStore((s) => s.cabinet.unlockedCardIds);

  const points = potRung(bramble);
  const pot = teaBonus(points);
  const carriedUp = teaLandingPour(points);
  const atTop = points >= TEA_ARC.maxPoints;
  // The ceiling shared mornings can have bought by now, and when the next rung
  // opens (`teaArcPoints` moves one rung every `morningsPerPoint` days).
  const nextRungDay = TEA_ARC.morningsPerPoint * (points + 1);
  const mornings = Math.max(1, nextRungDay - day);
  const behind = points < teaArcPoints(day);

  const sillKeys = fernMorningKeys(fern);
  const access = keyAccessFor(fern);

  return (
    <div className="chr-house">
      <div className="chr-house__row">
        <span>Mrs. Bramble's pot</span>
        <span className="chr-house__value tabular-nums">
          {pot > 0 ? `+${stepWords(pot)}` : 'a plain, kind cup'}
        </span>
        <p className="chr-house__note">
          {atTop
            ? 'She fills it to the brim now. There is no more pot to give.'
            : behind
              ? 'Sit down with her tomorrow morning and she pours a little deeper.'
              : `${mornings} more shared morning${mornings === 1 ? '' : 's'} and she pours a little deeper.`}
        </p>
        <p className="chr-house__note">
          {carriedUp > 0
            ? `A cup at the door; she carries the other +${carriedUp} up to ${rowName(TEA_POUR.landingRow0)}.`
            : 'A cup at the door. There is no pot to carry up yet.'}
        </p>
      </div>

      <div className="chr-house__row">
        <span>Fern's key, left on the sill</span>
        <span className="chr-house__value tabular-nums">
          {sillKeys > 0 ? `${sillKeys} at dawn` : 'not yet'}
        </span>
        <p className="chr-house__note">
          {sillKeys > 0
            ? 'Keys still turn back at nightfall — what she gives you is the way up, not a hoard.'
            : 'Tend the garden with her and she will start leaving one out for you.'}
          {access > 0 && ' She has told you where the spares are kept, too: they turn up in the offers more often.'}
        </p>
      </div>

      <div className="chr-house__row">
        <span>Rooms added to the plans</span>
        <span className="chr-house__value tabular-nums">
          {unlocked.length} of {UNLOCKABLE_CARDS.length}
        </span>
        <p className="chr-house__note">
          Floorplans the house has let you keep. They stay in the deck for every day after.
        </p>
      </div>
    </div>
  );
}
