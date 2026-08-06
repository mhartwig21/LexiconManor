/**
 * The Counting House — Sudoku view. OWNER: sudoku room agent.
 *
 * A ledger leaf: nine rows, nine columns, nine quarters, every figure once.
 * 390px-first — the leaf takes the full width so the figures stay large, and
 * every control lives in the sticky `.room-deck` thumb cluster at the bottom
 * (>=44px keys, AAA 6.19). Nothing on the board commits anything: tapping a
 * cell only moves the cursor, so a fat-fingered tap on a 43px cell is free.
 * (Nine cells at the 44px floor need 396px of glass; the phone offers 390 —
 * see counting-house.css for the measurement and the exemption note.)
 *
 * ═══ PLAY MODEL (round 5 rewrite) ═══
 * The leaf no longer marks her work as she goes. Pencil marks are free and
 * "Pencil what fits" fills them all in one tap (NYT's Auto Candidate Mode —
 * the tier-2/3 techniques are unreachable without complete marks). Inking is
 * free too: a figure that duplicates a visible peer is a dead letter (shake +
 * reason, nothing lands, nothing charged), and anything else LANDS as her own
 * unsettled ink, right or wrong, and lifts off again with the eraser. The eraser
 * is SURGICAL (round 10): it lifts one figure, or rubs out ONE pencil mark —
 * the last one written, named on the key before the tap — never the cell's
 * whole mask, and Undo walks any of it back. The priced
 * verbs are the CLAIM — "Balance the books", which reports how many of her
 * figures are astray without naming them — and two grades of help: the clerk's
 * technique nudge (cheap, teaches, keeps `perfect`) and consulting an actual
 * figure (dear, and it costs the bonus).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import {
  PEERS, TECHNIQUE_LEVEL, TECHNIQUE_NAMES, blanksRemaining, digitCount, isGiven,
  lastPencilMark, unitName,
  type SudokuPuzzle, type TechniqueId,
} from '../../../engine/puzzles/sudoku';
import type { SudokuAction, SudokuRoomState } from '../../../engine/puzzles/sudoku-adapter';
import { sfx } from '../../../app/sound';
import './counting-house.css';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

/**
 * Player-facing difficulty names for the three technique tiers.
 *
 * ROUND 5 CORRECTION (AAA §0.1 honesty-over-vibes): tier 1 used to print
 * "Expert". The engine is honest — 39/40 tier-1 boards peak at locked
 * candidates and the rest at a naked/hidden pair — but that ceiling is NYT
 * *Hard*, and an expert who reads "Expert leaf — it turned on a naked pair"
 * stops trusting every other number the room prints. The ladder now says what
 * the boards demand, and still escalates in three distinct in-world words.
 */
const TIER_NAME: Record<1 | 2 | 3, string> = {
  1: 'Tough',
  2: 'Expert',
  3: 'Diabolical',
};

const FIGURES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const rowOf = (cell: number) => Math.floor(cell / 9);
const colOf = (cell: number) => cell % 9;

function article(word: string): string {
  return /^[aeioux]/i.test(word) ? 'an' : 'a';
}

/**
 * The clerk's phrasing for each technique — an article and a number the copy
 * can agree with, so the nudge reads as a sentence a person wrote ("locked
 * candidates SIT in the eighth quarter", not "a locked candidates sits").
 */
