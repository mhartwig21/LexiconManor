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
import { centerIndex, findPath, puzzleSize, STUDY_POINTS, twistleRuleLines, twistleStanding } from '../../../engine/twistle';
import { sfx } from '../../../app/sound';
import { pressProps } from './usePressed';
import './anchor.css';
import { stepWords, STEP_TABLE, STUDY_REFUND } from '../../../engine/economy/steps';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

/** How many study chips the sticky deck will carry before it starts counting. */
const STUDY_CHIPS = 6;
/** The same, for the struck pile — which had no bound at all until round 34. */
const MISS_CHIPS = 4;

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
  /**
   * ROUND 44 — THE PRICE TAG ON THIS TOAST WAS TWO ROUNDS STALE. It was
   * `tier === 3 ? 3 : 2`, hard-coded, and round 42 made a wrong claim cost ONE
   * move at every weight and every tier: the Gallery has been printing
   * "It must cross the marked tile · −3 steps" beside a ledger entry of −1.
   * A false price is the exact defect ui/chrome/step-reasons.ts exists to
   * prevent, so it is read off the table now and cannot go stale again.
   */
  const stepCost = -STEP_TABLE.mistake(1, tier);
  const studies = state.twistle.foundStudies ?? [];
  /**
   * ROUND 28 — THE LADDER ON THE GLASS (BENCHMARKS §1's "points to next rank"
   * is called *the strongest one-more-word hook in the game*; this room had no
   * hook at all). Recomputed from the two found lists, never stored: the board
   * maximum is memoised inside the engine, so this costs one Map walk a render.
   */
  const standing = useMemo(
    () => twistleStanding(puzzle, state.twistle),
    [puzzle, state.twistle],
  );
  /**
   * THE RULE, IN THE ROOM'S OWN WORDS. Composed in the engine (`twistleRuleLines`)
   * and pinned there against the shipped pool clause by clause, because round 17
   * shipped a header that was false at tier 3 and no test could see it.
   */
  const rules = useMemo(() => twistleRuleLines(puzzle), [puzzle]);
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

  /**
   * ═══ ROUND 34 — THE BOARD PAYS FOR THE RECORD, INSTEAD OF HIDING UNDER IT ══
   *
   * `--tw-reserve` is a CONSTANT guess at how much of the stage the header and
   * the sticky deck will want (17.5rem, 13.8rem on a short glass), and the
   * board's cap is `--stage-h` minus that guess. The guess is right for an
   * EMPTY deck and for no other state, because the deck's last row is the chip
   * strip and the chip strip is the room's memory prosthetic: it grows with
   * every word she finds.
   *
   * Measured on `twistle-t3-1`, driving real traces with real taps until the
   * strip carried its studies and a few strikes:
   *
   *     375x667   the stage held 616px of content in 551px  → scrolled 65px
   *     390x844   the stage held 767px of content in 721px  → scrolled 46px
   *
   * and before the strip's own bounds were tightened, the bottom rank of the
   * tier-3 6x6 sat UNDER the sticky deck: six tiles that no longer answered a
   * tap at their own centre. The room the owner's steer points at hardest — the
   * word game — got harder to play the better you played it, and no gate saw it
   * because every gate walks in on an empty board.
   *
   * The reserve is measured now rather than guessed. The board's cap is the
   * stage minus what the header and the deck ACTUALLY occupy this frame, so the
   * board yields to the record instead of sliding under it, and the room cannot
   * scroll however long her list gets. There is no feedback loop: the deck's
   * height is a function of the column's WIDTH (how the chips wrap), which the
   * board does not affect. The floor keeps a 6x6 tile at 35px even in the worst
   * case, which is the Counting-House ruling this house already runs on for a
   * control that spends nothing; below it the board would rather the strip
   * wrapped again than shrink further.
   */
  const roomEl = useRef<HTMLDivElement | null>(null);
  const headEl = useRef<HTMLElement | null>(null);
  const deckEl = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const root = roomEl.current;
    if (!root) return;
    // The hung sheet has no deck at all, and a measurement left over from play
    // would shrink the celebration board by the height of a deck that is no
    // longer on the glass. Hand it back to `--tw-reserve`.
    if (won) { root.style.removeProperty('--tw-chrome'); return; }
    const apply = () => {
      const head = headEl.current?.offsetHeight ?? 0;
      const deck = deckEl.current?.offsetHeight ?? 0;
      if (head + deck === 0) return;
      // The column's OWN padding and its two gutters are chrome too, and they
      // differ by glass (0.7rem/0.7rem tall, 0.4rem/0.3rem short). A hand-set
      // guard for them was 19px short at 390x844 — which is exactly the 19px
      // that room then scrolled by. Read them instead.
      const cs = getComputedStyle(root);
      const gaps = 2 * (parseFloat(cs.rowGap) || 0);
      const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      root.style.setProperty('--tw-chrome', `${head + deck + gaps + pad}px`);
    };
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    if (headEl.current) ro.observe(headEl.current);
    if (deckEl.current) ro.observe(deckEl.current);
    return () => ro.disconnect();
  }, [won]);

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
      setToast({ kind: 'good', text: `${fb.word} — ${fb.found} of ${fb.target} works hung` });
      if (fb.won) later(() => sfx.victory(), 300);
      later(() => setToast(null), 1400);
    } else if (fb.kind === 'study') {
      // ROUND 28 — the sound and the colour of a GOOD thing. This word used to
      // be told it "isn't in the lexicon", which was false: it clears every
      // rule the board states and only misses the ask's corner floor.
      //
      // ROUND 44 — AND IT SAYS WHAT IT PAID, IN STEPS. The owner traced one of
      // these and reported: *"it was confusing what their purpose was. It
      // didn't automatically add steps."* Round 34's toast read "a study · +1"
      // and that +1 was a SCORE point — a unit she cannot spend, printed in the
      // same shape as the one she can, beside a step counter that did not move.
      // The word "step" is the whole difference, and the chip that follows
      // still carries the point under a caption that says "point each", so the
      // two ones can no longer be read as one thing.
      sfx.correct();
      setToast({
        kind: 'good',
        text: fb.refunded
          ? `${fb.word} — a study · +${stepWords(STUDY_REFUND.perStudy)} back`
          : `${fb.word} — a study, hung · +${fb.points} point`,
      });
      later(() => setToast(null), 1400);
    } else {
      const messages: Record<typeof fb.reason, string> = {
        'too-short': `Words need ${puzzle.rules.minLength}+ letters`,
        'not-on-grid': "The tiles won’t connect so",
        'breaks-rule': `It must cross the marked tile · −${stepWords(stepCost)}`,
        // Not "isn't a word" — the room cannot know that, and for the words
        // that land here (corpus-obscure, or refused by the cozy gate) it would
        // be a lie. It is a curator's list, and it says so.
        'not-a-word': `${fb.word} isn’t on the curator’s list`,
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
    <div ref={roomEl} className={`anch anch--gallery${won ? ' anch--verdict' : ''}`}>
      <header className="anch__head" ref={headEl}>
        <h2 className="anch__title">The Gallery</h2>
        {/* 3.2/7.2: the mechanical clause is NEVER the thing a short screen
            drops — at tier 3 the marked-tile rule is what a −3-step mistake
            hangs on, and this line is its only statement in words. */}
        <p className="anch__rule">{rules.line}</p>
        {/* ROUND 24 (COMPREHENSION, fix 6): the minimum length is a RULE OF
            PLAY and it was nowhere on the glass. Its only statement was a
            toast — `Words need N+ letters` — behind a Claim button disabled
            below exactly that length, i.e. authored and unreachable. It is
            stated here at rest now, and the button below has been un-disabled
            so the toast can fire as well. Read from the puzzle, never a
            literal: a tier-3 Gallery may raise it. */}
        {/* ROUND 28 (BENCHMARKS §8) — THE SECOND CLASS, STATED AT REST. Strands
            never refuses a real word, and neither does this room any more. It is
            FLAVOUR rather than RULE by the anchor.css taxonomy — a permissive
            rule can only surprise her pleasantly, so it is the line a 667px
            screen is allowed to give up (where the toast and the `studies:`
            caption still teach it). The mechanical clauses, which gate a −3-step
            mistake, are in the line above and are never hidden. */}
        <p className="anch__flavour">{rules.studies}</p>
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
          {/* ROUND 28 — the rung she reached, and the number the board was
              worth, in the line the room already had. BENCHMARKS §1: the ladder
              is the retention machine, and a room that ends on a rung with a
              bigger number beside it is a room she has a reason to open again.
              It rides IN this paragraph rather than in one of its own because a
              tier-3 hung sheet is 19px from the bottom of a 667px screen and the
              owner does not accept a scrollbar to buy a line of copy. */}
          <p className="anch-done__line">
            <strong className="anch-done__rank">{standing.name}</strong>
            {' · '}{standing.score} of {standing.max}
            {' · '}{state.twistle.foundWords.length} works
            {studies.length > 0 ? ` and ${studies.length} stud${studies.length === 1 ? 'y' : 'ies'}` : ''}
            {state.costedMistakes === 0 ? ', not a crooked frame among them' : ''}.
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
          <div className="room-deck room-deck--anch" ref={deckEl}>
            {/* ROUND 34 (COMPREHENSION, item 9) — WHAT A CORNER IS, UNDER THE
                TRACE TRAY. The ask line says "{n} works, a corner each" and
                re-measured at HEAD the word "corner" appears in this room
                EXACTLY ONCE, in that clause, at both shipped sizes: nothing
                defines it, nothing counts it, nothing points at one. Both cold
                readers read the clause and neither could tell whether their
                words had corners — one checked all five and gave up. It is not
                a flourish, either: the corner floor is what sorts a traced word
                into a WORK (which opens the room) rather than a STUDY, and it
                is worth two points a corner on the ladder.
                The definition rides the tray's own at-rest line, so it costs
                ZERO height — the line was already there, already this size,
                already saying something less useful — and it is exactly where
                she looks between traces. It steps aside for the word she is
                tracing, which is the only moment it would be in the way. */}
            <div className="tw-word">
              {word || <span className="tw-word__hint">trace or tap a word — a corner is a turn</span>}
            </div>

            {/* THE LADDER (BENCHMARKS §1) SHARES THE TOAST'S RESERVED SLOT.
                Rank, score and the points owed to the next rung are the room's
                only "one more word" hook, and they must be on the glass at rest
                — but a row of its own measured a scrollbar into a tier-3
                Gallery at 375×667. The slot was already reserved for zero
                layout shift (AAA 1.5), so the two stack in one grid cell: the
                standing at rest, the toast on top of it for its 1.4s. */}
            <div className="tw-slot">
              <div className={`tw-standing${toast ? ' tw-standing--hushed' : ''}`} aria-hidden={!!toast}>
                <span className="tw-standing__count tabular-nums">
                  {state.twistle.foundWords.length} of {puzzle.targetCount} works
                </span>
                <span className="tw-standing__rank">{standing.name}</span>
                <span className="tw-standing__score tabular-nums">{standing.score}</span>
                {standing.next && (
                  <span className="tw-standing__next tabular-nums">
                    {standing.next.points} to {standing.next.name}
                  </span>
                )}
              </div>
              <div className="anch-toastslot" aria-live="polite">
                {toast && <span className={`anch-toast anch-toast--${toast.kind}`}>{toast.text}</span>}
              </div>
            </div>

            <div className="anch-row">
              <button className="anch-btn" {...pressProps<HTMLButtonElement>()} onClick={() => setPath([])} disabled={path.length === 0}>
                Clear
              </button>
              {/* ROUND 24 (COMPREHENSION, fix 6) — THE CONTROL THAT PHOTOGRAPHS
                  LIKE A WORKING ONE. This was `disabled={word.length <
                  minLength}`, which made the room's own authored answer to a
                  short word ("Words need 4+ letters") unreachable by
                  construction: the only way to hear the rule was to already
                  obey it. The systems tester had to discover the minimum by
                  experiment against a dead button — this repo's own STATUS
                  lesson, shipped. A short claim is mistake weight 0 in the
                  adapter (only `breaks-rule` is costed), so enabling it prices
                  nothing; it only lets the room speak. Still disabled on an
                  EMPTY trace, because there is no word there to refuse. */}
              <button className="anch-btn anch-btn--primary" {...pressProps<HTMLButtonElement>()} onClick={() => submit(word)} disabled={path.length === 0}>
                Claim
              </button>
            </div>

            <div className="tw-lists">
              {state.twistle.foundWords.map((w) => (
                <span key={w} className="anch-chip anch-chip--accent">{w}</span>
              ))}
              {/* ROUND 24 (COMPREHENSION, fix 6): the struck strip had no
                  header, so two testers watched words they had traced go up
                  crossed-through with no reason given and concluded the room
                  had changed its mind about them. It has not: a struck chip is
                  a trace the curator's list does not carry (`not-a-word` in
                  the adapter — the ONLY reason a word lands here), which is the
                  same vocabulary the toast uses. Inline, so it costs no line
                  when nothing has been struck. */}
              {/* ROUND 28 — the studies. These used to arrive struck through
                  under "not in his lexicon", which was false. They are hung. */}
              {/* ═══ ROUND 34 (COMPREHENSION, item 9) — THE TWO VERDICTS ═════
                  Round 28 split this board into WORKS and STUDIES and it was a
                  whole round's work. It surfaced for NEITHER cold reader: both
                  finished the room believing that only the five named words
                  count and that a real word on a legal path scores zero —
                  precisely the belief round 28 was built to kill.
                  Re-measured at HEAD, both shipped phones, the reason is on
                  the glass and it is not the copy. A study chip and a struck
                  chip differ by: a DASHED versus a SOLID hairline in the same
                  token (#CDBFA4 both), and 20 units of ink darkness (#55452F
                  against #695C49). Same background, same weight, same size,
                  same row. The only strong signal in the strip is the STRIKE —
                  and a strike is a negative one, so a strip that carries one
                  positive-but-unmarked class and one struck class reads, at a
                  glance, as one rejected pile with a caption in the middle. She
                  never gets a mark that says KEPT.
                  Two changes, and the second is the one that matters:
                    · the study chip now carries what it EARNED (+1), in the
                      same idiom as the toast that announced it ("a study · +1")
                      and the score in the standing line. A number in the plus
                      direction cannot be read as a refusal.
                    · the captions start their own row (`--head`), so a kept
                      word is never printed shoulder-to-shoulder with a struck
                      one, and each caption heads the pile it describes instead
                      of floating between two of them.
                  The caption also stops being the word "studies:", which is
                  this room's private jargon, and says what the class is worth. */}
              {studies.length > 0 && (
                <>
                  <span className="tw-lists__break" aria-hidden />
                  <span className="tw-lists__cap tw-lists__cap--head">
                    also hung, {STUDY_POINTS} point each:
                  </span>
                </>
              )}
              {/* BOUNDED ON PURPOSE. A tier-3 board carries up to 77 studies and
                  the deck is sticky: an unbounded strip walks the board off the
                  bottom of a 667px screen. The most recent six are shown and the
                  rest are counted, so nothing she found is ever silently gone. */}
              {studies.slice(-STUDY_CHIPS).map((w) => (
                <span key={w} className="anch-chip anch-chip--study">
                  {w}
                  <span className="anch-chip__pts tabular-nums">+{STUDY_POINTS}</span>
                </span>
              ))}
              {studies.length > STUDY_CHIPS && (
                <span className="tw-lists__cap tabular-nums">+{studies.length - STUDY_CHIPS} more</span>
              )}
              {state.missedWords.length > 0 && (
                <>
                  <span className="tw-lists__break" aria-hidden />
                  <span className="tw-lists__cap tw-lists__cap--head">not on the curator’s list:</span>
                </>
              )}
              {/* ROUND 34 — BOUNDED, LIKE THE STUDIES BESIDE IT. This strip was
                  the one unbounded thing on a sticky deck sitting over a board:
                  `missedWords` grows with every refused trace and every chip
                  pushed the deck further up the glass, so the player who
                  experimented most lost the most of the board she was
                  experimenting on. Measured on `twistle-t3-1` at 375x667, a
                  strip carrying its studies and a handful of strikes put the
                  room 54px into a scroll and the bottom rank of a tier-3 6x6
                  under the deck — six tiles that no longer answered a tap at
                  their own centre. The cap is the same idiom the studies have
                  used since round 28, and it keeps the same promise: the most
                  recent are shown, the rest are counted, nothing is silently
                  gone. `tests/round34-rooms-live.mjs` (GALLERY/FIT) fills the
                  strip with real traced words and holds the room to it. */}
              {state.missedWords.slice(-MISS_CHIPS).map((w) => (
                <span key={w} className="anch-chip anch-chip--muted">{w}</span>
              ))}
              {state.missedWords.length > MISS_CHIPS && (
                <span className="tw-lists__cap tabular-nums">
                  +{state.missedWords.length - MISS_CHIPS} more
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
