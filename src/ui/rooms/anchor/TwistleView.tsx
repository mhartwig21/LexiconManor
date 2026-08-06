/**
 * The Gallery — Twistle view. OWNER: A3. General word-room bar (AAA §3):
 * drag-trace OR tap-build through king-adjacent tiles, persistent memory
 * prosthetics (found AND missed words stay visible), center-rule tile marked
 * before it can cost anything, warm toasts, distinct win celebration.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import type { TwistlePuzzle } from '../../../engine/types';
import type { TwistleAction, TwistleRoomState } from '../../../engine/rooms/adapters/twistle';
import { CENTER_INDEX, GRID_SIZE } from '../../../engine/twistle';
import { sfx } from '../../../app/sound';
import './anchor.css';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

function areNeighbors(a: number, b: number): boolean {
  const dr = Math.abs(Math.floor(a / GRID_SIZE) - Math.floor(b / GRID_SIZE));
  const dc = Math.abs((a % GRID_SIZE) - (b % GRID_SIZE));
  return dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0);
}

export default function TwistleView({ puzzle, state, tier, dispatch }: RoomViewProps<TwistlePuzzle, TwistleRoomState, TwistleAction>) {
  const [path, setPath] = useState<number[]>([]);
  const [shaking, setShaking] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const handledAttempt = useRef(0);
  const gesture = useRef<{ active: boolean; startIdx: number; didDrag: boolean; prevPath: number[] }>({
    active: false, startIdx: -1, didDrag: false, prevPath: [],
  });
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const won = state.twistle.status === 'won';
  const stepCost = tier === 3 ? 3 : 2;
  const word = useMemo(() => path.map((i) => puzzle.grid[i]).join(''), [path, puzzle]);

  const submit = (w: string) => {
    if (won || !w) return;
    dispatch({ type: 'submit', word: w });
    setPath([]);
  };

  useEffect(() => {
    if (state.attempts === handledAttempt.current) return;
    handledAttempt.current = state.attempts;
    const fb = state.lastFeedback;
    if (!fb) return;

    if (fb.kind === 'valid') {
      sfx.correct();
      setToast({ kind: 'good', text: `${fb.word} — ${fb.found} of ${fb.target} gathered` });
      if (fb.won) later(() => sfx.victory(), 300);
      later(() => setToast(null), 1400);
    } else {
      const messages: Record<typeof fb.reason, string> = {
        'too-short': `Words need ${puzzle.rules.minLength}+ letters`,
        'not-on-grid': "The tiles won't connect so",
        'breaks-rule': `It must cross the marked tile · −${stepCost} steps`,
        'not-a-word': `${fb.word} isn't in the lexicon`,
        'already-found': 'Already gathered',
      };
      if (fb.costed) sfx.wrong();
      setToast({ kind: fb.costed ? 'bad' : 'info', text: messages[fb.reason] });
      setShaking(true);
      later(() => setShaking(false), 340);
      later(() => setToast(null), 1300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempts]);

  // ---- Gesture: tap-build (tap head to undo) or drag-trace (release claims).
  const idxFromPoint = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-idx]');
    if (!el) return null;
    return Number((el as HTMLElement).dataset.idx);
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (won) return;
    const idx = idxFromPoint(e.clientX, e.clientY);
    if (idx === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { active: true, startIdx: idx, didDrag: false, prevPath: path };
    setToast(null);
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g.active || won) return;
    const idx = idxFromPoint(e.clientX, e.clientY);
    if (idx === null) return;
    if (!g.didDrag) {
      if (idx === g.startIdx) return;
      g.didDrag = true;
      setPath([g.startIdx]);
      sfx.tap();
    }
    setPath((p) => {
      const head = p[p.length - 1];
      if (head === idx) return p;
      if (p.length >= 2 && p[p.length - 2] === idx) return p.slice(0, -1); // backtrack
      if (p.includes(idx)) return p;
      if (head !== undefined && !areNeighbors(head, idx)) return p;
      sfx.tap();
      return [...p, idx];
    });
  };

  const onUp = () => {
    const g = gesture.current;
    if (!g.active) return;
    g.active = false;
    if (g.didDrag) {
      // Release claims the trace — or quietly lets an accidental graze go.
      setPath((p) => {
        const w = p.map((i) => puzzle.grid[i]).join('');
        if (w.length >= puzzle.rules.minLength) submit(w);
        return [];
      });
      return;
    }
    // Simple tap: build the path a tile at a time (v1-proven interaction).
    const idx = g.startIdx;
    sfx.tap();
    setPath(() => {
      const p = g.prevPath;
      if (p.length === 0) return [idx];
      if (p[p.length - 1] === idx) return p.slice(0, -1);           // tap head: undo
      if (p.includes(idx)) return p;
      return areNeighbors(p[p.length - 1]!, idx) ? [...p, idx] : p;
    });
  };

  return (
    <div className="anch anch--gallery">
      <header className="anch__head">
        <h2 className="anch__title">The Gallery</h2>
        <p className="anch__sub">
          Trace {puzzle.targetCount} words through touching tiles.
          {puzzle.rules.centerRequired && ' Every word must cross the marked tile.'}
        </p>
      </header>

      {won ? (
        <div className="anch-done">
          <div className="anch-done__title">The gallery is hung.</div>
          <p className="anch-done__line">
            {state.twistle.foundWords.length} works on display
            {state.costedMistakes === 0 ? ' — hung without a single crooked frame' : ''}.
          </p>
          <div className="tw-lists">
            {state.twistle.foundWords.map((w, i) => (
              <span key={w} className="anch-chip anch-chip--accent anch-pop" style={{ animationDelay: `${i * 90}ms` }}>
                {w}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div
            className={`tw-grid${shaking ? ' anch-shake' : ''}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {puzzle.grid.map((letter, i) => {
              const pos = path.indexOf(i);
              const head = path.length > 0 ? path[path.length - 1]! : null;
              const reachable = path.length === 0 || pos >= 0 || (head !== null && areNeighbors(head, i));
              return (
                <button
                  key={i}
                  data-idx={i}
                  className={[
                    'tw-cell',
                    pos >= 0 ? 'tw-cell--traced' : '',
                    pos >= 0 && pos === path.length - 1 ? 'tw-cell--head' : '',
                    i === CENTER_INDEX && puzzle.rules.centerRequired ? 'tw-cell--center' : '',
                    !reachable ? 'tw-cell--far' : '',
                  ].join(' ')}
                >
                  {letter}
                  {pos >= 0 && <span className="tw-cell__order tabular-nums">{pos + 1}</span>}
                </button>
              );
            })}
          </div>

          <div className="tw-word">
            {word || <span className="tw-word__hint">trace or tap a word…</span>}
          </div>

          <div className="anch-toastslot" aria-live="polite">
            {toast && <span className={`anch-toast anch-toast--${toast.kind}`}>{toast.text}</span>}
          </div>

          <div className="anch-row">
            <button className="anch-btn" onClick={() => setPath([])} disabled={path.length === 0}>
              Clear
            </button>
            <button className="anch-btn anch-btn--primary" onClick={() => submit(word)} disabled={word.length < puzzle.rules.minLength}>
              Claim
            </button>
          </div>

          <div className="tw-lists">
            {state.twistle.foundWords.map((w) => (
              <span key={w} className="anch-chip anch-chip--accent">{w}</span>
            ))}
            {state.missedWords.map((w) => (
              <span key={w} className="anch-chip anch-chip--muted">{w}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
