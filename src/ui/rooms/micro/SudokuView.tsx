/**
 * The Counting House — Sudoku view. OWNER: sudoku room agent.
 *
 * A ledger leaf: nine rows, nine columns, nine quarters, every figure once.
 * 390px-first — the leaf takes the full width so the figures stay large, and
 * every control lives in the sticky `.room-deck` thumb cluster at the bottom
 * (>=44px keys, AAA 6.19). Nothing on the board commits anything: tapping a
 * cell only moves the cursor, so a fat-fingered tap on a 42px cell is free.
 *
 * Play model (owner directive, playtest round — the dictionary-style free
 * refusal does NOT apply here): PENCIL MARKS ARE FREE, so exploration costs
 * nothing; INKING is the claim, and a figure that contradicts the ledger is
 * refused (it never lands — a known-false digit is anti-information, AAA 3.3)
 * and costs one mistake. Consulting the ledger is a step-priced hint.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import {
  PEERS, TECHNIQUE_LEVEL, TECHNIQUE_NAMES, blanksRemaining, digitCount, isGiven,
  type SudokuPuzzle, type TechniqueId,
} from '../../../engine/puzzles/sudoku';
import type { SudokuAction, SudokuRoomState } from '../../../engine/puzzles/sudoku-adapter';
import { sfx } from '../../../app/sound';
import './counting-house.css';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

/** Player-facing difficulty names for the three technique tiers. */
const TIER_NAME: Record<1 | 2 | 3, string> = {
  1: 'Expert',
  2: 'Fiendish',
  3: 'Diabolical',
};

const FIGURES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const rowOf = (cell: number) => Math.floor(cell / 9);
const colOf = (cell: number) => cell % 9;

function article(word: string): string {
  return /^[aeioux]/i.test(word) ? 'an' : 'a';
}

/** The hardest technique the board actually required (for the post-solve note). */
function peakTechnique(techniques: readonly TechniqueId[]): TechniqueId | null {
  let best: TechniqueId | null = null;
  for (const id of techniques) {
    if (!best || TECHNIQUE_LEVEL[id] > TECHNIQUE_LEVEL[best]) best = id;
  }
  return best;
}

