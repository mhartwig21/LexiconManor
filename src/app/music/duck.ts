/**
 * app/music/duck.ts — explicit refcounted gain ducking. OWNER: A8.
 *
 * No compressor sidechain exists in Web Audio, so ducking is a gain we drive
 * ourselves (AAA 8.5): SFX −5 dB fast-attack/slow-release; dialogue −6 dB
 * held; fanfares −9 dB. Refcounted so rapid letter taps hold the duck open
 * without pumping. The music *density* parameter also reads the duck state
 * (director.ts thins note probability while ducked).
 */

import { currentContext } from './context';
import { buildAudioGraph, dbToGain } from './graph';

export type DuckTag = 'sfx' | 'dialogue' | 'fanfare';

const DUCK_DB: Record<DuckTag, number> = { sfx: -5, dialogue: -6, fanfare: -9 };
const ATTACK_TAU = 0.015;   // ≤50ms attack
const RELEASE_TAU = 0.22;   // ≥500ms perceived release

const counts: Record<DuckTag, number> = { sfx: 0, dialogue: 0, fanfare: 0 };
const timers: Partial<Record<DuckTag, ReturnType<typeof setTimeout>>> = {};

function apply(): void {
  const ctx = currentContext();
  if (!ctx) return;
  const graph = buildAudioGraph(ctx);
  let db = 0;
  for (const tag of Object.keys(counts) as DuckTag[]) {
    if (counts[tag] > 0) db = Math.min(db, DUCK_DB[tag]);
  }
  const target = dbToGain(db);
  const now = ctx.currentTime;
  const attacking = target < graph.duckGain.gain.value;
  graph.duckGain.gain.setTargetAtTime(target, now, attacking ? ATTACK_TAU : RELEASE_TAU);
}

/** Hold a duck open (pair with release()). */
export function duck(tag: DuckTag): void {
  counts[tag] += 1;
  apply();
}

export function release(tag: DuckTag): void {
  counts[tag] = Math.max(0, counts[tag] - 1);
  apply();
}

/**
 * One-shot duck for fire-and-forget cues. Repeated calls extend the hold
 * (refcount stays at ≥1 until the trailing timer expires — no pumping).
 */
export function duckFor(tag: DuckTag, holdMs: number): void {
  const existing = timers[tag];
  if (existing !== undefined) {
    clearTimeout(existing);
  } else {
    counts[tag] += 1;
    apply();
  }
  timers[tag] = setTimeout(() => {
    delete timers[tag];
    release(tag);
  }, holdMs);
}

/** 1 when open; <1 while ducked — director thins note density with this. */
export function densityFactor(): number {
  for (const tag of Object.keys(counts) as DuckTag[]) {
    if (counts[tag] > 0) return 0.5;
  }
  return 1;
}
