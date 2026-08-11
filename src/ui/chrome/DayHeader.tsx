/**
 * DayHeader — OWNER: A2 (Economy/Day).
 *
 * The persistent top band: day numeral, the step candle, gem/key chips, and
 * the retire-early affordance (two-tap arm/confirm, no modal). Sits above
 * every route so the economy is always in view — the tension pillar is
 * "can I afford one more room?", and the answer never hides.
 */

import { useEffect, useState } from 'react';
import { useManorStore } from '../../app/store';
import CurrencyChip from './CurrencyChip';
import StepMeter from './StepMeter';
import { useOverlayOpen } from './overlay-watch';

/**
 * The first-run currency key: how long it waits for the dawn's step floats to
 * clear (matched by `.chr-key`'s animation-delay in chrome.css), and how long
 * it then stays if she touches nothing at all.
 */
const KEY_IN_MS = 1400;
const KEY_MS = 8000;
/**
 * ROUND 28 — ONE MORNING WAS NOT A KEY, IT WAS A GLIMPSE.
 *
 * Round 26 hung the three nouns under the cluster on day 1 and retired them
 * for ever on her first touch — which, measured, is inside three seconds of a
 * dawn that also has step floats, a morning card and Mrs. Bramble in it. From
 * day 2 a sighted stranger was back to three unlabelled trinkets, with the
 * words living only in `.chr-sr` (1px, clipped) where only a screen reader
 * goes. The key now opens the first three mornings — once each, still retiring
 * on her first touch, still costing the bar no width — which is the span over
 * which the campaign's own comprehension test says the machine is being
 * learned. After that the float carries it: every change names its unit ("+1
 * key"), and by then she has spent one.
 */
