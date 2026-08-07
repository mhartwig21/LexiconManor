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
import { useLocation } from 'wouter';
import { useManorStore } from '../../app/store';
import { sfx } from '../../app/sound';
import type { DayRecord, DayState } from '../../engine/types';
import { highestRowLine, refundLine } from '../../engine/day';
import { dawnCarryOver, dawnCarryOverLines } from '../../app/slices/manor';
import { firstMorningPot, teaArcPoints, teaBonus, TEA_ARC } from '../../engine/economy/steps';
import { getVolumeContent } from '../../app/content/volumes';
import { arrivedLetters, fragmentDroughtDays, openedLetterIds } from '../../engine/volume';
import { mantelLine, unseenKeepsakes, unseenPlates } from '../moment/mantel';
import DialogueScene from '../dialogue/DialogueScene';
import UnreadMark from '../journal/UnreadMark';
import { useJournalUnread } from '../journal/useJournalUnread';

/**
 * THE SCENE'S OWN ROUTE TO SETTINGS (AAA 11.24, round-9 major).
 *
 * Measured from the morning card, the minimum path to the blueprint — and
 * therefore to the only Chronicles entrance in the app — was 3 taps ("Begin the
 * day" → "Skip" → "Farewell"), and 14 if she actually READ Mrs. Bramble rather
 * than skipping her. Settings then cost the usual 2: five taps at the start of
 * every single day, sixteen if she is reading. The night digest had the same
 * shape ("To tomorrow" → the next morning card → a conversation). 11.24 allows
 * either a one-tap dismissal or the scene's own route to settings; "Begin the
 * day" is not a dismissal (it opens a conversation), so the scenes carry the
 * route. 11.25 is the reason it has to be this one and not a deeper link: a
 * player opening the app because it moved too much, or was too loud, must be
 * able to turn that off without sitting through the thing she is turning off.
 *
 * GameChrome suppresses the lifecycle scenes while the player is standing on
 * /chronicles, so this really lands on the page; the phase is untouched and the
 * scene is exactly where she left it when she comes back.
 */
export function SceneSettingsLink() {
  const [, navigate] = useLocation();
  return (
    <button
      type="button"
      className="chr-scene__aside"
      onClick={() => { sfx.tap(); navigate('/chronicles'); }}
    >
      Chronicles
      <span className="chr-scene__aside-sub">sound, motion, the trunk</span>
    </button>
  );
}

/**
 * THE SCENE'S OWN ROUTE TO THE JOURNAL (AAA 4.15 / 11.12, round-11 major).
 *
 * The morning card and the night digest are full-screen scenes the player
 * stands on EVERY day, and until this landed their only controls were the
 * primary advance and the Chronicles aside. Measured live from the morning
 * card, the cheapest path to a filed document was NINE taps: dismiss the card,
 * play Mrs. Bramble's whole morning conversation to reach `exploring`, then tap
 * Journal on the blueprint footer. The night digest was worse in kind, because
 * it PRINTS the waiting-post and mantel prose — it tells her a letter has
 * arrived on a surface from which she cannot open it, and the next morning's
 * card then stands between her and it.
 *
 * 4.15 and 11.12 both say ≤2 taps from anywhere, and "anywhere" plainly
 * includes the two screens she cannot avoid. The argument is the one 11.24
 * already accepted for Chronicles: the aside exists because the surface she is
 * trying to reach is the surface the scene is TALKING ABOUT. A seal that says
 * "Filed in the Journal · Testimony" and a digest that says "A letter waits
 * unopened in the post tray" are both directions to a room with no door on
 * them.
 *
 * It is rendered unconditionally rather than gated on unread, because 4.15's
 * promise is about any document EVER seen, not about new ones: re-reading last
 * week's engraving from the morning card must cost the same two taps as
 * opening tonight's letter. The unread mark rides on it when there is
 * something new, which also keeps the 11.19 chain unbroken at this new
 * entrance — the same mark, the same count, off the same derivation as the
 * blueprint footer's.
 */
