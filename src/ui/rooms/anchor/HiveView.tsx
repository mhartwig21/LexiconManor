/**
 * The Conservatory — Hive Builder view. OWNER: A3. Benchmarked against NYT
 * Spelling Bee per AAA §1: tap-first hive in the thumb zone, live entry
 * coloring, the 5-message invalid taxonomy with auto-clear, free unlimited
 * shuffle with a fixed center, garden rank ladder with points-to-next always
 * visible, an SB-Forum-style silhouette GRID (never spoilers) at Full Bloom.
 *
 * ROUND 5 fixes:
 *  - 1.8/1.7  the pangram burst no longer paints accent-on-accent over the
 *             centre hex and no longer swallows taps: the glow is a pure
 *             pointer-transparent radial, and the NAMING lives once, in the
 *             reserved toast slot.
 *  - 1.12/1.11 Full Bloom is a landing, not an ejection. The hive stays on the
 *             table, Every Petal (and its gem) is reachable, and the
 *             silhouettes are a view she opens, not a door slammed on her.
 *  - 1.15/1.17 Fern speaks (engine/rooms/fern-lines.ts) and the payout is named.
 *  - 3.2/7.2  the mechanical rule survives the SE-class breakpoint
 *             (`.anch__rule` is never hidden; only `.anch__flavour` is).
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import type { HivePuzzle } from '../../../engine/types';
import {
  HIVE_LADDER, ladderThreshold,
  type HiveAction, type HiveRoomState,
} from '../../../engine/rooms/adapters/hive';
import { fernLine } from '../../../engine/rooms/fern-lines';
import { STEP_TABLE } from '../../../engine/economy/steps';
import { createRng, shuffle } from '../../../engine/rng';
import { sfx } from '../../../app/sound';
import { pressProps } from './usePressed';
import './anchor.css';

/**
 * 1.16 milestone art: hand-drawn conservatory-in-bloom vignette, played once
 * on the Full Bloom crossing (≤2s, tap-skippable), then the view settles BACK
 * INTO THE HIVE (AAA 1.12 — the room is hers to keep gathering in). Stroke
 * ladder per §6.9: 3.0 contour / 2.0 features / 1.2 hatch, all
 * `currentColor`/accent, animated with transform+opacity only.
 *
 * ROUND 7 — IT ESCALATES (AAA 1.16 / 1.8's proportionality / 3.4). Full Bloom
 * (the 70% tier) had the bespoke vignette and Every Petal — the rarest, hidden,
 * gem-paying tier, our Queen Bee — had a green heading and 350px of blank
 * parchment, so the player who did the hardest thing in the room got the
 * weakest moment in it. The same drawing now carries a second, offset ring of
 * petals on a longer stagger for the 100% crossing: same idiom, unmistakably
 * more of it. Still ≤2s (last petal lands ~1.25s, heart at 1.3s) and still
 * tap-skippable per U.2/3.4.
 */
type BloomVariant = 'bloom' | 'every-petal';

interface Petal { deg: number; rx: number; ry: number; cy: number; delay: number }

const BLOOM_PETALS: Record<BloomVariant, Petal[]> = {
  bloom: [0, 60, 120, 180, 240, 300].map((deg, i) => ({
    deg, rx: 7, ry: 14, cy: 76, delay: 350 + i * 110,
  })),
  // The outer ring is drawn (and unfurls) first and is deliberately LARGER
  // than Full Bloom's whole flower; the inner ring is Full Bloom's exact ring,
  // offset 30° so the two read as two layers rather than one scribble.
  'every-petal': [
    ...[30, 90, 150, 210, 270, 330].map((deg, i) => ({
      deg, rx: 8, ry: 20, cy: 68, delay: 250 + i * 120,
    })),
    ...[0, 60, 120, 180, 240, 300].map((deg, i) => ({
      deg, rx: 6, ry: 13, cy: 77, delay: 310 + i * 120,
    })),
  ],
};

const BLOOM_COPY: Record<BloomVariant, { title: string; label: string; heart: number }> = {
  bloom: {
    title: 'Full Bloom!',
    label: 'The conservatory stands in full bloom',
    heart: 1050,
  },
  'every-petal': {
    title: 'Every Petal',
    label: 'Every petal in the conservatory has opened',
    heart: 1300,
  },
};

