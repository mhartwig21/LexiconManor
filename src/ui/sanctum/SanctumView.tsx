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
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useManorStore } from '../../app/store';
import { getVolumeContent } from '../../app/content/volumes';
import { definitionSlots, sanctumReadiness } from '../../engine/journal';
import { applyGuess, hasGuessedOnDay } from '../../engine/volume';
import type { GuessCloseness } from '../../engine/events';
import type { PortraitExpression } from '../../engine/dialogue/schema';
import { getDialogueFile } from '../../engine/dialogue/content';
import { selectDialogue } from '../../engine/dialogue/select';
import DialogueScene from '../dialogue/DialogueScene';
import { sfx } from '../../app/sound';
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
 *  floor) — the authored portrait.guess.* variants normally play instead. */
function sighFor(c: GuessCloseness): string {
  if (c.repeat) return 'That word again. The door has heard it once, and once was its full measure.';
  if (c.rightLength && c.sharedLetters >= 4)
    return '…No. And yet the door held its breath a moment, I think. The shape of it is not wrong.';
  if (c.sharedLetters >= 3) return 'No. Though some of those letters do belong to it. I shall say no more.';
  if (c.rightLength) return 'The right length of silence. The wrong silence.';
  if (c.sharedLetters === 0)
    return 'Not one of its letters, I am afraid. Strike it through; the list grows more honest as it shortens.';
  return 'No. But the house is warmer for hearing you try.';
}

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
  const beginNextVolume = useManorStore((s) => s.beginNextVolume);
  const endDay = useManorStore((s) => s.endDay);
  const buildDialogueQuery = useManorStore((s) => s.buildDialogueQuery);

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

  // Arriving at an already-solved volume: the door stands open.
  const alreadySolved = volume.status === 'solved' && phase === 'idle';

  if (!content) {
    return (
      <div className="snc-page">
        <div className="snc">
          <button className="snc__back" onClick={() => navigate('/')}>Back down the stairs</button>
          <p className="snc-line">The landing is dark. The Portrait is elsewhere.</p>
        </div>
      </div>
    );
  }

  const guessedToday = hasGuessedOnDay(volume, day);
  const readiness = sanctumReadiness(content, volume);
  const wrongGuesses = volume.guesses.filter(
    (g) => !content.accepted.some((a) => a.toUpperCase().replace(/[^A-Z]/g, '') === g.guess),
  );
  const answer = content.answer.toUpperCase();

  const speak = () => {
    if (phase !== 'idle' || guessedToday || !guess.trim()) return;
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

  // The portrait softens only once the win is *shown* (not during the
  // listening beat, even though the store already knows).
  const soft =
    phase === 'won-reveal' || phase === 'won-portrait' || phase === 'epilogue' ||
    (volume.status === 'solved' && phase === 'idle');

  // ------ Win staging ------
  if (phase === 'won-reveal') {
    return (
      <div className="snc-page">
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
        <div className="snc-page">
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
      <div className="snc-page">
        <div className="snc" onClick={advance}>
          <PortraitFrame soft />
          <h2 className="snc__title">The Lexicographer</h2>
          <p className="snc-line" key={beat}>{CLOSING_BEATS[beat]}</p>
          <button className="snc-btn" onClick={(e) => { e.stopPropagation(); advance(); }}>
            {last ? 'Let him rest' : '…'}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'epilogue' || alreadySolved) {
    const slots = definitionSlots(content, volume);
    return (
      <div className="snc-page">
        <div className="snc">
          <button className="snc__back" onClick={() => navigate('/')}>Back down the stairs</button>
          <PortraitFrame soft />
          <div className="snc-epilogue">
            <div className="snc-epilogue__word">{answer}</div>
            <div className="snc-epilogue__poem">
              {slots.map((s) =>
                s.fragment ? (
                  <span key={s.revealOrder}>“{s.fragment.text}”</span>
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
            <p className="snc-line--nudge snc-line">
              The door stands open now. The journal keeps the whole of it, should you want to reread him.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ------ The daily audience ------
  const portraitLine =
    phase === 'listening' ? null
    : phase === 'wrong' ? (sigh ?? '…')
    : guessedToday ? 'The door has heard today’s word. It is a patient door — come back with the morning.'
    : volume.guesses.length === 0 ? 'So you have climbed far enough to ask. Very well: the door wants no key. It wants the word. One a day, spoken plainly.'
    : 'The door is listening, whenever you are sure. There is no hurry in this house but yours.';

  return (
    <div className="snc-page">
      <div className="snc snc__accent">
        <button className="snc__back" onClick={() => navigate('/')}>Back down the stairs</button>
        <PortraitFrame
          soft={soft}
          expression={phase === 'wrong' ? sceneExpression ?? undefined : undefined}
        />
        <h2 className="snc__title">The Sanctum Door</h2>

        {phase === 'listening' ? (
          <p className="snc-line snc-listening">The door listens…</p>
        ) : (
          <p className="snc-line" key={portraitLine ?? ''}>{portraitLine}</p>
        )}

        {readiness.nudge && phase === 'idle' && !guessedToday && (
          <p className="snc-line snc-line--nudge">{readiness.nudge}</p>
        )}

        <div className={`snc-door${shaking ? ' snc-shake' : ''}`}>
          <div className="snc-door__caption">
            {guessedToday ? 'One word a day. Today’s is spent.' : 'The door will hear one word today.'}
          </div>
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
          {wrongGuesses.length > 0 && (
            <div className="snc-struck" aria-label="Words the door refused">
              {wrongGuesses.map((g, i) => (
                <span key={i} className="snc-struck__word">{g.guess}</span>
              ))}
            </div>
          )}
        </div>

        <button className="snc-journal-link" onClick={() => navigate('/journal')}>
          Consult the journal ({readiness.found} of {readiness.total} fragments filed)
        </button>
      </div>

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
