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
import StepMeter from './StepMeter';

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

export default function DayHeader() {
  const day = useManorStore((s) => s.day);
  const currencies = useManorStore((s) => s.currencies);
  const endDay = useManorStore((s) => s.endDay);
  const inRoom = useManorStore((s) => Boolean(s.day?.activeRoom));

  // Retire: first tap arms, second confirms; disarms itself after a moment.
  const [armed, setArmed] = useState(false);
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (disarm.current) clearTimeout(disarm.current); }, []);
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
  const showRetire = day.phase === 'exploring' && !inRoom;

  return (
    <header className="chr-header">
      <div className="chr-day">
        Day {day.day}
        {phase ? <span className="chr-day__phase">{phase}</span> : null}
      </div>
      <StepMeter />
      <div className="chr-right">
        <span className="chr-chip chr-chip--gems" aria-label={`${currencies.gems} gems`}>
          <GemGlyph />
          <span className="chr-chip__n tabular-nums">{currencies.gems}</span>
        </span>
        <span className="chr-chip chr-chip--keys" aria-label={`${currencies.keys} keys`}>
          <KeyGlyph />
          <span className="chr-chip__n tabular-nums">{currencies.keys}</span>
        </span>
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
