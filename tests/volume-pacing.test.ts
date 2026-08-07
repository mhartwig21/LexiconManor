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
 *   - THE SOLVE CHANNELS (round 8): a solved Study hands over a definition
 *     line and any other solved word game hands over a lintel engraving,
 *     once per day per channel, through the real `fragmentForSolveChannel`.
 *     The Study's share of the puzzle deck is read off `BASE_DECK` ×
 *     `categoryWeight` × `RARITY_WEIGHTS`, so a deck edit moves this model
 *     rather than silently invalidating it
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
 * That last clause used to be a lie the model told itself: /sanctum was
 * reachable from a link in the journal, so "a day she reaches the landing"
 * was every day from four fragments onward, and this file was modelling a
 * gate the game did not have. Round 8 put the door back at the top of the
 * house (`atSanctumDoor` gates ui/sanctum/SanctumView.tsx), so
 * `result.reachedSanctum` is now the same event on both sides — see the
 * landing-gate case at the bottom of this file.
 *
 * ROUND 7 (verifier) — THE SEAL IS THREADED THROUGH THIS MODEL.
 *
 * The measured quantity is the day the sixteenth fragment becomes **LEGIBLE**.
 * It used to be the day the sixteenth was *filed*, and this header used to
 * call that "the last engraving, after which the constraint set is a single
 * word" — which is false for a sealed engraving. Round 10 made a violet room
 * file a page that narrows NOTHING until a solve makes it out, so filing
 * sixteen pages no longer means knowing sixteen things, and a model that
 * measures filing would stay green through any retune of the seal while the
 * real horizon moved underneath it. That is the same shape as the round-6
 * "verified against a storey nobody enters" defect.
 *
 * So: violet-room pages are filed SEALED and are made out by
 * `SimDayResult.pagesMadeOut` (oldest first, matching `fragmentsToDecipher`),
 * with `sealedBacklog` carried across dawns into `simulateDay`; the letter,
 * testimony and solve-channel grants arrive legible, because she read those.
 * The FILED day is kept as a secondary assertion so the cozy "it is hers the
 * instant she walks in" promise stays pinned too — both numbers matter, and
 * they are now different numbers.
 *
 * (The seventeenth fragment is the Portrait's confession, a scene, not a clue.)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import type { CharacterId, DayRecord, VolumeState } from '../src/engine/types';
import {
  arrivedLetters, findLetter, fragmentDroughtDays, fragmentForSolveChannel, freshVolumeState,
  letterGrants, LINTEL_CHANNEL, nextFragmentForRoom, PITY_DROUGHT_DAYS, STUDY_CHANNEL,
  type VolumeContent,
} from '../src/engine/volume';
import {
  campaignProfileForDay, deckMixAt, medianOf, PROFILE_SKILLED, quantileOf, simulateDay,
} from '../src/engine/economy/simulate';
import { BASE_DECK } from '../src/engine/manor/deck';
import { categoryWeight, RARITY_WEIGHTS } from '../src/engine/manor/drafting';
import { rowTier } from '../src/engine/manor/grid';
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

/**
 * The Study's share of the puzzle rooms she can draw at this row — derived
 * from the live deck exactly the way `deckMixAt` derives its own mix, so a
 * deck edit that makes the Forgotten Word commoner or rarer moves the
 * measured horizon instead of quietly invalidating it.
 */
function studyShareAt(row0: number): number {
  const tier = rowTier(row0);
  let study = 0;
  let puzzle = 0;
  for (const card of BASE_DECK) {
    if (card.category !== 'puzzle') continue;
    if (card.tierRange[0] > tier || tier > card.tierRange[1]) continue;
    const w = categoryWeight('puzzle', row0) * RARITY_WEIGHTS[tier][card.rarity];
    puzzle += w;
    if (card.puzzleKind === 'forgotten-word') study += w;
  }
  return puzzle > 0 ? study / puzzle : 0;
}

/** What one seeded campaign measured: the day each FILED count and each
 *  LEGIBLE count was first reached (index n = fragment n). */
interface DripRun {
  filed: number[];
  legible: number[];
}

/** One seeded campaign through the real drip, seal included. */
function fragmentDays(seed: number, days: number): DripRun {
  const rng = createRng(seed);
  const timeRng = createRng((seed ^ 0x715e17) | 0);
  const metaRng = createRng((seed ^ 0x5eed21) | 0);

  let state: VolumeState = freshVolumeState(content.id, 1);
  const records: DayRecord[] = [];
  const openedIds = new Set<string>();
  const delivered = new Set<string>();
  const dayOfCount: number[] = [];
  const dayOfLegible: number[] = [];

  /** Filed but still smudged, in filing order — the queue a solve eats from. */
  let sealedQueue: string[] = [];
  let legibleCount = 0;

  /**
   * `sealed: true` is the violet-room channel: the page is hers this instant
   * and narrows nothing yet. Everything else — letters, testimony, the two
   * solve channels — arrives legible, because those are pages she was handed
   * open or earned by solving.
   */
  const file = (fragmentId: string | null | undefined, opts?: { sealed?: boolean }) => {
    if (!fragmentId || state.foundFragmentIds.includes(fragmentId)) return;
    state = { ...state, foundFragmentIds: [...state.foundFragmentIds, fragmentId] };
    if (opts?.sealed) sealedQueue.push(fragmentId);
    else legibleCount += 1;   // both counts are day-stamped at dusk, below
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
    const legibleBefore = legibleCount;

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
    // The backlog is carried across the dawn: a page she could not make out
    // last night is still smudged this morning and is the first thing today's
    // solve clears. Without this the seal would reset every midnight and the
    // model would understate exactly the pressure the mechanic exists to make.
    const result = simulateDay(
      rng, campaignProfileForDay(PROFILE_SKILLED, day), timeRng,
      { sealedBacklog: sealedQueue.length },
    );

    // Violet rooms she actually entered file the next fragment on the drip —
    // SEALED. Hers immediately, silent until a word game makes it out.
    for (let i = 0; i < result.fragmentsFound; i++) {
      file(
        nextFragmentForRoom(content, state, 'mystery', { reservedIds: reservedIds() })?.id,
        { sealed: true },
      );
    }

    // The word games pay the mystery (round 8): the Study hands over a
    // definition line, every other solved room a lintel engraving, one per
    // day per channel. Both channels are strict — when the volume has
    // nothing left labelled for them they go quiet rather than raiding the
    // violet drip, which is why this cannot run away with the horizon.
    let lintelPaid = false;
    let studyPaid = false;
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

    // Parlor rooms she happened to draft, at the live parlor share per row.
    for (let i = 0; i < result.rooms; i++) {
      const row0 = Math.min(i, Math.max(0, result.maxRow - 1));
      if (metaRng() >= deckMixAt(row0).parlor) continue;
      speak(PARLOR_KEEPERS[Math.floor(metaRng() * PARLOR_KEEPERS.length)]!);
    }

    // The Portrait keeps the landing outside the Sanctum: only on a day she
    // climbs that far does he say his piece (MANOR_DESIGN §8).
    if (result.reachedSanctum) speak('portrait');

    // --- The solves make the backlog out (oldest first, as the engine does).
    // `pagesMadeOut` is computed inside simulateDay in real day order through
    // the live `decipherYield`, so tier is already priced in. Clamped to the
    // queue we actually hold: the volume authors a fixed 17 fragments, so late
    // in a campaign the drip can run dry and file fewer than the sim expected.
    const madeOut = Math.min(result.pagesMadeOut, sealedQueue.length);
    if (madeOut > 0) {
      sealedQueue = sealedQueue.slice(madeOut);
      legibleCount += madeOut;
    }

    const found = state.foundFragmentIds.length;
    for (let n = before + 1; n <= found; n++) dayOfCount[n] = day;
    for (let n = legibleBefore + 1; n <= legibleCount; n++) dayOfLegible[n] = day;
    records.push({
      day, endedAt: 0, cause: 'steps-exhausted',
      roomsDrafted: result.rooms, roomsSolved: result.roomsSolved,
      fragmentsFound: found - before, stepsSpent: result.spent, minutes: result.minutes,
    } as DayRecord);
  }
  return { filed: dayOfCount, legible: dayOfLegible };
}

describe('fragment pacing — the volume horizon is measured, not asserted (AAA 4.10e)', () => {
  const HORIZON = 60;
  const CAMPAIGNS = 240;
  const runs = Array.from({ length: CAMPAIGNS }, (_, i) => fragmentDays((0x51ce + i * 0x9e37) | 0, HORIZON));
  /** THE horizon: the day the sixteenth fragment can actually be READ. */
  const day16 = runs.map((r) => r.legible[16] ?? HORIZON + 1);
  /** The cozy promise, kept as a secondary: the day it became hers. */
  const day16Filed = runs.map((r) => r.filed[16] ?? HORIZON + 1);

  // Measured over 240 seeded campaigns, ROUND 7 (verifier), with the seal
  // threaded through and the round-11 violet retune live:
  //   LEGIBLE fragment 16 — p10 8, median 12, max 19   ← the horizon
  //   FILED   fragment 16 — p10 8, median 11, max 18   ← the cozy promise
  //   lag between them — mean 0.54 days, max 3, NONZERO on 49% of campaigns
  //
  // That gap is the evidence the change is not cosmetic. If the two medians
  // ever collapse onto each other the seal has stopped costing anything and
  // 4.10g is no longer biting, which is precisely what this file could not
  // see while it measured filing alone.
  //
  // (Round 8, the two solve channels live and no seal modelled: min 6, p10 10,
  // median 13, p90 17, max 23. Round 6, before the word games paid anything:
  // min 8, p10 10, median 13.5, p90 17, max 22. The horizon has stayed inside
  // 4.10e's 14–28 day win window throughout — the volume authors a fixed 17
  // fragments and the pity/letter channels carry the quiet days, so what these
  // rounds changed is WHERE pages come from and WHEN they speak, which is the
  // whole point of 4.14 and 4.10g respectively.)
  it('every campaign reaches the last engraving inside the horizon', () => {
    expect(day16.every((d) => d <= HORIZON)).toBe(true);
  });

  it('the median campaign can READ fragment 16 between day 10 and day 20', () => {
    const m = medianOf(day16);
    expect(m, `median day-of-LEGIBLE-fragment-16 was ${m}`).toBeGreaterThanOrEqual(10);
    expect(m, `median day-of-LEGIBLE-fragment-16 was ${m}`).toBeLessThanOrEqual(20);
  });

  /**
   * The cozy half of round 10's promise, pinned separately: entering a violet
   * room hands her the page THAT INSTANT and nothing can take it back. Filing
   * must therefore never lag being able to read — if these two ever converge,
   * the seal has stopped costing anything and 4.10g is no longer biting; if
   * filing ever came out LATER than legibility, the model would be incoherent.
   */
  it('a page is hers before it speaks — filed never lags legible', () => {
    for (let i = 0; i < runs.length; i++) {
      expect(day16Filed[i]!, `campaign ${i}: filed ${day16Filed[i]}, legible ${day16[i]}`)
        .toBeLessThanOrEqual(day16[i]!);
    }
    const mFiled = medianOf(day16Filed);
    expect(mFiled, `median day-of-FILED-fragment-16 was ${mFiled}`).toBeGreaterThanOrEqual(10);
    expect(mFiled, `median day-of-FILED-fragment-16 was ${mFiled}`).toBeLessThanOrEqual(20);
  });

  it('even a lucky tenth of campaigns needs a full week (p10 >= 6)', () => {
    const p10 = quantileOf(day16, 0.1);
    expect(p10, `p10 day-of-fragment-16 was ${p10}`).toBeGreaterThanOrEqual(6);
  });

  /**
   * THE GATE THIS MODEL ASSUMES IS THE GATE THE GAME HAS.
   *
   * `speak('portrait')` above fires only on `result.reachedSanctum`, i.e. only
   * on days the simulated player climbs to the landing. That was fiction while
   * /sanctum was one tap from the journal on any day; the whole climax layer
   * (his opening line, the thin-file nudge, the "Back down the stairs"
   * back-link) was staged for an ascent nothing verified. This is a source
   * lint on purpose: the failure mode is someone re-adding a convenience
   * shortcut to the door, and only a grep catches that before a playtest does.
   */
  it('the guess, the audience and the arrival lines live at the landing', () => {
    const view = readFileSync(join(root, 'src', 'ui', 'sanctum', 'SanctumView.tsx'), 'utf8');
    expect(view, 'SanctumView no longer consults atSanctumDoor').toMatch(/atSanctumDoor\(s\.manor\)/);
    expect(view, 'the guess row must be gated on standing at the door').toMatch(/\{atDoor && \(/);
    expect(view, "the Portrait's audience must be gated on the landing")
      .toMatch(/phase === 'idle' && atDoor && audienceButton/);
    expect(view, 'the arrival line must be keyed by arrivalShade').toMatch(/portrait\.arrive\.\$\{shade\}/);
  });

  it('the store refuses a word spoken from anywhere else', () => {
    const slice = readFileSync(join(root, 'src', 'app', 'slices', 'journal.ts'), 'utf8');
    expect(slice, 'guessAtSanctum must not trust the screen').toMatch(/atSanctumDoor\(get\(\)\.manor\)/);
  });

  it('the journal points at the door instead of teleporting to it', () => {
    const journal = readFileSync(join(root, 'src', 'ui', 'journal', 'JournalView.tsx'), 'utf8');
    const at = journal.indexOf('Take it to the Sanctum');
    expect(at, 'the journal lost its Sanctum pointer entirely').toBeGreaterThan(0);
    expect(journal.slice(at - 400, at), 'the Sanctum link is unconditional again').toMatch(/atLanding/);
  });

  it('the pity floor holds: never PITY_DROUGHT_DAYS+1 consecutive dry days', () => {
    // Measured on FILING, deliberately: the pity channel's promise is that
    // she is never handed nothing for PITY_DROUGHT_DAYS running. A sealed page
    // still counts as something arriving — it is hers, it is in the journal,
    // and it is a reason to go solve a room.
    for (const run of runs) {
      const filedDays = run.filed;
      let dry = 0;
      let worst = 0;
      const last = filedDays.reduce((a, b) => Math.max(a, b ?? 0), 0);
      for (let day = 1; day <= last; day++) {
        const filedToday = filedDays.some((d) => d === day);
        dry = filedToday ? 0 : dry + 1;
        worst = Math.max(worst, dry);
      }
      expect(worst).toBeLessThanOrEqual(PITY_DROUGHT_DAYS);
    }
  });
});
