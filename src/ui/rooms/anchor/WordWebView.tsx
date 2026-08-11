/**
 * The Library — Word Web view. OWNER: A3. Benchmarked against NYT Connections
 * (+ Wordle's juice) per AAA §2: hop-then-hold suspense beat, slide-merge
 * banners with the name stamped after landing, wrong-guess shake that never
 * clears the selection, acknowledged herrings, a priced intruder nudge, free
 * unlimited shuffle, warm graded endscreen copy.
 *
 * ROUND 5 — the verdict choreography (AAA 2.2 / 2.3 [PARITY]):
 *   (a) THE MERGE. The four tiles used to simply unmount when the adapter
 *       dropped them from `remainingWords` — they evaporated in one frame and
 *       the banner popped in at its final position. Connections *travels* the
 *       tiles into the banner, and that fusion is the room's signature moment.
 *       `runMerge()` is a FLIP: measure the four resting tile rects just before
 *       dispatch, clone them as fixed-position elements in `.ww-fliplayer`, and
 *       transform them into the banner's rect over 700ms while `ww-land` fades
 *       the banner in beneath. Transform/opacity only (U.3), skipped wholesale
 *       under `prefers-reduced-motion`.
 *   (b) THE HOLD. The last tile settles at 600ms (300ms hop, 100ms stagger);
 *       the verdict used to fire at 760ms — a 160ms suspense hold against the
 *       required 300–400ms. It fires at 950ms now.
 *
 * ROUND 6 — TYPOGRAPHY. Theme labels are authored/generated copy and half the
 * bank quotes a fragment of a word: `Contains "OUT"`, `Anagrams of "LISTEN"`,
 * `Can Follow "SUN"`. Straight U+0022 has no handedness, and the body serif
 * draws it as a right-leaning comma-shape on BOTH sides, so the showcase read
 * `Anagrams of ”LISTEN”` — the opening mark backwards, 96 themes over. Every
 * authored string this view prints now goes through `typeset()`
 * (content/lib/typography.ts), which is idempotent, so the shipped theme bank
 * is set correctly whether or not its generator has been re-run.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import type {
  WordWebAction, WordWebHerringMatch, WordWebPuzzleEx, WordWebRoomState,
} from '../../../engine/rooms/adapters/word-web';
import { createRng, shuffle } from '../../../engine/rng';
import { sfx } from '../../../app/sound';
import { pressProps } from './usePressed';
import { typeset } from '../../../../content/lib/typography';
import { herringLine } from './herring-line';
import { endCopy } from './web-grade';
import './anchor.css';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string; bit?: string } | null;

/**
 * AAA 2.10 [BEAT] — the two things a wrong guess buys, both free with the
 * steps she has already spent.
 *
 * (a) THE STRUCTURAL BIT, printed on every wrong guess. Connections tells you
 *     only "one away" and otherwise nothing; our validator knows the true
 *     membership at build time, so the room can say how many of her four
 *     genuinely share a thread. That prunes the LOGIC space (which pairs can
 *     still be together), not merely the option space.
 */
function togetherLine(together: 1 | 2): string {
  return together >= 2
    ? 'Two of these share a thread.'
    : 'No two of these share a thread.';
}

function hashStr(s: string): number {
  let h = 0;
  for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h >>> 0;
}

const TIER_DOTS: Record<string, string> = { yellow: '●', green: '●●', blue: '●●●', purple: '●●●●' };
/** The same ranking the dots print, as a number — so the finished board can be
 *  sorted into a ladder (AAA 2.3/2.15) instead of into solve order. */
const TIER_RANK: Record<string, number> = { yellow: 0, green: 1, blue: 2, purple: 3 };

