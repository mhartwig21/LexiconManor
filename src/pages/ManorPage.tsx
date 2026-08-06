import { useLocation } from 'wouter';

/**
 * Phase-0 placeholder — OWNER: A1 (Manor). Replace with the parchment
 * blueprint grid (ui/blueprint/*): 5×7 cells, player token, DraftModal.
 */
export default function ManorPage() {
  const [, navigate] = useLocation();
  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: '18vh' }}>
      <h2>The Blueprint</h2>
      <p style={{ opacity: 0.85 }}>The drafting table is on its way up the drive.</p>
      <button className="btn" onClick={() => navigate('/')}>Back</button>
    </div>
  );
}
