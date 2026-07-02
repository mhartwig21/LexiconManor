import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useGameStore } from '../app/store';
import { nodeSeed, selectWordWeb } from '../app/content';
import { solveWordWeb, startWordWeb, submitGroup } from '../engine/word-web';
import { GlyphTray } from '../components/GlyphTray';
import { sfx } from '../app/sound';
import { scoreWordWeb } from '../engine/scoring';
import { createRng, shuffle } from '../engine/rng';
import type { MapNode } from '../engine/map';
import type { RunState, WordWebPuzzle } from '../engine/types';
import { RunHeader } from '../components/RunHeader';

export function WordWebGame({ node, run }: { node: MapNode; run: RunState }) {
  const [, navigate] = useLocation();
  const save = useGameStore((s) => s.save);
  const applyWrongAttempt = useGameStore((s) => s.applyWrongAttempt);
  const finishNode = useGameStore((s) => s.finishNode);
  const markPuzzleSeen = useGameStore((s) => s.markPuzzleSeen);
  const leaveNode = useGameStore((s) => s.leaveNode);

  // Puzzle choice is stable for this (run, node): same seed -> same puzzle.
  const puzzle: WordWebPuzzle = useMemo(
    () =>
      selectWordWeb({
        level: run.level,
        seenIds: save.seenPuzzleIds['word-web'],
        seed: nodeSeed(run.seed, node.id),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run.runId, node.id],
  );

  const [state, setState] = useState(() => startWordWeb(puzzle));
  const [selection, setSelection] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<'one-away' | 'wrong' | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const startedAt = useRef(Date.now());
  const finishedRef = useRef(false);

  const finishWith = (baseScore: number, wrongAttempts: number) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    finishNode({
      mode: 'word-web',
      puzzleId: puzzle.id,
      baseScore,
      wrongAttempts,
      durationMs: Date.now() - startedAt.current,
    });
    navigate('/map');
  };

  const onGlyphAction = (action: string) => {
    if (action === 'reveal_hint') {
      const unsolved = puzzle.groups.filter((g) => !state.solvedTiers.includes(g.tier));
      if (unsolved.length > 0) setHint(`One thread binds: “${unsolved[0]!.theme}”`);
    } else if (action === 'instant_solve') {
      setState(solveWordWeb(puzzle, state));
      finishWith(scoreWordWeb({ wrongAttempts: state.wrongAttempts }), state.wrongAttempts);
    } else if (action === 'skip') {
      finishWith(50, state.wrongAttempts);
    }
  };

  useEffect(() => {
    markPuzzleSeen('word-web', puzzle.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id]);

  const displayWords = useMemo(
    () => shuffle(createRng(nodeSeed(run.seed, node.id + '-display')), puzzle.groups.flatMap((g) => g.words)),
    [puzzle, run.seed, node.id],
  );

  const toggle = (word: string) => {
    sfx.tap();
    setFeedback(null);
    setSelection((sel) =>
      sel.includes(word) ? sel.filter((w) => w !== word) : sel.length < 4 ? [...sel, word] : sel,
    );
  };

  const submit = () => {
    if (selection.length !== 4 || finishedRef.current) return;
    const { state: next, result } = submitGroup(puzzle, state, selection);
    setState(next);
    setSelection([]);

    if (result.kind === 'solved') {
      setFeedback(null);
      sfx.correct();
      if (result.won) finishWith(scoreWordWeb({ wrongAttempts: next.wrongAttempts }), next.wrongAttempts);
      return;
    }
    if (result.kind === 'one-away' || result.kind === 'wrong') {
      sfx.wrong();
      setFeedback(result.kind === 'one-away' ? 'one-away' : 'wrong');
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      applyWrongAttempt(); // may end the run; PlayPage renders the defeat screen
    }
  };

  const solvedGroups = puzzle.groups.filter((g) => state.solvedTiers.includes(g.tier));

  return (
    <div className={`bg-level bg-level--${Math.min(run.level, 3)}`}>
      <div className="page">
        <RunHeader title="Word Web" />
        <p style={{ fontSize: 'var(--text-sm)', opacity: 0.8, marginTop: 0 }}>
          Weave the sixteen words into four threads of four.
        </p>
        <GlyphTray mode="word-web" onPuzzleAction={onGlyphAction} />
        {hint && (
          <p className="rise-fade" style={{ textAlign: 'center', color: 'var(--info)', fontSize: 'var(--text-sm)' }}>
            {hint}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {solvedGroups.map((g) => (
            <div key={g.tier} className={`web-solved web-solved--${g.tier} pop-in`}>
              <div className="web-solved__theme">{g.theme}</div>
              <div className="web-solved__words">{g.words.join(' · ')}</div>
            </div>
          ))}
        </div>

        <div className={`web-grid${shaking ? ' shake' : ''}`}>
          {displayWords
            .filter((w) => state.remainingWords.includes(w))
            .map((word) => (
              <button
                key={word}
                className={`web-tile${selection.includes(word) ? ' web-tile--selected' : ''}`}
                onClick={() => toggle(word)}
              >
                {word}
              </button>
            ))}
        </div>

        <div style={{ minHeight: '1.6rem', textAlign: 'center', marginTop: '0.6rem' }}>
          {feedback === 'one-away' && <span style={{ color: 'var(--tier-yellow)' }}>One away…</span>}
          {feedback === 'wrong' && <span style={{ color: 'var(--danger)' }}>The threads unravel. −1 mind point.</span>}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.4rem' }}>
          <button className="btn" onClick={() => setSelection([])} disabled={selection.length === 0}>
            Clear
          </button>
          <button className="btn btn--primary" onClick={submit} disabled={selection.length !== 4}>
            Weave
          </button>
          <button
            className="btn btn--danger"
            onClick={() => {
              leaveNode();
              navigate('/map');
            }}
          >
            Retreat
          </button>
        </div>
      </div>
    </div>
  );
}