function BloomVignette({ variant, onDone }: { variant: BloomVariant; onDone: () => void }) {
  const petals = BLOOM_PETALS[variant];
  const { title, label, heart } = BLOOM_COPY[variant];
  return (
    <div
      className={`hv-bloom${variant === 'every-petal' ? ' hv-bloom--every' : ''}`}
      onPointerDown={onDone}
      role="img"
      aria-label={label}
    >
      <svg className="hv-bloom__svg" viewBox="0 0 220 150" fill="none">
        {/* glasshouse contour */}
        <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M30 138 V64 Q30 24 110 22 Q190 24 190 64 V138" />
          <path d="M14 138 H206" />
          <circle cx="110" cy="16" r="3.5" />
        </g>
        {/* mullions */}
        <g stroke="currentColor" strokeWidth="2" opacity="0.55" strokeLinecap="round">
          <path d="M70 138 V34" />
          <path d="M110 138 V22" />
          <path d="M150 138 V34" />
          <path d="M30 66 H190" />
          <path d="M30 100 H190" />
        </g>
        {/* ground hatch */}
        <g stroke="currentColor" strokeWidth="1.2" opacity="0.45" strokeLinecap="round">
          <path d="M22 144 l8 -4" /><path d="M40 145 l8 -4" /><path d="M172 145 l8 -4" /><path d="M190 144 l8 -4" />
        </g>
        {/* the bloom — accent, unfurling */}
        <g className="hv-bloom__stem" stroke="var(--room-accent)" strokeWidth="2" strokeLinecap="round">
          <path d="M110 138 Q108 116 110 96" />
          <path d="M110 122 Q98 118 92 108" />
          <path d="M110 112 Q122 108 128 98" />
        </g>
        <g stroke="var(--room-accent)" strokeWidth="2" strokeLinecap="round">
          {/* rotation lives on the wrapper <g>; the CSS unfurl animates the
              ellipse itself, so the two transforms never fight */}
          {petals.map((p, i) => (
            <g key={`${p.deg}-${i}`} transform={`rotate(${p.deg} 110 88)`}>
              <ellipse
                className="hv-bloom__petal"
                style={{ animationDelay: `${p.delay}ms` }}
                cx="110" cy={p.cy} rx={p.rx} ry={p.ry}
              />
            </g>
          ))}
          <circle
            className="hv-bloom__heart"
            style={{ animationDelay: `${heart}ms` }}
            cx="110" cy="88" r="5.5" fill="var(--room-accent)"
          />
        </g>
      </svg>
      <div className="hv-bloom__title">{title}</div>
    </div>
  );
}

type Toast = { kind: 'good' | 'bad' | 'info' | 'big'; text: string; fern?: string } | null;

/**
 * AAA 1.12 [COZY] — the shape of the unfound space, SB-Forum style: counts by
 * first letter × word length across ALL remaining words. No word is ever
 * singled out, nothing is spoiled, and (unlike an alphabetical prefix of
 * chips) it covers 100% of what is left instead of stopping at D.
 */
function RestGrid({ unfound }: { unfound: readonly string[] }) {
  const { letters, lengths, cell, rowTotal, colTotal } = useMemo(() => {
    const byLetter = new Map<string, Map<number, number>>();
    for (const w of unfound) {
      const l = w[0]!;
      let row = byLetter.get(l);
      if (!row) byLetter.set(l, (row = new Map()));
      row.set(w.length, (row.get(w.length) ?? 0) + 1);
    }
    const letters = [...byLetter.keys()].sort();
    const lengths = [...new Set(unfound.map((w) => w.length))].sort((a, b) => a - b);
    const cell = (l: string, n: number) => byLetter.get(l)?.get(n) ?? 0;
    const rowTotal = (l: string) => lengths.reduce((a, n) => a + cell(l, n), 0);
    const colTotal = (n: number) => letters.reduce((a, l) => a + cell(l, n), 0);
    return { letters, lengths, cell, rowTotal, colTotal };
  }, [unfound]);

  if (unfound.length === 0) return null;

  return (
    <table className="hv-grid tabular-nums">
      <caption className="hv-grid__cap">Still folded in the beds — by first letter and length</caption>
      <thead>
        <tr>
          <th scope="col" aria-label="first letter" />
          {lengths.map((n) => <th key={n} scope="col">{n}</th>)}
          <th scope="col">Σ</th>
        </tr>
      </thead>
      <tbody>
        {letters.map((l) => (
          <tr key={l}>
            <th scope="row">{l}</th>
            {lengths.map((n) => {
              const c = cell(l, n);
              return <td key={n} className={c === 0 ? 'hv-grid__zero' : undefined}>{c === 0 ? '·' : c}</td>;
            })}
            <td className="hv-grid__tot">{rowTotal(l)}</td>
          </tr>
        ))}
        <tr className="hv-grid__foot">
          <th scope="row">Σ</th>
          {lengths.map((n) => <td key={n}>{colTotal(n)}</td>)}
          <td className="hv-grid__tot">{unfound.length}</td>
        </tr>
      </tbody>
    </table>
  );
}

