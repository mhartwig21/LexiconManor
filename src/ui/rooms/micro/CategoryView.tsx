/**
 * The Pantry — category sprint view. OWNER: A5.
 *
 * The game's ONE timed pressure (MANOR_DESIGN §11, AAA 3.6): a pantry
 * clock advances a tick every TICK_SECONDS while the room is live; ticks
 * are free until par, then cost steps (bounded — the adapter caps the
 * charges). No real-time fail state: the shelf can always be finished.
 * Misses are free and remembered; the curated trap gets its authored
 * knowing line. Finishing under par pays a gem.
 */

import { useEffect, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import { underPar, type CategoryPuzzle } from '../../../engine/puzzles/category';
import {
  TICK_SECONDS,
  type CategoryAction, type CategoryRoomState,
} from '../../../engine/puzzles/category-adapter';
import { sfx } from '../../../app/sound';
import './a5micro.css';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

export default function CategoryView({ puzzle, state, tier, dispatch }: RoomViewProps<CategoryPuzzle, CategoryRoomState, CategoryAction>) {
  const [word, setWord] = useState('');
  const [toast, setToast] = useState<Toast>(null);
  const [shaking, setShaking] = useState(false);

  const handledAttempt = useRef(0);
  const handledTicks = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const won = state.cat.status === 'won';
  const stepCost = tier === 3 ? 3 : 2;
  const pastPar = state.cat.ticks > puzzle.parTicks;

  // The pantry clock — dispatch stays fresh via ref (interval set once).
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  useEffect(() => {
    if (won) return;
    const id = window.setInterval(() => dispatchRef.current({ type: 'tick' }), TICK_SECONDS * 1000);
    return () => window.clearInterval(id);
  }, [won]);

  // Costed-tick toast (ticks don't bump attempts; watch the counter).
  useEffect(() => {
    if (state.cat.costedTicks === handledTicks.current) return;
    handledTicks.current = state.cat.costedTicks;
    if (state.cat.costedTicks > 0) {
      setToast({ kind: 'bad', text: `The pantry clock turns past the hour. · −${stepCost} steps` });
      later(() => setToast(null), 1700);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.cat.costedTicks]);

  useEffect(() => {
    if (state.attempts === handledAttempt.current) return;
    handledAttempt.current = state.attempts;
    const fb = state.lastFeedback;
    if (!fb || fb.kind === 'tick') return;
    const show = (t: Toast, ms = 1700) => { setToast(t); later(() => setToast(null), ms); };
    switch (fb.kind) {
      case 'found':
        if (fb.won) {
          sfx.victory();
        } else {
          sfx.correct();
          show({ kind: 'good', text: 'Shelved.' }, 900);
        }
        break;
      case 'trap':
        sfx.wrong();
        setShaking(true);
        later(() => setShaking(false), 340);
        show({ kind: 'bad', text: `${fb.note} · −${stepCost} steps` }, 2100);
        break;
      case 'miss':
        setShaking(true);
        later(() => setShaking(false), 340);
        show({ kind: 'info', text: 'Not on this shelf — no harm done.' }, 1200);
        break;
      case 'already-found':
        show({ kind: 'info', text: 'Already shelved.' }, 900);
        break;
      case 'already-tried':
        show({ kind: 'info', text: 'The Pantry already declined that one.' }, 1100);
        break;
      case 'finished':
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempts]);

  const submit = () => {
    if (won || !word.trim()) return;
    dispatch({ type: 'submit', word });
    setWord('');
  };

  const clockPct = Math.min(100, (state.cat.ticks / puzzle.parTicks) * 100);

  return (
    <div className="m2 m2--pantry">
      <header className="m2__head">
        <h2 className="m2__title">The Pantry</h2>
        <p className="m2__sub">{puzzle.flavor ?? 'Name them before the clock turns.'}</p>
      </header>

      <div className="m2-card pn-label">
        <div className="pn-label__eyebrow">Wanted on the shelf</div>
        <div className="pn-label__text">{puzzle.label}</div>
        <div className="pn-label__meta tabular-nums">
          {state.cat.found.length} of {puzzle.target} shelved
        </div>
      </div>

      {!won && (
        <div className={`pn-clock${pastPar ? ' pn-clock--late' : ''}`}>
          <div className="pn-clock__track" aria-hidden>
            <div className="pn-clock__sand" style={{ width: `${clockPct}%` }} />
          </div>
          <span className="pn-clock__text tabular-nums">
            {pastPar ? 'past the hour' : `turn ${state.cat.ticks} of ${puzzle.parTicks}`}
          </span>
        </div>
      )}

      <div className="pn-shelf">
        {state.cat.found.length === 0 && !won && <span className="pn-shelf__empty">The shelf stands empty…</span>}
        {state.cat.found.map((w, i) => (
          <span
            key={w}
            className={`m2-chip m2-chip--accent ${won ? 'm2-chip--dance' : 'm2-chip--in'}`}
            style={won ? { animationDelay: `${i * 90}ms` } : undefined}
          >
            {w}
          </span>
        ))}
      </div>

      {won ? (
        <div className="m2-done">
          <div className="m2-done__title">The shelf is full.</div>
          <p className="m2-done__line">
            {underPar(puzzle, state.cat)
              ? 'Swift work — a gem for your trouble.'
              : 'Done is done; the Pantry approves.'}
            {state.cat.trapsHit.length === 0 && state.cat.costedTicks === 0 ? ' Not a jar out of place.' : ''}
          </p>
        </div>
      ) : (
        <>
          <div className={`m2-row${shaking ? ' m2-shake' : ''}`} style={{ flexWrap: 'nowrap' }}>
            <input
              className="m2-input"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Name one…"
              aria-label="Your answer"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
            />
            <button className="m2-btn m2-btn--primary" onClick={submit} disabled={!word.trim()}>
              Shelve it
            </button>
          </div>

          <div className="m2-toastslot" aria-live="polite">
            {toast && <span className={`m2-toast m2-toast--${toast.kind}`}>{toast.text}</span>}
          </div>

          <div className="m2-row">
            {state.cat.trapsHit.map((w) => (
              <span key={w} className="m2-chip m2-chip--wax">{w}</span>
            ))}
            {state.cat.triedMisses.map((w) => (
              <span key={w} className="m2-chip m2-chip--muted">{w}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
