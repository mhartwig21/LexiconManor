import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useGameStore } from '../app/store';
import { sfx } from '../app/sound';
import { WordWebGame } from '../modes/WordWebGame';
import { HiveGame } from '../modes/HiveGame';
import { TwistleGame } from '../modes/TwistleGame';
import { ForgottenWordGame } from '../modes/ForgottenWordGame';

/** Resolves the current node to its mode component. */
export default function PlayPage() {
  const [, navigate] = useLocation();
  const run = useGameStore((s) => s.save.activeRun);
  const lastOutcome = useGameStore((s) => s.lastOutcome);
  const currentMap = useGameStore((s) => s.currentMap);

  const node = run?.currentNodeId ? currentMap()?.nodes.find((n) => n.id === run.currentNodeId) : undefined;
  // Run ended mid-puzzle (mind points hit zero) -> defeat screen.
  const showDefeat = !run && !!lastOutcome && !lastOutcome.won;

  useEffect(() => {
    if (!showDefeat && !node) navigate(run ? '/map' : '/');
  }, [showDefeat, node, run, navigate]);

  if (showDefeat) return <DefeatScreen />;
  if (!run || !node) return null;

  switch (node.mode) {
    case 'hive':
      return <HiveGame node={node} run={run} />;
    case 'twistle':
      return <TwistleGame node={node} run={run} />;
    case 'forgotten-word':
      return <ForgottenWordGame node={node} run={run} />;
    default:
      return <WordWebGame node={node} run={run} />;
  }
}

function DefeatScreen() {
  const [, navigate] = useLocation();
  const clearOutcome = useGameStore((s) => s.clearOutcome);
  useEffect(() => sfx.defeat(), []);
  return (
    <div className="bg-level bg-level--3">
      <div className="page" style={{ textAlign: 'center', paddingTop: '18vh' }}>
        <div className="modal card pop-in" style={{ margin: '0 auto' }}>
          <h2 style={{ color: 'var(--danger)' }}>Your mind fades…</h2>
          <p style={{ opacity: 0.85 }}>
            The loop claims another wanderer. Your journey is recorded in the chronicles.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1rem' }}>
            <button
              className="btn btn--primary"
              onClick={() => {
                clearOutcome();
                navigate('/');
              }}
            >
              Return home
            </button>
            <button
              className="btn"
              onClick={() => {
                clearOutcome();
                navigate('/chronicles');
              }}
            >
              Chronicles
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
