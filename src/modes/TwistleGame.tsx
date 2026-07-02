import { useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useGameStore } from '../app/store';
import { nodeSeed, selectTwistle } from '../app/content';
import { scoreTwistle } from '../engine/scoring';
import { CENTER_INDEX, GRID_SIZE, solveTwistle, startTwistle, submitTwistleWord } from '../engine/twistle';
import { GlyphTray } from '../components/GlyphTray';
import type { MapNode } from '../engine/map';
import type { RunState } from '../engine/types';
import { RunHeader } from '../components/RunHeader';

function areNeighbors(a: number, b: number): boolean {
  const dr = Math.abs(Math.floor(a / GRID_SIZE) - Math.floor(b / GRID_SIZE));
  const dc = Math.abs((a % GRID_SIZE) - (b % GRID_SIZE));
  return dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0);
}

export function TwistleGame({ node, run }: { node: MapNode; run: RunState }) {
  const [, navigate] = useLocation();
  const save = useGameStore((s) => s.save);
  const applyWrongAttempt = useGameStore((s) => s.applyWrongAttempt);
  const finishNode = useGameStore((s) => s.finishNode);
  const markPuzzleSeen = useGameStore((s) => s.markPuzzleSeen);
  const leaveNode = useGameStore((s) => s.leaveNode);
  const startedAt = useRef(Date.now());
  const finishedRef = useRef(false);

  const puzzle = useMemo(
    () =>
      selectTwistle({
        level: run.level,
        seenIds: save.seenPuzzleIds.twistle,
        seed: nodeSeed(run.seed, node.id),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run.runId, node.id],
  );

  const [state, setState] = useState(() => startTwistle(puzzle));
  const [path, setPath] = useState<number[]>([]);
  const [flash, setFlash] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null);
  const [shaking, setShaking] = useState(false);

  const word = path.map((i) => puzzle.grid[i]).join('');

  const finishWith = (baseScore: number, wrongAttempts: number) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    markPuzzleSeen('twistle', puzzle.id);
    finishNode({
      mode: 'twistle',
      puzzleId: puzzle.id,
      baseScore,
      wrongAttempts,
      durationMs: Date.now() - startedAt.current,
    });
    navigate('/map');
  };

  const onGlyphAction = (action: string) => {
    if (action === 'reveal_hint') {
      const unfound = puzzle.targetWords.find((w) => !state.foundWords.includes(w));
      if (unfound) setFlash({ kind: 'good', text: `Seek: ${unfound}` });
    } else if (action === 'instant_solve') {
      const solved = solveTwistle(puzzle, state);
      setState(solved);
      finishWith(
        scoreTwistle({ wordsFound: solved.foundWords.length, wrongAttempts: state.wrongAttempts, durationMs: Date.now() - startedAt.current }),
        state.wrongAttempts,
      );
    } else if (action === 'skip') {
      finishWith(50, state.wrongAttempts);
    }
  };

  const tap = (index: number) => {
    setFlash(null);
    setPath((p) => {
      if (p.length === 0) return [index];
      if (p[p.length - 1] === index) return p.slice(0, -1); // tap head to undo
      if (p.includes(index)) return p;
      return areNeighbors(p[p.length - 1]!, index) ? [...p, index] : p;
    });
  };

  const submit = () => {
    if (finishedRef.current || word.length < puzzle.rules.minLength) return;
    const { state: next, result } = submitTwistleWord(puzzle, state, word);
    setState(next);
    setPath([]);

    if (result.kind === 'valid') {
      setFlash({ kind: 'good', text: `${result.word} ✓ (${next.foundWords.length}/${puzzle.targetCount})` });
      if (result.won) {
        finishWith(
          scoreTwistle({ wordsFound: next.foundWords.length, wrongAttempts: next.wrongAttempts, durationMs: Date.now() - startedAt.current }),
          next.wrongAttempts,
        );
      }
      return;
    }

    const messages: Record<string, string> = {
      'too-short': `Words need ${puzzle.rules.minLength}+ letters`,
      'not-on-grid': 'That path is impossible',
      'breaks-rule': 'Must pass through the center tile',
      'not-a-word': `${word} is not in the lexicon. −1 mind point.`,
      'already-found': 'Already found',
      finished: '',
    };
    setFlash({ kind: 'bad', text: messages[result.reason] ?? 'No' });
    if (result.reason === 'not-a-word' || result.reason === 'not-on-grid') {
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      applyWrongAttempt(); // may end the run; PlayPage shows defeat
    }
  };

  return (
    <div className={`bg-level bg-level--${Math.min(run.level, 3)}`}>
      <div className="page">
        <RunHeader title="Twistle" />
        <p style={{ fontSize: 'var(--text-sm)', opacity: 0.8, marginTop: 0 }}>
          Trace {puzzle.targetCount} words through adjacent tiles.
          {puzzle.rules.centerRequired && (
            <>
              {' '}
              <strong style={{ color: 'var(--golden-bright)' }}>Twist: every word must cross the center tile.</strong>
            </>
          )}
        </p>
        <GlyphTray mode="twistle" onPuzzleAction={onGlyphAction} />

        <div className={`twistle-grid${shaking ? ' shake' : ''}`}>
          {puzzle.grid.map((letter, i) => {
            const pos = path.indexOf(i);
            const selectable = path.length === 0 || path.includes(i) || areNeighbors(path[path.length - 1]!, i);
            return (
              <button
                key={i}
                className={[
                  'twistle-cell',
                  pos >= 0 ? 'twistle-cell--traced' : '',
                  pos === path.length - 1 ? 'twistle-cell--head' : '',
                  i === CENTER_INDEX && puzzle.rules.centerRequired ? 'twistle-cell--center' : '',
                  !selectable && pos < 0 ? 'twistle-cell--far' : '',
                ].join(' ')}
                onClick={() => tap(i)}
              >
                {letter}
                {pos >= 0 && <span className="twistle-cell__order">{pos + 1}</span>}
              </button>
            );
          })}
        </div>

        <div className="hive__word" style={{ marginTop: '0.6rem' }}>
          {word || <span style={{ opacity: 0.4 }}>trace a word…</span>}
        </div>
        <div style={{ minHeight: '1.3rem', textAlign: 'center' }}>
          {flash && (
            <span className="rise-fade" style={{ color: flash.kind === 'good' ? 'var(--success)' : 'var(--danger)' }}>
              {flash.text}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
          <button className="btn" onClick={() => setPath([])} disabled={path.length === 0}>
            Clear
          </button>
          <button className="btn btn--primary" onClick={submit} disabled={word.length < puzzle.rules.minLength}>
            Claim
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

        {state.foundWords.length > 0 && (
          <div className="hive__found" style={{ marginTop: '0.8rem' }}>
            {state.foundWords.map((w) => (
              <span key={w} className="hive__found-word">
                {w}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
