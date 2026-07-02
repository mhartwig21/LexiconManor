import { useLocation } from 'wouter';
import { useGameStore } from '../app/store';
import { computeChronicleStats } from '../engine/stats';

const MODE_LABEL: Record<string, string> = {
  'word-web': 'Word Web',
  hive: 'Hive Builder',
  twistle: 'Twistle',
  'forgotten-word': 'Forgotten Word',
};

export default function ChroniclesPage() {
  const [, navigate] = useLocation();
  const history = useGameStore((s) => s.save.runHistory);
  const stats = computeChronicleStats(history);

  return (
    <div className="bg-level bg-level--1">
      <div className="page">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>Chronicles</h2>
          <button className="btn" style={{ minHeight: 36, padding: '0.3rem 0.9rem' }} onClick={() => navigate('/')}>
            Home
          </button>
        </header>

        <div className="card rise-fade" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.8rem', textAlign: 'center' }}>
            <Stat label="Journeys" value={stats.totalRuns} />
            <Stat label="Victories" value={stats.victories} />
            <Stat label="Best score" value={stats.bestRunScore.toLocaleString()} />
            <Stat label="Nodes cleared" value={stats.totalNodesCompleted} />
            <Stat label="Bosses felled" value={stats.totalBossesDefeated} />
            <Stat label="Best streak" value={stats.bestStreak} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '0.6rem' }}>By trial</h3>
          {Object.entries(stats.byMode)
            .filter(([, s]) => s.played > 0)
            .map(([mode, s]) => (
              <div key={mode} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', fontSize: 'var(--text-sm)' }}>
                <span>{MODE_LABEL[mode]}</span>
                <span style={{ opacity: 0.8 }}>
                  {s.won}/{s.played} won · best {s.bestScore.toLocaleString()} · {s.perfectClears} perfect
                </span>
              </div>
            ))}
          {Object.values(stats.byMode).every((s) => s.played === 0) && (
            <p style={{ opacity: 0.7, fontSize: 'var(--text-sm)' }}>No trials faced yet.</p>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '0.6rem' }}>Past journeys</h3>
          {history.length === 0 && <p style={{ opacity: 0.7, fontSize: 'var(--text-sm)' }}>Your story is unwritten.</p>}
          {[...history].reverse().map((run) => (
            <div key={run.runId} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', fontSize: 'var(--text-sm)', borderBottom: '1px solid rgba(217,179,66,0.12)' }}>
              <span>
                {run.outcome === 'victory' ? '★' : run.outcome === 'defeat' ? '✝' : '…'} Level {run.levelReached} ·{' '}
                {run.nodesCompleted} nodes
              </span>
              <span style={{ opacity: 0.8 }}>
                {run.totalScore.toLocaleString()} pts · {new Date(run.endedAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', color: 'var(--golden)' }}>{value}</div>
      <div style={{ fontSize: 'var(--text-xs)', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
    </div>
  );
}
