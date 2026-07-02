import { useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import { useGameStore } from '../app/store';
import { nodeSeed, selectHive } from '../app/content';
import { scoreHive } from '../engine/scoring';
import type { MapNode } from '../engine/map';
import type { RunState } from '../engine/types';
import { RunHeader } from '../components/RunHeader';
import { HiveCore } from './HiveCore';

export function HiveGame({ node, run }: { node: MapNode; run: RunState }) {
  const [, navigate] = useLocation();
  const save = useGameStore((s) => s.save);
  const finishNode = useGameStore((s) => s.finishNode);
  const failNode = useGameStore((s) => s.failNode);
  const markPuzzleSeen = useGameStore((s) => s.markPuzzleSeen);
  const spendMindPoint = useGameStore((s) => s.spendMindPoint);
  const leaveNode = useGameStore((s) => s.leaveNode);
  const startedAt = useRef(Date.now());

  const puzzle = useMemo(() => {
    const p = selectHive({
      level: run.level,
      seenIds: save.seenPuzzleIds.hive,
      seed: nodeSeed(run.seed, node.id),
    });
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.runId, node.id]);

  // Iron Focus perk / Momentum glyph: entropy cannot rise.
  const entropyImmune =
    (save.activePerkLoadout.includes('iron-focus') && save.unlockedPerkIds.includes('iron-focus')) ||
    run.entropyImmunityCharges > 0;

  return (
    <div className={`bg-level bg-level--${Math.min(run.level, 3)}`}>
      <div className="page">
        <RunHeader title="Hive Builder" />
        <p style={{ fontSize: 'var(--text-sm)', opacity: 0.8, marginTop: 0 }}>
          Build words from the hive — every word must use <strong style={{ color: 'var(--golden-bright)' }}>{puzzle.center}</strong>.
          False words feed the entropy; faded letters can be restored for a mind point.
        </p>

        <HiveCore
          puzzle={puzzle}
          seed={nodeSeed(run.seed, node.id + '-fade')}
          entropyImmune={entropyImmune}
          onRestoreLetter={spendMindPoint}
          onFinish={({ won, state, wordScores }) => {
            markPuzzleSeen('hive', puzzle.id);
            if (won) {
              finishNode({
                mode: 'hive',
                puzzleId: puzzle.id,
                baseScore: scoreHive({ wordScores, entropy: state.entropy }),
                wrongAttempts: state.entropy,
                durationMs: Date.now() - startedAt.current,
              });
            } else {
              failNode(); // entropy consumed the hive
              // Defeat? Stay on /play — the defeat screen renders there.
              if (!useGameStore.getState().save.activeRun) return;
            }
            navigate('/map');
          }}
        />

        <div style={{ textAlign: 'center', marginTop: '0.8rem' }}>
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
