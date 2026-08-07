/**
 * The Sanctum — OWNER: A7 (Mystery). The game's climax screen.
 *
 * The door at the top of the manor does not want a key: it wants the word
 * typed, once a day (MANOR_DESIGN §7). A wrong guess costs nothing but the
 * daily attempt — the Portrait answers with a sympathetic sigh keyed to
 * closeness (shared letters / right length / repeat, AAA 4.17), and the
 * guess is journaled as her own elimination history. A thin case file gets
 * an explicit nudge, never silence — and never a gate: the volume is
 * solvable from day one (AAA 4.16 / 4.18).
 *
 * The win sequence (seal cracks → letters come home → the Portrait softens
 * → the volume closes) is staged in taps, every stage skippable, legible
 * under reduced motion.
 *
 * The Portrait's reactions are AUTHORED dialogue, not hardcoded strings: both
 * the sigh after a wrong guess and the victory monologue mount A6's
 * DialogueScene on the 'sanctum-after-guess' slot (portrait.guess.* closeness
 * variants, the once-only thaw arc, portrait.react.victory — Hades' "failure
 * as content", AAA 4.17/5.1/5.10). The old hardcoded strings survive only as
 * the null-selection fallback so the door is never silent.
 *
 * THE LANDING IS ALSO HIS HAUNT (MANOR_DESIGN §8: "The Portrait — Landing
 * outside the Sanctum"). Nothing else in the manor ever mounted a scene for
 * him, so his entire 'parlor' set — the first-meeting chain, both arc beats,
 * the general pool — and, through the pacing valve that retargets it, his
 * whole 'idle' pool including the testimony that files v1-t5, were dead
 * content in the shipped build. The audience button below is that mount; the
 * per-(character, trigger) manifest in engine/dialogue/validate.ts now fails
 * the build rather than letting it happen a fourth time.
 *
 * ROUND-8 DEFECT: THE CLIMAX WITH NO CLIMB (AAA 4.16 / 5.1, MANOR_DESIGN §7).
 *
 * Measured live: day 2, standing in the Entrance Hall, zero fragments,
 * reached by tapping "Take it to the Sanctum" in the journal — and he opened
 * with "So you have climbed far enough to ask." He was addressing someone who
 * had climbed nothing, because the door was a menu item. Everything staged on
 * top of it said so too: the thin-file nudge, the "Back down the stairs"
 * back-link, and tests/volume-pacing.test.ts's model of his testimony being
 * "delivered only on a day she reaches the Sanctum landing" — which in the
 * shipped game was any day at all.
 *
 * Two changes close it, and they belong together:
 *   1. THE DOOR IS A PLACE. The guess row, his audience, the arrival lines
 *      and the heading itself are gated on `atDoor` — she is on the landing
 *      cell AND the room she drafted there drew a north door. Read from
 *      downstairs this is THE STAIRWELL: the Portrait, the struck-through
 *      list, the nudge and the fragment count all stay readable (they are
 *      journal-class information, AAA 4.15/4.16) and the page keeps its
 *      BackLink, so nothing about it is a dead end (AAA 11.1/11.3). The
 *      blueprint's own Sanctum hit is the way in (AAA 11.9).
 *   2. HE SPEAKS TO THE WALK SHE HAD. `arrivalShade` (engine/journal.ts)
 *      classifies it first / spent / again exactly as `guessVerdict`
 *      classifies a refused word, and the authored `portrait.arrive.*`
 *      variants are keyed by it. First arrival is a real first arrival now,
 *      recorded write-once as `vol.<id>.landing-reached`.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useManorStore } from '../../app/store';
import { getVolumeContent } from '../../app/content/volumes';
import {
  arrivalShade, definitionSlots, guessVerdict, landingFlag, sanctumReadiness,
  type ArrivalShade,
} from '../../engine/journal';
import { applyGuess, hasGuessedOnDay, sealedFragmentIds } from '../../engine/volume';
import { atSanctumDoor } from '../../engine/manor/grid';
import type { GuessCloseness } from '../../engine/events';
import type { PortraitExpression } from '../../engine/dialogue/schema';
import { getDialogueFile } from '../../engine/dialogue/content';
import { selectDialogue, selectTaggedLine } from '../../engine/dialogue/select';
import DialogueScene from '../dialogue/DialogueScene';
import BackLink from '../chrome/BackLink';
import { sfx } from '../../app/sound';
import { quoted } from '../journal/quote';
import PortraitFrame from './PortraitFrame';
import './sanctum.css';

type Phase =
  | 'idle'          // the door waits
  | 'listening'     // suspense beat after Speak
  | 'wrong'         // the sigh
  | 'won-reveal'    // seal cracks, letters come home
  | 'won-portrait'  // the Portrait softens (tap-through beats)
  | 'epilogue';     // the volume closes

/** Fallback sigh when dialogue selection has nothing for the slot (authoring
 *  floor) — the authored portrait.guess.* variants normally play instead.
 *  Keyed off the SAME five-shade taxonomy the journal files and his authored
 *  variants are prioritised by, so the fallback can never contradict them. */