export default function SudokuView({
  puzzle, state, tier, dispatch,
}: RoomViewProps<SudokuPuzzle, SudokuRoomState, SudokuAction>) {
  const engine = state.engine;
  const won = engine.status === 'won';
  const hintCost = tier === 3 ? 3 : 2;

  const firstBlank = useMemo(
    () => {
      const i = engine.values.findIndex((v) => v === 0);
      return i === -1 ? null : i;
    },
    // Only the opening cursor: recomputed per puzzle, not per ink.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [puzzle.id],
  );

  const [sel, setSel] = useState<number | null>(firstBlank);
  const [pencilMode, setPencilMode] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [refused, setRefused] = useState<{ cell: number; digit: number } | null>(null);
  const [pop, setPop] = useState<number | null>(null);

  const handledAttempt = useRef(0);
  const prevValues = useRef<number[] | null>(null);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // A different leaf in the same mounted view must not inherit the cursor.
  useEffect(() => {
    setSel(firstBlank);
    setPencilMode(false);
    setToast(null);
    setRefused(null);
    setPop(null);
    // Drop the previous leaf's board, or the first render of the new one
    // reads as 81 figures changing at once (a phantom pop + chime).
    prevValues.current = null;
    handledAttempt.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset keyed to the session only
  }, [puzzle.id]);

  // Ink landed: a small pop + a rising chime (the reveal chime is handled with
  // the rest of the adapter feedback below, so a consulted figure never
  // double-sounds).
  useEffect(() => {
    const prev = prevValues.current;
    prevValues.current = engine.values;
    if (!prev) return;
    const cell = engine.values.findIndex((v, i) => v !== prev[i]);
    if (cell === -1) return;
    setPop(cell);
    later(() => setPop(null), 220);
    if (!engine.revealed.includes(cell)) sfx.correct(81 - blanksRemaining(engine));
  }, [engine.values]);

  // Costed / notable moments, keyed off the adapter's attempt counter.
  useEffect(() => {
    if (state.attempts === handledAttempt.current) return;
    handledAttempt.current = state.attempts;
    const fb = state.lastFeedback;
    if (!fb) return;
    switch (fb.kind) {
      case 'contradiction':
        sfx.wrong();
        setRefused({ cell: fb.cell, digit: fb.digit });
        later(() => setRefused(null), 360);
        setToast({ kind: 'bad', text: `The ledger will not hold a ${fb.digit} there · −${hintCost} steps` });
        later(() => setToast(null), 1900);
        break;
      case 'revealed':
        sfx.glyph();
        setToast({ kind: 'info', text: `The old ledger supplies one figure · −${hintCost} steps` });
        later(() => setToast(null), 1700);
        break;
      case 'solved':
        sfx.victory();
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempts]);

  const peers = useMemo(() => (sel === null ? new Set<number>() : new Set(PEERS[sel]!)), [sel]);
  const cursorFigure = sel === null ? 0 : engine.values[sel]!;
  const left = blanksRemaining(engine);
  const peak = peakTechnique(puzzle.techniques);

  const selectCell = (cell: number) => {
    if (won) return;
    sfx.tap();
    setSel(cell);
  };

  const pressFigure = (digit: number) => {
    if (won || sel === null) return;
    if (engine.values[sel] !== 0) return;   // filled: nothing to write, nothing costed
    if (pencilMode) {
      sfx.tap();
      dispatch({ type: 'pencil', cell: sel, digit });
      return;
    }
    dispatch({ type: 'ink', cell: sel, digit });
  };

  const erase = () => {
    if (won || sel === null) return;
    sfx.tap();
    dispatch({ type: 'clear-pencil', cell: sel });
  };

  const consult = () => {
    if (won) return;
    dispatch({ type: 'reveal-cell', cell: sel !== null && engine.values[sel] === 0 ? sel : undefined });
  };

  const canErase = sel !== null && engine.pencil[sel]! !== 0;

  return (
    <div className="ch">
      <header className="ch__head">
        <h2 className="ch__title">The Counting House</h2>
        <p className="ch__sub">
          Every row, column, and quarter carries all nine figures once. Pencil freely — ink only when sure.
        </p>
      </header>

      <div className={`ch-leaf${won ? ' ch-leaf--won' : ''}`} role="group" aria-label="Ledger leaf">
        {engine.values.map((value, cell) => {
          const r = rowOf(cell);
          const c = colOf(cell);
          const given = isGiven(puzzle, cell);
          const consulted = engine.revealed.includes(cell);
          const marks = engine.pencil[cell]!;
          const isRefused = refused?.cell === cell;
          const cls = [
            'ch-cell',
            c % 3 === 2 ? (c === 8 ? 'ch-cell--edger' : 'ch-cell--boxr') : '',
            r % 3 === 2 ? (r === 8 ? 'ch-cell--edgeb' : 'ch-cell--boxb') : '',
            sel === cell ? 'ch-cell--sel' : peers.has(cell) ? 'ch-cell--peer' : '',
            given ? 'ch-cell--given' : value !== 0 ? 'ch-cell--inked' : '',
            consulted ? 'ch-cell--consulted' : '',
            cursorFigure !== 0 && value === cursorFigure && sel !== cell ? 'ch-cell--samefig' : '',
            isRefused ? 'ch-cell--wrong' : '',
            pop === cell ? 'ch-cell--pop' : '',
          ].filter(Boolean).join(' ');

          return (
            <button
              key={cell}
              className={cls}
              onPointerDown={() => selectCell(cell)}
              aria-label={
                `Row ${r + 1}, column ${c + 1}: `
                + (value !== 0
                  ? `${value}${given ? ', printed' : consulted ? ', consulted' : ', inked'}`
                  : marks !== 0
                    ? `penciled ${FIGURES.filter((d) => marks & (1 << (d - 1))).join(' ')}`
                    : 'blank')
              }
            >
              {value !== 0 ? (
                <span className="ch-cell__fig">{value}</span>
              ) : marks !== 0 ? (
                <span className="ch-pencil" aria-hidden="true">
                  {FIGURES.map((d) => (
                    <span key={d} className={cursorFigure === d ? 'is-hit' : undefined}>
                      {marks & (1 << (d - 1)) ? d : ''}
                    </span>
                  ))}
                </span>
              ) : null}
              {isRefused && <span className="ch-cell__ghost" aria-hidden="true">{refused.digit}</span>}
            </button>
          );
        })}
      </div>

      {won ? (
        <div className="ch-done">
          <p className="ch-done__title">The ledger balances</p>
          <p className="ch-done__line">
            {state.costedMistakes === 0 && state.hintsBought === 0
              ? 'Not one figure struck out. The lexicographer would have hated how easy you made that look.'
              : 'Every column carries its nine. The house is square again.'}
          </p>
          {peak && (
            <p className="ch-done__note">
              {TIER_NAME[puzzle.tier]} leaf — it turned on {article(TECHNIQUE_NAMES[peak])} {TECHNIQUE_NAMES[peak]}.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="ch__meta tabular-nums">
            <span>{TIER_NAME[puzzle.tier]} leaf</span>
            <span>{left} {left === 1 ? 'figure' : 'figures'} left</span>
          </div>

          <div className="ch-toastslot" aria-live="polite">
            {toast && <span className={`ch-toast ch-toast--${toast.kind}`}>{toast.text}</span>}
          </div>

          {/* Thumb zone: sticky, always reachable, board scrolls behind it. */}
          <div className="room-deck">
            <div className="ch-tools">
              <button
                className={`ch-tool${pencilMode ? ' ch-tool--on' : ''}`}
                aria-pressed={pencilMode}
                onClick={() => { sfx.tap(); setPencilMode((p) => !p); }}
              >
                {pencilMode ? '✎ Pencil — on' : '✎ Pencil — off'}
              </button>
              <button className="ch-tool" onClick={consult}>
                Consult the ledger · −{hintCost}
              </button>
            </div>

            <div className={`ch-pad${pencilMode ? ' ch-pad--pencil' : ''}`}>
              {FIGURES.map((d) => {
                const placed = digitCount(engine, d);
                return (
                  <button
                    key={d}
                    className={`ch-key ch-key--fig${placed === 9 ? ' ch-key--done' : ''}`}
                    // Costed actions commit on RELEASE, never on pointerdown:
                    // the deck is sticky at the bottom of a scrolling stage,
                    // and a downward drag that begins on a key must scroll the
                    // board, not spend steps. (Press feedback is CSS :active,
                    // so the tap still answers instantly — AAA 1.2/U.1.)
                    onClick={() => pressFigure(d)}
                    disabled={sel === null || (!pencilMode && placed === 9)}
                    aria-label={`${pencilMode ? 'Pencil' : 'Ink'} ${d}, ${9 - placed} left to place`}
                  >
                    {d}
                    <span className="ch-key__left tabular-nums" aria-hidden="true">{9 - placed}</span>
                  </button>
                );
              })}
              <button
                className="ch-key ch-key--wide"
                onClick={erase}
                disabled={!canErase}
                aria-label="Erase the pencil marks in this cell"
              >
                Erase
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
