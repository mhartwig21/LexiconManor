/**
 * The Linen Closet — mini crossword view. OWNER: A5.
 *
 * 390px-first: 56px cells, all 3–5 clues visible at once (memory prosthetic
 * — nothing hidden behind a picker), in-view QWERTY keys in the thumb zone
 * (no iOS keyboard, no focus-zoom, no viewport dance). Letters are free;
 * the grid auto-checks when full — wrong cells keep a wax mark until
 * edited. Reveal ("smooth a crease") prices through the hint event.
 * Reduced motion strips all juice; states stay legible (AAA U.3).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import {
  entryCells, openCells, solutionLetters,
  type CrosswordEntry, type CrosswordPuzzle,
} from '../../../engine/puzzles/crossword';
import type { CrosswordAction, CrosswordRoomState } from '../../../engine/puzzles/crossword-adapter';
import { sfx } from '../../../app/sound';
import './a5micro.css';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export default function CrosswordView({ puzzle, state, tier, dispatch }: RoomViewProps<CrosswordPuzzle, CrosswordRoomState, CrosswordAction>) {
  const cells = useMemo(() => openCells(puzzle), [puzzle]);
  const solution = useMemo(() => solutionLetters(puzzle), [puzzle]);
  const cellEntries = useMemo(() => {
    const map = new Map<number, CrosswordEntry[]>();
    for (const e of puzzle.entries) {
      for (const c of entryCells(puzzle, e)) {
        const list = map.get(c) ?? [];
        list.push(e);
        map.set(c, list);
      }
    }
    return map;
  }, [puzzle]);
  const numberAt = useMemo(() => {
    const map = new Map<number, string>();
    for (const e of puzzle.entries) {
      const start = e.row * puzzle.size + e.col;
      const num = e.id.replace(/[AD]$/, '');
      if (!map.has(start)) map.set(start, num);
    }
    return map;
  }, [puzzle]);

  const firstEntry = puzzle.entries[0]!;
  const [active, setActive] = useState<{ cell: number; entryId: string }>({
    cell: firstEntry.row * puzzle.size + firstEntry.col,
    entryId: firstEntry.id,
  });
  const [toast, setToast] = useState<Toast>(null);
  const [shaking, setShaking] = useState(false);
  const [popCell, setPopCell] = useState<number | null>(null);

  const handledAttempt = useRef(0);
  const timers = useRef<number[]>([]);
  // Round 5: the clue panel is no longer height-capped — all 3–5 clues are on
  // the paper at once, which is what "memory prosthetic" means (AAA 3.3). The
  // walk-into-view below is now only the safety net for the 40dvh backstop
  // (a5micro.css) and is a no-op whenever the whole list is visible.
  const activeClueRef = useRef<HTMLButtonElement | null>(null);
  const activeCellRef = useRef<HTMLButtonElement | null>(null);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const won = state.cw.status === 'won';
  const stepCost = tier === 3 ? 3 : 2;
  const activeEntry = puzzle.entries.find((e) => e.id === active.entryId) ?? firstEntry;

  // Keep the clue she is answering inside the clue box. `nearest` scrolls the
  // box only, never the page (the shell has no page scroll at all), and only
  // when the clue is actually out of view.
  useEffect(() => {
    activeClueRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active.entryId]);

  // Same guarantee for the square she is typing into. On a 375x667 screen the
  // grid, the clue, a full keyboard and two verbs cannot all fit at once
  // without dropping tap targets under the 44pt bar (AAA 6.19) — so the grid
  // is what scrolls, and the active square is always walked back onto the
  // glass. `nearest` is a no-op whenever it is already visible, so nothing
  // jitters on a tall phone where the whole grid fits.
  useEffect(() => {
    activeCellRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active.cell]);

  // Feedback choreography (keyed off adapter attempts).
  useEffect(() => {
    if (state.attempts === handledAttempt.current) return;
    handledAttempt.current = state.attempts;
    const fb = state.lastFeedback;
    if (!fb) return;
    if (fb.kind === 'solved') {
      sfx.victory();
    } else if (fb.kind === 'checked-wrong') {
      sfx.wrong();
      setShaking(true);
      later(() => setShaking(false), 340);
      setToast({
        kind: fb.charged ? 'bad' : 'info',
        text: fb.charged
          ? `Not quite — ${fb.wrongCount} thread${fb.wrongCount === 1 ? '' : 's'} loose. · −${stepCost} steps`
          : 'Still the same folding — no charge for looking twice.',
      });
      later(() => setToast(null), 1800);
    } else if (fb.kind === 'revealed') {
      sfx.glyph();
      setToast({ kind: 'good', text: 'The crease smooths itself.' });
      later(() => setToast(null), 1100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempts]);

  const selectCell = (index: number) => {
    const owners = cellEntries.get(index);
    if (!owners || won) return;
    sfx.tap();
    if (index === active.cell && owners.length > 1) {
      // Same cell tapped again: swap between its across/down owners.
      const other = owners.find((e) => e.id !== active.entryId);
      if (other) { setActive({ cell: index, entryId: other.id }); return; }
    }
    const preferred = owners.find((e) => e.id === active.entryId) ?? owners[0]!;
    setActive({ cell: index, entryId: preferred.id });
  };

  const selectEntry = (e: CrosswordEntry) => {
    if (won) return;
    sfx.tap();
    const eCells = entryCells(puzzle, e);
    const firstEmpty = eCells.find((c) => state.cw.letters[c] === undefined);
    setActive({ cell: firstEmpty ?? eCells[0]!, entryId: e.id });
  };

  const advanceWithin = (entry: CrosswordEntry, from: number) => {
    const eCells = entryCells(puzzle, entry);
    const idx = eCells.indexOf(from);
    if (idx >= 0 && idx + 1 < eCells.length) {
      setActive({ cell: eCells[idx + 1]!, entryId: entry.id });
    }
  };

  const typeLetter = (letter: string) => {
    if (won || state.cw.revealedCells.includes(active.cell)) return;
    setPopCell(active.cell);
    later(() => setPopCell(null), 220);
    dispatch({ type: 'set-cell', index: active.cell, letter });
    advanceWithin(activeEntry, active.cell);
  };

  const backspace = () => {
    if (won) return;
    if (state.cw.letters[active.cell] !== undefined && !state.cw.revealedCells.includes(active.cell)) {
      dispatch({ type: 'set-cell', index: active.cell, letter: null });
      return;
    }
    const eCells = entryCells(puzzle, activeEntry);
    const idx = eCells.indexOf(active.cell);
    if (idx > 0) {
      const prev = eCells[idx - 1]!;
      setActive({ cell: prev, entryId: activeEntry.id });
      if (!state.cw.revealedCells.includes(prev)) dispatch({ type: 'set-cell', index: prev, letter: null });
    }
  };

  const reveal = () => {
    if (won || state.cw.revealedCells.includes(active.cell)) return;
    dispatch({ type: 'reveal-cell', index: active.cell });
  };

  const entryDone = (e: CrosswordEntry) =>
    entryCells(puzzle, e).every((c) => state.cw.letters[c] === solution.get(c));

  const activeCells = new Set(entryCells(puzzle, activeEntry));

  return (
    <div className="m2 m2--linen">
      <header className="m2__head">
        <h2 className="m2__title">The Linen Closet</h2>
        <p className="m2__sub">Small words, neatly folded. Fill every square.</p>
      </header>

      <div
        className={`lc-grid${shaking ? ' m2-shake' : ''}`}
        // The square size is a CSS variable capped on both axes (a5micro.css)
        // so the grid + clues + keyboard fit a 375x667 screen (round-4).
        style={{ gridTemplateColumns: `repeat(${puzzle.size}, var(--lc-cell, 56px))` }}
      >
        {Array.from({ length: puzzle.size * puzzle.size }, (_, i) => {
          const open = cells.includes(i);
          if (!open) return <div key={i} className="lc-cell lc-cell--void" aria-hidden />;
          const classes = ['lc-cell'];
          if (activeCells.has(i)) classes.push('lc-cell--word');
          if (i === active.cell && !won) classes.push('lc-cell--active');
          if (state.cw.wrongCells.includes(i)) classes.push('lc-cell--wrong');
          if (state.cw.revealedCells.includes(i)) classes.push('lc-cell--given');
          if (popCell === i) classes.push('lc-cell--pop');
          if (won) classes.push('lc-cell--won');
          const wonDelay = won ? { animationDelay: `${cells.indexOf(i) * 60}ms` } : undefined;
          return (
            <button
              key={i}
              ref={i === active.cell ? activeCellRef : undefined}
              className={classes.join(' ')}
              onPointerDown={(ev) => { ev.preventDefault(); selectCell(i); }}
              aria-label={`Square ${i}`}
            >
              {numberAt.has(i) && <span className="lc-cell__num">{numberAt.get(i)}</span>}
              <span className="lc-cell__ch" style={wonDelay}>{state.cw.letters[i] ?? ''}</span>
            </button>
          );
        })}
      </div>

      {won ? (
        <div className="m2-done">
          <div className="m2-toastslot" aria-live="polite">
            {toast && <span className={`m2-toast m2-toast--${toast.kind}`}>{toast.text}</span>}
          </div>
          <div className="m2-done__title">Neat as new linen.</div>
          <p className="m2-done__line">
            Every word in its place{state.cw.costedChecks === 0 && state.cw.hintsUsed === 0 ? ' — folded right the first time' : ''}.
          </p>
        </div>
      ) : (
        <>
          {/* The deck: clues + keyboard + the room's verb stay pinned to the
              bottom of the scrolling stage, so they sit in the thumb zone on
              every iPhone instead of being pushed off the glass by the grid
              (round-4 owner report; see ui/rooms/room-host.css). The clue
              rides WITH the keyboard — a clue you cannot see while typing is
              not a memory prosthetic, it is a memory test. */}
          <div className="room-deck">
          {/* ROUND 7 (AAA 11.11): the verdict slot used to sit above this deck
              in the scrolling flow, and with real iPhone insets the column ran
              21px (390×844) / 44px (375×667) past its stage — the slot opened
              at 364.9–400.1 against a deck starting at 393.1, so the room's
              answer printed underneath the keyboard. It rides the deck now. */}
          <div className="m2-toastslot" aria-live="polite">
            {toast && <span className={`m2-toast m2-toast--${toast.kind}`}>{toast.text}</span>}
          </div>

          <div className="lc-clues m2-card">
            {puzzle.entries.map((e) => (
              <button
                key={e.id}
                ref={e.id === active.entryId ? activeClueRef : undefined}
                className={`lc-clue${e.id === active.entryId ? ' lc-clue--active' : ''}${entryDone(e) ? ' lc-clue--done' : ''}`}
                onPointerDown={(ev) => { ev.preventDefault(); selectEntry(e); }}
              >
                <span className="lc-clue__id">{e.id}</span>
                <span className="lc-clue__text">{e.clue}</span>
              </button>
            ))}
          </div>

          {/* Keys commit on RELEASE (`onClick`), never on pointerdown — the
              house rule, and the same round-6 fix the Darkroom took: the deck
              is `position: sticky` over a scrolling stage, so the gesture that
              scrolls the grid begins on a key, and a press that lands wrong
              must be abortable by sliding off. Selecting a square or a clue
              still answers on pointerdown: selection commits nothing and is
              free to redo. Press feedback is `.is-pressed` from the capture
              delegate in app/platform/boot.ts, so U.1 is unaffected, and
              `touch-action: manipulation` (a5micro.css) already does the job
              the old `preventDefault()` was doing. */}
          <div className="lc-keys">
            {KEY_ROWS.map((row, ri) => (
              <div key={row} className="lc-keys__row">
                {[...row].map((k) => (
                  <button
                    key={k}
                    className="lc-key"
                    onClick={() => typeLetter(k)}
                  >
                    {k}
                  </button>
                ))}
                {ri === 2 && (
                  <button
                    className="lc-key lc-key--wide"
                    onClick={backspace}
                    aria-label="Delete"
                  >
                    ⌫
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="m2-row">
            <button className="m2-btn" onClick={reveal} disabled={state.cw.revealedCells.includes(active.cell)}>
              Smooth a crease · −{stepCost} steps
            </button>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
