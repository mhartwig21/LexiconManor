/**
 * THE FRAGMENT DRIP, AS ONE INSTRUMENT — OWNER: A7 (Mystery).
 *
 * This is the harness `tests/volume-pacing.test.ts` has always used to measure
 * the volume horizon, lifted out of that file verbatim in round 17 so that the
 * verifier's re-measurement of REVIEW_AA's own numbers and the tests that PIN
 * those numbers cannot drift apart. The review's §0 finding was that the team
 * measured a stale build; the same failure mode one level down is a report that
 * quotes a number no test defends, so the report and the test now run the same
 * code.
 *
 * Nothing in here is a hand-tuned curve. It drives:
 *   - the real `content/authored/volumes/volume-1.json`
 *   - the real solve channels (`fragmentForSolveChannel`, both strict)
 *   - the real violet drip (`nextFragmentForRoom`, `reservedIds` included)
 *   - the real letter/pity channel (`arrivedLetters` / `letterGrants`)
 *   - the real testimony gates, read out of the authored dialogue JSON
 *   - the real economy (`simulateDay`, `deckMixAt`, `decipherYield` via
 *     `pagesMadeOut`), with the sealed backlog carried across dawns
 *
 * ROUND 17 (REVIEW_AA §5.1) — WHAT CHANGED AND WHY THE MODEL DID NOT.
 *
 * The re-route is an authoring change: fragments now NAME their channel in the
 * volume JSON instead of being sorted by kind. This harness never knew about
 * kinds — it asks `fragmentForSolveChannel` — so it measures the new routing
 * without a line of model change, which is the whole reason §5.1 could be
 * answered in JSON. The one thing added here is `profile`: the review's
 * legibility metric is about "a competent evening", i.e. PROFILE_DECENT, and
 * this file used to hard-code PROFILE_SKILLED.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng } from '../../src/engine/rng';
import type { CharacterId, DayRecord, VolumeState } from '../../src/engine/types';
import {
  arrivedLetters, findLetter, fragmentDroughtDays, fragmentForSolveChannel, freshVolumeState,
  letterGrants, LINTEL_CHANNEL, nextFragmentForRoom, STUDY_CHANNEL,
  type VolumeContent,
} from '../../src/engine/volume';
import {
  campaignProfileForDay, deckMixAt, PROFILE_SKILLED, simulateDay, type SimProfile,
} from '../../src/engine/economy/simulate';
import { BASE_DECK } from '../../src/engine/manor/deck';
import { categoryWeight, RARITY_WEIGHTS } from '../../src/engine/manor/drafting';
import { rowTier } from '../../src/engine/manor/grid';
import type { DialogueFile } from '../../src/engine/dialogue/schema';

// `import.meta.url`, not `__dirname`: vitest hands test files a CJS-ish
// `__dirname` but `npx tsx scripts/review-metrics.ts` loads this same
// module as real ESM, where that global does not exist. The report and the
// suite share this instrument, so it has to load under both.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const VOLUME = JSON.parse(
  readFileSync(join(root, 'content', 'authored', 'volumes', 'volume-1.json'), 'utf8'),
) as VolumeContent;

/** Whose parlor room is whose (src/pages/ManorPage.tsx PARLOR_CHARACTERS). */
const PARLOR_KEEPERS: readonly CharacterId[] =
  ['ellery', 'ellery', 'posy', 'fern', 'bramble'];

export interface TestimonyGate {
  character: CharacterId;
  fragmentId: string;
  /** Fragments filed before the character will say it. */
  gate: number;
}

