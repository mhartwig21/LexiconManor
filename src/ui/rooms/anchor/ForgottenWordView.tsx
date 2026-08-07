/**
 * The Study — Forgotten Word view. OWNER: A3. AAA 3.7: the definitions are the
 * best writing in the game, staged center; out-of-guesses is a warm
 * auto-abandon with the word revealed for closure, never a fail screen.
 * Clues unseal for steps (the one currency) — no timers anywhere.
 * Whispers-left is plain text, never a depleting-dots UI (AAA R.3).
 *
 * ROUND 6 — TYPOGRAPHY. The wrong-guess toast quoted the player's own word in
 * straight U+0022 (`Not "gloaming" — …`). U+0022 has no handedness and the
 * body serif draws it as a right-leaning comma-shape on BOTH sides, so the
 * opening mark came out backwards on the one line in this room the player
 * reads most often. Quotes the view sets itself are now curly; authored strings
 * it prints go through `typeset()` (content/lib/typography.ts), which is
 * idempotent and repairs any pool entry a generator has not re-set.
 */

import { useEffect, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import type { ForgottenWordPuzzle } from '../../../engine/types';
import type { ForgottenWordAction, ForgottenWordRoomState } from '../../../engine/rooms/adapters/forgotten-word';
import {
  definitionForLevel, glossForLevel, unshownDefinitions, type ClueId,
} from '../../../engine/forgotten-word';
import { sfx } from '../../../app/sound';
import { pressProps } from './usePressed';
import { typeset } from '../../../../content/lib/typography';
import './anchor.css';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string; bit?: string } | null;

/** Warm words for the free length refusal ("It was eleven letters, dear"). */
const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

/**
 * AAA 4.17's taxonomy, spoken in the Study's voice. The room already charged
 * 2–3 steps for the claim; these bits cost nothing further and are exactly
 * what the criterion governing this verb demands — right length, shared
 * letters, and (below) a repeat refusal that costs nothing at all.
 */
function closenessLine(shared: number, exact: number): string {
  // The warmth is on the main line ("Not 'gloaming' — 2 whispers remain"); this
  // is the marginal note, and it has one reserved line to say it in.
  if (shared === 0) return 'The right length · not one letter of his.';
  return `The right length · ${shared} of his letters · ${exact} in place.`;
}

/**
 * The teaser is not decoration: a sealed drawer that says only "Sealed…" asks
 * her to spend 2–3 steps on an unknown, which is the one thing a priced hint
 * must never do. It also gives the room's freed height something to hold
 * (AAA §0.1) instead of parchment.
 */
/* ROUND 8: the teasers lost four words each. The sealed clue card measured
   94.3px — two of them, 189px of a 651.8px stage — and at 375x667 that put the
   second card's own COSTED "Unseal" button underneath the sticky whisper deck
   (measured: `elementFromPoint` at its centre returned `.anch-btn--primary`,
   AAA 11.4 [PARITY]). The card is one line of label + teaser beside the price
   now; nothing the teaser was for is lost — it still says what she is buying
   before she buys it, which is the whole reason it exists. */
const CLUES: { id: ClueId; label: string; teaser: string }[] = [
  { id: 'etymology', label: 'Etymology', teaser: 'Where it came from.' },
  { id: 'usage', label: 'Usage', teaser: 'The word in a sentence.' },
];

/**
 * ROUND 11 (AAA 3.7) — THE REST OF THE ENTRY. The adapter hands the room its
 * tier exactly, so any register keyed to the tier is unreadable on that entry
 * forever: 226 of the 339 authored definitions had never once reached glass.
 * The two lines the puzzle did not use are printed here, once the word is
 * settled either way — the best writing in the game as the thing you get for
 * finishing, rather than as content nobody can reach.
 */
function RestOfEntry({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="fw-entry">
      <div className="fw-entry__cap">The rest of the entry, in his hand</div>
      {lines.map((line) => (
        <p key={line} className="fw-entry__line">{typeset(line)}</p>
      ))}
    </div>
  );
}

