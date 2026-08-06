import { useLocation } from 'wouter';
import { useGameStore } from '../app/store';
import { ACHIEVEMENTS, PERKS } from '../engine/effects';
import { PERK_SLOTS } from '../engine/types';

/** Sanctum: perk loadout (applies to the next run) + achievements gallery. */
export default function SanctumPage() {
  const [, navigate] = useLocation();
  const save = useGameStore((s) => s.save);
  const setPerkLoadout = useGameStore((s) => s.setPerkLoadout);

  const togglePerk = (id: string) => {
    const equipped = save.activePerkLoadout.includes(id);
    if (equipped) setPerkLoadout(save.activePerkLoadout.filter((p) => p !== id));
    else if (save.activePerkLoadout.length < PERK_SLOTS) setPerkLoadout([...save.activePerkLoadout, id]);
  };

  return (
    <div className="bg-level bg-level--1">
      <div className="page">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>Sanctum</h2>
          <button className="btn" style={{ minHeight: 36, padding: '0.3rem 0.9rem' }} onClick={() => navigate('/')}>
            Home
          </button>
        </header>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '0.2rem' }}>Perks</h3>
          <p style={{ fontSize: 'var(--text-sm)', opacity: 0.75, marginTop: 0 }}>
            Equip up to {PERK_SLOTS}. Changes take hold when your next journey begins.
            {save.activeRun && <em> (a journey is underway — its perks are already sealed)</em>}
          </p>
          {PERKS.map((perk) => {
            const unlocked = save.unlockedPerkIds.includes(perk.id);
            const equipped = save.activePerkLoadout.includes(perk.id);
            const unlockedBy = ACHIEVEMENTS.find((a) => a.id === perk.unlockedBy);
            return (
              <div key={perk.id} className={`perk-row${unlocked ? '' : ' perk-row--locked'}`}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', color: equipped ? 'var(--golden-bright)' : 'var(--golden)' }}>
                    {perk.name} <span className={`rarity-tag rarity-tag--${perk.rarity}`}>{perk.rarity}</span>
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', opacity: 0.8 }}>
                    {unlocked ? perk.description : `Sealed — ${unlockedBy?.description ?? 'unknown deed'}`}
                  </div>
                </div>
                <button
                  className={`btn${equipped ? ' btn--primary' : ''}`}
                  style={{ minHeight: 38, padding: '0.3rem 1rem', flexShrink: 0 }}
                  disabled={!unlocked || (!equipped && save.activePerkLoadout.length >= PERK_SLOTS)}
                  onClick={() => togglePerk(perk.id)}
                >
                  {equipped ? 'Equipped' : unlocked ? 'Equip' : '🔒'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '0.6rem' }}>Deeds</h3>
          {ACHIEVEMENTS.map((a) => {
            const earned = save.earnedAchievementIds.includes(a.id);
            return (
              <div key={a.id} className={`perk-row${earned ? '' : ' perk-row--locked'}`}>
                <span style={{ fontSize: '1.3rem', width: '2rem', textAlign: 'center' }}>{earned ? '✦' : '·'}</span>
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', color: earned ? 'var(--golden)' : undefined }}>{a.name}</div>
                  <div style={{ fontSize: 'var(--text-sm)', opacity: 0.8 }}>{a.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