/** Read the testimony channel out of the authored dialogue, never a constant. */
export function testimonyGates(): TestimonyGate[] {
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

export const GATES = testimonyGates();

/**
 * The Study's share of the puzzle rooms she can draw at this row — derived
 * from the live deck exactly the way `deckMixAt` derives its own mix, so a
 * deck edit that makes the Forgotten Word commoner or rarer moves the
 * measured horizon instead of quietly invalidating it.
 */
export function studyShareAt(row0: number): number {
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
export interface DripRun {
  filed: number[];
  legible: number[];
  /**
   * The per-day view the pity floor has to be measured against.
   * `unfoundAtDawn` is what makes the measurement honest — once the volume has
   * authored nothing further, no channel owes her "≥1 new fragment" and a dry
   * run says nothing about mercy.
   */
  perDay: {
    day: number;
    filed: number;
    legible: number;
    unfoundAtDawn: number;
    /**
     * ROUND 47 — every fragment she can READ by dusk on this day, cumulative.
     * The horizon used to be measured in PAGE COUNTS alone, and a page count
     * cannot see the thing that actually ends a deduction: how much of the
     * dictionary is still standing. `tests/volume-plate.test.ts` reads this
     * against the shipped plate.
     */
    legibleIds: string[];
  }[];
}

export interface DripOptions {
  /**
   * Characters this campaign NEVER meets — their scenes never play, so their
   * testimony stays reserved out of the room drip forever (AAA 4.14).
   *
   * ROUND 12. Discovery is random by design: Fern keeps the Greenhouse and
   * the Greenhouse is one card in a deck that need never deal it, so "a
   * player who never meets Fern" is not a pathological input, it is a
   * reachable campaign. Eight of Volume 1's 28 fragments are gated behind a
   * character scene, and the question this option exists to answer is whether
   * the mercy floor still covers her when some of that channel is switched
   * off. Defaults to nobody, so every existing measurement is byte-identical.
   */
  never?: readonly CharacterId[];
}

/** One seeded campaign through the real drip, seal included. */
export function fragmentDays(
  seed: number,
  days: number,
  profile: SimProfile = PROFILE_SKILLED,
  opts: DripOptions = {},
): DripRun {
  const never = new Set(opts.never ?? []);
  const rng = createRng(seed);
  const timeRng = createRng((seed ^ 0x715e17) | 0);
  const metaRng = createRng((seed ^ 0x5eed21) | 0);
  const content = VOLUME;

  let state: VolumeState = freshVolumeState(content.id, 1);
  const records: DayRecord[] = [];
  const openedIds = new Set<string>();
  const delivered = new Set<string>();
  const dayOfCount: number[] = [];
  const dayOfLegible: number[] = [];

  /** Filed but still smudged, in filing order — the queue a solve eats from. */
  let sealedQueue: string[] = [];
  let legibleCount = 0;
  /** The same pages `legibleCount` counts, by id (round 47). */
  const legibleIds = new Set<string>();

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
    else { legibleCount += 1; legibleIds.add(fragmentId); }  // day-stamped at dusk, below
  };
  /** Testimony not yet spoken is held out of the room drip (AAA 4.14). */
  const reservedIds = () =>
    new Set(GATES.filter((g) => !delivered.has(g.fragmentId)).map((g) => g.fragmentId));
  const speak = (character: CharacterId) => {
    if (never.has(character)) return; // never met — the scene never plays
    for (const g of GATES) {
      if (g.character !== character || delivered.has(g.fragmentId)) continue;
      if (state.foundFragmentIds.length < g.gate) continue;
      delivered.add(g.fragmentId);
      file(g.fragmentId);
    }
  };

  /**
   * The days on which she LEARNED something. The drought was once measured off
   * `DayRecord.fragmentsFound`, which counts a sealed page, because a sealed
   * page IS found — so a smudge she cannot read reset the mercy channel. The
   * shipped rule reads legibility, and so does this model.
   */
  const legibleDaysSet = new Set<number>();
  const perDay: DripRun['perDay'] = [];

  for (let day = 1; day <= days; day++) {
    const before = state.foundFragmentIds.length;
    const legibleBefore = legibleCount;
    const unfoundAtDawn = content.fragments.length - before;

    // --- Overnight post (drought measured from the banked day records). ----
    const droughtDays = fragmentDroughtDays(records, { legibleDays: legibleDaysSet });
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
    // solve clears.
    const result = simulateDay(
      rng, campaignProfileForDay(profile, day), timeRng,
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

    // The word games pay the mystery: the Study's channel and the lintel
    // channel, one per day per channel, through the real strict selector. WHAT
    // each channel pays is now the volume's authoring decision (§5.1) — this
    // loop is unchanged from the round-8 version on purpose.
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
    const madeOut = Math.min(result.pagesMadeOut, sealedQueue.length);
    if (madeOut > 0) {
      for (const id of sealedQueue.slice(0, madeOut)) legibleIds.add(id);
      sealedQueue = sealedQueue.slice(madeOut);
      legibleCount += madeOut;
    }

    const found = state.foundFragmentIds.length;
    for (let n = before + 1; n <= found; n++) dayOfCount[n] = day;
    for (let n = legibleBefore + 1; n <= legibleCount; n++) dayOfLegible[n] = day;
    if (legibleCount > legibleBefore) legibleDaysSet.add(day);
    records.push({
      day, endedAt: 0, cause: 'steps-exhausted',
      roomsDrafted: result.rooms, roomsSolved: result.roomsSolved,
      fragmentsFound: found - before, stepsSpent: result.spent, minutes: result.minutes,
    } as DayRecord);
    perDay.push({
      day, filed: found - before, legible: legibleCount - legibleBefore, unfoundAtDawn,
      legibleIds: [...legibleIds],
    });
  }
  return { filed: dayOfCount, legible: dayOfLegible, perDay };
}

/**
 * REVIEW_AA §5.1's OWN METRIC: the fraction of the first `window` days on which
 * a competent evening files something she can READ. The review's target is
 * ≥ 0.90 for PROFILE_DECENT over the first 14 days, and it is pinned in
 * tests/volume-pacing.test.ts.
 */
export function legibleDayShare(run: DripRun, window: number): number {
  const days = run.perDay.slice(0, window);
  if (days.length === 0) return 0;
  return days.filter((d) => d.legible > 0).length / days.length;
}

/**
 * The same fraction over the days the volume STILL OWED HER A PAGE.
 *
 * The distinction is not a dodge, it is the measurement REVIEW_AA's target was
 * reaching for. §5.1 wrote "≥0.90 of the first 14 days" against a channel two
 * fragments deep, where a dry day always meant *the game had something for her
 * and did not hand it over*. After the re-route the common dry day is the
 * opposite case: the volume authors a finite number of pages and a competent
 * evening can run them out, so a dry day late in the window can mean the
 * mystery is FINISHED rather than starved. Averaging those in measures the
 * length of the volume, not the health of the channel.
 *
 * Both numbers are reported and both are pinned, because the raw one is the
 * review's own and is still short of 0.90 — see the band in
 * tests/volume-pacing.test.ts, which records exactly why.
 */
export function legibleOwedDayShare(run: DripRun, window: number): number {
  const days = run.perDay.slice(0, window).filter((d) => d.unfoundAtDawn > 0);
  if (days.length === 0) return 1;
  return days.filter((d) => d.legible > 0).length / days.length;
}
