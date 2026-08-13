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
import { STEP_TABLE, stepWords } from '../../../engine/economy/steps';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

/**
 * Player-facing difficulty names for the three technique tiers.
 *
 * ROUND 5 CORRECTION (AAA §0.1 honesty-over-vibes): tier 1 used to print
 * "Expert" over boards that peak at locked candidates, and an expert who reads
 * "Expert leaf — it turned on a naked pair" stops trusting every other number
 * the room prints.
 *
 * ROUND 27 — AND NOW THE LABELS HAVE A PUBLISHED LADDER BEHIND THEM. The
 * boards were regraded against `docs/BENCHMARKS.md` §7, so each of these three
 * words means one specific rung of NYT's own three (`SUDOKU_TIER_GRADE`):
 *   Steady     = NYT MEDIUM      — locked candidates, nothing above them
 *   Tough      = NYT HARD        — subsets; no wing, fish or chain, ever
 *   Diabolical = ABOVE NYT HARD  — every board needs one of the five
 * "Tough" moved DOWN a storey rather than being retired, because it was
 * always the word for NYT Hard and it was on the wrong tier. Nothing here may
 * claim a difficulty its boards do not demand; `SUDOKU_TIER_GRADE` is what
 * they do demand, and the tests re-derive it off the shipped boards.
 */
