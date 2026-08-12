/**
 * The Darkroom — Substitution Cipher view. OWNER: A4.
 *
 * A cryptoquote in a developing tray: cipher letters above the line, pencil
 * marks below it. Tap any cell to select that cipher letter (every instance
 * lights), tap a key to pencil it in — penciling is thinking and costs
 * nothing; the selection auto-advances to the next blank. Locked letters
 * (starting reveals + purchased) glow in the room accent and never regress
 * (AAA 3.3). DEVELOP is the claim: blanks → free nudge; a wrong mapping
 * costs steps but always reports how many letters ring true (AAA 2.10's
 * principle). Win: the plaintext develops letter by letter, ≤2s total,
 * tap-skippable (AAA 3.4 / U.2).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import type { CipherPuzzle } from '../../../engine/puzzles/cipher';
import type { CipherAction, CipherRoomState } from '../../../engine/puzzles/cipher-adapter';
import { cipherLettersOf } from '../../../engine/puzzles/cipher';
import { sfx } from '../../../app/sound';
import './micro.css';
import { stepWords } from '../../../engine/economy/steps';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

/**
 * ROUND 5: the pad is the Linen Closet's three-row QWERTY, not a 7-column
 * alphabet grid. Four rows of 44px keys cost 191px of a 562px stage at
 * 375x667 and were the single largest reason the print did not fit above the
 * sticky deck; three rows cost 142px, the two typing rooms now share one
 * idiom, and the key geometry is the Wordle-parity geometry the house already
 * ships next door (a5micro.css). Nothing here is a committing tap — letters
 * are penciled, and penciling is free.
 */