const NUDGE_PHRASE: Record<TechniqueId, { it: string; plural?: true }> = {
  'naked-single': { it: 'a forced figure' },
  'hidden-single': { it: 'a hidden single' },
  'locked-candidates': { it: 'locked candidates', plural: true },
  'naked-pair': { it: 'a naked pair' },
  'hidden-pair': { it: 'a hidden pair' },
  'naked-triple': { it: 'a naked triple' },
  'hidden-triple': { it: 'a hidden triple' },
  'x-wing': { it: 'an X-wing' },
  'xy-wing': { it: 'an XY-wing' },
  'swordfish': { it: 'a swordfish' },
  'xyz-wing': { it: 'an XYZ-wing' },
  'simple-colouring': { it: 'a colouring chain' },
};

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
  const claimCost = tier === 3 ? 3 : 2;      // balance / nudge — weight 1
  const figureCost = claimCost * 2;          // consult a figure — weight 2

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
  const [refused, setRefused] = useState<{ cell: number; digit: number; conflict: number } | null>(null);
  const [shaking, setShaking] = useState(false);
  const [pop, setPop] = useState<number | null>(null);
  const [skipReveal, setSkipReveal] = useState(false);

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
    setShaking(false);
    setPop(null);
    setSkipReveal(false);
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
    const cell = engine.values.findIndex((v, i) => v !== prev[i] && v !== 0);
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
      case 'malformed': {
        // The leaf already showed the clash — a dead letter, not a debt.
        sfx.wrong();
        setRefused({ cell: fb.cell, digit: fb.digit, conflict: fb.conflict });
        later(() => setRefused(null), 360);
        setShaking(true);
        later(() => setShaking(false), 340);
        const where = fb.conflict >= 0
          ? `row ${rowOf(fb.conflict) + 1}, column ${colOf(fb.conflict) + 1}`
          : 'this row, column or quarter';
        setToast({ kind: 'info', text: `A ${fb.digit} already stands at ${where} — no charge.` });
        later(() => setToast(null), 1900);
        break;
      }
      case 'balanced': {
        if (fb.settled === 0) {
          setToast({ kind: 'info', text: 'Nothing of yours to weigh yet — ink freely, it costs nothing.' });
          later(() => setToast(null), 1700);
          break;
        }
        const mine = fb.settled === 1 ? 'your one figure sits true' : `all ${fb.settled} of your figures sit true`;
        if (fb.astray === 0) {
          sfx.glyph();
          setToast({
            kind: 'good',
            text: fb.charged
              ? `The books balance — ${mine} · −${claimCost} steps`
              : `The books balance — ${mine}. No charge for weighing twice.`,
          });
          later(() => setToast(null), 2000);
          break;
        }
        sfx.wrong();
        setShaking(true);
        later(() => setShaking(false), 340);
        // "N of M figures are astray" — never WHICH. The claim grammar the
        // Darkroom and the Linen Closet already speak.
        const tally = `${fb.astray} of your ${fb.settled} `
          + `${fb.settled === 1 ? 'figure is' : 'figures are'} astray`;
        setToast({
          kind: fb.charged ? 'bad' : 'info',
          text: fb.charged
            ? `${tally} · −${claimCost} steps`
            : `${tally} — no charge for weighing twice.`,
        });
        later(() => setToast(null), 2200);
        break;
      }
      case 'nudge': {
        sfx.glyph();
        const phrase = NUDGE_PHRASE[fb.technique];
        const verb = phrase.plural ? 'sit' : 'sits';
        const place = fb.unit === null ? 'across the whole leaf' : `in ${unitName(fb.unit)}`;
        const lead = fb.singlesPending > 0
          ? `${fb.singlesPending} ${fb.singlesPending === 1 ? 'figure is' : 'figures are'} already forced; after them, `
          : '';
        setToast({
          kind: 'good',
          text: `${lead}${phrase.it} ${verb} ${place} · −${claimCost} steps`,
        });
        later(() => setToast(null), 3400);
        break;
      }
      case 'no-nudge':
        setToast({
          kind: 'info',
          text: 'The clerk finds no next step on this leaf — lift a figure and ask again. No charge.',
        });
        later(() => setToast(null), 2400);
        break;
      case 'revealed':
        sfx.glyph();
        setToast({ kind: 'info', text: `The old ledger supplies one figure · −${figureCost} steps` });
        later(() => setToast(null), 1900);
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

  const canLift = sel !== null
    && engine.values[sel] !== 0
    && !isGiven(puzzle, sel)
    && !engine.revealed.includes(sel);

  const pressFigure = (digit: number) => {
    if (won || sel === null) return;
    if (pencilMode) {
      if (engine.values[sel] !== 0) return;   // no marks on a filled cell
      sfx.tap();
      dispatch({ type: 'pencil', cell: sel, digit });
      return;
    }
    dispatch({ type: 'ink', cell: sel, digit });
  };

  /**
   * ROUND 10 — THE ERASER IS SURGICAL (AAA 3.3).
   *
   * One eraser, two jobs, in the order she means them: lift her own figure if
   * one is standing here, otherwise rub out the LAST mark she wrote in this
   * cell — not the cell's whole mask. Both free. The key names the figure it
   * is about to take ("Rub out 7"), so the surgery is legible before the tap
   * rather than explained after it, and every peel is separately undoable.
   */
  const nextMark = sel === null ? 0 : lastPencilMark(engine, sel);
  const erase = () => {
    if (won || sel === null) return;
    sfx.tap();
    if (canLift) dispatch({ type: 'unink', cell: sel });
    else dispatch({ type: 'erase-mark', cell: sel });
  };

  // Undo — the permanent, always-visible control NYT Sudoku ships for the same
  // reason we do: pencil work IS the solve (AAA 3.3), so no free tap may cost
  // her ten minutes of eliminations with no way back. Board only; steps stay
  // spent, and a bought figure is never walked off the leaf.
  const canUndo = !won && state.history.length > 0;
  const undo = () => {
    if (!canUndo) return;
    sfx.tap();
    dispatch({ type: 'undo' });
  };

  const consult = () => {
    if (won) return;
    dispatch({ type: 'reveal-cell', cell: sel !== null && engine.values[sel] === 0 ? sel : undefined });
  };

  const canErase = canLift || nextMark !== 0;

  return (
    <div className="ch">
      <header className="ch__head">
        <h2 className="ch__title">The Counting House</h2>
        <p className="ch__sub">
          Every row, column, and quarter carries all nine figures once. Ink freely — the ledger only
          answers when you ask it to balance.
        </p>
      </header>

      <div
        className={`ch-leaf${won ? ' ch-leaf--won' : ''}${won && skipReveal ? ' ch-leaf--skip' : ''}${shaking ? ' ch-shake' : ''}`}
        role="group"
        aria-label="Ledger leaf"
      >
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
            refused?.conflict === cell ? 'ch-cell--clash' : '',
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
                <span
                  className="ch-cell__fig"
                  // AAA 3.1: the win is a sequential reveal, never an instant
                  // repaint. A diagonal wipe — 14ms per (row + col) step, a
                  // 224ms head and ~740ms total, inside the 2s ceiling — and
                  // tapping the panel drops every delay (AAA 3.4 / U.2).
                  style={won ? { animationDelay: `${(r + c) * 14}ms` } : undefined}
                >
                  {value}
                </span>
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
        <div className="ch-done" onPointerDown={() => setSkipReveal(true)}>
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
          {/* ONE reserved line of chrome, not two: the tier + figures-left sit
              here at rest and the toast takes the slot when there is one. The
              ~27px that used to be a second row went to the ledger leaf, which
              is the thing that has to be whole (AAA 3.3 / 7.7). Fixed height,
              so nothing shifts either way (AAA 1.5's principle). The meta sits
              OUTSIDE the live region — a screen reader should hear refusals
              and reports, not a figure count re-read on every ink. */}
          <div className="ch-toastslot">
            {!toast && (
              <span className="ch__meta tabular-nums">
                <span>{TIER_NAME[puzzle.tier]} leaf</span>
                <span>{left} {left === 1 ? 'figure' : 'figures'} left</span>
              </span>
            )}
            <span className="ch-toast-live" aria-live="polite">
              {toast && <span className={`ch-toast ch-toast--${toast.kind}`}>{toast.text}</span>}
            </span>
          </div>

          {/* Thumb zone: sticky, always reachable, board scrolls behind it.
              The verbs read free → priced, left to right, and every priced one
              prints its own price in its label, so the cost of a verb is never
              a surprise (AAA 4.6's principle). They share ONE row at every
              size: the second band cost ~48px of height, and height is what
              decides how big the ledger leaf can be (counting-house.css). */}
          <div className="room-deck">
            <div className="ch-toolbar">
              <div className="ch-tools ch-tools--free">
                <button
                  className={`ch-tool${pencilMode ? ' ch-tool--on' : ''}`}
                  aria-pressed={pencilMode}
                  onClick={() => { sfx.tap(); setPencilMode((p) => !p); }}
                >
                  {pencilMode ? '✎ Pencil — on' : '✎ Pencil — off'}
                </button>
                <button
                  className="ch-tool"
                  onClick={() => { sfx.tap(); dispatch({ type: 'fill-pencil' }); }}
                  aria-label="Pencil every figure that still fits in each blank cell — free"
                >
                  Pencil what fits
                </button>
              </div>
              <div className="ch-tools ch-tools--priced">
                <button className="ch-tool" onClick={() => dispatch({ type: 'balance' })}>
                  Balance the books · −{claimCost}
                </button>
                <button
                  className="ch-tool"
                  onClick={() => dispatch({ type: 'nudge' })}
                  aria-label={`A word from the clerk: name the next deduction on this leaf, minus ${claimCost} steps`}
                >
                  Ask the clerk · −{claimCost}
                </button>
                <button className="ch-tool" onClick={consult}>
                  Consult a figure · −{figureCost}
                </button>
              </div>
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
              {/* Undo sits beside Erase, in the pad, permanently — not behind a
                  menu. Six columns rather than five, so the eleventh key costs
                  the ledger no height (the axis this room has none of). */}
              <button
                className="ch-key ch-key--verb"
                onClick={undo}
                disabled={!canUndo}
                aria-label="Undo the last change to the leaf"
              >
                ↶ Undo
              </button>
              <button
                className="ch-key ch-key--verb ch-key--wide"
                onClick={erase}
                disabled={!canErase}
                aria-label={
                  canLift
                    ? 'Lift this figure back off the leaf'
                    : nextMark !== 0
                      ? `Rub out the ${nextMark} penciled in this cell — the other marks stay`
                      : 'Nothing to rub out in this cell'
                }
              >
                {canLift ? 'Lift' : nextMark !== 0 ? `Rub out ${nextMark}` : 'Rub out'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
