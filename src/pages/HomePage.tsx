import { useLocation } from 'wouter';
import { useGameStore } from '../app/store';

export default function HomePage() {
  const [, navigate] = useLocation();
  const save = useGameStore((s) => s.save);
  const startNewRun = useGameStore((s) => s.startNewRun);
  const run = save.activeRun;

  return (
    <div className="bg-level bg-level--1">
      <div className="page" style={{ textAlign: 'center', paddingTop: '10vh' }}>
        <h1 className="rise-fade">Lexicon Loop</h1>
        <p style={{ opacity: 0.8, marginBottom: '2.5rem' }}>A word-puzzle journey through the astral realms</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', maxWidth: 340, margin: '0 auto' }}>
          {run && run.status === 'active' && (
            <button className="btn btn--primary" onClick={() => navigate('/map')}>
              Continue Journey — Level {run.level}
            </button>
          )}
          <button
            className={`btn${run ? '' : ' btn--primary'}`}
            onClick={() => {
              if (run && run.status === 'active' && !confirm('Abandon your current journey and begin anew?')) return;
              startNewRun();
              navigate('/map');
            }}
          >
            New Adventure
          </button>
          <button className="btn" onClick={() => navigate('/chronicles')}>
            Chronicles
          </button>
          <button className="btn" onClick={() => navigate('/sanctum')}>
            Sanctum
          </button>
        </div>

        {save.runHistory.length > 0 && (
          <p style={{ marginTop: '2.5rem', fontSize: 'var(--text-sm)', opacity: 0.65 }}>
            {save.runHistory.length} past journey{save.runHistory.length === 1 ? '' : 's'} ·{' '}
            {save.runHistory.filter((r) => r.outcome === 'victory').length} victorious
          </p>
        )}
      </div>
    </div>
  );
}