const KEY_DAYS = 3;

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

  /* ═══ RETIRE: FIRST TAP ARMS, SECOND CONFIRMS ═══════════════════════════
   *
   * ROUND 26 (COMPREHENSION.md fix 9) — THE ONLY CONTROL THREE OF THREE BLIND
   * TESTERS BELIEVED WAS BROKEN. The arm used to disarm ITSELF after 2600ms.
   * A player reads "End the day?", thinks about whether she is done, looks
   * back — and the plate has quietly gone back to "Retire". One tester pressed
   * it four times over several minutes and concluded it was bugged; nobody
   * ever saw the confirm state and the arm at the same moment.
   *
   * A timeout was the wrong instrument. The arm exists so the day cannot be
   * ended by ONE stray tap, and a stray tap is exactly what un-arms it now:
   * the confirm holds until she touches something else. That is strictly safer
   * than the timer (a tap anywhere disarms, immediately, instead of leaving a
   * live confirm sitting in the band for 2.6s) and it is legible, which the
   * timer never was.
   *
   * The listener does not swallow the tap that disarms — no preventDefault, no
   * stopPropagation — so the cell, door or chip she actually reached for still
   * does its own job in the same gesture (the round-15 lesson: a layer that
   * eats a tap aimed at something else is the defect, not the fix).
   */
  const [armed, setArmed] = useState(false);
  /**
   * The last day on which the currency key has had its turn — 0 until it has
   * had one at all. A DAY, not a boolean, so the key can open each of the
   * first `KEY_DAYS` mornings once and never twice (round 28).
   */
  const [keyShownDay, setKeyShownDay] = useState(0);
  // An overlay opening mid-arm must not leave a live confirm tap waiting in
  // the band above it — the second tap ends the day with no further warning.
  useEffect(() => {
    if (!overlayOpen) return;
    setArmed(false);
  }, [overlayOpen]);
  useEffect(() => {
    if (!armed) return;
    const elsewhere = (event: Event) => {
      // The confirm tap itself lands on the button and must reach onClick.
      const el = event.target instanceof Element ? event.target : null;
      if (el?.closest('.chr-retire')) return;
      setArmed(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setArmed(false); };
    // Capture, so a scene that stops propagation on its own root cannot leave
    // the confirm armed behind it.
    document.addEventListener('pointerdown', elsewhere, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', elsewhere, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [armed]);
  const onRetire = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    endDay('retired-early');
  };

  /* ═══ THE THREE GLYPHS, NAMED ONCE (COMPREHENSION.md fix 15) ════════════
   *
   * "The three currency chips in the header are never labelled on screen — one
   * player only worked out gems/keys/bookmarks by reading accessible text."
   * And a second finished the campaign believing bookmarks were confiscated at
   * bedtime along with the gems and keys, which made the whole gift economy
   * look like pure loss. (endDay zeroes gems and keys and PRESERVES bookmarks;
   * they are the one currency that keeps.)
   *
   * A word beside each glyph is not available: measured live, the bar's
   * content ends exactly on its right padding at 390x844 AND at 375x667 —
   * there is not one spare pixel, and an overflowing label is a worse defect
   * than the unlabelled glyph. So this is the other half of 11.7's remedy: an
   * early-days key, hung under the cluster it names, in the chips' own
   * left-to-right order, out of the bar's width entirely.
   *
   * It is inert (`pointer-events: none`), it opens once on each of the first
   * `KEY_DAYS` mornings and never again, and the player's first touch anywhere
   * puts it away for that day — the same grammar as the retire confirm above. It waits out the dawn's step floats
   * before it fades in (CSS delay) so the two labels are never on the glass at
   * once. Everything it says is a NOUN, not a rule: this is a key to three
   * glyphs, not a tutorial.
   */
  const firstRun = day !== null && day.day <= KEY_DAYS && day.phase === 'exploring'
    && !overlayOpen && keyShownDay < day.day;
  useEffect(() => {
    if (!firstRun) return;
    const done = () => setKeyShownDay(day?.day ?? 0);
    // The listener is armed only once the key is actually ON the glass: an
    // eager first tap must not retire a label she never got to see.
    const arm = setTimeout(() => document.addEventListener('pointerdown', done, true), KEY_IN_MS);
    const out = setTimeout(done, KEY_IN_MS + KEY_MS);
    return () => {
      clearTimeout(arm);
      clearTimeout(out);
      document.removeEventListener('pointerdown', done, true);
    };
  }, [firstRun]);

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
      {/* `--arming` is what buys the confirm its width — see the retire block
          in chrome.css. The chips step aside for the 2.6s the arm lives. */}
      <div className={`chr-right${armed ? ' chr-right--arming' : ''}`}>
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
        {/* THE ONE DESTRUCTIVE CONTROL IN THE GAME — and, until round 10, an
            unlabelled moon glyph sitting in a row of currency chips (AAA 11.7).
            It read as a theme toggle, which is the single worst thing an
            end-the-day control can be mistaken for, and the WORD only appeared
            after the first tap had already armed it: the player learned what
            she had touched from the confirm state itself.
            The recognisable verb leads now and never leaves ("Retire"); the
            moon is demoted to decoration beside it, ~0.8em and faint, so it
            can carry the house's voice without carrying the meaning. Arming
            escalates to the consequence in plain words ("End the day?") rather
            than to a punctuation mark, and takes the chips' room to say it.
            The two-tap arm/disarm is unchanged — it is the safety, and 11.7
            asks for legibility, not for a modal. */}
        {showRetire ? (
          <button
            className={`chr-retire${armed ? ' chr-retire--armed' : ''}`}
            onClick={onRetire}
            aria-label={
              armed
                ? 'End the day now — tap again to retire for the evening'
                : 'Retire for the evening — ends the day'
            }
          >
            {armed ? (
              <span className="chr-retire__word">End the day?</span>
            ) : (
              <>
                <span className="chr-retire__moon" aria-hidden="true">☾</span>
                <span className="chr-retire__word">Retire</span>
              </>
            )}
          </button>
        ) : null}
        {/* Hung UNDER the cluster (chrome.css `.chr-key`), so it costs the bar
            no width and can be read left-to-right against the three glyphs it
            names. Inert and one-time; see the note above `firstRun`. */}
        {firstRun && !armed ? (
          <span className="chr-key">
            <span className="chr-key__row">gems · keys · bookmarks</span>
            <span className="chr-key__row chr-key__row--note">
              only the bookmarks keep overnight
            </span>
          </span>
        ) : null}
      </div>
    </header>
  );
}
