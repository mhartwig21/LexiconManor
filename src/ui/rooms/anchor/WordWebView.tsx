/**
 * The Library — Word Web view. OWNER: A3. Benchmarked against NYT Connections
 * (+ Wordle's juice) per AAA §2: hop-then-hold suspense beat, slide-merge
 * banners with the name stamped after landing, wrong-guess shake that never
 * clears the selection, acknowledged herrings, a priced intruder nudge, free
 * unlimited shuffle, warm graded endscreen copy.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import type { WordWebAction, WordWebPuzzleEx, WordWebRoomState } from '../../../engine/rooms/adapters/word-web';
import { createRng, shuffle } from '../../../engine/rng';
import { sfx } from '../../../app/sound';
import { pressProps } from './usePressed';
import './anchor.css';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

function hashStr(s: string): number {
  let h = 0;
  for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h >>> 0;
}

const TIER_DOTS: Record<string, string> = { yellow: '●', green: '●●', blue: '●●●', purple: '●●●●' };

/** Warm, never shame-adjacent (AAA 2.14). */
function endCopy(mistakes: number): string {
  if (mistakes === 0) return 'Perfect! Every thread true.';
  if (mistakes === 1) return 'Splendid weaving.';
  if (mistakes === 2) return 'Well pieced-together.';
  return 'Got there — the web holds.';
}