const FALLBACK_SIGHS: Readonly<Record<ReturnType<typeof guessVerdict>, string>> = {
  repeat: 'That word again. The door has heard it once, and once was its full measure.',
  'right-shape': 'The right length of silence. The wrong silence.',
  circling: 'No. Though some of those letters do belong to it. I shall say no more.',
  'one-letter': 'One letter of it, and one letter is not a word. Strike it through.',
  cold: 'Not one of its letters, I am afraid. Strike it through; the list grows more honest as it shortens.',
};

function sighFor(c: GuessCloseness): string {
  return FALLBACK_SIGHS[guessVerdict(c)];
}

/** Fallback openings, one per arrival shade (engine/journal.arrivalShade) —
 *  the authored portrait.arrive.* variants normally play instead. Same
 *  contract as FALLBACK_SIGHS: the taxonomy is shared with the authored
 *  content, so a fallback can never say something the writing contradicts.
 *  None of them may congratulate a climb that did not happen — that is the
 *  whole round-8 defect, and 'first' is the ONLY one that gets to. */
const FALLBACK_ARRIVALS: Readonly<Record<ArrivalShade, string>> = {
  first: 'So. You climbed it, and the last stair squeaked, and here you are. Very well: the door wants no key. It wants the word. One a day, spoken plainly.',
  again: 'Up again. One word a day, reader, whenever you are sure of one — the door keeps no other appointment.',
  spent: 'You have nothing left in your legs and you spent it getting here. Say your word if you have one; the door is in no hurry either way.',
};

/** Fallback closing beats when portrait.react.victory cannot be selected
 *  (e.g. already seen on a later volume) — tapped through, each skippable. */
const CLOSING_BEATS = [
  '…So. Spoken at last. And not by me.',
  'I struck it from every page, because a book with a hole in it cannot be finished — and a finished book can be shelved, and a shelved book can be forgotten. I see now that the hole was the living part.',
  'The word is rehoused. The house thanks you. And — unaccustomed as it is to the exercise — so do I.',
] as const;

