import { useEffect, useMemo, useRef, useState } from 'react';
import type { HivePuzzle } from '../engine/types';
import { MAX_ENTROPY, foundWordScores, restoreLetter, startHive, submitHiveWord, type HiveState } from '../engine/hive';
import { createRng, pick } from '../engine/rng';

/**
 * Shared Hive Builder board: used full-size for hive nodes and compact
 * (with a timer, entropy off) for Forgotten Word clue trials.
 */

export interface HiveFinish {
  won: boolean;
  reason: 'threshold' | 'entropy' | 'timeout';
  state: HiveState;
  wordScores: number[];
}

export function HiveCore({
  puzzle,
  seed,
  thresholdOverride,
  timerSeconds,
  entropyEnabled = true,
  entropyImmune = false,
  compact = false,
  onRestoreLetter,
  onFinish,
}: {
  puzzle: HivePuzzle;
  seed: number;
  thresholdOverride?: number;
  timerSeconds?: number;
  entropyEnabled?: boolean;
  entropyImmune?: boolean;
  compact?: boolean;
  /** Return true if a mind point was successfully spent. */
  onRestoreLetter?: () => boolean;
  onFinish: (result: HiveFinish) => void;
}) {
  const [state, setState] = useState<HiveState>(() => {
    const s = startHive(puzzle);
    return thresholdOverride !== undefined ? { ...s, pointThreshold: thresholdOverride } : s;
  });
  const [typed, setTyped] = useState('');
  const [flash, setFlash] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null);
  const [shaking, setShaking] = useState(false);
  const [timeLeft, setTimeLeft] = useState(timerSeconds ?? 0);
  const rngRef = useRef(createRng(seed));
  const doneRef = useRef(false);

  const finish = (won: boolean, reason: HiveFinish['reason'], finalState: HiveState) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onFinish({ won, reason, state: finalState, wordScores: foundWordScores(puzzle, finalState) });
  };

  // Trial timer.
  useEffect(() => {
    if (!timerSeconds) return;
    const t = setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          // Read latest state via setState callback to avoid staleness.
          setState((cur) => {
            finish(cur.score >= cur.pointThreshold, 'timeout', cur);
            return cur;
          });
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerSeconds]);

  const letters = useMemo(() => [puzzle.center, ...puzzle.outer], [puzzle]);

  const submit = () => {
    const word = typed.trim();
    if (!word || doneRef.current) return;
    const { state: next, result } = submitHiveWord(puzzle, state, word, {
      entropyImmune: entropyImmune || !entropyEnabled,
      fadePick: (candidates) => pick(rngRef.current, candidates),
    });
    setState(next);
    setTyped('');

    if (result.kind === 'valid') {
      setFlash({ kind: 'good', text: `${result.word} +${result.points}${result.isPangram ? ' ✦ PANGRAM!' : ''}` });
      if (result.won) finish(true, 'threshold', next);
    } else {
      const messages: Record<string, string> = {
        'too-short': 'Too short (4+ letters)',
        'missing-center': `Must use ${puzzle.center}`,
        'bad-letter': 'Unknown letter',
        'faded-letter': 'That letter has faded',
        'not-a-word': 'Not in the lexicon',
        'already-found': 'Already found',
        finished: '',
      };
      setFlash({ kind: 'bad', text: messages[result.reason] ?? 'No' });
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      if (result.lost) finish(false, 'entropy', next);
    }
  };

  const tapLetter = (letter: string) => {
    if (!state.fadedLetters.includes(letter)) setTyped((t) => t + letter);
  };

  const tryRestore = (letter: string) => {
    if (!onRestoreLetter || !state.fadedLetters.includes(letter)) return;
    if (onRestoreLetter()) setState((s) => restoreLetter(s, letter));
  };

  const pct = Math.min(100, Math.round((state.score / state.pointThreshold) * 100));

  return (
    <div className={compact ? 'hive hive--compact' : 'hive'}>
      <div className="hive__status">
        <div className="hive__progress" role="progressbar" aria-valuenow={state.score} aria-valuemax={state.pointThreshold}>
          <div className="hive__progress-fill" style={{ width: `${pct}%` }} />
          <span className="hive__progress-label">
            {state.score} / {state.pointThreshold}
          </span>
        </div>
        {timerSeconds ? (
          <span className={`hive__timer${timeLeft <= 15 ? ' hive__timer--low' : ''}`}>{timeLeft}s</span>
        ) : entropyEnabled ? (
          <span className="hive__entropy" title="Entropy: wrong words fade letters">
            {Array.from({ length: MAX_ENTROPY }, (_, i) => (
              <span key={i} className={`entropy-pip${i < state.entropy ? ' entropy-pip--lit' : ''}`} />
            ))}
          </span>
        ) : null}
      </div>

      <div className={`hive__word${shaking ? ' shake' : ''}`}>
        {typed || <span style={{ opacity: 0.4 }}>tap letters or type…</span>}
      </div>
      <div style={{ minHeight: '1.3rem', textAlign: 'center' }}>
        {flash && (
          <span className="rise-fade" style={{ color: flash.kind === 'good' ? 'var(--success)' : 'var(--danger)' }}>
            {flash.text}
          </span>
        )}
      </div>

      <div className="hive__board">
        {letters.map((letter, i) => {
          const faded = state.fadedLetters.includes(letter);
          return (
            <button
              key={letter}
              className={[
                'hive-cell',
                i === 0 ? 'hive-cell--center' : '',
                faded ? 'hive-cell--faded' : '',
                `hive-cell--pos${i}`,
              ].join(' ')}
              onClick={() => (faded ? tryRestore(letter) : tapLetter(letter))}
              title={faded ? 'Faded — tap to restore for 1 mind point' : letter}
            >
              {letter}
            </button>
          );
        })}
      </div>

      <input
        className="hive__input"
        value={typed}
        onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder=""
        aria-label="word entry"
        autoFocus={!compact}
      />

      <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
        <button className="btn" onClick={() => setTyped('')} disabled={!typed}>
          Clear
        </button>
        <button className="btn" onClick={() => setTyped((t) => t.slice(0, -1))} disabled={!typed}>
          ⌫
        </button>
        <button className="btn btn--primary" onClick={submit} disabled={typed.length < 4}>
          Submit
        </button>
      </div>

      {state.foundWords.length > 0 && (
        <div className="hive__found">
          {state.foundWords.map((w) => (
            <span key={w} className={puzzle.pangrams.includes(w) ? 'hive__found-word hive__found-word--pangram' : 'hive__found-word'}>
              {w}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
