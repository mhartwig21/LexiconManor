/** SCRATCH — measurement harness for the §5.1 routing pass. Deleted before hand-off. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import type { CharacterId, DayRecord, VolumeState } from '../src/engine/types';
import {
  arrivedLetters, findLetter, fragmentDroughtDays, fragmentForSolveChannel, freshVolumeState,
  letterGrants, LINTEL_CHANNEL, nextFragmentForRoom, STUDY_CHANNEL,
  type VolumeContent,
} from '../src/engine/volume';
import {
  campaignProfileForDay, deckMixAt, PROFILE_DECENT, PROFILE_SKILLED, simulateDay,
  type SimProfile,
} from '../src/engine/economy/simulate';
import { BASE_DECK } from '../src/engine/manor/deck';
import { categoryWeight, RARITY_WEIGHTS } from '../src/engine/manor/drafting';
import { rowTier } from '../src/engine/manor/grid';
import type { DialogueFile } from '../src/engine/dialogue/schema';

const root = join(__dirname, '..');
const content = JSON.parse(
  readFileSync(join(root, 'content', 'authored', 'volumes', 'volume-1.json'), 'utf8'),
) as VolumeContent;

const PARLOR_KEEPERS: readonly CharacterId[] =
  ['ellery', 'ellery', 'posy', 'fern', 'bramble'];

interface TestimonyGate { character: CharacterId; fragmentId: string; gate: number; }

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

function studyShareAt(row0: number): number {
  const tier = rowTier(row0);
  let study = 0; let puzzle = 0;
  for (const card of BASE_DECK) {
    if (card.category !== 'puzzle') continue;
    if (card.tierRange[0] > tier || tier > card.tierRange[1]) continue;
    const w = categoryWeight('puzzle', row0) * RARITY_WEIGHTS[tier][card.rarity];
    puzzle += w;
    if (card.puzzleKind === 'forgotten-word') study += w;
  }
  return puzzle > 0 ? study / puzzle : 0;
}

interface DayRow {
  day: number; filed: number; legible: number; unfoundAtDawn: number; heldSealed: number;
  solves: number; lintelLeft: number; studyLeft: number; testimonyLeft: number;
}

function run(profile: SimProfile, seed: number, days: number): DayRow[] {
  const rng = createRng(seed);
  const timeRng = createRng((seed ^ 0x715e17) | 0);
  const metaRng = createRng((seed ^ 0x5eed21) | 0);
  let state: VolumeState = freshVolumeState(content.id, 1);
  const records: DayRecord[] = [];
  const openedIds = new Set<string>();
  const delivered = new Set<string>();
  let sealedQueue: string[] = [];
  let legibleCount = 0;
  const legibleDaysSet = new Set<number>();
  const out: DayRow[] = [];

  const file = (fragmentId: string | null | undefined, opts?: { sealed?: boolean }) => {
    if (!fragmentId || state.foundFragmentIds.includes(fragmentId)) return;
    state = { ...state, foundFragmentIds: [...state.foundFragmentIds, fragmentId] };
    if (opts?.sealed) sealedQueue.push(fragmentId); else legibleCount += 1;
  };
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
    const legibleBefore = legibleCount;
    const unfoundAtDawn = content.fragments.length - before;
    const heldSealed = sealedQueue.length;

    const droughtDays = fragmentDroughtDays(records, { legibleDays: legibleDaysSet });
    for (const letter of arrivedLetters(content, state, day, { droughtDays, openedIds })) {
      if (openedIds.has(letter.id)) continue;
      const resolved = findLetter(content, letter.id) ?? letter;
      for (const id of letterGrants(content, resolved, state)) file(id);
      openedIds.add(letter.id);
    }
    speak('bramble');

    const result = simulateDay(rng, campaignProfileForDay(profile, day), timeRng, {
      sealedBacklog: sealedQueue.length,
    });

    for (let i = 0; i < result.fragmentsFound; i++) {
      file(nextFragmentForRoom(content, state, 'mystery', { reservedIds: reservedIds() })?.id, { sealed: true });
    }
    let lintelPaid = false; let studyPaid = false;
    for (let i = 0; i < result.roomsSolved; i++) {
      const row0 = Math.min(i, Math.max(0, result.maxRow - 1));
      const isStudy = metaRng() < studyShareAt(row0);
      if (isStudy && !studyPaid) {
        studyPaid = true;
        file(fragmentForSolveChannel(content, state, STUDY_CHANNEL, { reservedIds: reservedIds() })?.id);
      } else if (!isStudy && !lintelPaid) {
        lintelPaid = true;
        file(fragmentForSolveChannel(content, state, LINTEL_CHANNEL, { reservedIds: reservedIds() })?.id);
      }
    }
    for (let i = 0; i < result.rooms; i++) {
      const row0 = Math.min(i, Math.max(0, result.maxRow - 1));
      if (metaRng() >= deckMixAt(row0).parlor) continue;
      speak(PARLOR_KEEPERS[Math.floor(metaRng() * PARLOR_KEEPERS.length)]!);
    }
    if (result.reachedSanctum) speak('portrait');

    const madeOut = Math.min(result.pagesMadeOut, sealedQueue.length);
    if (madeOut > 0) { sealedQueue = sealedQueue.slice(madeOut); legibleCount += madeOut; }

    const found = state.foundFragmentIds.length;
    if (legibleCount > legibleBefore) legibleDaysSet.add(day);
    records.push({
      day, endedAt: 0, cause: 'steps-exhausted', roomsDrafted: result.rooms,
      roomsSolved: result.roomsSolved, fragmentsFound: found - before,
      stepsSpent: result.spent, minutes: result.minutes,
    } as DayRecord);
    const has = new Set(state.foundFragmentIds);
    out.push({
      day, filed: found - before, legible: legibleCount - legibleBefore, unfoundAtDawn, heldSealed,
      solves: result.roomsSolved,
      lintelLeft: content.fragments.filter((f) => !has.has(f.id) && f.channel === 'lintel').length,
      studyLeft: content.fragments.filter((f) => !has.has(f.id) && f.channel === 'study').length,
      testimonyLeft: content.fragments.filter((f) => !has.has(f.id) && f.kind === 'testimony').length,
    });
  }
  return out;
}

describe('SCRATCH measurement', () => {
  it('prints the numbers', () => {
    for (const [name, profile] of [['DECENT', PROFILE_DECENT], ['SKILLED', PROFILE_SKILLED]] as const) {
      const N = 240;
      const WINDOW = 14;
      let legibleDaySum = 0; let owedDaySum = 0; let legibleOwedSum = 0;
      let exhaustDaySum = 0; const exhaust: number[] = [];
      const perDayLegible = Array.from({ length: WINDOW }, () => 0);
      const legible16: number[] = [];
      for (let i = 0; i < N; i++) {
        const rows = run(profile, (0x51ce + i * 0x9e37) | 0, 60);
        const w = rows.slice(0, WINDOW);
        for (const r of w) {
          if (r.legible > 0) { legibleDaySum++; perDayLegible[r.day - 1]!++; }
          const owed = r.unfoundAtDawn > 0 || r.heldSealed > 0;
          if (owed) { owedDaySum++; if (r.legible > 0) legibleOwedSum++; }
        }
        // day the volume ran out of unfound fragments
        const ex = rows.find((r) => r.unfoundAtDawn === 0)?.day ?? 61;
        exhaust.push(ex); exhaustDaySum += ex;
        // day of 16th legible
        let cum = 0; let d16 = 61;
        for (const r of rows) { cum += r.legible; if (cum >= 16) { d16 = r.day; break; } }
        legible16.push(d16);
      }
      const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]!; };
      console.log(`\n=== ${name} ===`);
      console.log(`legibleDays (raw, first ${WINDOW}): ${(legibleDaySum / (N * WINDOW)).toFixed(3)}`);
      console.log(`legibleDays (owed only):            ${(legibleOwedSum / Math.max(1, owedDaySum)).toFixed(3)}  (owed day share ${(owedDaySum / (N * WINDOW)).toFixed(3)})`);
      console.log(`per-day legible share: ${perDayLegible.map((c) => (c / N).toFixed(2)).join(' ')}`);
      console.log(`volume exhausted (all 17 filed) median day ${med(exhaust)}`);
      console.log(`16th LEGIBLE median day ${med(legible16)}  p10 ${[...legible16].sort((a, b) => a - b)[Math.floor(N * 0.1)]}`);
      // Dry-day forensics
      let dryNoSolve = 0, dryLintelDry = 0, dryOther = 0, dryTotal = 0, doubles = 0, legFrag = 0;
      const lintelLeftByDay = Array.from({ length: WINDOW }, () => 0);
      for (let i = 0; i < N; i++) {
        const rows = run(profile, (0x51ce + i * 0x9e37) | 0, WINDOW);
        for (const r of rows) {
          legFrag += r.legible;
          if (r.legible > 1) doubles += r.legible - 1;
          lintelLeftByDay[r.day - 1]! += r.lintelLeft;
          const owed = r.unfoundAtDawn > 0 || r.heldSealed > 0;
          if (!owed || r.legible > 0) continue;
          dryTotal++;
          if (r.solves === 0) dryNoSolve++;
          else if (r.lintelLeft === 0) dryLintelDry++;
          else dryOther++;
        }
      }
      console.log(`legible FRAGMENT-events per campaign over ${WINDOW}d: ${(legFrag / N).toFixed(2)}  (doubles ${(doubles / N).toFixed(2)})`);
      console.log(`dry owed days/campaign ${(dryTotal / N).toFixed(2)}: no-solve ${(dryNoSolve / N).toFixed(2)} | lintel-drained ${(dryLintelDry / N).toFixed(2)} | other ${(dryOther / N).toFixed(2)}`);
      console.log(`lintel stock left at dusk: ${lintelLeftByDay.map((c) => (c / N).toFixed(1)).join(' ')}`);
    }
    expect(true).toBe(true);
  });
});