export default function SanctumView() {
  const [, navigate] = useLocation();
  const volume = useManorStore((s) => s.volume);
  const day = useManorStore((s) => s.day?.day ?? s.volume.day);
  const dayActive = useManorStore((s) => s.day !== null && (s.day.phase === 'morning' || s.day.phase === 'exploring'));
  const guessAtSanctum = useManorStore((s) => s.guessAtSanctum);
  /**
   * ── THE DOOR IS A PLACE (AAA 4.10e). ─────────────────────────────────────
   * The word is spoken from the landing at (2,5), through that room's north
   * door — the one shared predicate the blueprint draws its approach with
   * (engine/manor/grid.ts `atSanctumDoor`), and the same one the store's
   * `guessAtSanctum` refuses without. Everything else on this screen stays
   * readable from anywhere: the Portrait, the struck-through list, the nudge
   * are journal-class information (AAA 4.15/4.16).
   */
  const atDoor = useManorStore((s) => atSanctumDoor(s.manor));
  const beginNextVolume = useManorStore((s) => s.beginNextVolume);
  const endDay = useManorStore((s) => s.endDay);
  const buildDialogueQuery = useManorStore((s) => s.buildDialogueQuery);
  // The walk-up, as facts (round-8 defect, see the module header). `atDoor`
  // above is the same predicate; these are what let him speak to WHICH walk.
  const flags = useManorStore((s) => s.flags);
  const setFlag = useManorStore((s) => s.setFlag);
  const stepsLeft = useManorStore((s) => s.stepsRemaining());

  const content = getVolumeContent(volume.volumeId);

  const [phase, setPhase] = useState<Phase>('idle');
  const [beat, setBeat] = useState(0);
  const [guess, setGuess] = useState('');
  const [shaking, setShaking] = useState(false);
  const [sigh, setSigh] = useState<string | null>(null);
  // Whether the current wrong/victory beat plays as an authored DialogueScene
  // (decided ONCE on entering the phase — selection mutates seen-state while
  // the scene runs, so it must not be re-derived per render).
  const [wrongScene, setWrongScene] = useState(false);
  const [victoryScene, setVictoryScene] = useState(false);
  /** The landing audience — his 'parlor' haunt (see the module header). */
  const [audience, setAudience] = useState(false);
  const [sceneExpression, setSceneExpression] = useState<PortraitExpression | null>(null);

  /** Would the 'sanctum-after-guess' slot actually select an authored node
   *  right now? (selectDialogue never returns silence — it falls back to the
   *  idle pool — so we check the selected node's trigger, not just null.) */
  const pickAfterGuess = () => {
    const node = selectDialogue(
      getDialogueFile('portrait'),
      buildDialogueQuery('portrait', 'sanctum-after-guess'),
    );
    return node && node.trigger === 'sanctum-after-guess' ? node : null;
  };
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /**
   * First arrival is captured BEFORE the write-once flag lands, and held for
   * the whole visit — otherwise setting the flag would immediately demote his
   * opening from "you climbed it" to "up again" mid-scene.
   */
  const landingSeenFlag = landingFlag(volume.volumeId);
  const firstArrival = useRef<boolean | null>(null);
  if (atDoor && firstArrival.current === null) {
    firstArrival.current = !flags.includes(landingSeenFlag);
  }
  useEffect(() => {
    if (atDoor && !flags.includes(landingSeenFlag)) setFlag(landingSeenFlag);
  }, [atDoor, flags, landingSeenFlag, setFlag]);
  const shade = arrivalShade({ firstEver: firstArrival.current ?? false, stepsLeft });

  // Arriving at an already-solved volume: the door stands open.
  const alreadySolved = volume.status === 'solved' && phase === 'idle';

  if (!content) {
    return (
      <div className="snc-page">
        <div className="snc">
          <BackLink className="snc__nav" flavour="Back down the stairs" />
          <p className="snc-line">The landing is dark. The Portrait is elsewhere.</p>
        </div>
      </div>
    );
  }

  const guessedToday = hasGuessedOnDay(volume, day);
  // Round 11: the gate counts pages she can READ. Four sealed smudges used to
  // retire his thin-file nudge — the one AAA 4.16 signal — for a player with
  // no constraint at all on the alphabet plate.
  const readiness = sanctumReadiness(content, volume, {
    sealedIds: sealedFragmentIds(volume.volumeId, flags),
  });
  const wrongGuesses = volume.guesses.filter(
    (g) => !content.accepted.some((a) => a.toUpperCase().replace(/[^A-Z]/g, '') === g.guess),
  );
  const answer = content.answer.toUpperCase();

  /**
   * The landing audience (MANOR_DESIGN §8). Mounts his 'parlor' pool; the
   * 5.9 valve retargets a second visit the same day to his idle pool, which
   * is where the keepsake scene and the testimony that files v1-t5 live.
   * Available after the volume closes too — portrait.gen.after is gated on
   * the solved flag and has nowhere else to play.
   */
  const audienceButton = (
    <button type="button" className="snc-audience" onClick={() => { sfx.tap(); setAudience(true); }}>
      Speak with the Portrait
    </button>
  );
  const audienceScene = audience ? (
    <DialogueScene character="portrait" slot="parlor" onClose={() => setAudience(false)} />
  ) : null;

  /**
   * The insufficient-info nudge (AAA 4.16) is HIS line, quoted from the
   * authored JSON (portrait.gate.*) — not engine prose in the housekeeper's
   * voice. Rendered, not played: no valve spent, nothing marked seen.
   *
   * These ride their own `sanctum-idle` trigger rather than `idle`. On `idle`
   * they were eligible in his ordinary rotation, so a parlor visit could serve
   * "your journal is empty" as small talk; the door screen is the only place
   * that sentence means anything.
   */
  const gateNode =
    readiness.enough || guessedToday || volume.status === 'solved'
      ? undefined
      : selectTaggedLine(
          getDialogueFile('portrait'),
          buildDialogueQuery('portrait', 'sanctum-idle'),
          'portrait.gate.',
        );

  /** His opening, keyed to the walk she actually had — rendered, not played,
   *  exactly like the gate lines above (no valve spent, nothing marked seen). */
  const arriveNode = selectTaggedLine(
    getDialogueFile('portrait'),
    buildDialogueQuery('portrait', 'sanctum-idle'),
    `portrait.arrive.${shade}`,
  );

  const speak = () => {
    if (phase !== 'idle' || guessedToday || !guess.trim()) return;
    if (!atDoor) return;   // the second gate — see `atDoor` above (AAA 4.10e)
    // Pure preview of the outcome; the store applies the same transition.
    const { result } = applyGuess(content, volume, guess, day);
    if (result.kind === 'empty' || result.kind === 'gate') return;
    sfx.tap();
    guessAtSanctum(guess);
    setGuess('');
    setPhase('listening');
    const holdMs = matchMedia('(prefers-reduced-motion: reduce)').matches ? 250 : 1000;
    later(() => {
      if (result.kind === 'solved') {
        sfx.victory();
        setPhase('won-reveal');
      } else if (result.kind === 'wrong') {
        sfx.dusk();
        // The 'sanctum-guess-wrong' event (with closeness metadata) is already
        // on the stream — guessAtSanctum recorded it — so the authored
        // portrait.guess.* variants and the thaw arc are selectable now.
        const node = pickAfterGuess();
        setWrongScene(!!node);
        setSceneExpression(node?.lines[0]?.portrait ?? null);
        setSigh(node ? null : sighFor(result.closeness));
        setShaking(true);
        later(() => setShaking(false), 360);
        setPhase('wrong');
      }
    }, holdMs);
  };

  /** won-reveal → won-portrait: decide once whether portrait.react.victory
   *  plays (authored 4-beat monologue) or the fallback CLOSING_BEATS. */
  const enterWonPortrait = () => {
    const node = pickAfterGuess();
    setVictoryScene(!!node);
    setSceneExpression(node?.lines[0]?.portrait ?? null);
    setBeat(0);
    setPhase('won-portrait');
  };

  const closeVolume = () => {
    beginNextVolume();
    if (dayActive) endDay('volume-solved');
    navigate('/');
  };

  /**
   * THE CEREMONY'S WAY OUT (AAA 11.1 — round-10 blocker, decided rather than
   * excused).
   *
   * `won-reveal` and the CLOSING_BEATS variant of `won-portrait` advanced
   * FORWARD only: every control on them ("Look up at the Portrait", "…",
   * "Let him rest") went deeper into the ceremony, none returned toward the
   * blueprint, and there is no auto-advance — so neither surface satisfied
   * 11.1, whose one exemption is an unconditional auto-advance of ≤2s.
   *
   * The choice was: carry a BackLink through, or write a forward-only
   * exception into docs/AAA_BAR.md. Neither, exactly — both would have been
   * wrong here, and for the same reason. A plain BackLink would have LEFT the
   * volume open: the ceremony's terminal button is the only caller of
   * `beginNextVolume()` + `endDay('volume-solved')` anywhere in the app, and
   * the `alreadySolved` screen she would return to does not offer it. So a
   * "way back" would have been a way to strand the campaign's roll-over. And a
   * documented exception would have kept the single biggest, unrepeatable
   * scene in the game as the one surface with no exit — on a phone, in a house
   * with no browser back button.
   *
   * So the ceremony's OWN terminal action is offered from its first beat:
   * `Let the house sleep` does exactly what the epilogue's button does — closes
   * the volume properly and returns to the blueprint. Forward-only stays the
   * default path for anyone who wants the whole ceremony; the exit is a quiet
   * aside beside it, never the loud one. It also satisfies U.2 (every
   * celebration is tap-skippable) with the same control.
   */
  const ceremonyExit = (
    <button
      type="button"
      className="snc-btn snc-btn--aside"
      onClick={(e) => { e.stopPropagation(); closeVolume(); }}
    >
      <span className="snc-btn__label">Let the house sleep</span>
      <span className="snc-btn__sub">the journal keeps the rest</span>
    </button>
  );

  // The portrait softens only once the win is *shown* (not during the
  // listening beat, even though the store already knows).
  const soft =
    phase === 'won-reveal' || phase === 'won-portrait' || phase === 'epilogue' ||
    (volume.status === 'solved' && phase === 'idle');

  // ------ Win staging ------
  //
  // ROUND 9 (AAA 11.5, blocker). The ceremony phases below are MODAL and say
  // so with `data-overlay`. They render `.snc-page`, which is not `.dlg`,
  // `.bp-modal` or `.chr-scene`, so neither lock in ui/chrome (the `:has()`
  // rule in chrome.css, and DayHeader's `useOverlayOpen()` unmount) knew a
  // scene was up: the destructive `.chr-retire` moon stayed MOUNTED and
  // hit-testable at 334,4,44x44 straight through the won-reveal card, and two
  // taps there ended the day mid-ceremony — the dusk veil dropping over "Look
  // up at the Portrait" during the campaign's single biggest, unrepeatable
  // moment. `data-overlay` is the published opt-in contract
  // (ui/chrome/layers.ts OVERLAY_SELECTOR); one attribute closes both locks.
  // Regression-tested live by the ceremony row in tests/modal-hit-test.mjs.
  if (phase === 'won-reveal') {
    return (
      <div className="snc-page" data-overlay>
        <div className="snc" onClick={enterWonPortrait}>
          <PortraitFrame soft />
          <div className="snc-won">
            <div className="snc-seal-halves" aria-hidden>
              <span className="snc-seal-half snc-seal-half--l" />
              <span className="snc-seal-half snc-seal-half--r" />
            </div>
            <div className="snc-reveal" aria-label={`The word was ${answer}`}>
              {[...answer].map((ch, i) => (
                <span key={i} className="snc-reveal__ch" style={{ animationDelay: `${i * 110}ms` }}>{ch}</span>
              ))}
            </div>
            <p className="snc-won__line">The seal parts. Somewhere below, every dictionary in the house grows one line longer.</p>
            <button className="snc-btn snc-btn--primary" onClick={(e) => { e.stopPropagation(); enterWonPortrait(); }}>
              Look up at the Portrait
            </button>
            {ceremonyExit}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'won-portrait') {
    // The authored victory monologue (portrait.react.victory, priority 1000,
    // conditioned on today's 'volume-solved') — journal summary + expressions
    // + typewriter all come from A6's scene. CLOSING_BEATS only if selection
    // came back empty.
    if (victoryScene) {
      return (
        <div className="snc-page" data-overlay>
          <div className="snc">
            <PortraitFrame soft expression={sceneExpression ?? undefined} />
            <h2 className="snc__title">The Lexicographer</h2>
            <DialogueScene
              character="portrait"
              slot="sanctum-after-guess"
              onClose={() => setPhase('epilogue')}
            />
          </div>
        </div>
      );
    }
    const last = beat >= CLOSING_BEATS.length - 1;
    const advance = () => {
      if (last) setPhase('epilogue');
      else { sfx.tap(); setBeat(beat + 1); }
    };
    return (
      <div className="snc-page" data-overlay>
        <div className="snc" onClick={advance}>
          <PortraitFrame soft />
          <h2 className="snc__title">The Lexicographer</h2>
          <p className="snc-line" key={beat}>{CLOSING_BEATS[beat]}</p>
          <button className="snc-btn" onClick={(e) => { e.stopPropagation(); advance(); }}>
            {last ? 'Let him rest' : '…'}
          </button>
          {/* On EVERY beat, not only the early ones. 11.1 is a per-surface
              promise and the beat is the surface: a player who taps to the
              last line and then wants out must not have to pass through one
              more screen to find the door. */}
          {ceremonyExit}
        </div>
      </div>
    );
  }

  if (phase === 'epilogue' || alreadySolved) {
    const slots = definitionSlots(content, volume);
    // Modal only while the CEREMONY is running. The `alreadySolved` variant is
    // an ordinary page — it carries a BackLink and the player may legitimately
    // retire from it — so it must NOT claim modality (11.21's "no marker where
    // nothing is unread", applied to the overlay signal: a page that lies about
    // being modal disables the chrome for no reason).
    return (
      <div className="snc-page" {...(phase === 'epilogue' ? { 'data-overlay': '' } : {})}>
        <div className="snc">
          <BackLink className="snc__nav" flavour="Back down the stairs" />
          <PortraitFrame soft />
          <div className="snc-epilogue">
            <div className="snc-epilogue__word">{answer}</div>
            <div className="snc-epilogue__poem">
              {slots.map((s) =>
                s.fragment ? (
                  <span key={s.revealOrder}>{quoted(s.fragment.text)}</span>
                ) : (
                  <span key={s.revealOrder} style={{ letterSpacing: '0.3em' }}>— · —</span>
                ),
              )}
            </div>
            <div className="snc-epilogue__closed">
              Volume I — {content.title} · closed on day {volume.guesses[volume.guesses.length - 1]?.day ?? day}
            </div>
          </div>
          {phase === 'epilogue' ? (
            <button className="snc-btn snc-btn--primary" onClick={closeVolume}>Let the house sleep</button>
          ) : (
            <>
              <p className="snc-line--nudge snc-line">
                The door stands open now. The journal keeps the whole of it, should you want to reread him.
              </p>
              {audienceButton}
            </>
          )}
        </div>
        {audienceScene}
      </div>
    );
  }

  // ------ The daily audience ------
  const portraitLine =
    phase === 'listening' ? null
    : phase === 'wrong' ? (sigh ?? '…')
    // Read from below (the journal's pointer, a returning visit): he is happy
    // to be consulted, and says plainly where the door is. Never a scolding —
    // the climb is the price, not a punishment (AAA 4.10e / R.3).
    : !atDoor ? 'Consult me as often as you like. But the door hears one word a day, and only from the landing at the top of the stairs — you will have to climb to it.'
    : guessedToday ? 'The door has heard today’s word. It is a patient door — come back with the morning.'
    // His opening now answers the walk she actually had: a first arrival, a
    // repeat visit, or an arrival on fumes (engine/journal.arrivalShade). The
    // line this replaced congratulated a climb on a day she had not made one.
    : (arriveNode?.lines[0]?.text ?? FALLBACK_ARRIVALS[shade]);

  return (
    <div className="snc-page">
      <div className="snc snc__accent">
        <BackLink className="snc__nav" flavour="Back down the stairs" />
        <PortraitFrame
          soft={soft}
          expression={phase === 'wrong' ? sceneExpression ?? undefined : undefined}
        />
        {/* The heading tells the truth about where she is standing (AAA 11.7:
            the recognisable word leads). Read from the armchair this is the
            stairwell, and calling it the door was half of why the climax
            staged itself for a climb that had not happened. */}
        <h2 className="snc__title">{atDoor ? 'The Sanctum Door' : 'The Stairwell'}</h2>

        {phase === 'listening' ? (
          <p className="snc-line snc-listening">The door listens…</p>
        ) : (
          <p className="snc-line" key={portraitLine ?? ''}>{portraitLine}</p>
        )}

        {gateNode && phase === 'idle' && (
          <p className="snc-line snc-line--nudge">{gateNode.lines[0]!.text}</p>
        )}

        <div className={`snc-door${shaking ? ' snc-shake' : ''}`}>
          <div className="snc-door__caption">
            {!atDoor
              ? 'He hears one word a day — and only from the top of the stairs.'
              : guessedToday ? 'One word a day. Today’s is spent.'
              : 'The door will hear one word today.'}
          </div>
          {/* The word is spoken at the door, never from the armchair (AAA
              4.10e). Away from the landing this whole row is absent rather
              than greyed: a disabled input on a screen she can legitimately
              read would look like a bug, and the caption above already says
              where the door is. Everything else here stays readable. */}
          {atDoor && (
          <div className="snc-row">
            <input
              className="snc-input"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && speak()}
              placeholder="the forgotten word"
              aria-label="Your one word for today"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="send"
              disabled={guessedToday || phase !== 'idle'}
            />
            <button
              className="snc-speak"
              onClick={speak}
              disabled={guessedToday || phase !== 'idle' || !guess.trim()}
            >
              Speak
            </button>
          </div>
          )}
          {wrongGuesses.length > 0 && (
            <div className="snc-struck" aria-label="Words the door refused">
              {wrongGuesses.map((g, i) => (
                <span key={i} className="snc-struck__word">{g.guess}</span>
              ))}
            </div>
          )}
        </div>

        {/* His audience is the LANDING's audience (MANOR_DESIGN §8: "the
            Portrait — landing outside the Sanctum"). Offering it from the
            armchair is the same defect as the door being a menu item, and it
            is what let his testimony (v1-t5) arrive on a day with no climb in
            it — which tests/volume-pacing.test.ts models as a landing day.
            The mount is unchanged (TRIGGER_MOUNTS.portrait.parlor); it is now
            where the fiction always said it was. */}
        {phase === 'idle' && atDoor && audienceButton}

        {/* Both numbers, always, once they differ: a page she is holding but
            cannot read yet is the most enticing thing on this screen, and
            hiding the difference is what let the door say "2 of 17 filed" to
            someone who could read one of them (AAA 4.16). */}
        <button className="snc-journal-link" onClick={() => navigate('/journal')}>
          {readiness.legible === readiness.filed
            ? `Consult the journal (${readiness.filed} of ${readiness.total} fragments filed)`
            : `Consult the journal (${readiness.filed} of ${readiness.total} filed · ${readiness.legible} made out)`}
        </button>
      </div>

      {audienceScene}

      {/* The Portrait's authored sigh — mounted after the 360ms door shake so
          the refusal lands first, then the sympathy (AAA 4.17). Marks the
          node seen (journal summaries, 5.10) and types out like every other
          conversation in the house. */}
      {phase === 'wrong' && wrongScene && !shaking && (
        <DialogueScene
          character="portrait"
          slot="sanctum-after-guess"
          onClose={() => { setWrongScene(false); setPhase('idle'); }}
        />
      )}
    </div>
  );
}
