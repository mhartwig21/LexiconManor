/**
 * The Gallery — Twistle view. OWNER: A3. General word-room bar (AAA §3):
 * drag-trace OR tap-build through king-adjacent tiles, persistent memory
 * prosthetics (found AND missed words stay visible), center-rule tile marked
 * before it can cost anything, warm toasts, distinct win celebration.
 *
 * ROUND 10 — THE WIN STATE KEEPS THE BOARD (AAA 3.4 / 3.3).
 * The solved screen used to delete the grid: the celebration was a gilt frame
 * drawn around a title, a line and a row of chips, leaving ~326px of blank
 * parchment where the board had been (measured: `.anch-done` 197px tall in a
 * 721px stage) — the only room in the house whose win state was emptier than
 * its play state, and the one room whose whole pleasure is *where* the words
 * were hiding. The board now stays, and the celebration is the completed
 * word-search sheet: every found word's trace is inked back onto the grid,
 * one after another, inside the same gilt frame. Nothing new is stored for
 * this — `findPath` (the same solver the engine validates submissions with)
 * re-derives each trace from `foundWords` + the grid, so the celebration
 * cannot disagree with what she actually claimed.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { RoomViewProps } from '../registry';
import type { TwistlePuzzle } from '../../../engine/types';
import type { TwistleAction, TwistleRoomState } from '../../../engine/rooms/adapters/twistle';
import { centerIndex, findPath, puzzleSize } from '../../../engine/twistle';
import { sfx } from '../../../app/sound';
import { pressProps } from './usePressed';
import './anchor.css';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

/** King adjacency on an n×n board (n comes from the puzzle, not a constant). */
function areNeighbors(a: number, b: number, n: number): boolean {
  const dr = Math.abs(Math.floor(a / n) - Math.floor(b / n));
  const dc = Math.abs((a % n) - (b % n));
  return dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0);
}

