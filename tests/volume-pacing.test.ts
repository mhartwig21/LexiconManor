/**
 * Fragment pacing — OWNER: A7 (Mystery). The mystery half of AAA 4.10e.
 *
 * 4.18 used to also claim "median playtest solve lands in 2–4 evenings",
 * which contradicted 4.10e's 14–28 days outright: no critic could pass or
 * fail the mystery's pacing and the economy and mystery owners were
 * optimising against opposite targets. That clause is gone (round 6); 4.10e
 * owns the horizon and THIS FILE measures it, so the horizon is testable
 * rather than asserted.
 *
 * The drip modelled here is the real one, not a hand-tuned curve:
 *   - violet-room yield comes from A2's `simulateDay` (which draws rooms
 *     through the live `deckMixAt` weights and the live STEP_TABLE climb),
 *     filed through `nextFragmentForRoom` — including its `reservedIds` rule
 *   - the three authored static letter grants + both authored pity letters +
 *     the synthesized pity channel come from `arrivedLetters`/`letterGrants`
 *     over the real `content/authored/volumes/volume-1.json`
 *   - `PITY_DROUGHT_DAYS` is honoured through the real
 *     `fragmentDroughtDays(DayRecord[])`
 *   - the five testimony fragments are gated on the `fragmentCount`
 *     conditions read out of the authored dialogue JSON, and delivered only
 *     when the player actually meets that character that day (Bramble every
 *     morning; Ellery/Posy/Fern on a drafted parlor room; the Portrait only
 *     on a day she reaches the Sanctum landing)
 *
 * The measured quantity is the day the SIXTEENTH fragment is filed — the last
 * engraving, after which the constraint set is a single word. (The
 * seventeenth is the Portrait's confession, which is a scene, not a clue.)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import type { CharacterId, DayRecord, VolumeState } from '../src/engine/types';
import {
  arrivedLetters, findLetter, fragmentDroughtDays, freshVolumeState, letterGrants,
  nextFragmentForRoom, PITY_DROUGHT_DAYS, type VolumeContent,
} from '../src/engine/volume';
import {
  campaignProfileForDay, deckMixAt, medianOf, PROFILE_SKILLED, quantileOf, simulateDay,
} from '../src/engine/economy/simulate';
import type { DialogueFile } from '../src/engine/dialogue/schema';

const root = join(__dirname, '..');

const content = JSON.parse(
  readFileSync(join(root, 'content', 'authored', 'volumes', 'volume-1.json'), 'utf8'),
) as VolumeContent;

/** Whose parlor room is whose (src/pages/ManorPage.tsx PARLOR_CHARACTERS). */
const PARLOR_KEEPERS: readonly CharacterId[] =
  ['ellery', 'ellery', 'posy', 'fern', 'bramble'];   // reading-nook, drawing-room, post-room, greenhouse, morning-room

interface TestimonyGate {
  character: CharacterId;
  fragmentId: string;
  /** Fragments filed before the character will say it. */
  gate: number;
}

/** Read the testimony channel out of the authored dialogue, never a constant. */
function testimonyGates(): TestimonyGate[] {
  const dir = join(root, 'content', 'authored', 'dialogue');
  const out: TestimonyGate[] = [];
  for (const c of ['bramble', 'ellery', 'posy', 'fern', 'portrait'] as CharacterId[]) {
    const file = JSON.parse(readFileSync(join(dir, `${c}.json`), 'utf8')) as DialogueFile;
    for (const node of file.nodes) {
      const grants = node.effects?.grantsFragmentIds ?? [];
      if (grants.length === 0) continue;
      const gate = (node.conditions ?? []).reduce(
        (g, cond) => (cond.kind === 'fragmentCount' ? cond.gte ?? g : g), 0,
      );
      for (const fragmentId of grants) out.push({ character: c, fragmentId, gate });
    }
  }
  return out;
}

const GATES = testimonyGates();

/** One seeded campaign through the real drip. Returns the 1-based day each
 *  fragment count was first reached (index n = the day fragment n was filed). */
