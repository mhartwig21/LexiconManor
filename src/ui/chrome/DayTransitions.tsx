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
import type { AnimationEvent } from 'react';
import { useLocation } from 'wouter';
import { useManorStore } from '../../app/store';
import { sfx } from '../../app/sound';
import type { DayRecord, DayState } from '../../engine/types';
import { highestRowLine, nightTallyRows, NIGHT_TALLY_NOTE } from '../../engine/day';
import { dawnCarryOver, dawnCarryOverLines } from '../../app/slices/manor';
import {
  firstMorningPot, rowName, teaArcPoints, teaDawnPour, teaLandingPour, TEA_ARC, TEA_POUR,
} from '../../engine/economy/steps';
import { getVolumeContent } from '../../app/content/volumes';
import { arrivedLetters, legibleDroughtDays, openedLetterIds } from '../../engine/volume';
import { mantelLine, unseenKeepsakes } from '../moment/mantel';
import { getDialogueFile } from '../../engine/dialogue/content';
import { selectTaggedLine } from '../../engine/dialogue/select';
import DialogueScene from '../dialogue/DialogueScene';
import WhereaboutsAside from '../dialogue/WhereaboutsAside';
import UnreadMark from '../journal/UnreadMark';
import SealedMark from '../journal/SealedMark';
import { useJournalUnread } from '../journal/useJournalUnread';
import { ceremonyGate } from '../moment/ceremony';

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
        {/* ROUND 12 — the second marker, and the reason the first one is
            trustworthy again. Wax used to carry both "you have not looked at
            this" and "this is not deciphered yet", so it could not clear on
            viewing (AAA 11.20) and its count could not match the number of
            unviewed items (11.21). The backlog now has its own glyph — an open
            ink ring, never wax — and its own exact count. */}
        <SealedMark count={unread.sealed.total} showCount />
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

/**
 * ── THE SEAL DOES NOT PRESS INTO A SCENE (round 25; AAA 11.13 / 11.27) ──────
 *
 * Measured at 375×667 the night round 15's goodnight shipped: `elementFromPoint`
 * at the centre of BOTH `.chr-night__say` lines returned `span.mom__title` and
 * `span.mom__where` — the wax seal, parked in its usual band under the chrome
 * bar, sits exactly where a full-screen lifecycle scene puts its opening
 * paragraph. At 390×844 with a keepsake grant behind a letter grant, the first
 * line's centre returned `span.mom__where` too, and the queue is 5.6s + 4.0s:
 * on precisely the nights the conditioned beat exists to describe — she found
 * a page, she opened a letter, she earned a keepsake — Mrs. Bramble's goodnight
 * was illegible for about ten seconds and then gone with the scene.
 *
 * The layer already knows how to wait. `ceremonyGate` was built in round 12
 * for the introduction card: while it is held the seal renders nothing AND
 * does not arm its dwell timer, so the grant is not dismissed behind something
 * nobody saw (11.13) — it presses in the moment the scene hands off, on the
 * blueprint, where it has a board to name and a tap that means something.
 *
 * The morning card releases the gate when it opens Mrs. Bramble's
 * conversation: a dialogue overlay is not a full-glass ceremony, round 16
 * already made the seal an ordinary tappable card over one, and a grant made
 * inside a morning scene should land inside that scene.
 */
function useSceneCeremony(active = true): void {
  useEffect(() => {
    if (!active) return undefined;
    return ceremonyGate.hold();
  }, [active]);
}

const MORNING_LINES = [
  'Light through the tall windows. The manor is waiting.',
  'The kettle is already on.',
  'Somewhere upstairs, a door that was not there yesterday.',
  'The parquet is cold, the tea is not.',
  'Dewey was sleeping on the blueprint again.',
  'A good day for a long corridor.',
];

/**
 * ── THE LAST THING SHE READS (REVIEW_AA §5.11, round 24) ────────────────────
 *
 * This was a three-entry Record, keyed by end cause, and it was the whole of
 * the night: six consecutive evenings printed "An early night, well chosen."
 * or "The candles have burned down to their dishes." — alternating by nothing
 * but why the day stopped — over a step-refund total and two unread badges.
 * The morning gets six rotating lines AND a person; bedtime got a receipt.
 *
 * The night is now Mrs. Bramble's, authored on the engine's own `night`
 * trigger (which had been declared and mounted by nobody since the spine was
 * written), conditioned on what the day actually contained: a room left for
 * tomorrow, a page made out, a wrong word at the door, the first climb, a
 * question asked of somebody downstairs. These three strings survive as the
 * BACKSTOP ONLY — if the pool ever has nothing to say, the digest still ends
 * in a sentence rather than a blank.
 */