/** The merge travel, and the input lock that covers it (AAA 2.3). */
const HOLD_MS = 950;      // hop (600) + 350ms suspense hold → verdict
const MERGE_MS = 700;     // tiles travel into the banner (2.3: 600ms–1s)
const RELEASE_MS = 620;   // input unlocks; total ceremony stays under ~1.6s

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  // --- FLIP plumbing for the merge -----------------------------------------
  const tileEls = useRef(new Map<string, HTMLButtonElement>());
  const flipLayer = useRef<HTMLDivElement | null>(null);
  const bannerEl = useRef<HTMLDivElement | null>(null);
  const nameCardEl = useRef<HTMLDivElement | null>(null);
  const pendingMerge = useRef<{ word: string; rect: DOMRect }[]>([]);

  const naming = state.pendingNaming;
  const won = state.web.status === 'won' && !naming;
  const stepCost = tier === 3 ? 3 : 2;

  const solvedGroups = useMemo(
    () => state.web.solvedTiers.map((t) => puzzle.groups.find((g) => g.tier === t)!),
    [state.web.solvedTiers, puzzle],
  );
  // While the naming act is up, the final banner stays unstamped — its label
  // is the question (AAA 2.11), so it must not land early as a spoiler.
  //
  // ROUND 16 (AAA 2.3/2.15) — THE FINISHED BOARD IS A LADDER. During play the
  // banners keep SOLVE order, because the newest one is the one that animates
  // in and `isLast` below is how it is found. The moment the board is won they
  // re-sort to yellow → green → blue → purple, so the rank dots read 1,2,3,4
  // down the column instead of the solve order's 1,3,2,4. Connections re-sorts
  // on reveal for exactly this reason: the finished grid is the thing she
  // looks at, and a difficulty ladder that does not ascend means nothing.
  const shownGroups = useMemo(() => {
    const shown = naming ? solvedGroups.slice(0, -1) : solvedGroups;
    const rank = (t: string) => TIER_RANK[t] ?? 99;
    return won ? [...shown].sort((a, b) => rank(a.tier) - rank(b.tier)) : shown;
  }, [solvedGroups, naming, won]);
  const remaining = order.filter((w) => state.web.remainingWords.includes(w));

  const toggle = (word: string) => {
    if (busy || won) return;
    sfx.tap();
    setToast(null);
    setSelection((sel) =>
      sel.includes(word) ? sel.filter((w) => w !== word) : sel.length < 4 ? [...sel, word] : sel,
    );
  };

  /**
   * AAA 2.3 — the four tiles TRAVEL into the banner instead of vanishing.
   * Called from the verdict handler, one frame after the banner has mounted so
   * its rect is real; the clones are pointer-transparent, so nothing about the
   * board's input is blocked while they fly.
   */
  const runMerge = () => {
    const sources = pendingMerge.current;
    pendingMerge.current = [];
    if (sources.length === 0 || reducedMotion()) return;
    requestAnimationFrame(() => {
      const layer = flipLayer.current;
      const targetEl = nameCardEl.current ?? bannerEl.current;
      const target = targetEl?.getBoundingClientRect();
      if (!layer || !target || target.height === 0) return;
      const clones = sources.map(({ word, rect }) => {
        const el = document.createElement('div');
        el.className = 'ww-flip';
        el.textContent = word;
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        el.style.width = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
        layer.appendChild(el);
        return el;
      });
      requestAnimationFrame(() => {
        sources.forEach(({ rect }, i) => {
          const dx = target.left + target.width / 2 - (rect.left + rect.width / 2);
          const dy = target.top + target.height / 2 - (rect.top + rect.height / 2);
          const scale = Math.max(0.3, Math.min(1, target.height / Math.max(1, rect.height)));
          const c = clones[i]!;
          c.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
          c.style.opacity = '0';
        });
      });
      later(() => clones.forEach((c) => c.remove()), MERGE_MS + 90);
    });
  };

  // Submit → sequential hop → 350ms suspense hold → verdict → merge (AAA 2.2).
  const submit = () => {
    if (busy || won || selection.length !== 4) return;
    const chosen = [...selection];
    setBusy(true);
    setHopping(chosen);
    later(() => {
      // Measured at rest: `ww-hop` ends on translateY(0) with fill `both`, so
      // these are the tiles' true resting rects — the FLIP's "First".
      pendingMerge.current = chosen.flatMap((w) => {
        const el = tileEls.current.get(w);
        return el ? [{ word: w, rect: el.getBoundingClientRect() }] : [];
      });
      dispatch({ type: 'submit', selection: chosen });
      setHopping([]);
    }, HOLD_MS);
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
        runMerge();
        if (fb.won) later(() => sfx.victory(), 650);
        later(() => setBusy(false), RELEASE_MS);   // input locked while tiles land (AAA 2.3)
        break;
      case 'name-final':
        // Last four fall together — hold the win until the thread is named.
        // They merge into the naming card, which is where the question lives.
        sfx.correct();
        setSelection([]);
        runMerge();
        later(() => setBusy(false), RELEASE_MS);
        break;
      case 'one-away':
        pendingMerge.current = [];
        sfx.wrong();
        setToast({ kind: 'bad', text: `One away… · −${stepCost} steps` });
        setShaking(true);
        later(() => setShaking(false), 420);
        later(() => setBusy(false), 430);
        break;
      case 'wrong':
        pendingMerge.current = [];
        sfx.wrong();
        // Never bare "no": the structural bit is the headline, and a trap she
        // genuinely followed is named beneath it (AAA 2.10).
        setToast({
          kind: 'bad',
          text: `${togetherLine(fb.together)} · −${stepCost} steps`,
          bit: fb.herring ? herringLine(fb.herring) : undefined,
        });
        setShaking(true);
        later(() => setShaking(false), 420);
        later(() => setBusy(false), 430);
        break;
      case 'hint':
        sfx.glyph();
        setToast({ kind: 'good', text: typeset(`${fb.intruder} stands apart from the rest.`) });
        break;
      case 'invalid':
        pendingMerge.current = [];
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

  // AAA 1.5: `naming` swaps the 16-tile grid for a short card, so it pins the
  // column top-side too — the act of naming should not begin with a 300px slide.
  const verdict = won || naming !== null;

  return (
    <div className={`anch anch--library${verdict ? ' anch--verdict' : ''}`}>
      {/* Fixed, pointer-transparent stage for the merge clones. */}
      <div className="ww-fliplayer" ref={flipLayer} aria-hidden="true" />

      <header className="anch__head">
        <h2 className="anch__title">The Library</h2>
        <p className="anch__flavour">Weave the sixteen words.</p>
        <p className="anch__rule">Four threads of four.</p>
      </header>

      <div className="ww-banners">
        {shownGroups.map((g, i) => {
          const isLast = i === shownGroups.length - 1;
          return (
            <div
              key={g.tier}
              ref={isLast ? bannerEl : undefined}
              className={[
                'ww-banner', `ww-banner--${g.tier}`,
                // 3.4: EVERY win dances, not only the perfect one; `perfect`
                // earns the extra staggered flourish on the thread names.
                won ? 'ww-banner--dance' : (!naming && isLast ? 'ww-banner--in' : ''),
                won && perfect ? 'ww-banner--perfect' : '',
              ].filter(Boolean).join(' ')}
              style={won ? { animationDelay: `${i * 100}ms` } : undefined}
            >
              <div
                className="ww-banner__theme"
                style={won && perfect ? { animationDelay: `${i * 100 + 160}ms` } : undefined}
              >
                {typeset(g.theme)}
              </div>
              <div className="ww-banner__words">{g.words.join(' · ')}</div>
              <div className="ww-banner__dots">{TIER_DOTS[g.tier]}</div>
            </div>
          );
        })}
      </div>

      {naming ? (
        // AAA 2.11 — the act of naming: the last four fell together, but the
        // room only solves (and 'Perfect!' only lands) once the thread is named.
        <div className="anch-card ww-name anch-pop" ref={nameCardEl}>
          <div className="ww-name__eyebrow">The last four fall together</div>
          <div className="ww-name__words">{naming.words.join(' · ')}</div>
          <p className="ww-name__ask">What thread binds them?</p>
          {/* ROUND 34 (COMPREHENSION, item 14) — THE STAKE, WHERE SHE CHOOSES.
              The naming act is not free-form flavour: the adapter gates
              `perfect` on it (`isPerfect` reads `namedCorrectly`), and getting
              it wrong is the one way a spotless board loses the perfect grade.
              Nothing on the glass said so, so a cold reader could only read the
              three buttons as a quiz with no answer sheet — the grader's whole
              point. The clause sits directly above the options, which is where
              her eyes are while she picks, rather than in a toast afterwards.
              No number: views never price anything (see slices/room.ts). */}
          <p className="ww-name__stake">Name it true and the weave is perfect.</p>
          <div className="ww-name__options">
            {naming.options.map((theme) => (
              <button
                key={theme}
                className="anch-btn"
                {...pressProps<HTMLButtonElement>()}
                onClick={() => dispatch({ type: 'name-theme', theme })}
              >
                {typeset(theme)}
              </button>
            ))}
          </div>
        </div>
      ) : won ? (
        <div className="anch-done">
          <div className="anch-done__title">{perfect ? 'Perfect!' : 'Woven.'}</div>
          <p className="anch-done__line">
            {endCopy(state.costedMistakes + state.hintsBought, state.namedCorrectly !== false)}
          </p>
          {state.namedCorrectly === false && state.lastFeedback?.kind === 'group-solved' && (
            // Warm, never shame-adjacent (2.14): a missed name is just told true.
            <p className="anch-done__line">It called itself “{typeset(state.lastFeedback.theme)}”.</p>
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
                  ref={(el) => {
                    if (el) tileEls.current.set(word, el);
                    else tileEls.current.delete(word);
                  }}
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
            {toast && (
              <span className={`anch-toast anch-toast--${toast.kind}`}>
                {toast.text}
                {toast.bit && <span className="anch-toast__bit">{toast.bit}</span>}
              </span>
            )}
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