export function SceneJournalLink() {
  const [, navigate] = useLocation();
  const unread = useJournalUnread();
  return (
    <button
      type="button"
      className="chr-scene__aside unread-host"
      onClick={() => { sfx.tap(); navigate('/journal'); }}
    >
      <span className="chr-scene__aside-label">
        Journal
        <UnreadMark
          count={unread.total}
          noun={unread.total === 1 ? 'thing in the journal' : 'things in the journal'}
          showCount
        />
      </span>
      <span className="chr-scene__aside-sub">what the manor has filed</span>
    </button>
  );
}

/**
 * The two stand-asides, in one row so the scene keeps its vertical room at
 * 375×667. Chronicles stays FIRST in the DOM: it is the older affordance and
 * the live walks address it as `.chr-scene__aside`.
 */
function SceneAsides() {
  return (
    <div className="chr-scene__asides">
      <SceneSettingsLink />
      <SceneJournalLink />
    </div>
  );
}

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

/** "her fourth pot" — pots are poured one a morning, so the day IS the count. */
const ORDINALS = [
  '', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth',
  'ninth', 'tenth', 'eleventh', 'twelfth',
];
function ordinal(n: number): string {
  return ORDINALS[n] ?? `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
}

/**
 * ── THE POT, NAMED WHERE IT IS POURED (AAA 4.9 / 4.10d / 11.16, round 7) ───
 *
 * The single largest step grant in the game used to arrive in silence: the tea,
 * the welcome pot and yesterday's carry-over are all appended inside
 * `startDay`, the StepMeter classified that batch as "a new day, no floats",
 * and the header is covered by this very card anyway. Nothing in the shipped
 * UI ever said the tea GROWS, what it is worth today, or what the next rung
 * costs — so weeks of friendship read as "some mornings I have more steps".
 *
 * The card now itemises the morning where her eyes already are, and says what
 * buys the next rung. (The floating +N still fires too — StepMeter holds the
 * dawn batch until this card is dismissed, so it lands on the blueprint.)
 */
function DawnGrants({ day }: { day: DayState }) {
  const recentEvents = useManorStore((s) => s.recentEvents);
  const known = useManorStore((s) => s.affinities.bramble ?? 0);
  const dayNumber = day.day;
  // What today's pot comes to once she has sat down with her (the shared
  // morning tops it up as the scene closes — DaySlice.shareMorningTea).
  const points = Math.max(known, teaArcPoints(dayNumber));
  const pot = teaBonus(points);
  const welcome = firstMorningPot(dayNumber);
  const carried = dawnCarryOver({ day, recentEvents });

  const rows: Array<[string, number]> = [];
  if (pot > 0) rows.push([`Her ${ordinal(dayNumber)} pot`, pot]);
  if (welcome > 0) rows.push(['A welcome cup, poured before you asked', welcome]);
  if (carried.steps > 0) rows.push(['What yesterday left steeping', carried.steps]);

  // The next rung, named. `teaArcPoints` is the ceiling shared mornings buy;
  // it moves every `morningsPerPoint` days, so this is a promise, not a tease.
  const atTop = points >= TEA_ARC.maxPoints;
  const nextRungDay = TEA_ARC.morningsPerPoint * (points + 1);
  const mornings = Math.max(1, nextRungDay - dayNumber);
  const rung = atTop
    ? 'She fills it to the brim now; there is no more pot to give.'
    : mornings === 1
      ? 'One more morning like this and she pours a little deeper.'
      : `${mornings} more mornings like this and she pours a little deeper.`;

  if (rows.length === 0) {
    return <p className="chr-dawn__rung">{rung}</p>;
  }
  return (
    <div className="chr-dawn">
      <dl className="chr-dawn__list">
        {rows.map(([label, n]) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd className="tabular-nums">+{n} steps</dd>
          </Fragment>
        ))}
      </dl>
      <p className="chr-dawn__rung">{rung}</p>
    </div>
  );
}

export function MorningCard() {
  const day = useManorStore((s) => s.day);
  const advance = useManorStore((s) => s.advanceDayPhase);
  // The tea arc is BOUGHT, not clocked (AAA 4.10d): the point lands when this
  // scene has actually played, and the pot tops up with it.
  const shareMorningTea = useManorStore((s) => s.shareMorningTea);
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
    const closeMorning = () => { shareMorningTea(); advance(); };
    return <DialogueScene character="bramble" slot="morning" onClose={closeMorning} />;
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
      <DawnGrants day={day} />
      <button className="chr-scene__btn" onClick={() => setGreeting(true)}>
        Begin the day
      </button>
      <SceneAsides />
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
function NightLedger({ record, lettersOpened }: { record: DayRecord; lettersOpened: number }) {
  const climb = highestRowLine(record);
  const gave = refundLine(record);
  const rows: Array<[string, number]> = [
    ['Rooms drafted', record.roomsDrafted],
    ['Rooms solved', record.roomsSolved],
    ['Steps spent', record.stepsSpent],
    ['Fragments found', record.fragmentsFound],
    // Round 6 (AAA 11.12): the post was the one campaign channel the digest
    // never mentioned — a letter could arrive, be read, and leave no trace
    // anywhere outside the journal tab nobody had a reason to open.
    ['Letters read', lettersOpened],
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

/** "A letter waits" / "Two letters wait" — counted in words, never a badge. */
const COUNT_WORDS = ['no', 'A', 'Two', 'Three', 'Four', 'Five', 'Six'];
function waitingPostLine(n: number): string | null {
  if (n <= 0) return null;
  if (n === 1) return 'A letter waits unopened in the post tray.';
  const word = COUNT_WORDS[n] ?? String(n);
  return `${word} letters wait unopened in the post tray.`;
}

export function NightDigest() {
  const day = useManorStore((s) => s.day);
  const records = useManorStore((s) => s.chronicles.dayRecords);
  const startDay = useManorStore((s) => s.startDay);
  // The post, read back with the rest of the day (AAA 11.12): what she opened
  // today, and what is still sealed. Both are derivations over the save — they
  // survive the day roll and a force-quit, which a moment on glass cannot.
  const volume = useManorStore((s) => s.volume);
  const flags = useManorStore((s) => s.flags);
  const recentEvents = useManorStore((s) => s.recentEvents);
  // ROUND 9 (AAA 11.12): the mantel was the last campaign channel with no line
  // here. A keepsake could be banked at the day roll and a floorplan plate
  // filled by a favour, and the digest — the one surface that reads the day
  // back — said nothing, exactly as the post used to. Both are derivations over
  // write-once flags, so they survive the roll and a force-quit.
  const earned = useManorStore((s) => s.earnedAchievementIds);
  const unlockedCardIds = useManorStore((s) => s.cabinet.unlockedCardIds);
  const [turning, setTurning] = useState(false);
  if (!day) return null;

  const mantel = mantelLine(
    unseenKeepsakes(earned, flags).length,
    unseenPlates(unlockedCardIds, flags).length,
  );

  const content = getVolumeContent(volume.volumeId);
  const openedIds = content ? openedLetterIds(content.id, flags) : new Set<string>();
  const tray = content
    ? arrivedLetters(content, volume, day.day, {
        droughtDays: fragmentDroughtDays(records),
        openedIds,
      })
    : [];
  const waitingPost = waitingPostLine(tray.filter((l) => !openedIds.has(l.id)).length);
  const lettersOpened = recentEvents.filter(
    (e) => e.day === day.day && e.event.type === 'letter-opened',
  ).length;

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
      {record ? <NightLedger record={record} lettersOpened={lettersOpened} /> : null}
      {waitingPost && <p className="chr-digest__prose">{waitingPost}</p>}
      {mantel && <p className="chr-digest__prose">{mantel}</p>}
      <button className="chr-scene__btn" onClick={onTomorrow}>
        To tomorrow
      </button>
      <SceneAsides />
    </section>
  );
}
