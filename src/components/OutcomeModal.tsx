import { useLocation } from 'wouter';
import { useGameStore } from '../app/store';
import { glyphById, perkById, ACHIEVEMENTS } from '../engine/effects';

/**
 * Post-node reward modal, shown on the map after a victory.
 * Run-victory celebration also lands here (map redirects home after).
 */
export function OutcomeModal() {
  const [, navigate] = useLocation();
  const outcome = useGameStore((s) => s.lastOutcome);
  const clearOutcome = useGameStore((s) => s.clearOutcome);
  if (!outcome || !outcome.won) return null;

  const glyph = outcome.glyphEarned ? glyphById(outcome.glyphEarned) : null;

  return (
    <div className="modal-backdrop" onClick={clearOutcome}>
      <div className="modal card pop-in" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ color: 'var(--success)' }}>{outcome.runWon ? 'The Loop is Closed!' : 'Victory'}</h2>
        <p style={{ fontSize: 'var(--text-lg)', margin: '0.5rem 0' }}>
          +{outcome.score.toLocaleString()} points
        </p>

        {glyph && (
          <p className="rise-fade" style={{ margin: '0.4rem 0' }}>
            <span style={{ color: 'var(--golden-bright)' }}>{glyph.name}</span>
            <br />
            <span style={{ fontSize: 'var(--text-sm)', opacity: 0.8 }}>{glyph.description}</span>
          </p>
        )}

        {outcome.achievementsEarned.map((id) => {
          const a = ACHIEVEMENTS.find((a) => a.id === id);
          return a ? (
            <p key={id} className="rise-fade" style={{ margin: '0.4rem 0', color: 'var(--info)' }}>
              ✦ Achievement: {a.name}
            </p>
          ) : null;
        })}
        {outcome.perksUnlocked.map((id) => (
          <p key={id} className="rise-fade" style={{ margin: '0.4rem 0', color: 'var(--tier-purple)' }}>
            ❖ Perk unlocked: {perkById(id).name}
          </p>
        ))}

        {outcome.leveledUp && (
          <p style={{ margin: '0.6rem 0', color: 'var(--golden-bright)' }}>
            The boss falls — a deeper realm opens. +2 mind points.
          </p>
        )}

        <button
          className="btn btn--primary"
          style={{ marginTop: '0.8rem' }}
          onClick={() => {
            clearOutcome();
            if (outcome.runWon) navigate('/');
          }}
        >
          {outcome.runWon ? 'Bask in glory' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
