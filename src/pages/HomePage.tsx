import { useLocation } from 'wouter';
import { useManorStore } from '../app/store';

/** Phase-0 placeholder — the Entrance Hall morning scene lands with A2/A6. */
export default function HomePage() {
  const [, navigate] = useLocation();
  const profileName = useManorStore((s) => s.profileName);

  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: '14vh' }}>
      <h1>Lexicon Manor</h1>
      <p style={{ opacity: 0.85 }}>
        Welcome back, {profileName}. The manor is being rebuilt, room by room.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}>
        <button className="btn btn--primary" onClick={() => navigate('/manor')}>Enter the manor</button>
        <button className="btn" onClick={() => navigate('/journal')}>Journal</button>
        <button className="btn" onClick={() => navigate('/chronicles')}>Chronicles</button>
        <button className="btn" onClick={() => navigate('/sanctum')}>The Sanctum</button>
      </div>
    </div>
  );
}
