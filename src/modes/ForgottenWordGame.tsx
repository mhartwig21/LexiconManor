import { useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useGameStore } from '../app/store';
import { nodeSeed, selectForgottenWord, selectHive } from '../app/content';
import { scoreForgottenWord } from '../engine/scoring';
import {
  definitionForLevel,
  revealClueByGlyph,
  startForgottenWord,
  submitGuess,
  unlockClue,
  type ClueId,
} from '../engine/forgotten-word';
import { GlyphTray } from '../components/GlyphTray';
import type { MapNode } from '../engine/map';
import type { RunState } from '../engine/types';
import { RunHeader } from '../components/RunHeader';
import { HiveCore } from './HiveCore';

const TRIAL_SECONDS = 90;
const TRIAL_TARGET = { etymology: 12, usage: 16 };

export function ForgottenWordGame({ node, run }: { node: MapNode; run: RunState }) {
  const [, navigate] = useLocation();
  const save = useGameStore((s) => s.save);
  const finishNode = useGameStore((s) => s.finishNode);
  const failNode = useGameStore((s) => s.failNode);
  const markPuzzleSeen = useGameStore((s) => s.markPuzzleSeen);
  const leaveNode = useGameStore((s) => s.leaveNode);
  const startedAt = useRef(Date.now());
  const finishedRef = useRef(false);

  const puzzle = useMemo(
    () =>
      selectForgottenWord({
        level: run.level,
        seenIds: save.seenPuzzleIds['forgotten-word'],
        seed: nodeSeed(run.seed, node.id),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run.runId, node.id],
  );

  const [state, setState] = useState(() => startForgottenWord(puzzle, run.level));
  const [guess, setGuess] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [activeTrial, setActiveTrial] = useState<ClueId | null>(null);
  const [trialBonusTime, setTrialBonusTime] = useState(0);

  const openTrial = (clue: ClueId) => {
    setTrialBonusTime(0); // bonus time never carries between trials
    setActiveTrial(clue);
  };

  const finishWith = (baseScore: number, wrongAttempts: number) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    markPuzzleSeen('forgotten-word', puzzle.id);
    finishNode({
      mode: 'forgotten-word',
      puzzleId: puzzle.id,
      baseScore,
      wrongAttempts,
      durationMs: Date.now() - startedAt.current,
    });
    navigate('/map');
  };

  const onGlyphAction = (action: string, value: number) => {
    if (action === 'reveal_hint') {
      setState((s) => revealClueByGlyph(s));
      setFlash('A clue unseals itself.');
    } else if (action === 'extend_time') {
      setTrialBonusTime((t) => t + value);
    } else if (action === 'instant_solve') {
      setFlash(`The word returns: ${puzzle.word}.`);
      finishWith(scoreForgottenWord({ hintsUsed: state.hintsUsed, wrongGuesses: state.guesses.length }), state.guesses.length);
    } else if (action === 'skip') {
      finishWith(50, state.guesses.length);
    }
  };

  const submit = () => {
    if (finishedRef.current || !guess.trim()) return;
    const { state: next, result } = submitGuess(puzzle, state, guess);
    setState(next);
    setGuess('');

    if (result.kind === 'correct') {
      finishWith(
        scoreForgottenWord({ hintsUsed: next.hintsUsed, wrongGuesses: next.guesses.length - 1 }),
        next.guesses.length - 1,
      );
      return;
    }
    if (result.kind === 'wrong') {
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      if (result.lost) {
        setFlash(`The word slips away… it was ${puzzle.word}.`);
        finishedRef.current = true;
        markPuzzleSeen('forgotten-word', puzzle.id);
        setTimeout(() => {
          failNode();
          if (!useGameStore.getState().save.activeRun) return; // defeat screen on /play
          navigate('/map');
        }, 2200);
      } else {
        setFlash(`Not "${next.guesses.at(-1)!.toLowerCase()}" — ${result.guessesLeft} whisper${result.guessesLeft === 1 ? '' : 's'} left.`);
      }
    }
    if (result.kind === 'invalid' && result.reason === 'repeat') setFlash('Already whispered.');
  };

  const trialPuzzle = useMemo(
    () =>
      activeTrial
        ? selectHive({
            level: 1, // trials use accessible hives regardless of run level
            seenIds: [], // trials may reuse hive puzzles freely
            seed: nodeSeed(run.seed, `${node.id}-trial-${activeTrial}`),
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTrial],
  );

  return (
    <div className={`bg-level bg-level--${Math.min(run.level, 3)}`}>
      <div className="page">
        <RunHeader title="The Forgotten Word" />
        <GlyphTray mode="forgotten-word" canExtendTime={activeTrial !== null} onPuzzleAction={onGlyphAction} />
        <div className="card pop-in" style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <div style={{ fontSize: 'var(--text-xs)', letterSpacing: '0.15em', opacity: 0.7, textTransform: 'uppercase' }}>
            A word has been forgotten
          </div>
          <p style={{ fontSize: 'var(--text-lg)', fontStyle: 'italic', margin: '0.6rem 0', color: 'var(--parchment)' }}>
            “{definitionForLevel(puzzle, run.level)}”
          </p>
          <div style={{ fontSize: 'var(--text-sm)', opacity: 0.75 }}>
            {puzzle.word.length} letters · {state.maxGuesses - state.guesses.length} of {state.maxGuesses} whispers left
          </div>
        </div>

        {/* Clues */}
        <div style={{ display: 'grid', gap: '0.6rem', marginBottom: '1rem' }}>
          <ClueRow
            label="Etymology"
            unlocked={state.unlockedClues.includes('etymology')}
            text={puzzle.etymology}
            onTrial={() => openTrial('etymology')}
          />
          <ClueRow
            label="Usage"
            unlocked={state.unlockedClues.includes('usage')}
            text={puzzle.usage}
            onTrial={() => openTrial('usage')}
          />
        </div>

        <div className={shaking ? 'shake' : ''} style={{ display: 'flex', gap: '0.6rem' }}>
          <input
            className="hive__input"
            style={{ flex: 1, textAlign: 'left', paddingLeft: '0.8rem' }}
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Speak the forgotten word…"
            disabled={finishedRef.current}
            autoFocus
          />
          <button className="btn btn--primary" onClick={submit} disabled={!guess.trim() || finishedRef.current}>
            Whisper
          </button>
        </div>
        <div style={{ minHeight: '1.5rem', textAlign: 'center', marginTop: '0.5rem' }}>
          {flash && <span className="rise-fade" style={{ color: 'var(--tier-yellow)' }}>{flash}</span>}
        </div>
        {state.guesses.length > 0 && (
          <div style={{ textAlign: 'center', fontSize: 'var(--text-sm)', opacity: 0.6 }}>
            Whispered: {state.guesses.join(', ')}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
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

        {/* Trial modal: a timed mini-hive guards each clue */}
        {activeTrial && trialPuzzle && (
          <div className="modal-backdrop">
            <div className="modal card pop-in" style={{ textAlign: 'left' }}>
              <h3 style={{ textAlign: 'center' }}>Trial of {activeTrial === 'etymology' ? 'Origins' : 'Context'}</h3>
              <p style={{ fontSize: 'var(--text-sm)', opacity: 0.8, textAlign: 'center' }}>
                Score {TRIAL_TARGET[activeTrial]} points in {TRIAL_SECONDS}s to unlock the clue.
              </p>
              <HiveCore
                puzzle={trialPuzzle}
                seed={nodeSeed(run.seed, `${node.id}-trialfade`)}
                thresholdOverride={TRIAL_TARGET[activeTrial]}
                timerSeconds={TRIAL_SECONDS}
                bonusTime={trialBonusTime}
                entropyEnabled={false}
                compact
                onFinish={({ won }) => {
                  const clue = activeTrial;
                  setActiveTrial(null);
                  if (won && clue) {
                    setState((s) => unlockClue(s, clue));
                    setFlash('The clue reveals itself.');
                  } else {
                    setFlash('The trial defeats you — the clue stays hidden.');
                  }
                }}
              />
              <div style={{ textAlign: 'center', marginTop: '0.6rem' }}>
                <button className="btn" onClick={() => setActiveTrial(null)}>
                  Abandon trial
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ClueRow({ label, unlocked, text, onTrial }: { label: string; unlocked: boolean; text: string; onTrial: () => void }) {
  return (
    <div className="card" style={{ padding: '0.8rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem' }}>
      <div>
        <div style={{ fontFamily: 'var(--font-heading)', color: 'var(--golden)', fontSize: 'var(--text-sm)' }}>{label}</div>
        {unlocked ? (
          <div className="rise-fade" style={{ fontSize: 'var(--text-sm)' }}>{text}</div>
        ) : (
          <div style={{ fontSize: 'var(--text-sm)', opacity: 0.5, fontStyle: 'italic' }}>Sealed behind a trial…</div>
        )}
      </div>
      {!unlocked && (
        <button className="btn" style={{ flexShrink: 0 }} onClick={onTrial}>
          Face trial
        </button>
      )}
    </div>
  );
}
