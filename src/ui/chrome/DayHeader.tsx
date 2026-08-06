/**
 * DayHeader — OWNER: A2 (Economy/Day).
 *
 * The persistent top band: day numeral, the step candle, gem/key chips, and
 * the retire-early affordance (two-tap arm/confirm, no modal). Sits above
 * every route so the economy is always in view — the tension pillar is
 * "can I afford one more room?", and the answer never hides.
 */

import { useEffect, useRef, useState } from 'react';
import { useManorStore } from '../../app/store';
import CurrencyChip from './CurrencyChip';
import StepMeter from './StepMeter';
import { useOverlayOpen } from './overlay-watch';

const PHASE_LABEL: Record<string, string> = {
  morning: 'morning',
  exploring: '',
  dusk: 'dusk',
  night: 'night',
};

function GemGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 1 L11 5 L6 11 L1 5 Z" fill="currentColor" />
    </svg>
  );
}

function KeyGlyph() {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">
      <circle cx="4" cy="6" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.6 6 H13 M10.5 6 V8.6 M12.5 6 V8" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

/** A ribbon marker — the gift currency's own shape (AAA 6.3 double-encoding). */
function BookmarkGlyph() {
  return (
    <svg width="10" height="13" viewBox="0 0 10 13" aria-hidden="true">
      <path d="M1 0.8 H9 V12.2 L5 9.2 L1 12.2 Z" fill="currentColor" />
    </svg>
  );
}

export default function DayHeader() {
  const day = useManorStore((s) => s.day);
  const currencies = useManorStore((s) => s.currencies);
  const endDay = useManorStore((s) => s.endDay);
  const inRoom = useManorStore((s) => Boolean(s.day?.activeRoom));
  // Is a scene the player believes is modal on the glass? (AAA 11.5)
  const overlayOpen = useOverlayOpen();

  // Retire: first tap arms, second confirms; disarms itself after a moment.
  const [armed, setArmed] = useState(false);
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (disarm.current) clearTimeout(disarm.current); }, []);
  // An overlay opening mid-arm must not leave a live confirm tap waiting in
  // the band above it — the second tap ends the day with no further warning.
  useEffect(() => {
    if (!overlayOpen) return;
    if (disarm.current) clearTimeout(disarm.current);
    setArmed(false);
  }, [overlayOpen]);
  const onRetire = () => {
    if (!armed) {
      setArmed(true);
      if (disarm.current) clearTimeout(disarm.current);
      disarm.current = setTimeout(() => setArmed(false), 2600);
      return;
    }
    setArmed(false);
    endDay('retired-early');
  };

  if (!day) return null;
  const phase = PHASE_LABEL[day.phase];
  // AAA 11.5. The two-tap retire is the one DESTRUCTIVE control in the chrome,
  // and the chrome is painted above every overlay so the candle stays readable
  // (see layers.ts). Readable is not tappable: while a draft, a conversation or
  // a lifecycle card is up, the control is not rendered at all. `.chr-header`
  // also goes pointer-inert in CSS, so this is the second of two locks, not the
  // only one — the audited failure was a player able to end her evening by
  // tapping the top of a scene she thought was modal.
  const showRetire = day.phase === 'exploring' && !inRoom && !overlayOpen;
  // A currency move is HERS while the manor is open for business. At dusk and
  // night the same numbers go to zero because the day ended (day.ts endDay),
  // and a −3 floating off the gem chip at bedtime would be a lie about
  // spending. Dawn counts: Fern's key and the Still Room's carry over both
  // land in `morning`, behind the morning card, with the bar in full view.
  const live = day.phase === 'exploring' || day.phase === 'morning';

  return (
    <header className="chr-header">
      <div className="chr-day">
        Day {day.day}
        {phase ? <span className="chr-day__phase">{phase}</span> : null}
      </div>
      <StepMeter />
      <div className="chr-right">
        <CurrencyChip name="gems" unit={['gem', 'gems']} value={currencies.gems} live={live}>
          <GemGlyph />
        </CurrencyChip>
        <CurrencyChip name="keys" unit={['key', 'keys']} value={currencies.keys} live={live}>
          <KeyGlyph />
        </CurrencyChip>
        {/* Bookmarks are earned in letters and spent in a parlor two rooms
            away, so the ONE place they were shown — inside the dialogue scene
            that spends them — was the one place the decision was already
            made. AAA 11.16: she cannot plan against a quantity she cannot
            see. They persist across nights (day.ts), so the chip does too. */}
        <CurrencyChip
          name="bookmarks"
          unit={['bookmark', 'bookmarks']}
          value={currencies.bookmarks}
          live={live}
        >
          <BookmarkGlyph />
        </CurrencyChip>
        {showRetire ? (
          <button
            className={`chr-retire${armed ? ' chr-retire--armed' : ''}`}
            onClick={onRetire}
            aria-label="Retire for the evening"
          >
            {armed ? 'Retire?' : '☾'}
          </button>
        ) : null}
      </div>
    </header>
  );
}