const NIGHT_FALLBACK = 'The candles have burned down to their dishes.';
const NIGHT_LINES: Record<string, string> = {
  'steps-exhausted': NIGHT_FALLBACK,
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
  // ROUND 23 (`TEA_POUR`): the cup is on the table; the rest of the pot is
  // waiting on the second landing. Two lines because they are two different
  // promises, and the second is the whole reason the ground floor is thin
  // again (REVIEW_AA §5.10).
  const cup = teaDawnPour(points);
  const carriedUp = teaLandingPour(points);
  const welcome = firstMorningPot(dayNumber);
  const carried = dawnCarryOver({ day, recentEvents });

  const rows: Array<[string, number]> = [];
  if (cup > 0) rows.push([`Her ${ordinal(dayNumber)} cup, poured at the door`, cup]);
  if (carriedUp > 0) {
    rows.push([`The rest of the pot, left on ${rowName(TEA_POUR.landingRow0)}`, carriedUp]);
  }
  // ── THE RAISE THAT READ AS A CUT (docs/COMPREHENSION.md, fix 11) ─────────
  // BASE_DAY_BUDGET is 18 on every day of the campaign; day 1 alone adds this
  // scripted pot. Two of three blind testers finished the session certain the
  // allowance had SHRUNK on day 2 — one filed it as a difficulty spike, one as
  // a punishment for having retired early — because day 1's header read 21 on
  // the build they played (`FIRST_MORNING_POT` was 3) and day 2's opens at 18
  // before her tea lands. The arithmetic was fixed at HEAD: the pot is 4 now
  // and round 23's TEA_POUR dawn cup makes the day-2 purse **22** — the same
  // number day 1 shows — from one affinity point on. This is the naming half,
  // and it is the half that matters,
  // because the row is where she is looking. Say it is a first morning's own
  // and only, and tomorrow's smaller list is not a demotion, it is the house
  // going back to normal.
  if (welcome > 0) rows.push(['A welcome cup — this first morning only', welcome]);
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

/**
 * ── WHAT IS WAITING, ON THE DAY IT CAN BE OPENED (REVIEW_AA §5.11) ──────────
 *
 * The post tray and the mantel, moved here off the night digest. Both are
 * derivations over the save (write-once flags and the letter tray), so they
 * survive the roll and a force-quit; both name a surface this card carries a
 * one-tap route to (11.12) — the Journal aside for the tray, Chronicles for
 * the mantel. The CABINET line is deliberately not reprinted on either scene:
 * neither carries a route to it, and 11.12 fails a scene that names a filed
 * document it cannot reach. Unseen plates keep their marker where the cabinet
 * actually is, on the blueprint's own entrance (ManorPage).
 */
function WaitingLines({ day }: { day: DayState }) {
  const records = useManorStore((s) => s.chronicles.dayRecords);
  const volume = useManorStore((s) => s.volume);
  const flags = useManorStore((s) => s.flags);
  const earned = useManorStore((s) => s.earnedAchievementIds);

  const content = getVolumeContent(volume.volumeId);
  const openedIds = content ? openedLetterIds(content.id, flags) : new Set<string>();
  const tray = content
    ? arrivedLetters(content, volume, day.day, {
        droughtDays: legibleDroughtDays(volume.volumeId, flags, records),
        openedIds,
      })
    : [];
  const waitingPost = waitingPostLine(tray.filter((l) => !openedIds.has(l.id)).length);
  const mantel = mantelLine(unseenKeepsakes(earned, flags).length, 0);

  /* ONE thing, the nearest one. Measured at 375×667 on a day-9 save with three
     sealed letters and four unseen keepsakes: both sentences in body type ran
     the card 17px past the fold, and both in caption type still ran it 24px
     past — and on a `justify-content: safe center` scene that means an
     internal scroll, which is the one shape the owner will not have. The post
     leads because it is today's; the mantel takes the line on the mornings the
     tray is clear. Neither channel loses its marker either way — the Journal
     aside carries the unread count and the Chronicles entrance the keepsake
     one (the 11.19 chain), and this caption was only ever the prose. */
  const line = waitingPost ?? mantel;
  if (!line) return null;
  return <p className="chr-wait">{line}</p>;
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
  useSceneCeremony(!greeting);
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
      {/* A6 seam (round 12): one thing Mrs. Bramble says in passing about
          somebody the player has not met — the whereabouts channel. It is
          HERE and not inside her conversation because her morning plays one
          node and the reaction band owns it; the measurement that settled
          that is in engine/dialogue/whereabouts.ts. Renders nothing on the
          two mornings in three that are not mention mornings, and nothing at
          all once the household is met, so the card grows no hole. */}
      <WhereaboutsAside />
      <WaitingLines day={day} />
      <DawnGrants day={day} />
      <button className="chr-scene__btn" onClick={() => setGreeting(true)}>
        Begin the day
      </button>
      <SceneAsides />
    </section>
  );
}

