/**
 * ui/chrome — OWNER: A2 (Economy/Day). Public surface for other agents:
 * mount GameChrome once (App.tsx); StepMeter/DayHeader are exported for
 * reuse should a page ever need the candle inline.
 */

export { default as GameChrome } from './GameChrome';
export { default as DayHeader } from './DayHeader';
export { default as StepMeter } from './StepMeter';
export { MorningCard, DuskVeil, NightDigest } from './DayTransitions';
