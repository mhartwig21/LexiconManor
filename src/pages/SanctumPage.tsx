import { useLocation } from 'wouter';
import { useManorStore } from '../app/store';

/**
 * Phase-0 placeholder — OWNER: A7 (Mystery). Replace with ui/sanctum/*:
 * the Portrait scene + the daily typed guess (one per day, sympathetic
 * closeness-keyed reactions, AAA 4.17). This route REPLACES the v1
 * perk-loadout Sanctum page (parked in legacy/, pending AAA §10.1).
 */
export default function SanctumPage() {
  const [, navigate] = useLocation();
  const guessesToday = useManorStore(
    (s) => s.volume.guesses.filter((g) => g.day === (s.day?.day ?? s.volume.day)).length,
  );
  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: '18vh' }}>
      <h2>The Sanctum</h2>
      <p style={{ opacity: 0.85 }}>
        The sealed door waits at the top of the manor.
        {guessesToday > 0 ? ' The Portrait has heard your guess for today.' : ''}
      </p>
      <button className="btn" onClick={() => navigate('/')}>Back down the stairs</button>
    </div>
  );
}