export default function WordWebView({ puzzle, state, tier, dispatch }: RoomViewProps<WordWebPuzzleEx, WordWebRoomState, WordWebAction>) {
  const [selection, setSelection] = useState<string[]>([]);
  // 2.6: the opening order is the generator's adversarial layout (planted
  // herrings clustered so shuffle is a real tool); shuffle-seeded fallback
  // only for boards predating the layout field.
  const [order, setOrder] = useState<string[]>(() => {
    const all = puzzle.groups.flatMap((g) => g.words);
    const layout = puzzle.layout;
    if (layout && layout.length === all.length && all.every((w) => layout.includes(w))) return layout;
    return shuffle(createRng(hashStr(puzzle.id)), all);
  });
  const [busy, setBusy] = useState(false);
  const [hopping, setHopping] = useState<string[]>([]);
  const [shaking, setShaking] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const handledAttempt = useRef(0);
  const shuffleCount = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const naming = state.pendingNaming;
  const won = state.web.status === 'won' && !naming;
  const stepCost = tier === 3 ? 3 : 2;

  const solvedGroups = useMemo(
    () => state.web.solvedTiers.map((t) => puzzle.groups.find((g) => g.tier === t)!),
    [state.web.solvedTiers, puzzle],
  );
  // While the naming act is up, the final banner stays unstamped — its label
  // is the question (AAA 2.11), so it must not land early as a spoiler.
  const shownGroups = naming ? solvedGroups.slice(0, -1) : solvedGroups;
  const remaining = order.filter((w) => state.web.remainingWords.includes(w));

  const toggle = (word: string) => {
    if (busy || won) return;
    sfx.tap();
    setToast(null);
    setSelection((sel) =>
      sel.includes(word) ? sel.filter((w) => w !== word) : sel.length < 4 ? [...sel, word] : sel,
    );
  };

  // Submit → sequential hop → suspense hold → verdict. Total <1.5s (AAA 2.2).
  const submit = () => {
    if (busy || won || selection.length !== 4) return;
    setBusy(true);
    setHopping([...selection]);
    later(() => {
      dispatch({ type: 'submit', selection });
      setHopping([]);
    }, 760);
  };

  useEffect(() => {
    if (state.attempts === handledAttempt.current) return;
    handledAttempt.current = state.attempts;
    const fb = state.lastFeedback;
    if (!fb) return;

    switch (fb.kind) {
      case 'group-solved':
        sfx.correct();
        setSelection([]);
        if (fb.won) later(() => sfx.victory(), 650);
        later(() => setBusy(false), 700);          // input locked while tiles land (AAA 2.3)
        break;
      case 'name-final':
        // Last four fall together — hold the win until the thread is named.
        sfx.correct();
        setSelection([]);
        later(() => setBusy(false), 700);
        break;
      case 'one-away':
        sfx.wrong();
        setToast({ kind: 'bad', text: `One away… · −${stepCost} steps` });
        setShaking(true);
        later(() => setShaking(false), 420);
        later(() => setBusy(false), 430);
        break;
      case 'wrong':
        sfx.wrong();
        setToast(
          fb.herring.length > 0
            ? { kind: 'bad', text: `They do keep company, don't they? But no. · −${stepCost} steps` }
            : { kind: 'bad', text: `Not quite a thread. · −${stepCost} steps` },
        );
        setShaking(true);
        later(() => setShaking(false), 420);
        later(() => setBusy(false), 430);
        break;
      case 'hint':
        sfx.glyph();
        setToast({ kind: 'good', text: `${fb.intruder} stands apart from the rest.` });
        break;
      case 'invalid':
        setBusy(false);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempts, state.hintsBought]);

  // The generator's opening layout is adversarial (2.6), so the free,
  // unlimited shuffle is a real tool from the very first glance.
  const doShuffle = () => {
    if (busy) return;
    shuffleCount.current += 1;
    setOrder((o) => shuffle(createRng(hashStr(puzzle.id) + shuffleCount.current), o));
  };

  const perfect =
    won && state.costedMistakes === 0 && state.hintsBought === 0 && state.namedCorrectly !== false;

  return (
    <div className="anch anch--library">
      <header className="anch__head">
        <h2 className="anch__title">The Library</h2>
        <p className="anch__sub">Weave the sixteen words into four threads of four.</p>
      </header>

      <div className="ww-banners">
        {shownGroups.map((g, i) => (
          <div
            key={g.tier}
            className={`ww-banner ww-banner--${g.tier} ${perfect ? 'ww-banner--dance' : i === shownGroups.length - 1 ? 'ww-banner--in' : ''}`}
            style={perfect ? { animationDelay: `${i * 100}ms` } : undefined}
          >
            <div className="ww-banner__theme">{g.theme}</div>
            <div className="ww-banner__words">{g.words.join(' · ')}</div>
            <div className="ww-banner__dots">{TIER_DOTS[g.tier]}</div>
          </div>
        ))}
      </div>

      {naming ? (
        // AAA 2.11 — the act of naming: the last four fell together, but the
        // room only solves (and 'Perfect!' only lands) once the thread is named.
        <div className="anch-card ww-name anch-pop">
          <div className="ww-name__eyebrow">The last four fall together</div>
          <div className="ww-name__words">{naming.words.join(' · ')}</div>
          <p className="ww-name__ask">What thread binds them?</p>
          <div className="ww-name__options">
            {naming.options.map((theme) => (
              <button
                key={theme}
                className="anch-btn"
                {...pressProps<HTMLButtonElement>()}
                onClick={() => dispatch({ type: 'name-theme', theme })}
              >
                {theme}
              </button>
            ))}
          </div>
        </div>
      ) : won ? (
        <div className="anch-done">
          <div className="anch-done__title">{perfect ? 'Perfect!' : 'Woven.'}</div>
          <p className="anch-done__line">{endCopy(state.costedMistakes + state.hintsBought)}</p>
          {state.namedCorrectly === false && state.lastFeedback?.kind === 'group-solved' && (
            // Warm, never shame-adjacent (2.14): a missed name is just told true.
            <p className="anch-done__line">It called itself “{state.lastFeedback.theme}”.</p>
          )}
        </div>
      ) : (
        <>
          <div className={`ww-grid${shaking ? ' anch-shake' : ''}`}>
            {remaining.map((word) => {
              const hopIdx = hopping.indexOf(word);
              return (
                <button
                  key={word}
                  className={[
                    'ww-tile',
                    selection.includes(word) ? 'ww-tile--selected' : '',
                    word.length > 7 ? 'ww-tile--small' : '',
                    hopIdx >= 0 ? 'ww-tile--hop' : '',
                  ].join(' ')}
                  style={hopIdx >= 0 ? { animationDelay: `${hopIdx * 100}ms` } : undefined}
                  // U.1/2.1: selection toggles on pointerdown, not click — the
                  // fill change lands at touch, not at finger-lift.
                  {...pressProps<HTMLButtonElement>({ down: () => toggle(word) })}
                >
                  {word}
                </button>
              );
            })}
          </div>

          <div className="anch-toastslot" aria-live="polite">
            {toast && <span className={`anch-toast anch-toast--${toast.kind}`}>{toast.text}</span>}
          </div>

          <div className="anch-row">
            <button className="anch-btn" {...pressProps<HTMLButtonElement>()} onClick={() => setSelection([])} disabled={selection.length === 0 || busy}>
              Clear
            </button>
            <button className="anch-btn" {...pressProps<HTMLButtonElement>()} onClick={doShuffle} disabled={busy}>
              Shuffle
            </button>
            <button className="anch-btn anch-btn--primary" {...pressProps<HTMLButtonElement>()} onClick={submit} disabled={selection.length !== 4 || busy}>
              Weave
            </button>
          </div>

          {state.lastWrongSelection && !busy && (
            <div className="anch-row">
              <button className="anch-btn" {...pressProps<HTMLButtonElement>()} onClick={() => dispatch({ type: 'buy-hint' })}>
                A nudge from the shelves · −{stepCost} steps
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
