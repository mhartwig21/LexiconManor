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

import { Fragment, useEffect, useRef, useState } from 'react';
import { useManorStore } from '../../app/store';
import { sfx } from '../../app/sound';
import type { DayRecord } from '../../engine/types';
import { highestRowLine, refundLine } from '../../engine/day';
import { dawnCarryOverLines } from '../../app/slices/manor';
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
  // What yesterday left steeping (AAA 4.11 cross-day investment): the Larder's
  // risen dough, the Still Room's key on the sill. Read at dawn, so a green
  // room drafted on a quiet Tuesday visibly pays for Wednesday's climb.
  const recentEvents = useManorStore((s) => s.recentEvents);
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
  const kept = dawnCarryOverLines({ day, recentEvents });
  return (
    <section className="chr-scene chr-scene--enter" aria-label={`Morning of day ${day.day}`}>
      <h1 className="chr-scene__title">Day {day.day}</h1>
      <hr className="chr-scene__rule" />
      <p className="chr-scene__line">{line}</p>
      {kept.length > 0 && (
        <p className="chr-digest__prose">{kept.join(' ')}</p>
      )}
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

/**
 * The day read back — as a story, not a report card.
 *
 * Round-5 audit: the first night of the game closed on four rows of zeros
 * ("Rooms solved 0 · Steps spent 18 · Fragments found 0"), and the two numbers
 * that make the retune legible — how high she got, and how much the manor gave
 * back — were not recorded at all. Now they are (engine/day.ts
 * `buildDayRecord`), they lead, they are prose, and **every zero row is
 * suppressed rather than printed**: a quiet day says less, it never says you
 * scored nothing.
 */
function NightLedger({ record }: { record: DayRecord }) {
  const climb = highestRowLine(record);
  const gave = refundLine(record);
  const rows: Array<[string, number]> = [
    ['Rooms drafted', record.roomsDrafted],
    ['Rooms solved', record.roomsSolved],
    ['Steps spent', record.stepsSpent],
    ['Fragments found', record.fragmentsFound],
  ];
  const kept = rows.filter(([, n]) => n > 0);
  return (
    <>
      {(climb || gave) && (
        <p className="chr-digest__prose">
          {climb}
          {climb && gave ? ' ' : null}
          {gave}
        </p>
      )}
      {kept.length > 0 ? (
        <dl className="chr-digest">
          {kept.map(([label, n]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd className="tabular-nums">{n}</dd>
            </Fragment>
          ))}
        </dl>
      ) : null}
    </>
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
      {record ? <NightLedger record={record} /> : null}
      <button className="chr-scene__btn" onClick={onTomorrow}>
        To tomorrow
      </button>
    </section>
  );
}
