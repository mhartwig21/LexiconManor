/**
 * NoticeRail — OWNER: A2 (Economy/Day).
 *
 * The chrome's line of glass, just under the day bar. It exists because of two
 * round-6 escapes of the §0.5 shape:
 *
 *   1. The utility rooms' authored payout copy (engine/manor/deck.ts
 *      `UTILITY_EFFECTS[*].toast`) had NO render site anywhere in the app.
 *      Gems and keys landed in the bar in silence (AAA 11.18).
 *   2. An affinity rank-up recorded its event and left the celebration to an
 *      authored node the one-conversation-per-day valve pushes to tomorrow —
 *      nothing happened at the instant (AAA 5.7 / 11.11).
 *
 * Two structural rules, both learned from the fragment-notice escape:
 *
 *   - It reads the AUDITED EVENT SPINE, never a call site. A notice tied to
 *     the component that applied the effect is a notice that fires while the
 *     player is somewhere else (AAA 11.10/11.11). GameChrome never unmounts,
 *     so "somewhere else" does not exist for this rail.
 *   - It sits ABOVE the full-screen overlays (dialogue, draft) AND above the
 *     day bar itself, on the `notice` rung of the published layering scale
 *     (src/ui/chrome/layers.ts — it was a bare 45, chosen to beat an overlay
 *     band that was also 40), and is `pointer-events: none` end to end, so it
 *     can be seen through a modal without ever being tappable through one
 *     (AAA 11.5).
 *
 * Class discipline (AAA 11.14): these are rewards, so they are set as a raised
 * card with a named eyebrow and a colored rule — nothing here shares a rule
 * with the cat's purr or any other flavour line. Campaign-class grants
 * (fragments, letters, volumes) are NOT this rail's business; they belong to
 * the moment layer, which owes them a persistent trace as well (AAA 11.12).
 */

import { useEffect, useRef, useState } from 'react';
import { useManorStore } from '../../app/store';
import { payoutNoticeFor } from '../../engine/manor/deck';

interface Notice {
  id: number;
  eyebrow: string;
  line: string;
  tone: 'payout' | 'warm';
}

/** Long enough to read two short lines at a glance; well under a celebration. */
const NOTICE_MS = 3400;
/** Never stack more than this — the bar is an instrument, not a feed. */
const MAX_ON_GLASS = 2;

export default function NoticeRail() {
  const events = useManorStore((s) => s.recentEvents);
  const [notices, setNotices] = useState<Notice[]>([]);
  // High-water mark: on mount (and on a reload) the stream's history is
  // already-lived, never replayed. The dusk prune shrinks it — that is a
  // reset, not a rewind.
  const seen = useRef(events.length);
  const nextId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (events.length < seen.current) {
      seen.current = events.length;
      return;
    }
    if (events.length === seen.current) return;
    const fresh = events.slice(seen.current);
    seen.current = events.length;

    const made: Notice[] = [];
    for (const record of fresh) {
      const event = record.event;
      if (event.type === 'room-drafted') {
        // The green rooms' authored payout line, finally on glass.
        const payout = payoutNoticeFor(event.cardId);
        if (payout) {
          made.push({
            id: nextId.current++, eyebrow: payout.title, line: payout.toast, tone: 'payout',
          });
        }
      }
      /* ROUND 9 — the `affinity-rank-up` branch that stood here is GONE, and
         deliberately so. The moment layer maps the same event to a campaign
         seal, so a single rank-up announced TWICE: their generic title at the
         top of the glass and this bespoke line lower down. The fix went the
         other way from the obvious one — the rail kept the good copy and the
         seal kept the generic title, so instead of deleting the duplicate
         render we moved `rankUpNotice` INTO ui/moment/moments.ts, where it is
         now the seal's quote. One event, one announcement, in the bespoke
         voice (AAA 5.7 / 11.11). See rank-up-lines.ts, which is still the one
         home of the copy and still lint-covered by tests/notice-copy.ts. */
    }
    if (made.length === 0) return;

    setNotices((n) => [...n, ...made].slice(-MAX_ON_GLASS));
    const ids = made.map((m) => m.id);
    timers.current.push(
      setTimeout(() => setNotices((n) => n.filter((x) => !ids.includes(x.id))), NOTICE_MS),
    );
  }, [events]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (notices.length === 0) return null;

  return (
    <div className="chr-notices" role="status" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`chr-notice chr-notice--${n.tone}`}>
          <span className="chr-notice__eyebrow">{n.eyebrow}</span>
          <span className="chr-notice__line">{n.line}</span>
        </div>
      ))}
    </div>
  );
}