export default function TwistleView({ puzzle, state, tier, dispatch }: RoomViewProps<TwistlePuzzle, TwistleRoomState, TwistleAction>) {
  // Board metrics ride on the puzzle so a tier-3 Gallery can ship 6×6.
  const size = puzzleSize(puzzle);
  const centre = centerIndex(size);

  const [path, setPath] = useState<number[]>([]);
  const [shaking, setShaking] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  /** AAA 3.4: the gilt frame is skippable at any point in its ≤1.2s draw. */
  const [frameSkipped, setFrameSkipped] = useState(false);

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

  // ---- The hung sheet: every claimed word traced back onto the board.
  /** The traces, in the order she found them. Re-derived, never stored. */
  const hungTraces = useMemo(
    () =>
      won
        ? state.twistle.foundWords.flatMap((w) => {
            const p = findPath(puzzle.grid, w, puzzle.rules);
            return p ? [{ word: w, path: p }] : [];
          })
        : [],
    [won, state.twistle.foundWords, puzzle],
  );
  const hungGrid = useRef<HTMLDivElement | null>(null);
  /**
   * Cell centres in the grid's own pixel space. Measured rather than computed
   * from the CSS gap, so the 5×5 and the tier-3 6×6 both land exactly and a
   * later gutter retune cannot silently shift the traces off the letters.
   * `offsetLeft/offsetWidth` are layout values, so the panel's `anch-pop`
   * scale-in cannot distort them mid-measure.
   */
  const [hungGeom, setHungGeom] = useState<{ w: number; h: number; cell: number; pts: { x: number; y: number }[] } | null>(null);
  useLayoutEffect(() => {
    if (!won) return;
    const measure = () => {
      const g = hungGrid.current;
      if (!g) return;
      const cells = [...g.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('tw-cell'));
      if (cells.length === 0 || g.offsetWidth === 0) return;
      // `offsetLeft/Top` are measured from the nearest POSITIONED ancestor. The
      // hung grid is `position: relative`, so it is normally the cells' own
      // offsetParent and their offsets are already grid-local; the subtraction
      // is kept for the case where it is not, because getting this wrong does
      // not fail loudly — it silently draws every trace over the wrong letters
      // (it did, by exactly the title block's height, until this line).
      const local = cells[0]!.offsetParent === g;
      const ox = local ? 0 : g.offsetLeft;
      const oy = local ? 0 : g.offsetTop;
      setHungGeom({
        w: g.offsetWidth,
        h: g.offsetHeight,
        cell: cells[0]!.offsetWidth,
        pts: cells.map((c) => ({
          x: c.offsetLeft - ox + c.offsetWidth / 2,
          y: c.offsetTop - oy + c.offsetHeight / 2,
        })),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [won, size]);
  /** Cells that carry at least one claimed word — the sheet's own ink. */
  const hungCells = useMemo(() => new Set(hungTraces.flatMap((t) => t.path)), [hungTraces]);

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

  // U.1: pressed squash on the touched cell within one frame of pointerdown
  // (the grid owns the gesture, so the class is driven from here, not per-cell).
  const pressedCell = useRef<HTMLElement | null>(null);
  const releaseCell = () => {
    pressedCell.current?.classList.remove('is-pressed');
    pressedCell.current = null;
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (won) return;
    const idx = idxFromPoint(e.clientX, e.clientY);
    if (idx === null) return;
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tw-cell');
    if (cell) {
      pressedCell.current = cell as HTMLElement;
      cell.classList.add('is-pressed');
    }
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
      if (head !== undefined && !areNeighbors(head, idx, size)) return p;
      sfx.tap();
      return [...p, idx];
    });
  };

  const onUp = () => {
    releaseCell();
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
      return areNeighbors(p[p.length - 1]!, idx, size) ? [...p, idx] : p;
    });
  };

  return (
    <div className={`anch anch--gallery${won ? ' anch--verdict' : ''}`}>
      <header className="anch__head">
        <h2 className="anch__title">The Gallery</h2>
        {/* 3.2/7.2: the mechanical clause is NEVER the thing a short screen
            drops — at tier 3 the marked-tile rule is what a −3-step mistake
            hangs on, and this line is its only statement in words. */}
        <p className="anch__flavour">Trace words through touching tiles.</p>
        <p className="anch__rule">
          {puzzle.targetCount} words
          {puzzle.rules.centerRequired && ' · every word crosses the marked tile'}
        </p>
      </header>

      {won ? (
        // AAA 3.4: a celebration that is NOT the in-play chip arrival replayed.
        // A gilt frame draws itself around the block, edge by edge (≤1.2s),
        // matching the room's own "hung" metaphor — and inside the frame the
        // BOARD STAYS, with every claimed word inked back over it on a 150ms
        // stagger (round 10). Both are transform/opacity only (U.3/9.5): the
        // frame edges scale from their far ends, the traces fade in; no
        // stroke-dash repaint anywhere.
        <div
          className={`anch-done tw-hung${frameSkipped ? ' tw-hung--done' : ''}`}
          onPointerDown={() => setFrameSkipped(true)}
        >
          <div className="tw-frame" aria-hidden="true">
            <i className="tw-frame__seg tw-frame__seg--t" />
            <i className="tw-frame__seg tw-frame__seg--r" />
            <i className="tw-frame__seg tw-frame__seg--b" />
            <i className="tw-frame__seg tw-frame__seg--l" />
          </div>
          <div className="anch-done__title">The gallery is hung.</div>
          <p className="anch-done__line">
            {state.twistle.foundWords.length} works on display
            {state.costedMistakes === 0 ? ' — hung without a single crooked frame' : ''}.
          </p>

          {/* The finished sheet. The grid is inert here (divs, no gesture
              handlers, no pointer cursor), so the celebration cannot be
              mistaken for another turn of play. */}
          <div
            ref={hungGrid}
            className="tw-grid tw-grid--hung"
            style={{ '--tw-size': size } as CSSProperties}
            role="img"
            aria-label={`The finished board. ${hungTraces.map((t) => t.word).join(', ')}.`}
          >
            {puzzle.grid.map((letter, i) => (
              <div
                key={i}
                className={[
                  'tw-cell', 'tw-cell--still',
                  hungCells.has(i) ? 'tw-cell--hung' : '',
                  i === centre && puzzle.rules.centerRequired ? 'tw-cell--center' : '',
                ].filter(Boolean).join(' ')}
              >
                {letter}
              </div>
            ))}
            {hungGeom && (
              <svg
                className="tw-threads"
                viewBox={`0 0 ${hungGeom.w} ${hungGeom.h}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {hungTraces.map((t, i) => {
                  const pts = t.path.map((idx) => hungGeom.pts[idx]).filter(Boolean) as { x: number; y: number }[];
                  if (pts.length === 0) return null;
                  return (
                    <g key={t.word} className="tw-thread" style={{ animationDelay: `${Math.min(i * 150, 1300)}ms` }}>
                      <polyline
                        points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                        strokeWidth={hungGeom.cell * 0.24}
                      />
                      <circle cx={pts[0]!.x} cy={pts[0]!.y} r={hungGeom.cell * 0.19} />
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          <div className="tw-lists">
            {state.twistle.foundWords.map((w) => (
              <span key={w} className="anch-chip anch-chip--accent">{w}</span>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div
            className={`tw-grid${shaking ? ' anch-shake' : ''}`}
            style={{ '--tw-size': size } as CSSProperties}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {puzzle.grid.map((letter, i) => {
              const pos = path.indexOf(i);
              const head = path.length > 0 ? path[path.length - 1]! : null;
              const reachable = path.length === 0 || pos >= 0 || (head !== null && areNeighbors(head, i, size));
              return (
                <button
                  key={i}
                  data-idx={i}
                  className={[
                    'tw-cell',
                    pos >= 0 ? 'tw-cell--traced' : '',
                    pos >= 0 && pos === path.length - 1 ? 'tw-cell--head' : '',
                    i === centre && puzzle.rules.centerRequired ? 'tw-cell--center' : '',
                    !reachable ? 'tw-cell--far' : '',
                  ].join(' ')}
                >
                  {letter}
                  {pos >= 0 && <span className="tw-cell__order tabular-nums">{pos + 1}</span>}
                </button>
              );
            })}
          </div>

          {/* ROUND 7 (AAA 11.2/11.3, measured on device-accurate insets): the
              traced word, its verdict and Clear/CLAIM are the room's verbs, and
              at 375x667 they measured 81px PAST the bottom of their own stage —
              Claim was not on the glass at all. They ride the shell's sticky
              deck now (ui/rooms/room-host.css), so the board scrolls behind
              them and the verbs never leave the thumb zone. */}
          <div className="room-deck room-deck--anch">
            <div className="tw-word">
              {word || <span className="tw-word__hint">trace or tap a word…</span>}
            </div>

            <div className="anch-toastslot" aria-live="polite">
              {toast && <span className={`anch-toast anch-toast--${toast.kind}`}>{toast.text}</span>}
            </div>

            <div className="anch-row">
              <button className="anch-btn" {...pressProps<HTMLButtonElement>()} onClick={() => setPath([])} disabled={path.length === 0}>
                Clear
              </button>
              <button className="anch-btn anch-btn--primary" {...pressProps<HTMLButtonElement>()} onClick={() => submit(word)} disabled={word.length < puzzle.rules.minLength}>
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
          </div>
        </>
      )}
    </div>
  );
}
