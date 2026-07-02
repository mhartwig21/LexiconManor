import { useGameStore } from '../app/store';
import { MindPoints } from './MindPoints';

/** Shared header for map + game screens: level, score, mind points. */
export function RunHeader({ title }: { title: string }) {
  const run = useGameStore((s) => s.save.activeRun);
  if (!run) return null;
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        marginBottom: '1rem',
      }}
    >
      <div>
        <h3 style={{ fontSize: 'var(--text-base)' }}>{title}</h3>
        <div style={{ fontSize: 'var(--text-xs)', opacity: 0.75 }}>
          Level {run.level} · {run.totalScore.toLocaleString()} pts
        </div>
      </div>
      <MindPoints current={run.mindPoints} max={run.maxMindPoints} />
    </header>
  );
}