const TIER_NAME: Record<1 | 2 | 3, string> = {
  1: 'Steady',
  2: 'Tough',
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
  puzzle, state, tier, dispatch, resumed,
}: RoomViewProps<SudokuPuzzle, SudokuRoomState, SudokuAction>) {
  const engine = state.engine;
  const won = engine.status === 'won';
  /**
   * ═══ ROUND 45 — THE WORST OF THE FIVE: A PRINTED PRICE 6x THE CHARGE ══════
   *
   * These two lines were `tier === 3 ? 3 : 2` and `claimCost * 2`, transcribed
   * against the pre-round-42 ladder. Round 42 made every costed claim and every
   * purchased hint −1 at every weight and every tier, so at tier 3 the Counting
   * House printed "Consult a figure · −6 steps" on a BUTTON and the ledger took
   * one. A stale toast teaches a false rule; a stale button asks her to decide
   * on a lie. Both are read off the table now, by the weight the adapter
   * actually emits (`sudoku-adapter.ts`: balance/nudge are weight 1, a revealed
   * figure is weight 2), and `tests/round45-prices-live.mjs` drives each button
   * and compares the printed string against the counter the ledger moved.
   */
  const claimCost = -STEP_TABLE.mistake(1, tier);   // balance — weight 1
  const nudgeCost = -STEP_TABLE.hint(1, tier);      // a word from the clerk
  const figureCost = -STEP_TABLE.hint(2, tier);     // consult a figure — weight 2

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

  /**
   * ROUND 27 — THE RESUMED LEAF ANNOUNCES ITSELF WHERE THE ROOM ALWAYS HAS
   * GLASS, AND THIS IS A LIVE-PASS FIX, NOT A FLOURISH.
   *
   * The line in `.ch__sub` is the natural home for it and it is DISPLAY:NONE
   * below 760px of viewport, and the whole head goes below 700 — round 7 traded
   * both away so the ledger leaf could be whole on a 667px phone
   * (counting-house.css). Measured at 375×667: the grid came back from
   * yesterday and the room said nothing about it. So the fact also goes through
   * the two surfaces the deck reserves at EVERY size — the toast slot on open,
   * and the meta line at rest for as long as the leaf is a carry-over — while
   * the RULE ("the house is put away at night; this leaf is not") is the
   * footer's, which is on the glass at both sizes.
   */
  useEffect(() => {
    if (!resumed) return;
    setToast({
      kind: 'info',
      // ONE LINE, and short enough to stay one line at 375×667 — the toast slot
      // is a `min-height`, so a wrapped notice takes its second line off the
      // ledger leaf (measured: 21px of overflow at the fuller wording). The
      // RULE this is a consequence of lives in the footer note, which has room
      // for two lines because it is not competing with the board.
      text: `Left open on day ${resumed.day} — still yours.`,
    });
    later(() => setToast(null), 3200);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per resumed leaf
  }, [puzzle.id, resumed?.day]);

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
              ? `The books balance — ${mine} · −${stepWords(claimCost)}`
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
            ? `${tally} · −${stepWords(claimCost)}`
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
          text: `${lead}${phrase.it} ${verb} ${place} · −${stepWords(nudgeCost)}`,
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
        setToast({ kind: 'info', text: `The old ledger supplies one figure · −${stepWords(figureCost)}` });
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
  /**
   * Nothing of hers on the leaf yet — no figure inked, no mark pencilled, and
   * not a board carried over from an earlier day. The condition the room's one
   * standing rule retires on (round 28).
   */
  const virgin = !resumed
    && engine.pencil.every((m) => m === 0)
    && engine.values.every((v, i) => v === 0 || puzzle.givens[i] !== '.');
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
        {/* ROUND 28 — `.ch__sub` IS GONE, BECAUSE IT WAS NEVER ON A PHONE.
            Round 27's own comment above this line said the truth out loud —
            "it is DISPLAY:NONE below 760px of viewport" — and then wrote two
            paragraphs into it anyway. Re-measured: `display: none` under
            `@media (max-height: 900px)` (counting-house.css) is 0.0 x 0.0 at
            390x844 AND at 375x667, so BOTH branches were unreadable on every
            device the game ships to. The carry-over branch was already routed
            through the two surfaces the deck reserves at every size (the
            opening toast and the meta line) by that same round; the standing
            branch is now routed the same way — the shape of the leaf goes in
            the reserved line until she inks her first figure, and the price of
            a weighing is on the verb button that charges it. */}
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
              // ROUND 16 (COZY pillar): her best moment used to be delivered
              // as the dead man's hatred — "would have hated how easy you made
              // that look" — which routes praise through someone's contempt
              // and uses the exact register the tone gate blocks in display
              // words. The compliment belongs to her now.
              ? 'Not one figure struck out. He kept his ledgers exactly this clean, and it took him thirty years.'
              : 'Every column carries its nine. The house is square again.'}
          </p>
          {peak && (
            <p className="ch-done__note">
              {TIER_NAME[puzzle.tier]} leaf — it turned on {article(TECHNIQUE_NAMES[peak])} {TECHNIQUE_NAMES[peak]}.
            </p>
          )}
          {/* ROUND 27 — AND THE EXCEPTION CLOSES OUT LOUD. If the room only
              ever said "this leaf stays open", a player would have no way to
              know the offer had ended and that tomorrow's Counting House deals
              a new board. Three notices: leaving, returning, and here. */}
          <p className="ch-done__note">This leaf is closed. The next one will be a fresh sheet.</p>
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
          {/* ROUND 7 (AAA 11.11, measured with real iPhone insets): this slot
              used to sit OUTSIDE the deck, in the scrolling flow. The leaf plus
              its head made the column 60px taller than the stage at both
              390×844 and 375×667, so the slot's own box (top 590, bottom 631.6)
              opened entirely UNDERNEATH the sticky deck (top 582.6) — the
              room's refusals and its figure count were painted behind the
              keypad. Moved inside the deck, above the toolbar: the deck is the
              thing that is always on the glass, so the room's answer is too. */}
          {/* Thumb zone: sticky, always reachable, board scrolls behind it.
              The verbs read free → priced, left to right, and every priced one
              prints its own price in its label, so the cost of a verb is never
              a surprise (AAA 4.6's principle). They share ONE row at every
              size: the second band cost ~48px of height, and height is what
              decides how big the ledger leaf can be (counting-house.css). */}
          <div className="room-deck">
            <div className="ch-toastslot">
              {/* ROUND 28 — THE SHAPE OF THE LEAF, ON GLASS THAT EXISTS.
                  A SELF-RETIRING label on a leaf she has not touched: the one
                  rule of the room, in the one line the deck reserves at every
                  height. It goes the instant she inks a figure, because a
                  player who has inked one has demonstrably got it, and the
                  line returns to the count it has always been. */}
              {!toast && virgin && (
                <span className="ch__meta">Every row, column and quarter holds all nine.</span>
              )}
              {!toast && !virgin && (
                <span className="ch__meta tabular-nums">
                  {/* Round 27: on a carry-over leaf the newsworthy half of this
                      line is WHERE THE BOARD CAME FROM, not its grade — and
                      this slot is the one piece of chrome the deck reserves at
                      every viewport height, so it is where the fact can be
                      trusted to land. The grade is still printed on the
                      finished card. */}
                  <span>{resumed ? `Left open day ${resumed.day}` : `${TIER_NAME[puzzle.tier]} leaf`}</span>
                  <span>{left} {left === 1 ? 'figure' : 'figures'} left</span>
                </span>
              )}
              <span className="ch-toast-live" aria-live="polite">
                {toast && <span className={`ch-toast ch-toast--${toast.kind}`}>{toast.text}</span>}
              </span>
            </div>
            {/* ROUND 8 TYPE PASS (AAA 6.6) — THE TWO-LINE VERB.
                These five labels were the smallest painted text in the game:
                0.8rem = 12.8px, three published floors under the body serif's
                16, and round 7 reported them without fixing them because the
                copy could not wrap into a 44px key at any legible size. The
                label is now a VERB line and a PRICE line, so the button is
                exactly two lines tall by construction and both of them are
                15px. The long in-voice phrasing is not lost — it is the
                aria-label and the tooltip, where it was already duplicated.
                Every priced key still prints its own price (the reason the
                free/priced bands could collapse into one row in round 7). */}
            <div className="ch-toolbar">
              <div className="ch-tools ch-tools--free">
                <button
                  className={`ch-tool${pencilMode ? ' ch-tool--on' : ''}`}
                  aria-pressed={pencilMode}
                  aria-label={`Pencil mode — ${pencilMode ? 'on' : 'off'}, free`}
                  title="Pencil mode — free"
                  onClick={() => { sfx.tap(); setPencilMode((p) => !p); }}
                >
                  <span className="ch-tool__verb">✎ Pencil</span>
                  <span className="ch-tool__price">{pencilMode ? 'on' : 'off'}</span>
                </button>
                <button
                  className="ch-tool"
                  onClick={() => { sfx.tap(); dispatch({ type: 'fill-pencil' }); }}
                  aria-label="Pencil every figure that still fits in each blank cell — free"
                  title="Pencil every figure that still fits — free"
                >
                  <span className="ch-tool__verb">Fill marks</span>
                </button>
              </div>
              <div className="ch-tools ch-tools--priced">
                <button
                  className="ch-tool"
                  onClick={() => dispatch({ type: 'balance' })}
                  aria-label={`Balance the books: check the leaf against his hand, minus ${stepWords(claimCost)}`}
                  title="Balance the books"
                >
                  <span className="ch-tool__verb">Balance</span>
                  <span className="ch-tool__price">−{stepWords(claimCost)}</span>
                </button>
                <button
                  className="ch-tool"
                  onClick={() => dispatch({ type: 'nudge' })}
                  aria-label={`A word from the clerk: name the next deduction on this leaf, minus ${stepWords(nudgeCost)}`}
                  title="Ask the clerk"
                >
                  <span className="ch-tool__verb">Ask clerk</span>
                  <span className="ch-tool__price">−{stepWords(nudgeCost)}</span>
                </button>
                <button
                  className="ch-tool"
                  onClick={consult}
                  aria-label={`Consult a figure: the ledger fills the selected cell, minus ${stepWords(figureCost)}`}
                  title="Consult a figure"
                >
                  <span className="ch-tool__verb">Consult</span>
                  <span className="ch-tool__price">−{stepWords(figureCost)}</span>
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
