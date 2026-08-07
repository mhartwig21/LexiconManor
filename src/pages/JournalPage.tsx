import { usePageNavBand } from '../app/platform/page-nav';
import JournalView from '../ui/journal/JournalView';

/**
 * /journal — OWNER: A7 (Mystery). The auto-filing cozy-detective journal:
 * the definition poem with gaps, the alphabet plate, engravings, testimony,
 * and the overnight letters. Any seen document re-readable in ≤2 taps from
 * anywhere (AAA 4.15).
 *
 * ROUND 11 (AAA 11.2/11.19). This route is the one surface in the app with a
 * SECOND navigation band — the ribbon tabs — below the back row, and the fixed
 * moment layer, which clears the bar and the back row, sat on top of it: all
 * four tabs hit-tested to `.mom`, and the seal being tappable meant a reach for
 * "Testimony" dismissed the notice instead. The route publishes the ribbon's
 * measured floor (`--page-nav-floor`) for as long as it is mounted; the moment
 * layer takes the larger of its own clearance and that. Published from the PAGE
 * rather than from a pixel written into moment.css, so retuning the journal's
 * head cannot silently bury the tabs again (11.4).
 */
export default function JournalPage() {
  usePageNavBand('.jrn-tabs');
  return <JournalView />;
}
