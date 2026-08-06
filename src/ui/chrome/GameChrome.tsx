/**
 * GameChrome — OWNER: A2 (Economy/Day).
 *
 * The one persistent frame composed over every route: DayHeader (day numeral,
 * step candle, gems/keys, retire) plus the lifecycle scenes (morning card,
 * dusk veil, night digest). Renders nothing until a day exists — the Home
 * page decides when to call startDay().
 *
 * Mount point: `<GameChrome />` after the route <Switch> in App.tsx
 * (architect-owned — see SHARED-FILE REQUESTS). The chrome is an overlay;
 * it owns no routing and never unmounts across navigation, so the candle
 * and its floats survive room entry/exit.
 */

import { useManorStore } from '../../app/store';
import DayHeader from './DayHeader';
import { DuskVeil, MorningCard, NightDigest } from './DayTransitions';
import './chrome.css';

export default function GameChrome() {
  const phase = useManorStore((s) => s.day?.phase ?? null);
  const reduced = useManorStore((s) => s.settings.reducedMotion);

  if (!phase) return null;

  return (
    <div className={reduced ? 'chr--reduced' : undefined}>
      <DayHeader />
      {phase === 'morning' ? <MorningCard /> : null}
      {phase === 'dusk' ? <DuskVeil /> : null}
      {phase === 'night' ? <NightDigest /> : null}
    </div>
  );
}