export default function HiveView({ puzzle, state, tier, dispatch }: RoomViewProps<HivePuzzle, HiveRoomState, HiveAction>) {
  const [typed, setTyped] = useState('');
  const [petals, setPetals] = useState<string[]>(puzzle.outer);
  const [shuffling, setShuffling] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [burst, setBurst] = useState(false);
  const [showFound, setShowFound] = useState(false);
  const [showRest, setShowRest] = useState(false);
  const [bloom, setBloom] = useState(false);
  const [petalBloom, setPetalBloom] = useState(false);
  const [rungBeat, setRungBeat] = useState(0);

  const handledAttempt = useRef(0);
  const shuffleCount = useRef(0);
  const bloomShown = useRef(false);
  const petalShown = useRef(false);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const allowed = useMemo(() => new Set([puzzle.center, ...puzzle.outer]), [puzzle]);
  const solveAt = ladderThreshold(state.maxScore, 70);
  // AAA 1.12: Full Bloom SOLVES and PAYS the room; it does not close it. Only
  // Every Petal (the hidden 100% tier) ends the session.
  const fullBloom = state.fullBloom;
  const everyPetal = state.everyPetal;

  const submit = () => {
    const word = typed.trim();
    if (!word || everyPetal) return;
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
      const firstWord = state.hive.foundWords.length === 1;
      if (fb.isPangram) {
        // 1.8: the glow is the celebration; the NAMING lives once, in the
        // reserved (layout-stable) toast slot, where it is actually legible.
        sfx.flourish();
        setBurst(true);
        later(() => setBurst(false), 950);
        setToast({
          kind: 'big',
          text: `Pangram! ${fb.word} +${fb.points}`,
          fern: fernLine('pangram', puzzle.id),
        });
        later(() => setToast(null), 1800);
      } else if (fb.tierUps.length > 0) {
        // 1.15/1.17: a rung is its own beat — its own sound, its own pop on
        // the ladder name, and Fern names the rung in character.
        const rung = fb.tierUps[fb.tierUps.length - 1]!;
        sfx.correct(fb.word.length);
        later(() => sfx.glyph(), 140);
        setRungBeat((n) => n + 1);
        setToast({
          kind: 'good',
          text: `${fb.word} +${fb.points} — you've reached ${rung}`,
          fern: fernLine(`tier-up:${rung}`, puzzle.id),
        });
        later(() => setToast(null), 1600);
      } else {
        sfx.correct(fb.word.length);
        // The top two praise bands are Fern's, not a disembodied adjective
        // (AAA 1.15 [BEAT] — the SB failure mode we exist to beat).
        setToast({
          kind: 'good',
          text: `${fb.word} +${fb.points}`,
          fern: firstWord
            ? fernLine('first-word', puzzle.id)
            : fb.points >= 7
              ? fernLine('good-word', puzzle.id)
              : undefined,
        });
        later(() => setToast(null), 1400);
      }
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
      // Structural slips are flat −1 at every tier (AAA R.1) — never −2/−3.
      const cost = fb.costed ? ' · −1 step' : '';
      setToast({ kind: fb.costed ? 'bad' : 'info', text: messages[fb.reason] + cost });
      setShaking(true);
      later(() => setShaking(false), 340);
      later(() => setTyped(''), 350);
      later(() => setToast(null), 1100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempts]);

  // Full Bloom crossing: victory sting + the 1.16 hand-drawn vignette
  // (≤2s, tap-skippable) — and then straight back to the hive.
  useEffect(() => {
    if (!fullBloom || bloomShown.current) return;
    bloomShown.current = true;
    sfx.victory();
    setBloom(true);
    later(() => setBloom(false), 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullBloom]);

  // Every Petal: the hidden 100% tier actually lands now (it used to be dead
  // code behind the old forced solve at 70%) — and it gets the ESCALATED
  // vignette (AAA 1.16 / 1.8), not less ceremony than the tier below it.
  useEffect(() => {
    if (!everyPetal || petalShown.current) return;
    petalShown.current = true;
    sfx.levelUp();
    setBloom(false);            // never two vignettes stacked
    setPetalBloom(true);
    later(() => setPetalBloom(false), 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [everyPetal]);

  // Physical keyboard support (desktop / iPad keyboards).
  useEffect(() => {
    if (everyPetal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[a-zA-Z]$/.test(e.key)) setTyped((t) => (t + e.key.toUpperCase()).slice(0, 24));
      else if (e.key === 'Backspace') setTyped((t) => t.slice(0, -1));
      else if (e.key === 'Enter') submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [everyPetal, typed]);

  const tapLetter = (letter: string) => {
    if (everyPetal) return;
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

  const unfound = useMemo(
    () => puzzle.validWords.filter((w) => !state.hive.foundWords.includes(w)),
    [puzzle, state.hive.foundWords],
  );

  // AAA 1.17 [BEAT]: the payout is named in the room, in steps she can see on
  // the chrome meter — sourced from the same table the room slice pays from.
  const payoutLine = useMemo(() => {
    const solve = STEP_TABLE.solve('anchor', tier);
    const clean = state.costedMistakes === 0;
    return `+${solve} steps for the flowering${clean ? ` · +${STEP_TABLE.perfect} for a bed without a bent stem` : ''}`;
  }, [tier, state.costedMistakes]);

  const found = [...state.hive.foundWords].reverse();
  const strip = found.slice(0, 8);

  /**
   * AAA 1.5 — THE STRIP NEVER SLICES A WORD (round 10).
   *
   * The collapsed found-line clipped at `overflow: hidden` under a mask that
   * faded from 82%, so the last chip on the line was routinely cut through the
   * middle of a word (measured: `ARRANGE` at 84.7px of its 93.6px, hard-cut
   * 8.9px short of its own border). It is the first thing on screen under the
   * rank bar, and a half-drawn word there reads as a rendering fault, not as
   * "there is more". Chips whose box does not fit ENTIRELY inside the strip
   * are made invisible instead — the count and the ▾ toggle beside them are
   * already the honest statement that there is more.
   *
   * Measured with layout values (`offsetLeft` / `offsetWidth`), so the newest
   * chip's `anch-pop` scale cannot make it measure small and then overflow
   * when it settles; and because the hidden chips keep their boxes, the
   * measurement is a fixed point (nothing reflows in response to it).
   */
  const stripEl = useRef<HTMLDivElement | null>(null);
  const [stripFit, setStripFit] = useState(strip.length);
  useLayoutEffect(() => {
    const measure = () => {
      const el = stripEl.current;
      if (!el) return;
      const limit = el.clientWidth;
      const chips = [...el.children] as HTMLElement[];
      // `offsetLeft` is measured from the nearest POSITIONED ancestor, which
      // may or may not be the strip itself; normalise before comparing.
      const ox = chips[0] && chips[0].offsetParent === el ? 0 : el.offsetLeft;
      let n = 0;
      for (const child of chips) {
        if (child.offsetLeft - ox + child.offsetWidth > limit + 0.5) break;
        n += 1;
      }
      setStripFit(n);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [strip.join('')]);
  // AAA 1.5 — every state that swaps the tall play cluster out for a short
  // panel pins the column to the top instead of letting the stage re-centre
  // it; otherwise the header slides 300px on the vignette, slides back 2s
  // later, and does it again on the found drawer.
  const verdict = everyPetal || showRest || bloom || petalBloom || showFound;

  /**
   * The hive itself, hoisted so Every Petal can keep it ON THE TABLE beneath
   * its trophy (AAA 1.12's lesson, one tier up): the player who found every
   * word should not be the one ejected from the room.
   */
  const hiveBoard = (
    <div className={`hv-board${shuffling ? ' hv-board--shuffling' : ''}${everyPetal ? ' hv-board--kept' : ''}`}>
      <button
        className="hv-cell hv-cell--center hv-cell--c"
        {...pressProps<HTMLButtonElement>({ down: () => tapLetter(puzzle.center) })}
      >
        <span className="hv-cell__g">{puzzle.center}</span>
      </button>
      {petals.map((letter, i) => (
        <button
          key={letter}
          className={`hv-cell hv-cell--p${i}`}
          {...pressProps<HTMLButtonElement>({ down: () => tapLetter(letter) })}
        >
          <span className="hv-cell__g">{letter}</span>
        </button>
      ))}
      {/* Pure glow. No text over the hive, no tap-catcher: the one moment
          she most wants to keep typing is not the moment the hive stops
          listening (AAA 1.7 [PARITY]). */}
      {burst && <div className="hv-burst" aria-hidden="true" />}
    </div>
  );

  return (
    <div className={`anch anch--conservatory${verdict ? ' anch--verdict' : ''}`}>
      <header className="anch__head">
        <h2 className="anch__title">The Conservatory</h2>
        {/* 3.2/7.2: the FLAVOUR is what an SE-class screen gives up; the RULE
            is load-bearing (a word without the centre letter costs a step) and
            is never hidden. */}
        <p className="anch__flavour">Grow words from the hive.</p>
        <p className="anch__rule">
          Every word must hold <strong style={{ color: 'var(--room-accent)' }}>{puzzle.center}</strong>.
        </p>
      </header>

      <div className="hv-ladder">
        <span key={rungBeat} className="hv-ladder__name anch-pop">{tierName}</span>
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
        <div className="hv-found__strip" ref={stripEl}>
          {strip.map((w, i) => (
            <span
              key={w}
              className={[
                'anch-chip',
                i === 0 ? 'anch-pop' : '',
                puzzle.pangrams.includes(w) ? 'anch-chip--accent' : '',
                i >= stripFit ? 'anch-chip--offstrip' : '',
              ].filter(Boolean).join(' ')}
              aria-hidden={i >= stripFit || undefined}
            >
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
          {found.length === 0 && <span className="anch__flavour">Nothing gathered yet — tap to close.</span>}
        </div>
      ) : petalBloom ? (
        <BloomVignette variant="every-petal" onDone={() => setPetalBloom(false)} />
      ) : bloom ? (
        <BloomVignette variant="bloom" onDone={() => setBloom(false)} />
      ) : everyPetal ? (
        // The hidden tier finally lands: nothing folded, a gem in the trug —
        // and the room she emptied stays under her hands. `RestGrid` would
        // render nothing here (there is no unfound space left), so the column
        // is filled with the thing that IS the trophy: the whole gathering,
        // pangrams in the accent. AAA 1.16 / 3.4.
        <>
          <div className="anch-done hv-trophy">
            <div className="anch-done__title">Every Petal</div>
            <p className="anch-done__fern">{fernLine('every-petal', puzzle.id)}</p>
            <p className="anch-done__line">{payoutLine} · +1 gem</p>
          </div>
          {hiveBoard}
          <div className="hv-trophy__cap">
            All {state.hive.foundWords.length} gathered — nothing left folded
          </div>
          <div className="hv-foundpanel hv-trophy__list">
            {[...state.hive.foundWords].sort().map((w) => (
              <span key={w} className={`anch-chip${puzzle.pangrams.includes(w) ? ' anch-chip--accent' : ''}`}>
                {w}
              </span>
            ))}
          </div>
        </>
      ) : showRest ? (
        // AAA 1.12: what remains, as shape rather than words — opened by her,
        // covering 100% of the unfound space, and never a list to feel bad about.
        <div className="anch-done">
          <div className="anch-done__title">Full Bloom</div>
          <p className="anch-done__fern">{fernLine('full-bloom', puzzle.id)}</p>
          <p className="anch-done__line">{payoutLine}</p>
          <RestGrid unfound={unfound} />
          <div className="anch-row" style={{ marginTop: '0.7rem' }}>
            <button className="anch-btn" {...pressProps<HTMLButtonElement>()} onClick={() => setShowRest(false)}>
              Back to the hive
            </button>
          </div>
        </div>
      ) : (
        <>
          {fullBloom && (
            <div className="hv-note">
              <span>The room is yours — gather on, or step out.</span>
              <button className="hv-found__toggle" onClick={() => setShowRest(true)}>Still folded ▾</button>
            </div>
          )}
          {/* Flexible slack sits ABOVE the play cluster so entry/hive/controls
              pin to the bottom safe-area — SB's hive-low, thumb-zone
              composition (AAA 1.1), not a mid-screen float. */}
          <div className="hv-spacer" aria-hidden="true" />
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
            {toast && (
              <span className={`anch-toast anch-toast--${toast.kind}`}>
                {toast.text}
                {toast.fern && <span className="anch-toast__fern">{toast.fern}</span>}
              </span>
            )}
          </div>

          {hiveBoard}

          <div className="anch-row">
            <button
              className="anch-btn"
              {...pressProps<HTMLButtonElement>({ down: deleteDown, up: deleteUp })}
              disabled={!typed}
            >
              Delete
            </button>
            <button className="anch-btn" {...pressProps<HTMLButtonElement>()} onClick={doShuffle} aria-label="Shuffle petals">
              Shuffle
            </button>
            <button className="anch-btn anch-btn--primary" {...pressProps<HTMLButtonElement>()} onClick={submit} disabled={typed.length < 4}>
              Enter
            </button>
          </div>
        </>
      )}
    </div>
  );
}