/**
 * The breath of held, finished dusk between the fade landing and the night
 * turning over. It came down from 1000ms when the fade went 3200 → 4000ms
 * (chrome.css `--chr-dusk-ms`): the fade is the part she is watching and the
 * hold is the part she is waiting through, so the extra 800ms was bought from
 * the waiting and the whole dusk still lands inside five seconds.
 */
const DUSK_HELD_MS = 700;

export function DuskVeil() {
  const advance = useManorStore((s) => s.advanceDayPhase);
  const soundOn = useManorStore((s) => s.settings.soundEnabled);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useSceneCeremony();

  useEffect(() => {
    if (soundOn) sfx.dusk();
    return () => { if (holdTimer.current) clearTimeout(holdTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once, on the veil falling
  }, []);

  /**
   * ── THE VEIL WAS ADVANCING ON SOMEBODY ELSE'S ANIMATION (round 39) ────────
   *
   * `onAnimationEnd` is a React synthetic handler and animation events BUBBLE,
   * so every child on this layer — the candle, the line, and now the vignette
   * on `::before`, whose events are dispatched at the host element itself —
   * was ending the dusk. Under the old timings the candle finished at 3000ms
   * against a 3200ms veil and the 1000ms hold covered the difference, so it
   * was invisible; the moment the candle was moved EARLY (which is the whole
   * point of round 39's choreography) it would have cut the fade off at 2000ms
   * and the night would have arrived before the dark did.
   *
   * So the veil listens for its own fade BY NAME.
   *
   * ROUND 53 — there is only one name now. Reduced motion used to swap the
   * veil to `chrDuskStill`, a 200ms cut to black, and this handler had to know
   * both; it runs the same `chrDuskFall` on the same clock as everybody else
   * (chrome.css, the reduced-motion block), because a cross-fade does not
   * travel and reduced motion is about travel. The two things that DID travel
   * — the vignette's scale and the line's rise — are still removed there.
   */
  const onFallen = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.animationName !== 'chrDuskFall') return;
    // Fade complete (AAA 4.12's ≤4s bar) — a breath of held dusk, then night.
    if (holdTimer.current) return;
    holdTimer.current = setTimeout(advance, DUSK_HELD_MS);
  };

  return (
    <div className="chr-dusk" onAnimationEnd={onFallen} role="status" aria-label="Dusk settles">
      {/* ROUND 8 composition pass: the veil measured a 372px featureless band
          — 44.1% of the glass — between the day bar and its own line, because
          everything it drew lived in the bottom 100px and the blueprint behind
          it had gone to shadow. The candle is the image the whole economy is
          already built on (the step meter IS a candle, chrome.css), so the
          middle of the veil now holds the one thing dusk means: it has gone
          out. Decorative and aria-hidden — the veil's own `role="status"`
          already announces dusk — and it inherits the veil's fade rather than
          animating on its own, so `prefers-reduced-motion` needs nothing extra
          (AAA U.3). */}
      <svg className="chr-dusk__candle" viewBox="0 0 64 96" aria-hidden focusable="false">
        <path d="M24 40h16v44a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M24 52q8 5 16 0" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.65" />
        <path d="M32 40v-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M32 30c0-5 5-6 3-11 4 3 6 7 3 11" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
        <path d="M12 88h40" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      </svg>
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
  // The prose is the day's STORY now, and the story is the climb. What the
  // manor gave back has gone down into the tally where it belongs — see
  // engine/day.ts NIGHT_TALLY_LABELS for why (COMPREHENSION fix 10).
  const climb = highestRowLine(record);
  // Round 6 (AAA 11.12): the post was the one campaign channel the digest
  // never mentioned — a letter could arrive, be read, and leave no trace
  // anywhere outside the journal tab nobody had a reason to open.
  const kept = nightTallyRows(record, lettersOpened);
  return (
    <>
      {climb && <p className="chr-digest__prose">{climb}</p>}
      {kept.length > 0 ? (
        <>
          <dl className="chr-digest">
            {kept.map(([label, n]) => (
              <Fragment key={label}>
                <dt>{label}</dt>
                <dd className="tabular-nums">{n}</dd>
              </Fragment>
            ))}
          </dl>
          <p className="chr-digest__note">{NIGHT_TALLY_NOTE}</p>
        </>
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

/**
 * ── THE GOODNIGHT (REVIEW_AA §5.11) ─────────────────────────────────────────
 *
 * Bramble's night beat, QUOTED rather than played: the digest stays a digest —
 * no portrait plate, no typewriter, no extra tap between the day and bed — and
 * the pacing valve is untouched, exactly as the Sanctum door quotes the
 * Portrait (AAA 4.16, `selectTaggedLine`). The chosen node IS marked seen, and
 * that is the whole rotation: the once-only beats (the first climb, the first
 * page made out, the night she nearly had it) retire after they land, and the
 * repeatable pool carries the ordinary evenings.
 *
 * Frozen at mount for the same reason every other scene freezes its query:
 * marking the node seen writes to the store, and a beat that re-selected
 * itself mid-scene would swap the words under her eyes.
 */
function NightBeat({ fallback }: { fallback: string }) {
  const buildDialogueQuery = useManorStore((s) => s.buildDialogueQuery);
  const markNodeSeen = useManorStore((s) => s.markNodeSeen);
  const [beat] = useState(() =>
    selectTaggedLine(getDialogueFile('bramble'), buildDialogueQuery('bramble', 'night'), 'bramble.night.'));
  const marked = useRef(false);

  useEffect(() => {
    if (!beat || marked.current) return;
    marked.current = true;
    markNodeSeen(beat.id, 'bramble');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the beat this night dealt
  }, []);

  if (!beat) return <p className="chr-scene__line">{fallback}</p>;
  return (
    <div className="chr-night">
      {beat.lines.map((l, i) => (
        <p key={i} className={`chr-night__say${l.narration ? ' chr-night__say--narration' : ''}`}>
          {l.narration ? l.text : `“${l.text}”`}
        </p>
      ))}
      <p className="chr-night__who">— Mrs. Bramble, turning down the lamps</p>
    </div>
  );
}

export function NightDigest() {
  const day = useManorStore((s) => s.day);
  const records = useManorStore((s) => s.chronicles.dayRecords);
  const startDay = useManorStore((s) => s.startDay);
  const recentEvents = useManorStore((s) => s.recentEvents);
  const [turning, setTurning] = useState(false);
  useSceneCeremony();
  if (!day) return null;

  const lettersOpened = recentEvents.filter(
    (e) => e.day === day.day && e.event.type === 'letter-opened',
  ).length;

  // The record banked at endDay for the closing day.
  let record: DayRecord | undefined;
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (r && r.day === day.day) { record = r; break; }
  }
  const fallback = NIGHT_LINES[record?.cause ?? 'steps-exhausted'] ?? NIGHT_FALLBACK;

  const onTomorrow = () => {
    if (turning) return;
    setTurning(true);
    startDay(); // night → next morning; the manor resets, the journal keeps
  };

  /* ROUND 24 — WHAT THE NIGHT NO LONGER SAYS (REVIEW_AA §5.11).
     The waiting-post and mantel lines moved to the MORNING card. Measured
     live across six consecutive nights, they were the only two lines besides
     the mood string that ever appeared, and both were nags: "A keepsake you
     have not looked at sits on the mantel." printed identically every single
     night, over "N letters wait unopened in the post tray." Blue Prince ends a
     run on a discovery; this ended on a chore list — and on the one screen
     where the correct answer to a chore is "tomorrow". They now open the day
     they can actually be acted on, on a card that carries a route to both
     (11.12: the Journal aside for the tray, Chronicles for the mantel). */
  return (
    <section className="chr-scene chr-scene--enter" aria-label="Night">
      <h1 className="chr-scene__title">Night</h1>
      <hr className="chr-scene__rule" />
      <NightBeat fallback={fallback} />
      {record ? <NightLedger record={record} lettersOpened={lettersOpened} /> : null}
      <button className="chr-scene__btn" onClick={onTomorrow}>
        To tomorrow
      </button>
      <SceneAsides />
    </section>
  );
}
