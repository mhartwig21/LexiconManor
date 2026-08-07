/**
 * THE FIRST MEETING — the card. OWNER: A6 (Dialogue).
 *
 * A card of introduction, presented before the scene speaks. Its whole job is
 * the one thing the routine panel could not do: make it unmistakable that a
 * PERSON HAS ENTERED THE STORY, at the moment of arrival, whatever the trigger
 * was — drafting their parlor, the morning tea, the Sanctum landing, or a cat
 * sitting down in the middle of the afternoon.
 *
 * The form, in the game's cozy-detective register, is a calling card being
 * made out: an empty frame arrives, the portrait settles into it, a hairline
 * is drawn beneath, the name is WRITTEN left to right, the wax is pressed with
 * their letterform, and the standing is added underneath. Then the card gives
 * way and the ordinary conversation panel arrives behind it with the first
 * line already typing. It is not a notice ABOUT the conversation; it is the
 * conversation's first beat.
 *
 * Why not the moment layer's queue — engine/dialogue/meeting.ts, at length.
 *
 * The bar it answers:
 *   U.2  — skippable: the whole glass is the target, and the auto-advance is
 *          the floor for the player who does not know that
 *   U.3  — transform/opacity only; every animation carries `backwards` fill so
 *          the RESTING state is the finished card, which is what makes the
 *          reduced-motion override a one-line `animation: none`
 *   6.19 — the tap target is the screen
 *   6.3  — the wax carries one Latin letterform; nothing here is hue-borne
 *   6.6  — the name sits at the 22px display floor, never below
 */

import { useCallback, useEffect, useRef } from 'react';
import type { CharacterId } from '../../engine/types';
import type { MeetingCardCopy } from '../../engine/dialogue/meeting';
import CharacterPortrait from './portraits';
import { ceremonyGate } from '../moment/ceremony';
import './meeting.css';

/**
 * How long the card holds before it hands off on its own.
 *
 * The choreography runs to ~1.75s (the standing line is the last thing to
 * arrive), so this is that plus a beat to read it. Deliberately far under the
 * moment layer's 5.6s: that card is a receipt for something the player may
 * have missed, and has to survive inattention; this one is the opening of a
 * scene she is already looking at, and the reward for waiting is the scene.
 */
export const MEETING_MS = 2900;

/** With motion off there is no choreography to wait out — only reading. */
export const MEETING_REDUCED_MS = 2200;

export interface MeetingCardProps {
  character: CharacterId;
  copy: MeetingCardCopy;
  /** System preference OR the in-game toggle — the caller merges both. */
  reducedMotion: boolean;
  /** Hand off to the scene. Called by the tap and by the timer, once. */
  onDone: () => void;
}

export default function MeetingCard({ character, copy, reducedMotion, onDone }: MeetingCardProps) {
  /* The hand-off is armed ONCE, at landing. Held through a ref because the
     scene above re-renders on any store notification (the day bar's counters
     tick constantly), and a callback in the dependency list would re-arm the
     timer on every one of them — a card that never retires for the player who
     is waiting rather than tapping. Same reasoning as the moment layer's
     `waitingAtLanding`. */
  const done = useRef(onDone);
  done.current = onDone;
  const handOff = useCallback(() => done.current(), []);

  /* The campaign seal steps aside while this is up, and its dwell clock stops
     with it, so a grant that lands in the same tick waits instead of stacking
     a second wax card over the introduction. Measured on day 1, where Posy's
     letter announces itself at exactly this moment — ui/moment/ceremony.ts. */
  useEffect(() => ceremonyGate.hold(), []);

  useEffect(() => {
    const t = setTimeout(handOff, reducedMotion ? MEETING_REDUCED_MS : MEETING_MS);
    return () => clearTimeout(t);
  }, [handOff, reducedMotion]);

  return (
    <button
      type="button"
      className={`mtg${reducedMotion ? ' mtg--reduced' : ''}`}
      onPointerDown={handOff}
      aria-label={`You have met ${copy.name}. ${copy.standing} Tap to go on.`}
    >
      <span className="mtg__card">
        <span className="mtg__eyebrow">Someone new in the manor</span>

        <span className="mtg__frame">
          <CharacterPortrait character={character} expression="neutral" />
          {/* Wax as a pressed disc — 6.15's sanctioned seal use, never as text
              ink; the letterform is what survives a grayscale screenshot. */}
          <span className="mtg__wax" aria-hidden="true">{copy.sigil}</span>
        </span>

        <span className="mtg__rule" aria-hidden="true" />

        <span className="mtg__name">{copy.name}</span>
        <span className={`mtg__standing${copy.narrated ? ' mtg__standing--narrated' : ''}`}>
          {copy.standing}
        </span>
      </span>

      <span className="mtg__hint" aria-hidden="true">Tap to go on</span>
    </button>
  );
}