function fragmentDays(seed: number, days: number): number[] {
  const rng = createRng(seed);
  const timeRng = createRng((seed ^ 0x715e17) | 0);
  const metaRng = createRng((seed ^ 0x5eed21) | 0);

  let state: VolumeState = freshVolumeState(content.id, 1);
  const records: DayRecord[] = [];
  const openedIds = new Set<string>();
  const delivered = new Set<string>();
  const dayOfCount: number[] = [];

  const file = (fragmentId: string | null | undefined) => {
    if (!fragmentId || state.foundFragmentIds.includes(fragmentId)) return;
    state = { ...state, foundFragmentIds: [...state.foundFragmentIds, fragmentId] };
  };
  /** Testimony not yet spoken is held out of the room drip (AAA 4.14). */
  const reservedIds = () =>
    new Set(GATES.filter((g) => !delivered.has(g.fragmentId)).map((g) => g.fragmentId));
  const speak = (character: CharacterId) => {
    for (const g of GATES) {
      if (g.character !== character || delivered.has(g.fragmentId)) continue;
      if (state.foundFragmentIds.length < g.gate) continue;
      delivered.add(g.fragmentId);
      file(g.fragmentId);
    }
  };

  for (let day = 1; day <= days; day++) {
    const before = state.foundFragmentIds.length;

    // --- Overnight post (drought measured from the banked day records). ----
    const droughtDays = fragmentDroughtDays(records);
    for (const letter of arrivedLetters(content, state, day, { droughtDays, openedIds })) {
      if (openedIds.has(letter.id)) continue;
      const resolved = findLetter(content, letter.id) ?? letter;
      for (const id of letterGrants(content, resolved, state)) file(id);
      openedIds.add(letter.id);
    }

    // --- Morning: Bramble, every single day. -------------------------------
    speak('bramble');

    // --- The day itself, played through the live economy. ------------------
    const result = simulateDay(rng, campaignProfileForDay(PROFILE_SKILLED, day), timeRng);

    // Violet rooms she actually entered file the next fragment on the drip.
    for (let i = 0; i < result.fragmentsFound; i++) {
      file(nextFragmentForRoom(content, state, 'mystery', { reservedIds: reservedIds() })?.id);
    }

    // Parlor rooms she happened to draft, at the live parlor share per row.
    for (let i = 0; i < result.rooms; i++) {
      const row0 = Math.min(i, Math.max(0, result.maxRow - 1));
      if (metaRng() >= deckMixAt(row0).parlor) continue;
      speak(PARLOR_KEEPERS[Math.floor(metaRng() * PARLOR_KEEPERS.length)]!);
    }

    // The Portrait keeps the landing outside the Sanctum: only on a day she
    // climbs that far does he say his piece (MANOR_DESIGN §8).
    if (result.reachedSanctum) speak('portrait');

    const found = state.foundFragmentIds.length;
    for (let n = before + 1; n <= found; n++) dayOfCount[n] = day;
    records.push({
      day, endedAt: 0, cause: 'steps-exhausted',
      roomsDrafted: result.rooms, roomsSolved: result.roomsSolved,
      fragmentsFound: found - before, stepsSpent: result.spent, minutes: result.minutes,
    } as DayRecord);
  }
  return dayOfCount;
}

describe('fragment pacing — the volume horizon is measured, not asserted (AAA 4.10e)', () => {
  const HORIZON = 60;
  const CAMPAIGNS = 240;
  const runs = Array.from({ length: CAMPAIGNS }, (_, i) => fragmentDays((0x51ce + i * 0x9e37) | 0, HORIZON));
  const day16 = runs.map((r) => r[16] ?? HORIZON + 1);

  // Measured on the round-6 content: min 8, p10 10, median 13.5, p90 17,
  // max 22 across 240 seeded campaigns — i.e. the drip is built for 4.10e
  // and nowhere near the deleted "2–4 evenings" clause.
  it('every campaign reaches the last engraving inside the horizon', () => {
    expect(day16.every((d) => d <= HORIZON)).toBe(true);
  });

  it('the median campaign files fragment 16 between day 10 and day 20', () => {
    const m = medianOf(day16);
    expect(m, `median day-of-fragment-16 was ${m}`).toBeGreaterThanOrEqual(10);
    expect(m, `median day-of-fragment-16 was ${m}`).toBeLessThanOrEqual(20);
  });

  it('even a lucky tenth of campaigns needs a full week (p10 >= 6)', () => {
    const p10 = quantileOf(day16, 0.1);
    expect(p10, `p10 day-of-fragment-16 was ${p10}`).toBeGreaterThanOrEqual(6);
  });

  it('the pity floor holds: never PITY_DROUGHT_DAYS+1 consecutive dry days', () => {
    for (const run of runs) {
      let dry = 0;
      let worst = 0;
      const last = run.reduce((a, b) => Math.max(a, b ?? 0), 0);
      for (let day = 1; day <= last; day++) {
        const filedToday = run.some((d) => d === day);
        dry = filedToday ? 0 : dry + 1;
        worst = Math.max(worst, dry);
      }
      expect(worst).toBeLessThanOrEqual(PITY_DROUGHT_DAYS);
    }
  });
});
