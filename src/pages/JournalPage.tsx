import { useLocation } from 'wouter';
import { useManorStore } from '../app/store';

/**
 * Phase-0 placeholder — OWNER: A7 (Mystery). Replace with ui/journal/* tabs:
 * fragments, characters, letters, floorplan cabinet. Any seen document
 * re-readable in <=2 taps from anywhere (AAA 4.15).
 */
export default function JournalPage() {
  const [, navigate] = useLocation();
  const found = useManorStore((s) => s.volume.foundFragmentIds.length);
  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: '18vh' }}>
      <h2>The Journal</h2>
      <p style={{ opacity: 0.85 }}>
        {found === 0
          ? 'Its pages are blank, for now.'
          : `${found} fragment${found === 1 ? '' : 's'} filed so far.`}
      </p>
      <button className="btn" onClick={() => navigate('/')}>Back</button>
    </div>
  );
}