export default function ForgottenWordView({ puzzle, state, tier, dispatch }: RoomViewProps<ForgottenWordPuzzle, ForgottenWordRoomState, ForgottenWordAction>) {
  const [guess, setGuess] = useState('');
  const [shaking, setShaking] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  /**
   * AAA 3.4: the letter-by-letter `fw-reveal` is the REVEAL, not the
   * celebration. `inked` is the second beat — the definition's quotation marks
   * close and the word inks itself into the card. Tap anywhere on the panel to
   * jump straight to it.
   */
  const [inked, setInked] = useState(false);

  const handledAttempt = useRef(0);
  const handledHints = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const playing = state.fw.status === 'playing';
  const won = state.fw.status === 'won';
  const slipped = state.fw.status === 'lost'; // engine name; outcome is a warm auto-abandon
  const whispersLeft = state.fw.maxGuesses - state.fw.guesses.length;
  const clueCost = tier === 3 ? 3 : 2;
  const gloss = glossForLevel(puzzle, state.tier);
  const rest = unshownDefinitions(puzzle, state.tier);

  const submit = () => {
    if (!playing || !guess.trim()) return;
    dispatch({ type: 'guess', word: guess });
    setGuess('');
  };

  useEffect(() => {
    if (state.attempts === handledAttempt.current) return;
    handledAttempt.current = state.attempts;
    const fb = state.lastFeedback;
    if (!fb) return;
    switch (fb.kind) {
      case 'correct':
        sfx.victory();
        break;
      case 'slipped':
        sfx.dusk();
        break;
      case 'wrong':
        sfx.wrong();
        setShaking(true);
        later(() => setShaking(false), 340);
        setToast({
          kind: 'bad',
          text: `Not “${fb.guess.toLowerCase()}” — ${fb.guessesLeft} whisper${fb.guessesLeft === 1 ? '' : 's'} remain${fb.guessesLeft === 1 ? 's' : ''}. · −${clueCost} steps`,
          bit: closenessLine(fb.shared, fb.exact),
        });
        later(() => setToast(null), 2400);
        break;
      case 'invalid':
        if (fb.reason === 'repeat') {
          // 4.17: a repeat is not a new claim, so it is not a new price.
          setToast({ kind: 'info', text: 'Already whispered — that one is free.' });
          later(() => setToast(null), 1300);
        } else if (fb.reason === 'wrong-length') {
          // AAA 3.2: the card announced the count, so a wrong-length guess is
          // malformed input — a warm free refusal, no whisper, no steps.
          setShaking(true);
          later(() => setShaking(false), 340);
          setToast({ kind: 'info', text: `It was ${numberWord(puzzle.word.length)} letters, dear.` });
          later(() => setToast(null), 1400);
        }
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempts]);

  // The reveal runs word.length × 110ms + the 420ms turn; the celebration
  // starts when it finishes, not instead of it.
  useEffect(() => {
    if (!won) return;
    later(() => setInked(true), puzzle.word.length * 110 + 420);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [won]);

  useEffect(() => {
    if (state.hintsBought === handledHints.current) return;
    handledHints.current = state.hintsBought;
    if (state.lastFeedback?.kind === 'clue-unsealed') {
      sfx.glyph();
      setToast({ kind: 'good', text: 'The seal lifts.' });
      later(() => setToast(null), 1100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hintsBought]);

  return (
    <div className={`anch anch--study${won || slipped ? ' anch--verdict' : ''}`}>
      <header className="anch__head">
        <h2 className="anch__title">The Study</h2>
        {/* 3.2/7.2: the premise is the flavour; the letter count is the RULE —
            a wrong-length whisper is refused, so she must always be able to
            read the count, SE-class screen or not. */}
        {/* NOT the Sanctum's premise. This line used to repeat the Volume 1
            erasure claim verbatim (see engine/volume.ts) — a word taken out
            of every dictionary — over forty-odd perfectly ordinary words the
            player can look up on her phone. That both cheapened the one
            monstrous erasure the whole mystery turns on and read as a false
            lead with no character wrongness signal to close it (AAA 4.16).
            These are the lexicographer's own unfinished entries, which is
            true, and which makes the Study feed the Sanctum instead of
            competing with it. Sole ownership of the claim is pinned by
            tests/volume-premise.test.ts. */}
        <p className="anch__flavour">An entry in his hand. The headword is torn away.</p>
        <p className="anch__rule tabular-nums">{puzzle.word.length} letters — whisper it back.</p>
      </header>

      <div className={`anch-card fw-def${inked ? ' fw-def--inked' : ''}`}>
        <div className="fw-def__eyebrow">{inked ? 'The headword, restored' : 'A headword is missing'}</div>
        <p className="fw-def__text">
          <span className="fw-def__q fw-def__q--open">“</span>
          {typeset(definitionForLevel(puzzle, state.tier))}
          <span className="fw-def__q fw-def__q--close">”</span>
        </p>
        {/* ROUND 11 (AAA 3.7) — the plain gloss, free, at tier 1 only. The
            poetry is the headline in every Study now; what the bottom of the
            house gets extra is the dictionary reading of the same word
            underneath it, so the easiest room hands over the most and no
            authored register is unreachable. */}
        {gloss && <p className="fw-def__gloss">{typeset(gloss)}</p>}
        {inked && won ? (
          <div className="fw-def__word">{puzzle.word}</div>
        ) : (
          <div className="fw-def__meta tabular-nums">
            {puzzle.word.length} letters
            {playing && ` · ${whispersLeft} whisper${whispersLeft === 1 ? '' : 's'} left`}
          </div>
        )}
      </div>

      {/* The shape of what was torn out. AAA 3.2: the letter count is the one
          rule this room refuses a guess over, so it is drawn as well as said —
          and AAA §0.1: the freed height in a room with no board has to become
          ink, not a taller empty card. */}
      {playing && (
        <div className="fw-slots" aria-hidden="true">
          {Array.from({ length: puzzle.word.length }, (_, i) => (
            <span key={i} className="fw-slot" />
          ))}
        </div>
      )}

      {won && state.lastFeedback?.kind === 'correct' ? (
        <div
          className={`anch-done${inked ? ' anch-done--settled' : ''}`}
          onPointerDown={() => setInked(true)}
        >
          <div className="fw-reveal">
            {[...state.lastFeedback.word].map((ch, i) => (
              <span key={i} className="fw-reveal__ch" style={{ animationDelay: `${i * 110}ms` }}>{ch}</span>
            ))}
          </div>
          <p className="anch-done__line">
            The word returns to the page{state.costedMistakes === 0 && state.hintsBought === 0 ? ' — remembered whole, first breath' : ''}.
          </p>
          <RestOfEntry lines={rest} />
        </div>
      ) : slipped ? (
        <div className="anch-done">
          <div className="anch-done__title" style={{ fontSize: 'var(--text-display-sm)' }}>It slips away for now.</div>
          <p className="anch-done__line">It was “{puzzle.word}”. The Study will offer another tomorrow.</p>
          <RestOfEntry lines={rest} />
        </div>
      ) : (
        <>
          {/* ROUND 8 (AAA 11.4 [PARITY]) — WHAT YOU CAN BUY IS ALWAYS ON THE
              GLASS; WHAT YOU HAVE BOUGHT IS READING MATTER.
              Both clue cards used to sit here, in the scrolling body, above a
              sticky deck — so whether a control that SPENDS STEPS was reachable
              depended on how many lines this particular definition ran to.
              Measured: at 375x667 the second card's "Unseal · −N steps"
              hit-tested as the whisper button on every entry, and at 390x844 on
              the longer ones; compacting the card (see `.fw-clue`) fixed the
              short entries and left the long ones failing, which is the worst
              of the three outcomes because it looks fixed.
              A SEALED clue is a priced control, so it rides the deck with the
              other priced control in the room and can never be behind anything.
              An UNSEALED clue is a paragraph of the entry, so it goes back into
              the body and scrolls with the definition it belongs to. */}
          {CLUES.filter(({ id }) => state.fw.unlockedClues.includes(id)).map(({ id, label }) => (
            <div key={id} className="anch-card fw-clue fw-clue--open">
              <div className="fw-clue__body">
                <span className="fw-clue__label">{label}</span>
                <span className="fw-clue__text anch-pop">{typeset(id === 'etymology' ? puzzle.etymology : puzzle.usage)}</span>
              </div>
            </div>
          ))}

          {/* ROUND 7 (AAA 3.3/11.3): the whisper row, the reply and the
              elimination history measured 52px (390x844) and 106px (375x667)
              past the bottom of the stage once real iPhone insets were applied
              — the memory prosthetic the room is built around was off the
              glass. They ride the shell's sticky deck; the entry scrolls
              behind them. */}
          <div className="room-deck room-deck--anch">
          {CLUES.filter(({ id }) => !state.fw.unlockedClues.includes(id)).map(({ id, label, teaser }) => (
            <div key={id} className="fw-clue fw-clue--sealedrow">
              <div className="fw-clue__body">
                <span className="fw-clue__label">{label}</span>
                <span className="fw-clue__sealed">{teaser}</span>
              </div>
              <button
                className="anch-btn fw-clue__buy"
                {...pressProps<HTMLButtonElement>()}
                onClick={() => dispatch({ type: 'unseal-clue', clue: id })}
              >
                Unseal · −{clueCost} steps
              </button>
            </div>
          ))}
          <div className={`anch-row${shaking ? ' anch-shake' : ''}`} style={{ flexWrap: 'nowrap' }}>
            <input
              className="fw-input"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Whisper the forgotten word…"
              aria-label="Your guess"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
            />
            <button className="anch-btn anch-btn--primary" {...pressProps<HTMLButtonElement>()} onClick={submit} disabled={!guess.trim()}>
              Whisper
            </button>
          </div>

          <div className="anch-toastslot" aria-live="polite">
            {toast && (
              <span className={`anch-toast anch-toast--${toast.kind}`}>
                {toast.text}
                {toast.bit && <span className="anch-toast__bit tabular-nums">{toast.bit}</span>}
              </span>
            )}
          </div>

          {/* AAA 3.3 [PARITY] — the elimination history keeps the closeness she
              paid for. A struck chip alone told her only THAT she had tried the
              word; the two counts (letters of his in the word · of those, in
              place) mean she never re-derives what the toast already said. */}
          {/* Always mounted: the history is the room's memory prosthetic, so
              its place on the page is fixed from the first whisper onward and
              nothing below it moves when a chip arrives (AAA 1.5). */}
          <div className="fw-tried">
            <div className="fw-tried__cap">Whispered · his letters · in place</div>
            <div className="anch-row">
              {state.closeness.length === 0 ? (
                <span className="fw-tried__none">Nothing whispered yet.</span>
              ) : (
                state.closeness.map(({ guess, shared, exact }) => (
                  <span key={guess} className="anch-chip anch-chip--muted fw-tried__chip">
                    {guess}
                    <span
                      className="fw-tried__n tabular-nums"
                      aria-label={`${shared} of his letters, ${exact} in place`}
                    >
                      {shared}·{exact}
                    </span>
                  </span>
                ))
              )}
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