const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export default function CipherView({ puzzle, state, tier, dispatch }: RoomViewProps<CipherPuzzle, CipherRoomState, CipherAction>) {
  const letters = useMemo(() => cipherLettersOf(puzzle), [puzzle]);
  const firstBlank = letters.find((c) => !state.engine.guesses[c]) ?? letters.find((c) => !state.engine.locked.includes(c)) ?? null;

  const [sel, setSel] = useState<string | null>(firstBlank);
  const [shaking, setShaking] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [skipReveal, setSkipReveal] = useState(false);

  const handledAttempt = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const won = state.engine.status === 'won';
  const hintCost = tier === 3 ? 3 : 2;
  const penciled = letters.filter((c) => !!state.engine.guesses[c]).length;
  /**
   * Marks SHE made — the starting reveals are in `guesses` too, and they are in
   * there before she has touched anything (measured: `penciled` is 3 of 12 on
   * entry to a fresh print). So the round-24 rule line below hung on a
   * condition that was never true, which is the same class of defect as the
   * rule being hidden by a media query. It hangs on her own first mark now.
   */
  const herMarks = letters.filter(
    (c) => !!state.engine.guesses[c] && !state.engine.locked.includes(c),
  ).length;

  // A new puzzle in the same mounted view (same-kind room, different cell)
  // must not inherit the previous session's selection.
  useEffect(() => {
    setSel(firstBlank);
    setSkipReveal(false);
    setToast(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset keyed to the session only
  }, [puzzle.id]);

  // Duplicate pencil marks (two cipher letters → same plain) get flagged in wax.
  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const c of letters) {
      const g = state.engine.guesses[c];
      if (g) seen.set(g, (seen.get(g) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([g]) => g));
  }, [letters, state.engine.guesses]);

  useEffect(() => {
    if (state.attempts === handledAttempt.current) return;
    handledAttempt.current = state.attempts;
    const fb = state.lastFeedback;
    if (!fb) return;
    switch (fb.kind) {
      case 'developed':
        sfx.victory();
        break;
      case 'murky':
        sfx.wrong();
        setShaking(true);
        later(() => setShaking(false), 340);
        setToast({
          kind: fb.charged ? 'bad' : 'info',
          text: fb.charged
            // ROUND 10 — ONE IDIOM FOR ONE QUANTITY. This line used to spell
            // the tally out ("3 of 16 letters ring true") at the same moment
            // the prints strip filed the identical number as a fraction
            // ("3/16"), so the room printed one quantity twice, two ways, on
            // one screen. The strip is the permanent record (AAA 3.3) and it
            // has to stay compact, so the fraction is the idiom that wins and
            // the toast now speaks it too — the eye can match the toast to the
            // chip it just filed without re-parsing the number.
            ? `Still murky — ${fb.correct}/${fb.total} letters ring true · −${stepWords(hintCost)}`
            : 'The same print again — no charge for looking twice.',
        });
        later(() => setToast(null), 2000);
        break;
      case 'incomplete':
        setToast({ kind: 'info', text: `${fb.missing} letter${fb.missing === 1 ? '' : 's'} still blank — pencil freely, it costs nothing.` });
        later(() => setToast(null), 1600);
        break;
      case 'letter-developed':
        sfx.glyph();
        setToast({ kind: 'good', text: `${fb.letter} develops true.` });
        later(() => setToast(null), 1300);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempts]);

  /**
   * ═══ THE SCROLL THAT MOVED THE CURSOR (round 12, deferred since round 7) ══
   *
   * Round 6 moved every *costed* verb in this room onto release (`onClick`) —
   * the 27 keys, Erase, Develop, Develop one letter — because the deck is
   * `position: sticky` over a scrolling stage and a press that lands wrong has
   * to be abortable by sliding off (AAA U.1 / 7.12). Cell selection was left
   * on `pointerdown` under the house rule "selection commits nothing".
   *
   * It commits nothing, and it still breaks the room. The tray is where the
   * scroll gesture LIVES: at 30+ glyphs the sheet is taller than the glass
   * (that is what `dense` exists for), the whole sheet is made of `.dk-cell`
   * buttons, so a drag to read the top of a long cryptogram necessarily
   * *begins* on a cell — and moved the cursor there. The next key press then
   * pencilled into whichever letter her thumb happened to start the scroll on.
   * That is precisely the failure `pencil()` already guards against from the
   * other direction ("earned state must not move under her", AAA 3.3), reached
   * by a gesture instead of a tap.
   *
   * The fix keeps both halves. Selection still lands on `pointerdown`, so the
   * highlight is instant (U.1) — and if the gesture turns out to be a scroll
   * rather than a tap, it is put back. Two signals, because touch gives both:
   * the browser fires `pointercancel` on the element when it takes the gesture
   * over for scrolling, and before that we watch for movement past a thumb's
   * worth of slop.
   */
  const DRAG_SLOP_PX = 10;
  const tapGuard = useRef<{ id: number; from: string | null; x: number; y: number } | null>(null);

  const beginCellTap = (e: React.PointerEvent, c: string) => {
    if (state.engine.locked.includes(c)) return;
    tapGuard.current = { id: e.pointerId, from: sel, x: e.clientX, y: e.clientY };
    sfx.tap();
    setSel(c);
  };
  /** The gesture was a scroll, not a tap: put the cursor back where it was. */
  const abandonCellTap = () => {
    const g = tapGuard.current;
    if (!g) return;
    tapGuard.current = null;
    setSel(g.from);
  };
  const moveCellTap = (e: React.PointerEvent) => {
    const g = tapGuard.current;
    if (!g || g.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > DRAG_SLOP_PX) abandonCellTap();
  };
  const endCellTap = (e: React.PointerEvent) => {
    if (tapGuard.current?.id === e.pointerId) tapGuard.current = null;
  };

  const advanceFrom = (c: string) => {
    const start = letters.indexOf(c);
    for (let i = 1; i <= letters.length; i++) {
      const cand = letters[(start + i) % letters.length]!;
      if (!state.engine.locked.includes(cand) && !state.engine.guesses[cand] && cand !== c) return cand;
    }
    return c; // nothing blank left — stay put for corrections
  };

  const pencil = (plain: string) => {
    if (won || !sel) return;
    sfx.tap();
    // The cursor follows a CHANGE, never a keypress. Pressing the letter the
    // cell already carries used to advance anyway, so a confirming re-tap
    // silently skipped the next blank and she typed the following letter into
    // the wrong cipher letter (AAA 3.3 — earned state must not move under her).
    const changed = state.engine.guesses[sel] !== plain;
    dispatch({ type: 'pencil', cipherLetter: sel, plain });
    if (changed) setSel(advanceFrom(sel));
  };
  const erase = () => {
    if (won || !sel) return;
    sfx.tap();
    dispatch({ type: 'pencil', cipherLetter: sel, plain: null });
  };

  const words = puzzle.ciphertext.split(' ');
  let cellIndex = 0;

  // A cryptogram is attacked by word shape and letter frequency across the
  // WHOLE phrase, so the tray must fit the glass: at 33 letters the last rank
  // was already sliced by the sticky deck, and the pool runs to 41 letters —
  // worst exactly at tier 3, the long, no-crib, wide-alphabet tier. Long
  // phrases get a denser cell so every letter stays above the deck (AAA
  // 3.3 / §0.1: the board is wholly visible at rest).
  const glyphCount = [...puzzle.ciphertext].filter((c) => /[A-Z]/i.test(c)).length;
  const dense = glyphCount > 30;

  return (
    <div className="mic mic--darkroom">
      {/* ═══ ROUND 24 — THE ONE ROOM WITH NO NYT TWIN (COMPREHENSION, fix 13) ══
          Every other room in the manor is carried by the player's existing
          habit: the Conservatory is a Spelling Bee, the Linen Closet is a mini
          crossword, the Gallery is a word search. The Darkroom is a cryptogram,
          which most people have never played, and it shipped with no statement
          of its rule anywhere on the glass — the sub-line said the letters were
          "swapped" and left her to infer that the swap is CONSISTENT, which is
          the only fact that makes the puzzle solvable at all. It stopped a
          blind tester outright and he named it the room that would strand a
          non-cryptogram player.
          THE RULE IS NOT WRITTEN HERE. Measured live: `.mic__sub` is
          `display: none` under `@media (max-height: 900px)` (micro.css, round
          5's fit pass), which is BOTH shipped phone sizes — so a sentence added
          to this line would have been authored, committed, and invisible on
          every device the game is played on. That is this repo's signature
          failure and it very nearly happened again. The rule lives in the
          reserved line above the keys instead; see `.mic-toastslot` below. */}
      {/* ROUND 28 — AND THEN THE SUB-LINE ITSELF WENT. Round 24 wrote the
          paragraph above, put the RULE where it can be read, and left the
          `.mic__sub` line standing: "A phrase sits in the tray, its letters
          swapped. Pencil freely — develop when sure." Measured this round at
          390x844 and 375x667, that line is 0.0 x 0.0 on both. Every fact in
          it is already on the glass where she is looking — the swap is stated
          by the reserved line below, "pencil freely" is what the incomplete
          develop says in words, and the develop button carries its own price
          — so the line is not moved, it is retired. A room does not get to
          keep copy nobody can see. */}
      <header className="mic__head">
        <h2 className="mic__title">The Darkroom</h2>
      </header>

      {won ? (
        <div className="mic-done" onPointerDown={() => setSkipReveal(true)}>
          <div className={`dk-reveal${skipReveal ? ' dk-reveal--skip' : ''}`} aria-label={puzzle.plaintext}>
            {puzzle.plaintext.split(' ').map((w, wi) => {
              const base = puzzle.plaintext.split(' ').slice(0, wi).join(' ').length;
              return (
                <span key={wi} className="dk-reveal__word">
                  {[...w].map((ch, i) => (
                    <span
                      key={i}
                      className="dk-reveal__ch"
                      style={{ animationDelay: `${Math.min((base + i) * 36, 1900)}ms` }}
                    >
                      {ch}
                    </span>
                  ))}
                </span>
              );
            })}
          </div>
          <p className="mic-done__line">
            {state.costedMistakes === 0 && state.hintsBought === 0
              ? 'Developed clean on the first print. Remarkable.'
              : 'The print develops. The words come back to the light.'}
          </p>
        </div>
      ) : (
        <>
          <div
            className={`dk-sheet${dense ? ' dk-sheet--dense' : ''}${shaking ? ' mic-shake' : ''}`}
            onPointerMove={moveCellTap}
            onPointerUp={endCellTap}
            onPointerCancel={abandonCellTap}
            onPointerLeave={abandonCellTap}
          >
            {words.map((w, wi) => (
              <span key={wi} className="dk-word">
                {[...w].map((c) => {
                  const idx = cellIndex++;
                  const locked = state.engine.locked.includes(c);
                  const guess = state.engine.guesses[c] ?? '';
                  return (
                    <button
                      key={idx}
                      className={
                        'dk-cell'
                        + (c === sel ? ' dk-cell--sel' : '')
                        + (locked ? ' dk-cell--locked' : '')
                        + (guess && dupes.has(guess) && !locked ? ' dk-cell--dupe' : '')
                      }
                      onPointerDown={(e) => beginCellTap(e, c)}
                      aria-label={`Cipher letter ${c}${guess ? `, penciled ${guess}` : ', blank'}${locked ? ', developed' : ''}`}
                    >
                      <span className="dk-cell__cipher">{c}</span>
                      <span className="dk-cell__plain">{guess}</span>
                    </button>
                  );
                })}
              </span>
            ))}
          </div>

          {/* Prints in the tray. Every paid develop used to live only in a
              toast that cleared after 2000ms — after three prints she had
              spent 6–9 steps and could see none of what she bought. The
              information she paid for now stays on the paper (AAA 3.3), and
              the run of counts is itself a solving tool: "print 3 · 12 of 13"
              after "print 2 · 10 of 13" says the last two swaps were right. */}
          {state.engine.prints.length > 0 && (
            <ol
              className="dk-prints tabular-nums"
              aria-label={state.engine.prints
                .map((p, i) => `print ${i + 1}: ${p.correct} of ${p.total} rang true`)
                .join('; ')}
            >
              <li className="dk-prints__label" aria-hidden="true">prints</li>
              {state.engine.prints.map((p, i) => (
                <li
                  key={i}
                  className="dk-print"
                  title={`print ${i + 1} · ${p.correct} of ${p.total} rang true`}
                >
                  {p.correct}<span className="dk-print__of">/{p.total}</span>
                </li>
              ))}
            </ol>
          )}

          {/* The deck: progress, the refusal toast, the 27-key pad and the two
              verbs all stay pinned to the bottom of the scrolling stage so
              they land in the thumb zone on every iPhone, and so the print
              scrolls BEHIND a clean edge instead of half-cutting a line of
              type (round-4; see ui/rooms/room-host.css). */}
          <div className="room-deck">
          {/* ONE reserved line, not two: progress at rest, the toast when there
              is one. The ~29px that used to be a second row went to the print,
              which is the thing that has to be whole (AAA 3.3 / §0.1). Fixed
              height, so nothing shifts either way. The progress line sits
              OUTSIDE the live region — a screen reader should hear develops,
              not a pencil count re-read on every letter. */}
          <div className="mic-toastslot">
            {/* Same denominator, same idiom as the prints strip and the develop
                toast — the room counts part-of-whole exactly one way (r10). */}
            {/* ROUND 24 (COMPREHENSION, fix 13) — THE RULE, WHERE IT IS
                ACTUALLY VISIBLE. This reserved line is the only chrome in the
                room that survives every glass (the sub-line under the title is
                `display: none` below 900px tall, i.e. on both phones), it sits
                directly above the keys her thumb is already on, and it costs
                nothing: the slot is reserved and stands empty at rest anyway.
                It is a SELF-RETIRING label, not a tutorial — the moment she has
                pencilled a single letter she has demonstrably got it, and the
                line goes back to being the count it has always been. */}
            {!toast && (
              herMarks === 0 ? (
                <span className="mic__meta">
                  One letter stands for one letter, all the way through.
                </span>
              ) : (
                <span className="mic__meta tabular-nums">
                  {penciled}/{letters.length} letters penciled
                </span>
              )
            )}
            <span className="mic-toast-live" aria-live="polite">
              {toast && <span className={`mic-toast mic-toast--${toast.kind}`}>{toast.text}</span>}
            </span>
          </div>

          {/* Every key in this pad commits on RELEASE (`onClick`), never on
              pointerdown — the house rule the Counting House already states in
              its own source, and the reason a 32.5px key is safe: the deck is
              `position: sticky` over a scrolling stage, so the gesture that
              scrolls the print to read the top of a long cryptogram BEGINS on
              a letter key, and a press that lands wrong must be abortable by
              sliding off. (Erase was already `onClick`; two commit idioms in
              one keyboard is also 6.16's one-metaphor-per-verb.) Press
              feedback is unaffected — `.is-pressed` lands from the capture
              delegate in app/platform/boot.ts on pointerdown, AAA U.1. */}
          <div className="mic-keys">
            {KEY_ROWS.map((row, ri) => (
              <div key={row} className="mic-keys__row">
                {[...row].map((ch) => (
                  <button
                    key={ch}
                    className={`mic-key${dupes.has(ch) || Object.values(state.engine.guesses).includes(ch) ? ' mic-key--dim' : ''}`}
                    onClick={() => pencil(ch)}
                    disabled={won || !sel}
                    aria-label={`Pencil ${ch}`}
                  >
                    {ch}
                  </button>
                ))}
                {ri === 2 && (
                  <button
                    className="mic-key mic-key--wide"
                    onClick={erase}
                    disabled={won || !sel || !state.engine.guesses[sel]}
                  >
                    Erase
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="mic-row">
            <button className="mic-btn mic-btn--primary" onClick={() => dispatch({ type: 'develop' })}>
              Develop the print
            </button>
            <button className="mic-btn" onClick={() => dispatch({ type: 'reveal-letter' })}>
              Develop one letter · −{hintCost}
            </button>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
