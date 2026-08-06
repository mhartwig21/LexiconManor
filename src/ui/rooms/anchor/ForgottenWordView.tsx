/**
 * The Study — Forgotten Word view. OWNER: A3. AAA 3.7: the definitions are the
 * best writing in the game, staged center; out-of-guesses is a warm
 * auto-abandon with the word revealed for closure, never a fail screen.
 * Clues unseal for steps (the one currency) — no timers anywhere.
 * Whispers-left is plain text, never a depleting-dots UI (AAA R.3).
 */

import { useEffect, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import type { ForgottenWordPuzzle } from '../../../engine/types';
import type { ForgottenWordAction, ForgottenWordRoomState } from '../../../engine/rooms/adapters/forgotten-word';
import { definitionForLevel, type ClueId } from '../../../engine/forgotten-word';
import { sfx } from '../../../app/sound';
import { pressProps } from './usePressed';
import './anchor.css';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

/** Warm words for the free length refusal ("It was eleven letters, dear"). */
const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

const CLUES: { id: ClueId; label: string }[] = [
  { id: 'etymology', label: 'Etymology' },
  { id: 'usage', label: 'Usage' },
];

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
          text: `Not "${fb.guess.toLowerCase()}" — ${fb.guessesLeft} whisper${fb.guessesLeft === 1 ? '' : 's'} remain${fb.guessesLeft === 1 ? 's' : ''}. · −${clueCost} steps`,
        });
        later(() => setToast(null), 1800);
        break;
      case 'invalid':
        if (fb.reason === 'repeat') {
          setToast({ kind: 'info', text: 'Already whispered.' });
          later(() => setToast(null), 1100);
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
          {definitionForLevel(puzzle, state.tier)}
          <span className="fw-def__q fw-def__q--close">”</span>
        </p>
        {inked && won ? (
          <div className="fw-def__word">{puzzle.word}</div>
        ) : (
          <div className="fw-def__meta tabular-nums">
            {puzzle.word.length} letters
            {playing && ` · ${whispersLeft} whisper${whispersLeft === 1 ? '' : 's'} left`}
          </div>
        )}
      </div>

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
        </div>
      ) : slipped ? (
        <div className="anch-done">
          <div className="anch-done__title" style={{ fontSize: 'var(--text-display-sm)' }}>It slips away for now.</div>
          <p className="anch-done__line">It was “{puzzle.word}”. The Study will offer another tomorrow.</p>
        </div>
      ) : (
        <>
          {CLUES.map(({ id, label }) => {
            const unlocked = state.fw.unlockedClues.includes(id);
            return (
              <div key={id} className="anch-card fw-clue">
                <div>
                  <div className="fw-clue__label">{label}</div>
                  {unlocked ? (
                    <div className="fw-clue__text anch-pop">{id === 'etymology' ? puzzle.etymology : puzzle.usage}</div>
                  ) : (
                    <div className="fw-clue__sealed">Sealed…</div>
                  )}
                </div>
                {!unlocked && (
                  <button className="anch-btn" {...pressProps<HTMLButtonElement>()} onClick={() => dispatch({ type: 'unseal-clue', clue: id })}>
                    Unseal · −{clueCost} steps
                  </button>
                )}
              </div>
            );
          })}

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
            {toast && <span className={`anch-toast anch-toast--${toast.kind}`}>{toast.text}</span>}
          </div>

          {state.fw.guesses.length > 0 && (
            <div className="anch-row">
              {state.fw.guesses.map((g) => (
                <span key={g} className="anch-chip anch-chip--muted">{g}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
