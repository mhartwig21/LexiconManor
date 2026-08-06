import { useLocation } from 'wouter';
import { useManorStore } from '../app/store';

/**
 * Phase-0 placeholder — OWNER: A8 (Platform). Refresh with v2 day records +
 * the archived v1 run history (chronicles.runHistoryV1) + achievements; the
 * parked v1 perk-loadout UI (legacy/pages/SanctumPage.v1.tsx) lives here
 * until the glyph question (AAA §10.1) is decided.
 */
export default function ChroniclesPage() {
  const [, navigate] = useLocation();
  const days = useManorStore((s) => s.chronicles.dayRecords.length);
  const legacyRuns = useManorStore((s) => s.chronicles.runHistoryV1?.length ?? 0);
  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: '18vh' }}>
      <h2>Chronicles</h2>
      <p style={{ opacity: 0.85 }}>
        {days} day{days === 1 ? '' : 's'} recorded in the manor
        {legacyRuns > 0 ? `, ${legacyRuns} expedition${legacyRuns === 1 ? '' : 's'} archived from before` : ''}.
      </p>
      <button className="btn" onClick={() => navigate('/')}>Back</button>
    </div>
  );
}
