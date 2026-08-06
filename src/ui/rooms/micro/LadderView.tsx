/**
 * The Staircase — Word Ladder view. OWNER: A4.
 *
 * One rung per landing: the target waits at the top behind dashed stones,
 * the climb stacks beneath it, and the editable rung sits at the bottom in
 * the thumb zone. Two taps per attempt: pick a cell, pick a letter — the
 * probe submits itself, because probes are FREE (Wordle's gentle refusal;
 * the adapter maps every refusal to weight 0). Refused words stay listed
 * struck-through (AAA 3.3); stepping back down is free; the only priced
 * action is buying the next stone. Win: the flight dances upward, graded
 * warm copy, perfect = at par with no bought stones.
 */

import { useEffect, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import type { LadderPuzzle } from '../../../engine/puzzles/ladder';
import type { LadderAction, LadderRoomState } from '../../../engine/puzzles/ladder-adapter';
import { sfx } from '../../../app/sound';
import './micro.css';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
/** How many climbed rungs stay visible under the target (the rest fold). */
const VISIBLE_RUNGS = 4;

export default function LadderView({ puzzle, state, tier, dispatch }: RoomViewProps<LadderPuzzle, LadderRoomState, LadderAction>) {
  const [selPos, setSelPos] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const handledAttempt = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const rungs = state.engine.rungs;
  const current = rungs[rungs.length - 1]!;
  const won = state.engine.status === 'won';
  const steps = rungs.length - 1;
  const hintCost = tier === 3 ? 3 : 2;

  // Fresh rung (or a fresh puzzle in the same mounted view) → selection
  // back to the first cell.
  useEffect(() => { setSelPos(0); setToast(null); }, [rungs.length, puzzle.id]);

  useEffect(() => {
    if (state.attempts === handledAttempt.current) return;
    handledAttempt.current = state.attempts;
    const fb = state.lastFeedback;
    if (!fb) return;
    switch (fb.kind) {
      case 'valid':
        if (fb.won) {
          sfx.victory();
        } else {
          sfx.correct();
        }
        break;
      case 'stone-bought':
        sfx.glyph();
        if (fb.won) {
          sfx.victory();
        } else {
          setToast({ kind: 'good', text: `The next stone appears: ${fb.word}` });
          later(() => setToast(null), 1400);
        }
        break;
      case 'stepped-back':
        sfx.tap();
        setToast({ kind: 'info', text: `Back down to ${fb.toWord}.` });
        later(() => setToast(null), 1100);
        break;
      case 'invalid': {
        sfx.wrong();
        setShaking(true);
        later(() => setShaking(false), 340);
        const text =
          fb.reason === 'not-a-word' ? `“${fb.word}” isn't a word the Staircase knows — no cost, it's noted below.`
          : fb.reason === 'already-used' ? `You've already stood on “${fb.word}”.`
          : fb.reason === 'not-one-step' ? 'One letter per landing — change exactly one.'
          : 'Same length as the stone you stand on.';
        setToast({ kind: fb.reason === 'not-a-word' ? 'info' : 'bad', text });
        later(() => setToast(null), 1600);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempts]);

  const tryLetter = (letter: string) => {
    if (won || letter === current[selPos]) return;
    sfx.tap();
    const candidate = current.slice(0, selPos) + letter + current.slice(selPos + 1);
    dispatch({ type: 'step', word: candidate });
  };

  const climbed = rungs.slice(0, -1);                       // everything below the current rung
  const foldedCount = Math.max(0, climbed.length - VISIBLE_RUNGS);
  const visibleClimbed = climbed.slice(foldedCount);

  const renderWord = (word: string, cls: string, rungIndex: number, danceBase = 0) => (
    <div
      key={`${rungIndex}-${word}`}
      className={`st-step ${cls}${state.boughtRungs.includes(rungIndex) ? ' st-step--bought' : ''}${won ? ' st-step--dance' : ''}`}
      style={won ? { animationDelay: `${danceBase}ms` } : undefined}
    >
      {[...word].map((ch, i) => <span key={i} className="st-cell">{ch}</span>)}
    </div>
  );

  return (
    <div className="mic mic--staircase">
      <header className="mic__head">
        <h2 className="mic__title">The Staircase</h2>
        <p className="mic__sub">One letter per landing. Climb from {puzzle.start} to {puzzle.target}.</p>
      </header>

      <div className="mic__meta tabular-nums">
        {steps} step{steps === 1 ? '' : 's'} taken · par {puzzle.par}
      </div>

      <div className="st-flight">
        {/* The landing above: the target, dashed until reached. */}
        {!won && (
          <>
            <div className="st-step st-step--target">
              {[...puzzle.target].map((ch, i) => <span key={i} className="st-cell">{ch}</span>)}
            </div>
            <div className="st-gap" aria-hidden="true">
              {'·'.repeat(Math.max(1, Math.min(6, puzzle.par - steps < 1 ? 1 : puzzle.par - steps)))}
            </div>
          </>
        )}

        {won && renderWord(puzzle.target, '', rungs.length - 1, (rungs.length - 1) * 90)}

        {/* The current, editable rung (thumb zone) — hidden once won. */}
        {!won && (
          <div className={`st-step st-edit st-step--in${shaking ? ' mic-shake' : ''}`}>
            {[...current].map((ch, i) => (
              <button
                key={i}
                className={`st-cell${i === selPos ? ' st-cell--sel' : ''}`}
                onPointerDown={() => { sfx.tap(); setSelPos(i); }}
                aria-label={`Change letter ${i + 1} (${ch})`}
              >
                {ch}
              </button>
            ))}
          </div>
        )}

        {/* The flight already climbed, newest first. */}
        {[...visibleClimbed].reverse().map((w, i) => {
          const rungIndex = climbed.length - 1 - i;
          return renderWord(w, 'st-step--past', rungIndex, rungIndex * 90);
        })}
        {foldedCount > 0 && <div className="st-more tabular-nums">… {foldedCount} more below</div>}
      </div>

      <div className="mic-toastslot" aria-live="polite">
        {toast && <span className={`mic-toast mic-toast--${toast.kind}`}>{toast.text}</span>}
      </div>

      {won ? (
        <div className="mic-done">
          <div className="mic-done__title">
            {steps === puzzle.par && state.hintsBought === 0 ? 'A perfect climb.' : 'You reach the landing.'}
          </div>
          <p className="mic-done__line">
            {steps === puzzle.par
              ? `Every stone true — ${steps} steps, right at par.`
              : `${steps} steps against a par of ${puzzle.par}. The Staircase doesn't judge.`}
          </p>
        </div>
      ) : (
        <>
          <div className="mic-keys">
            {ALPHABET.map((ch) => (
              <button
                key={ch}
                className={`mic-key${ch === current[selPos] ? ' mic-key--dim' : ''}`}
                onPointerDown={() => tryLetter(ch)}
                disabled={won}
                aria-label={`Try ${ch}`}
              >
                {ch}
              </button>
            ))}
            <button
              className="mic-key mic-key--wide"
              onClick={() => dispatch({ type: 'step-back' })}
              disabled={rungs.length <= 1}
            >
              Step back
            </button>
          </div>

          <div className="mic-row">
            <button className="mic-btn" onClick={() => dispatch({ type: 'buy-stone' })}>
              Next stone · −{hintCost}
            </button>
          </div>

          {state.missedWords.length > 0 && (
            <div className="mic-row">
              {state.missedWords.map((w) => (
                <span key={w} className="mic-chip mic-chip--missed">{w}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
