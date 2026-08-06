/**
 * Day transitions — OWNER: A2 (Economy/Day).
 *
 * The three lifecycle scenes the chrome owns:
 *   MorningCard — the "Day N" frame around the morning beat. (A6's Bramble
 *     scene renders inside this phase later; the card is the warm fallback
 *     and the frame either way.)
 *   DuskVeil — 0 steps: a wordless ≤4s darkening (AAA 4.12). pointer-events
 *     pass through the veil (the walk-but-no-interact grace is enforced by
 *     phase, not by trapping taps); a single quiet button skips ahead.
 *   NightDigest — the banked day read back gently, then to tomorrow.
 *
 * A run ending is "the day is over," never anything else (MANOR_DESIGN §1).
 */

import { useEffect, useRef, useState } from 'react';
import { useManorStore } from '../../app/store';
import { sfx } from '../../app/sound';
import type { DayRecord } from '../../engine/types';
import DialogueScene from '../dialogue/DialogueScene';

const MORNING_LINES = [
  'Light through the tall windows. The manor is waiting.',
  'The kettle is already on.',
  'Somewhere upstairs, a door that was not there yesterday.',
  'The parquet is cold, the tea is not.',
  'Dewey was sleeping on the blueprint again.',
  'A good day for a long corridor.',
];

const NIGHT_LINES: Record<string, string> = {
  'steps-exhausted': 'The candles have burned down to their dishes.',
  'retired-early': 'An early night, well chosen.',
  'volume-solved': 'The Sanctum heard the word. The manor sleeps easy tonight.',
};

export function MorningCard() {
  const day = useManorStore((s) => s.day);
  const advance = useManorStore((s) => s.advanceDayPhase);
  // Integration (A6 seam): the morning beat IS Mrs. Bramble — tea in the
  // Entrance Hall (MANOR_DESIGN §2). The card frames the day; tapping into
  // it plays her contextual morning scene (recaps react to yesterday's
  // events), and closing the scene opens the blueprint.
  const [greeting, setGreeting] = useState(false);
  if (!day) return null;
  const line = MORNING_LINES[(day.day - 1) % MORNING_LINES.length];
  if (greeting) {
    return <DialogueScene character="bramble" slot="morning" onClose={advance} />;
  }
  return (
    <section className="chr-scene chr-scene--enter" aria-label={`Morning of day ${day.day}`}>
      <h1 className="chr-scene__title">Day {day.day}</h1>
      <hr className="chr-scene__rule" />
      <p className="chr-scene__line">{line}</p>
      <button className="chr-scene__btn" onClick={() => setGreeting(true)}>
        Begin the day
      </button>
    </section>
  );
}

export function DuskVeil() {
  const advance = useManorStore((s) => s.advanceDayPhase);
  const soundOn = useManorStore((s) => s.settings.soundEnabled);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (soundOn) sfx.dusk();
    return () => { if (holdTimer.current) clearTimeout(holdTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once, on the veil falling
  }, []);

  const onFallen = () => {
    // Fade complete (≤4s bar) — a breath of held dusk, then night.
    if (holdTimer.current) return;
    holdTimer.current = setTimeout(advance, 1000);
  };

  return (
    <div className="chr-dusk" onAnimationEnd={onFallen} role="status" aria-label="Dusk settles">
      <div className="chr-dusk__line">Dusk settles over the manor.</div>
      <button className="chr-dusk__skip" onClick={advance}>
        And so, to bed
      </button>
    </div>
  );
}

export function NightDigest() {
  const day = useManorStore((s) => s.day);
  const records = useManorStore((s) => s.chronicles.dayRecords);
  const startDay = useManorStore((s) => s.startDay);
  const [turning, setTurning] = useState(false);
  if (!day) return null;

  // The record banked at endDay for the closing day.
  let record: DayRecord | undefined;
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (r && r.day === day.day) { record = r; break; }
  }
  const line = NIGHT_LINES[record?.cause ?? 'steps-exhausted'] ?? NIGHT_LINES['steps-exhausted'];

  const onTomorrow = () => {
    if (turning) return;
    setTurning(true);
    startDay(); // night → next morning; the manor resets, the journal keeps
  };

  return (
    <section className="chr-scene chr-scene--enter" aria-label="Night">
      <h1 className="chr-scene__title">Night</h1>
      <hr className="chr-scene__rule" />
      <p className="chr-scene__line">{line}</p>
      {record ? (
        <dl className="chr-digest">
          <dt>Rooms drafted</dt>
          <dd className="tabular-nums">{record.roomsDrafted}</dd>
          <dt>Rooms solved</dt>
          <dd className="tabular-nums">{record.roomsSolved}</dd>
          <dt>Steps spent</dt>
          <dd className="tabular-nums">{record.stepsSpent}</dd>
          <dt>Fragments found</dt>
          <dd className="tabular-nums">{record.fragmentsFound}</dd>
        </dl>
      ) : null}
      <button className="chr-scene__btn" onClick={onTomorrow}>
        To tomorrow
      </button>
    </section>
  );
}
