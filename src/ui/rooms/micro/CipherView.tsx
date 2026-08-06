/**
 * The Darkroom — Substitution Cipher view. OWNER: A4.
 *
 * A cryptoquote in a developing tray: cipher letters above the line, pencil
 * marks below it. Tap any cell to select that cipher letter (every instance
 * lights), tap a key to pencil it in — penciling is thinking and costs
 * nothing; the selection auto-advances to the next blank. Locked letters
 * (starting reveals + purchased) glow in the room accent and never regress
 * (AAA 3.3). DEVELOP is the claim: blanks → free nudge; a wrong mapping
 * costs steps but always reports how many letters ring true (AAA 2.10's
 * principle). Win: the plaintext develops letter by letter, ≤2s total,
 * tap-skippable (AAA 3.4 / U.2).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import type { CipherPuzzle } from '../../../engine/puzzles/cipher';
import type { CipherAction, CipherRoomState } from '../../../engine/puzzles/cipher-adapter';
import { cipherLettersOf } from '../../../engine/puzzles/cipher';
import { sfx } from '../../../app/sound';
import './micro.css';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

export default function CipherView({ puzzle, state, tier, dispatch }: RoomViewProps<CipherPuzzle, CipherRoomState, CipherAction>) {
  const letters = useMemo(() => cipherLettersOf(puzzle), [puzzle]);
  const firstBlank = letters.find((c) => !state.engine.guesses[c]) ?? letters.find((c) => !state.engine.locked.includes(c)) ?? null;

  const [sel, setSel] = useState<string | null>(firstBlank);
  const [shaking, setShaking] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [skipReveal, setSkipReveal] = useState(false);

  const handledAttempt = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const won = state.engine.status === 'won';
  const hintCost = tier === 3 ? 3 : 2;
  const penciled = letters.filter((c) => !!state.engine.guesses[c]).length;

  // A new puzzle in the same mounted view (same-kind room, different cell)
  // must not inherit the previous session's selection.
  useEffect(() => {
    setSel(firstBlank);
    setSkipReveal(false);
    setToast(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset keyed to the session only
  }, [puzzle.id]);

  // Duplicate pencil marks (two cipher letters → same plain) get flagged in wax.
  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const c of letters) {
      const g = state.engine.guesses[c];
      if (g) seen.set(g, (seen.get(g) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([g]) => g));
  }, [letters, state.engine.guesses]);

  useEffect(() => {
    if (state.attempts === handledAttempt.current) return;
    handledAttempt.current = state.attempts;
    const fb = state.lastFeedback;
    if (!fb) return;
    switch (fb.kind) {
      case 'developed':
        sfx.victory();
        break;
      case 'murky':
        sfx.wrong();
        setShaking(true);
        later(() => setShaking(false), 340);
        setToast({ kind: 'bad', text: `Still murky — ${fb.correct} of ${fb.total} letters ring true · −${hintCost} steps` });
        later(() => setToast(null), 2000);
        break;
      case 'incomplete':
        setToast({ kind: 'info', text: `${fb.missing} letter${fb.missing === 1 ? '' : 's'} still blank — pencil freely, it costs nothing.` });
        later(() => setToast(null), 1600);
        break;
      case 'letter-developed':
        sfx.glyph();
        setToast({ kind: 'good', text: `${fb.letter} develops true.` });
        later(() => setToast(null), 1300);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempts]);

  const advanceFrom = (c: string) => {
    const start = letters.indexOf(c);
    for (let i = 1; i <= letters.length; i++) {
      const cand = letters[(start + i) % letters.length]!;
      if (!state.engine.locked.includes(cand) && !state.engine.guesses[cand] && cand !== c) return cand;
    }
    return c; // nothing blank left — stay put for corrections
  };

  const pencil = (plain: string) => {
    if (won || !sel) return;
    sfx.tap();
    dispatch({ type: 'pencil', cipherLetter: sel, plain });
    setSel(advanceFrom(sel));
  };
  const erase = () => {
    if (won || !sel) return;
    sfx.tap();
    dispatch({ type: 'pencil', cipherLetter: sel, plain: null });
  };

  const words = puzzle.ciphertext.split(' ');
  let cellIndex = 0;

  return (
    <div className="mic mic--darkroom">
      <header className="mic__head">
        <h2 className="mic__title">The Darkroom</h2>
        <p className="mic__sub">A phrase sits in the tray, its letters swapped. Pencil freely — develop when sure.</p>
      </header>

      {won ? (
        <div className="mic-done" onPointerDown={() => setSkipReveal(true)}>
          <div className={`dk-reveal${skipReveal ? ' dk-reveal--skip' : ''}`} aria-label={puzzle.plaintext}>
            {puzzle.plaintext.split(' ').map((w, wi) => {
              const base = puzzle.plaintext.split(' ').slice(0, wi).join(' ').length;
              return (
                <span key={wi} className="dk-reveal__word">
                  {[...w].map((ch, i) => (
                    <span
                      key={i}
                      className="dk-reveal__ch"
                      style={{ animationDelay: `${Math.min((base + i) * 36, 1900)}ms` }}
                    >
                      {ch}
                    </span>
                  ))}
                </span>
              );
            })}
          </div>
          <p className="mic-done__line">
            {state.costedMistakes === 0 && state.hintsBought === 0
              ? 'Developed clean on the first print. Remarkable.'
              : 'The print develops. The words come back to the light.'}
          </p>
        </div>
      ) : (
        <>
          <div className={`dk-sheet${shaking ? ' mic-shake' : ''}`}>
            {words.map((w, wi) => (
              <span key={wi} className="dk-word">
                {[...w].map((c) => {
                  const idx = cellIndex++;
                  const locked = state.engine.locked.includes(c);
                  const guess = state.engine.guesses[c] ?? '';
                  return (
                    <button
                      key={idx}
                      className={
                        'dk-cell'
                        + (c === sel ? ' dk-cell--sel' : '')
                        + (locked ? ' dk-cell--locked' : '')
                        + (guess && dupes.has(guess) && !locked ? ' dk-cell--dupe' : '')
                      }
                      onPointerDown={() => { if (!locked) { sfx.tap(); setSel(c); } }}
                      aria-label={`Cipher letter ${c}${guess ? `, penciled ${guess}` : ', blank'}${locked ? ', developed' : ''}`}
                    >
                      <span className="dk-cell__cipher">{c}</span>
                      <span className="dk-cell__plain">{guess}</span>
                    </button>
                  );
                })}
              </span>
            ))}
          </div>

          <div className="mic__meta tabular-nums">{penciled} of {letters.length} letters penciled</div>

          <div className="mic-toastslot" aria-live="polite">
            {toast && <span className={`mic-toast mic-toast--${toast.kind}`}>{toast.text}</span>}
          </div>

          <div className="mic-keys">
            {ALPHABET.map((ch) => (
              <button
                key={ch}
                className={`mic-key${dupes.has(ch) || Object.values(state.engine.guesses).includes(ch) ? ' mic-key--dim' : ''}`}
                onPointerDown={() => pencil(ch)}
                disabled={won || !sel}
                aria-label={`Pencil ${ch}`}
              >
                {ch}
              </button>
            ))}
            <button className="mic-key mic-key--wide" onClick={erase} disabled={won || !sel || !state.engine.guesses[sel]}>
              Erase
            </button>
          </div>

          <div className="mic-row">
            <button className="mic-btn mic-btn--primary" onClick={() => dispatch({ type: 'develop' })}>
              Develop the print
            </button>
            <button className="mic-btn" onClick={() => dispatch({ type: 'reveal-letter' })}>
              Develop one letter · −{hintCost}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
