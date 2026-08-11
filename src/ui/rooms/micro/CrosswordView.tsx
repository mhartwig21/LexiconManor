/**
 * The Linen Closet — the sparse clue room with a hem. OWNER: A5.
 *
 * NOT A CROSSWORD (docs/LINEN_CLOSET.md, the owner's ruling; docs/BENCHMARKS.md
 * §10, the NYT Acrostic teardown written to replace the Mini's). The board is a
 * skeleton, the clues are the content, and the letters are checked by a SPINE.
 *
 * ─── ROUND 29, AND THE THREE THINGS THIS FILE HAD WRONG ────────────────────
 *
 * 1. THREE OF FIVE CLUES WERE OFF THE GLASS. Measured at HEAD on
 *    `crossword-t3-19` at 375x667: `.lc-clues` was 88px of scrollport over
 *    220px of rows, and 3D, 4A and 5A failed the hit test at their centre AND
 *    at all four inset corners — they were behind the QWERTY. If the clues are
 *    the puzzle, three of five hidden is not a presentation bug. The arithmetic
 *    is unforgiving and is written down where the numbers live (a5micro.css):
 *    five 44px clue rows over a five-rank board wanted 132px this stage does
 *    not have. Three things paid it, none of them the board:
 *      · the clue rows STOPPED BEING CONTROLS. They are the page now, not a
 *        picker — selection lives on the numbered squares, where a crossword
 *        has always put it, plus the auto-advance below. A row that commits
 *        nothing is not under AAA 6.19, and 5 x 28px fits where 5 x 44 cannot.
 *      · the room's verb moved into the keyboard as a wide key (>=44x44pt, so
 *        6.19's "every COSTED control, no exception" still holds) and its own
 *        44px row went away.
 *      · tier 3 went from five entries to four (+ the hem), which is a
 *        shortening, declared: 5 clues printed before, 5 printed now, ~17
 *        letters to type before, ~14 now.
 *
 * 2. THE ROOM HAD A FREE CORRECTNESS ORACLE AND HAS NOT GOT ONE NOW. Until
 *    this round `.lc-clue--done` dimmed a clue the moment its entry matched the
 *    SOLUTION — a free, unlimited, per-entry right/wrong answer, in a room
 *    whose whole economy rests on the full-grid check being the one costed
 *    claim. The doc that sent this round said "nothing disambiguates a wrong
 *    answer"; the truth was worse — something did, for free, and it made the
 *    charge unreachable for anyone who noticed. The dim now means FILLED (every
 *    square has a letter in it), which is a fact about her, not about the
 *    answer, and the honest partial check is the hem.
 *
 * 3. THE HEM. One marked square per entry, mirrored down the right edge of the
 *    clue list so the column reads as a word, with the hem's own clue on the
 *    last row. It is derived from letters already placed, so it is free, like a
 *    crossing; it refuses to spell when an entry is wrong; and read the other
 *    way it hands one letter to every entry.
 *
 * 390px-first: all clues visible at once (memory prosthetic — nothing hidden
 * behind a picker), in-view QWERTY in the thumb zone (no iOS keyboard, no
 * focus-zoom, no viewport dance). Reduced motion strips all juice; states stay
 * legible (AAA U.3).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import {
  entryCells, hemLetters, isHemSpelled, openCells,
  type CrosswordEntry, type CrosswordPuzzle,
} from '../../../engine/puzzles/crossword';
import type { CrosswordAction, CrosswordRoomState } from '../../../engine/puzzles/crossword-adapter';
import { sfx } from '../../../app/sound';
import './a5micro.css';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export default function CrosswordView({ puzzle, state, tier, dispatch }: RoomViewProps<CrosswordPuzzle, CrosswordRoomState, CrosswordAction>) {
  const cells = useMemo(() => openCells(puzzle), [puzzle]);
  const spine = puzzle.spine;
  /** The squares the hem reads, for the grid's shading. */
  const markedCells = useMemo(() => new Set(spine?.cells ?? []), [spine]);
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
  const hemAnnounced = useRef(false);
  const timers = useRef<number[]>([]);
  const activeCellRef = useRef<HTMLButtonElement | null>(null);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const won = state.cw.status === 'won';
  const stepCost = tier === 3 ? 3 : 2;
  const activeEntry = puzzle.entries.find((e) => e.id === active.entryId) ?? firstEntry;

  const hem = hemLetters(puzzle, state.cw);
  const hemSpelled = isHemSpelled(puzzle, state.cw);

  // The square she is typing into is walked back onto the glass if anything
  // ever pushes it off. `nearest` is a no-op whenever it is already visible, so
  // nothing jitters on a board that fits — which, since the deck stopped
  // over-claiming the stage, is every board in the pool at both sizes.
  useEffect(() => {
    activeCellRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active.cell]);

  /**
   * THE HEM'S ONE ANNOUNCEMENT, and it is free. When the marked letters first
   * read the spine's answer the room says so — that is the moment the second
   * solve lands, and it costs nothing because it is derived from letters
   * already on the board, exactly as reading a crossing is. It fires once.
   */
  useEffect(() => {
    if (!spine || won) return;
    if (hemSpelled && !hemAnnounced.current) {
      hemAnnounced.current = true;
      sfx.glyph();
      setToast({ kind: 'good', text: `The hem reads ${spine.answer}.` });
      later(() => setToast(null), 1600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hemSpelled, won]);

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
    /**
     * ROUND 34 (COMPREHENSION, item 11) — MOVING SIDEWAYS SHOULD NOT TURN YOU
     * ROUND. This kept the entry only when the tapped square belonged to the
     * SAME entry, and otherwise fell to `owners[0]` — which is puzzle order,
     * and the pool lists the downs first. So filling 3-Across, tapping a
     * square one column over that also carries a down, silently span the
     * cursor to that down and the next letter went the other way. Keep the
     * DIRECTION she is already typing in wherever the square supports it, then
     * prefer across, which is the convention every crossword opens on.
     */
    const dir = active.entryId.slice(-1);
    const preferred =
      owners.find((e) => e.id === active.entryId)
      ?? owners.find((e) => e.id.endsWith(dir))
      ?? owners.find((e) => e.id.endsWith('A'))
      ?? owners[0]!;
    setActive({ cell: index, entryId: preferred.id });
  };

  /**
   * Where the cursor goes after a letter lands. The clue rows stopped being
   * taps this round, so this is not a nicety — it is the replacement for the
   * picker, and it is what the NYT Mini does anyway: the next empty square of
   * this answer, else the first empty square of the next answer that still has
   * one, wrapping. It only stops moving when the board is full.
   */
  const advanceFrom = (entry: CrosswordEntry, from: number, letters: Record<number, string>) => {
    const eCells = entryCells(puzzle, entry);
    const here = eCells.indexOf(from);
    for (let i = here + 1; i < eCells.length; i++) {
      if (letters[eCells[i]!] === undefined) { setActive({ cell: eCells[i]!, entryId: entry.id }); return; }
    }
    const order = puzzle.entries;
    const at = order.findIndex((e) => e.id === entry.id);
    for (let k = 1; k <= order.length; k++) {
      const next = order[(at + k) % order.length]!;
      const empty = entryCells(puzzle, next).find((c) => letters[c] === undefined);
      if (empty !== undefined) { setActive({ cell: empty, entryId: next.id }); return; }
    }
    if (here >= 0 && here + 1 < eCells.length) setActive({ cell: eCells[here + 1]!, entryId: entry.id });
  };

  const typeLetter = (letter: string) => {
    if (won || state.cw.revealedCells.includes(active.cell)) return;
    setPopCell(active.cell);
    later(() => setPopCell(null), 220);
    dispatch({ type: 'set-cell', index: active.cell, letter });
    advanceFrom(activeEntry, active.cell, { ...state.cw.letters, [active.cell]: letter });
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

  /**
   * ROUND 29: this used to be `entryDone` and compared against the SOLUTION,
   * which dimmed a clue exactly when its answer was right — a free, unlimited
   * correctness oracle in a room whose one costed moment is the full-grid
   * check. It now means what it looks like it means: every square of this
   * answer has a letter in it. Whether they are the RIGHT letters is what the
   * hem hints at and what the check settles.
   */
  const entryFilled = (e: CrosswordEntry) =>
    entryCells(puzzle, e).every((c) => state.cw.letters[c] !== undefined);

  const activeCells = new Set(entryCells(puzzle, activeEntry));
  /**
   * ROUND 34 (COMPREHENSION, item 11) — THE ROOM KNEW WHICH WAY IT WAS ABOUT
   * TO TYPE AND NEVER SAID. Measured live at HEAD on `crossword-t3-19`, both
   * shipped phones: not one glyph, word or arrow anywhere in the room named a
   * direction (the clue ids carry `1D`/`3A`, which is the crossword's own
   * shorthand and means nothing to someone meeting it cold), and a real
   * pointer tap on the top-left numbered square followed by a real key press
   * moved the cursor five squares — one whole rank, straight down. The cold
   * reader placed every letter of the board by hand rather than trust it.
   * The caret is drawn ON the square the next letter lands in, pointing the
   * way the cursor will run, so the answer is where the question is.
   */
  const runsDown = activeEntry.id.endsWith('D');

  return (
    /* The class carries the BOARD SIZE, not the tier: the clue panel's budget
       is arithmetic about ranks of squares (a5micro.css), and a pool that one
       day pairs a 4x4 with tier 2 must still get the right answer. */
    <div className={`m2 m2--linen${puzzle.size <= 4 ? ' m2--linen-sm' : ''}`}>
      {/* ROUND 28 — A LINE THAT WAS 0.0 x 0.0 ON EVERY PHONE THE GAME SHIPS ON.
          `.m2__sub` said "Small words, neatly folded. Fill every square." and
          `display: none` under `@media (max-height: 900px)`, which is BOTH
          shipped sizes. It is retired. The nameplate goes the same way at the
          same threshold and that is fine: the room is named on the blueprint
          she walked in from. What was NOT fine is that the closet's priced
          moments were unannounced anywhere she could read them; they are in
          the reserved verdict line below, which survives every glass. */}
      <header className="m2__head">
        <h2 className="m2__title">The Linen Closet</h2>
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
          // The mark is painted AFTER the active-word tint and carries a corner
          // fold as well as a colour, so a marked square is still a marked
          // square inside the answer she is filling in, and for a player who
          // cannot separate the two tints.
          if (markedCells.has(i)) classes.push('lc-cell--mark');
          if (i === active.cell && !won) {
            classes.push('lc-cell--active');
            classes.push(runsDown ? 'lc-cell--down' : 'lc-cell--across');
          }
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
              aria-label={
                `Square ${i}${markedCells.has(i) ? ', marked for the hem' : ''}`
                + (i === active.cell && !won ? `, typing ${runsDown ? 'down' : 'across'}` : '')
              }
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
            {spine ? <>The hem reads <strong>{spine.answer}</strong></> : <>Every word in its place</>}
            {state.cw.costedChecks === 0 && state.cw.hintsUsed === 0 ? ' — folded right the first time' : ''}.
          </p>
        </div>
      ) : (
        <>
          {/* The deck: clues + keyboard stay pinned to the bottom of the stage,
              so they sit in the thumb zone on every iPhone instead of being
              pushed off the glass by the grid (round-4 owner report; see
              ui/rooms/room-host.css). The clues ride WITH the keyboard — a clue
              you cannot see while typing is not a memory prosthetic, it is a
              memory test, and until this round three of five were behind it. */}
          <div className="room-deck">
          {/* ROUND 7 (AAA 11.11): the verdict slot used to sit above this deck
              in the scrolling flow, and with real iPhone insets the column ran
              21px (390×844) / 44px (375×667) past its stage — the room's answer
              printed underneath the keyboard. It rides the deck now.
              ROUND 28/29 — THE PRICES, WHERE THEY ARE ACTUALLY VISIBLE. This
              reserved line is the only chrome in the room that survives every
              glass, so it opens by naming the two things the room charges for
              and then retires: the moment she types a letter she has
              demonstrated the probe is free. The at-rest line sits OUTSIDE the
              live region; a screen reader should hear verdicts, not a standing
              notice re-read on every keystroke. */}
          <div className="m2-toastslot">
            {/* ROUND 34 (COMPREHENSION, item 11) — THE HEM IS THE ROOM'S WHOLE
                NEW MECHANIC AND IT INTRODUCED ITSELF AFTER THE SOLVE.
                Measured at HEAD on `crossword-t3-19`, both shipped phones: the
                string "hem" appeared EXACTLY ONCE anywhere in the room — in
                the id column of a fifth clue row that has no numbered squares
                and no explanation — and the only other statement of it was the
                `The hem reads X` toast, which fires at the moment the hem is
                already solved. A cold reader met a clue with no squares and
                read it as a bug. The marked squares, the mirrored column down
                the clue list and the fold on the grid are all already drawn;
                one clause joins them up, and it is the second occupant of a
                slot that was measured EMPTY at rest from the first keystroke
                on (the price notice below retires the moment she types). It
                retires in its turn the moment the hem spells, because at that
                point the room has said it in a toast and shown it in gilt. */}
            {!toast && Object.keys(state.cw.letters).length === 0 && (
              <span className="m2-toast m2-toast--info">Letters are free — ✎ and the check cost steps.</span>
            )}
            {!toast && spine && !hemSpelled && Object.keys(state.cw.letters).length > 0 && (
              <span className="m2-toast m2-toast--info m2-toast--hem">
                The marked squares fill the hem — one more word, free.
              </span>
            )}
            <span className="m2-toast-live" aria-live="polite">
              {toast && <span className={`m2-toast m2-toast--${toast.kind}`}>{toast.text}</span>}
            </span>
          </div>

          {/* THE CLUE LIST, WHICH IS THE PUZZLE. Rows are <li>, not buttons:
              they commit nothing, they are read, and being read is the whole
              job. The right-hand column is the hem — each row shows its own
              marked letter, so the column reads downward as a word, and the
              last row clues that word. */}
          <ol className="lc-clues m2-card">
            {puzzle.entries.map((e, i) => (
              <li
                key={e.id}
                className={`lc-clue${e.id === active.entryId ? ' lc-clue--active' : ''}${entryFilled(e) ? ' lc-clue--filled' : ''}`}
              >
                <span className="lc-clue__id">{e.id}</span>
                <span className="lc-clue__text">{e.clue}</span>
                {spine && (
                  <span className={`lc-mark${hem[i] ? ' lc-mark--set' : ''}${hemSpelled ? ' lc-mark--spelled' : ''}`}>
                    {hem[i] ?? ''}
                  </span>
                )}
              </li>
            ))}
            {spine && (
              <li className={`lc-clue lc-clue--hem${hemSpelled ? ' lc-clue--filled' : ''}`}>
                {/* The row names itself in the ID column rather than inline.
                    Inline cost it ~7 characters of clue and, measured live at
                    375x667, wrapped the hem's own row to two lines inside a
                    28px box — the panel overflowed by 5px and the sentence was
                    clipped. The column was already there and was already the
                    place a clue list says which clue this is. */}
                <span className="lc-clue__id lc-clue__id--hem">Hem</span>
                <span className="lc-clue__text">{spine.clue}</span>
                <span className={`lc-mark lc-mark--seal${hemSpelled ? ' lc-mark--spelled' : ''}`} aria-hidden>
                  {hemSpelled ? '✓' : ''}
                </span>
              </li>
            )}
          </ol>

          {/* Keys commit on RELEASE (`onClick`), never on pointerdown — the
              house rule, and the same round-6 fix the Darkroom took: a press
              that lands wrong must be abortable by sliding off. Selecting a
              square still answers on pointerdown: selection commits nothing.
              Press feedback is `.is-pressed` from the capture delegate in
              app/platform/boot.ts, so U.1 is unaffected.
              ROUND 29: the room's verb is the last key on the bottom row. It
              is a COSTED control, which AAA 6.19 exempts nothing from, so it is
              sized past 44x44pt by `.lc-key--verb` rather than by the 32x48
              keyboard ruling in 6.19(b) — measured live at both sizes. */}
          <div className="lc-keys">
            {KEY_ROWS.map((row, ri) => (
              <div key={row} className="lc-keys__row">
                {ri === 2 && (
                  <button
                    className="lc-key lc-key--wide"
                    onClick={backspace}
                    aria-label="Delete"
                  >
                    ⌫
                  </button>
                )}
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
                    className="lc-key lc-key--verb"
                    onClick={reveal}
                    disabled={state.cw.revealedCells.includes(active.cell)}
                    aria-label={`Smooth a crease — reveals this square, costs ${stepCost} steps`}
                  >
                    <span className="lc-key__glyph" aria-hidden>✎</span>
                    <span className="lc-key__price" aria-hidden>−{stepCost}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
          </div>
        </>
      )}
    </div>
  );
}
