/**
 * The Conservatory — Hive Builder view. OWNER: A3. Benchmarked against NYT
 * Spelling Bee per AAA §1: tap-first hive in the thumb zone, live entry
 * coloring, the 5-message invalid taxonomy with auto-clear, free unlimited
 * shuffle with a fixed center, garden rank ladder with points-to-next always
 * visible, silhouettes (never spoilers) at Full Bloom.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import type { HivePuzzle } from '../../../engine/types';
import {
  HIVE_LADDER, ladderThreshold,
  type HiveAction, type HiveRoomState,
} from '../../../engine/rooms/adapters/hive';
import { createRng, shuffle } from '../../../engine/rng';
import { sfx } from '../../../app/sound';
import './anchor.css';

type Toast = { kind: 'good' | 'bad' | 'info' | 'big'; text: string } | null;

/** In-world praise, escalating with the find (AAA 1.7 / 1.15). */
function praiseFor(points: number): string {
  if (points >= 11) return 'Radiant!';
  if (points >= 7) return 'Splendid!';
  if (points >= 5) return 'Lovely.';
  return 'A petal unfurls.';
}

export default function HiveView({ puzzle, state, tier, dispatch }: RoomViewProps<HivePuzzle, HiveRoomState, HiveAction>) {
  const [typed, setTyped] = useState('');
  const [petals, setPetals] = useState<string[]>(puzzle.outer);
  const [shuffling, setShuffling] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [burst, setBurst] = useState(false);
  const [showFound, setShowFound] = useState(false);

  const handledAttempt = useRef(0);
  const shuffleCount = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const allowed = useMemo(() => new Set([puzzle.center, ...puzzle.outer]), [puzzle]);
  const solveAt = ladderThreshold(state.maxScore, 70);
  const solved = state.hive.score >= solveAt;
  const stepCost = tier === 3 ? 3 : 2;

  const submit = () => {
    const word = typed.trim();
    if (!word || solved) return;
    dispatch({ type: 'submit', word });
  };

  // React to the adapter's verdict exactly once per submission.
  useEffect(() => {
    if (state.attempts === handledAttempt.current) return;
    handledAttempt.current = state.attempts;
    const fb = state.lastFeedback;
    if (!fb) return;

    if (fb.kind === 'valid') {
      setTyped('');
      if (fb.isPangram) {
        sfx.flourish();
        setBurst(true);
        later(() => setBurst(false), 1350);
        setToast({ kind: 'big', text: `Pangram! ${fb.word} +${fb.points}` });
      } else if (fb.tierUps.length > 0) {
        sfx.correct();
        setToast({ kind: 'good', text: `${fb.word} +${fb.points} — you've reached ${fb.tierUps[fb.tierUps.length - 1]}` });
      } else {
        sfx.correct();
        setToast({ kind: 'good', text: `${praiseFor(fb.points)} ${fb.word} +${fb.points}` });
      }
      later(() => setToast(null), 1400);
    } else {
      // AAA 1.6: shake ≤350ms, terse reason, auto-clear — she never deletes it.
      if (fb.costed) sfx.wrong();
      const messages: Record<typeof fb.reason, string> = {
        'too-short': 'Too short',
        'missing-center': `Missing ${puzzle.center}`,
        'bad-letters': 'Bad letters',
        'not-in-word-list': 'Not in the lexicon',
        'already-found': 'Already found',
      };
      const cost = fb.costed ? ` · −${stepCost} steps` : '';
      setToast({ kind: fb.costed ? 'bad' : 'info', text: messages[fb.reason] + cost });
      setShaking(true);
      later(() => setShaking(false), 340);
      later(() => setTyped(''), 350);
      later(() => setToast(null), 1100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempts]);

  useEffect(() => {
    if (solved) sfx.victory();
  }, [solved]);

  // Physical keyboard support (desktop / iPad keyboards).
  useEffect(() => {
    if (solved) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[a-zA-Z]$/.test(e.key)) setTyped((t) => (t + e.key.toUpperCase()).slice(0, 24));
      else if (e.key === 'Backspace') setTyped((t) => t.slice(0, -1));
      else if (e.key === 'Enter') submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved, typed]);

  const tapLetter = (letter: string) => {
    if (solved) return;
    sfx.tap();
    setTyped((t) => (t + letter).slice(0, 24));
  };

  // Free, unlimited; petals fade out/in ≤400ms, center never moves (AAA 1.4).
  const doShuffle = () => {
    if (shuffling) return;
    setShuffling(true);
    later(() => {
      shuffleCount.current += 1;
      setPetals((p) => shuffle(createRng(0x5eed + shuffleCount.current), p));
      setShuffling(false);
    }, 190);
  };

  // Delete: single tap + press-and-hold repeat (AAA 1.4).
  const holdRef = useRef<{ t?: number; i?: number }>({});
  const deleteDown = () => {
    setTyped((t) => t.slice(0, -1));
    holdRef.current.t = window.setTimeout(() => {
      holdRef.current.i = window.setInterval(() => setTyped((t) => t.slice(0, -1)), 120);
    }, 420);
  };
  const deleteUp = () => {
    clearTimeout(holdRef.current.t);
    clearInterval(holdRef.current.i);
  };

  // Ladder derivations — points-to-next always visible (AAA 1.11).
  const tierName = HIVE_LADDER[state.tierIndex]!.name;
  const nextTier = HIVE_LADDER[state.tierIndex + 1];
  const toNext = nextTier ? ladderThreshold(state.maxScore, nextTier.pct) - state.hive.score : 0;
  const fillPct = Math.min(100, (state.hive.score / solveAt) * 100);

  // Silhouettes on exit: lengths + first letters, never the words (AAA 1.12).
  const silhouettes = useMemo(() => {
    if (!solved) return [];
    return puzzle.validWords
      .filter((w) => !state.hive.foundWords.includes(w))
      .map((w) => `${w[0]}${' ·'.repeat(w.length - 1)}`)
      .slice(0, 18);
  }, [solved, puzzle, state.hive.foundWords]);
  const silhouetteOverflow = solved
    ? Math.max(0, puzzle.validWords.length - state.hive.foundWords.length - 18)
    : 0;

  const found = [...state.hive.foundWords].reverse();

  return (
    <div className="anch anch--conservatory">
      <header className="anch__head">
        <h2 className="anch__title">The Conservatory</h2>
        <p className="anch__sub">
          Grow words from the hive — every one must hold <strong style={{ color: 'var(--room-accent)' }}>{puzzle.center}</strong>.
        </p>
      </header>

      <div className="hv-ladder">
        <span className="hv-ladder__name">{tierName}</span>
        <div className="hv-bar" role="progressbar" aria-valuenow={state.hive.score} aria-valuemax={solveAt}>
          <div className="hv-bar__fill" style={{ width: `${fillPct}%` }} />
          {HIVE_LADDER.map((t) => (
            <span
              key={t.name}
              className={`hv-bar__dot${state.hive.score >= ladderThreshold(state.maxScore, t.pct) ? ' hv-bar__dot--lit' : ''}`}
              style={{ left: `${Math.min(100, (ladderThreshold(state.maxScore, t.pct) / solveAt) * 100)}%` }}
            />
          ))}
        </div>
        <span className="hv-ladder__next tabular-nums">
          {nextTier ? `${toNext} to ${nextTier.name}` : 'In full flower'}
        </span>
      </div>

      <div className="hv-found">
        <div className="hv-found__strip">
          {found.slice(0, 8).map((w, i) => (
            <span key={w} className={`anch-chip${i === 0 ? ' anch-pop' : ''}${puzzle.pangrams.includes(w) ? ' anch-chip--accent' : ''}`}>
              {w}
            </span>
          ))}
        </div>
        <button className="hv-found__toggle" onClick={() => setShowFound((s) => !s)}>
          {found.length} found {showFound ? '▴' : '▾'}
        </button>
      </div>

      {showFound ? (
        <div className="hv-foundpanel" onClick={() => setShowFound(false)}>
          {found.map((w) => (
            <span key={w} className={`anch-chip${puzzle.pangrams.includes(w) ? ' anch-chip--accent' : ''}`}>{w}</span>
          ))}
          {found.length === 0 && <span className="anch__sub">Nothing gathered yet — tap to close.</span>}
        </div>
      ) : solved ? (
        <div className="anch-done">
          <div className="anch-done__title">Full Bloom!</div>
          <p className="anch-done__line">
            The conservatory stands in flower{state.costedMistakes === 0 ? ' — not a stem bent' : ''}.
          </p>
          {silhouettes.length > 0 && (
            <>
              <p className="anch-done__line">Still folded in the beds:</p>
              <div className="hv-sil">
                {silhouettes.map((s, i) => (
                  <span key={i} className="anch-chip anch-chip--muted" style={{ textDecoration: 'none' }}>{s}</span>
                ))}
                {silhouetteOverflow > 0 && <span className="anch-chip anch-chip--muted" style={{ textDecoration: 'none' }}>+{silhouetteOverflow} more</span>}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div className={`hv-entry${typed.length > 11 ? ' hv-entry--long' : ''}${shaking ? ' anch-shake' : ''}`}>
            {typed ? (
              <>
                {[...typed].map((ch, i) => (
                  <span
                    key={i}
                    className={ch === puzzle.center ? 'hv-entry__ch--center' : !allowed.has(ch) ? 'hv-entry__ch--dead' : undefined}
                  >
                    {ch}
                  </span>
                ))}
                <span className="hv-caret" />
              </>
            ) : (
              <span className="hv-entry__hint">tap the hive, or type<span className="hv-caret" /></span>
            )}
          </div>

          <div className="anch-toastslot" aria-live="polite">
            {toast && <span className={`anch-toast anch-toast--${toast.kind}`}>{toast.text}</span>}
          </div>

          <div className={`hv-board${shuffling ? ' hv-board--shuffling' : ''}`}>
            <button className="hv-cell hv-cell--center hv-cell--c" onPointerDown={() => tapLetter(puzzle.center)}>
              <span className="hv-cell__g">{puzzle.center}</span>
            </button>
            {petals.map((letter, i) => (
              <button key={letter} className={`hv-cell hv-cell--p${i}`} onPointerDown={() => tapLetter(letter)}>
                <span className="hv-cell__g">{letter}</span>
              </button>
            ))}
            {burst && (
              <div className="hv-burst" onPointerDown={() => setBurst(false)}>
                <span className="hv-burst__text">Pangram!</span>
              </div>
            )}
          </div>

          <div className="anch-row">
            <button className="anch-btn" onPointerDown={deleteDown} onPointerUp={deleteUp} onPointerLeave={deleteUp} onPointerCancel={deleteUp} disabled={!typed}>
              Delete
            </button>
            <button className="anch-btn" onClick={doShuffle} aria-label="Shuffle petals">
              Shuffle
            </button>
            <button className="anch-btn anch-btn--primary" onClick={submit} disabled={typed.length < 4}>
              Enter
            </button>
          </div>
        </>
      )}
    </div>
  );
}
