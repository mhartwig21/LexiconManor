import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useGameStore } from '../app/store';
import { glyphById, perkById, ACHIEVEMENTS } from '../engine/effects';
import { sfx } from '../app/sound';

/** Animated 0 -> value count-up. */
function useCountUp(target: number, ms = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - k, 3)))); // ease-out cubic
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

const SPARKLES = [
  { top: '-8px', left: '12%', delay: '0s' },
  { top: '-14px', left: '78%', delay: '0.25s' },
  { top: '30%', left: '-10px', delay: '0.5s' },
  { top: '20%', left: 'calc(100% - 4px)', delay: '0.7s' },
  { top: 'calc(100% - 6px)', left: '30%', delay: '0.4s' },
];

/**
 * Post-node reward modal, shown on the map after a victory.
 * Run-victory celebration also lands here (map redirects home after).
 */
export function OutcomeModal() {
  const [, navigate] = useLocation();
  const outcome = useGameStore((s) => s.lastOutcome);
  const clearOutcome = useGameStore((s) => s.clearOutcome);
  const shown = outcome !== null && outcome.won;
  const score = useCountUp(shown ? outcome.score : 0);

  useEffect(() => {
    if (!shown) return;
    if (outcome.runWon || outcome.leveledUp) sfx.levelUp();
    else sfx.victory();
    if (outcome.glyphEarned) setTimeout(() => sfx.glyph(), 700);
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;

  const glyph = outcome.glyphEarned ? glyphById(outcome.glyphEarned) : null;

  return (
    <div className="modal-backdrop" onClick={clearOutcome}>
      <div className="modal card pop-in" style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        {SPARKLES.map((s, i) => (
          <span key={i} className="sparkle" style={{ top: s.top, left: s.left, animationDelay: s.delay }}>
            ✦
          </span>
        ))}
        <h2 style={{ color: 'var(--success)' }}>{outcome.runWon ? 'The Loop is Closed!' : 'Victory'}</h2>
        <p style={{ fontSize: 'var(--text-xl)', margin: '0.5rem 0', fontFamily: 'var(--font-heading)', color: 'var(--golden-bright)' }}>
          +{score.toLocaleString()}
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
