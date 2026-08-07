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
  legibleDayFlag, legibleDroughtDays, letterGrants, LINTEL_CHANNEL, nextFragmentForRoom,
  PITY_DROUGHT_DAYS, sealedFragmentFlag, STUDY_CHANNEL,
  type VolumeContent,
} from '../src/engine/volume';
import {
  campaignProfileForDay, deckMixAt, medianOf, PROFILE_DECENT, PROFILE_SKILLED, quantileOf,
  simulateCampaigns, simulateDay,
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
  /**
   * ROUND 13: the per-day view the pity floor has to be measured against.
   * `unfoundAtDawn` is what makes the measurement honest — once the volume has
   * authored nothing further, no channel owes her "≥1 new fragment" and a dry
   * run says nothing about mercy.
   */
  perDay: { day: number; filed: number; legible: number; unfoundAtDawn: number }[];
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

  /**
   * ROUND 13 (AAA 4.14 blocker) — the days on which she LEARNED something.
   *
   * The drought was measured off `DayRecord.fragmentsFound`, which counts a
   * sealed page, because a sealed page IS found. So a smudge she cannot read
   * reset the mercy channel, and the model reproduced that rather than flagging
   * it. The shipped rule now reads legibility (engine/volume.legibleDroughtDays
   * over the `made-out-day-<N>` flags), and so does this model.
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
    if (legibleCount > legibleBefore) legibleDaysSet.add(day);
    records.push({
      day, endedAt: 0, cause: 'steps-exhausted',
      roomsDrafted: result.rooms, roomsSolved: result.roomsSolved,
      fragmentsFound: found - before, stepsSpent: result.spent, minutes: result.minutes,
    } as DayRecord);
    perDay.push({
      day, filed: found - before, legible: legibleCount - legibleBefore, unfoundAtDawn,
    });
  }
  return { filed: dayOfCount, legible: dayOfLegible, perDay };
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

  /**
   * ROUND 19 — 10–20 → 6–16, FOR THE SAME REASON 4.10e's WIN BAND MOVED.
   *
   * This horizon is the knowledge curve seen from the content side, and
   * REVIEW_AA §5.1 re-routed it deliberately: under the old kind-based routing
   * exactly two of the seventeen fragments were payable by an ordinary
   * evening's solve, and the volume now routes nine (7 lintel + 2 study). The
   * same instrument that measured 12–13 before the re-route measures 9 after
   * it, which is the change working, not the change breaking.
   *
   * It is pinned as a band and not as a decimal because the number that must
   * not drift is the SHAPE: fragment 16 is the tie-breaking engraving, so the
   * day it becomes legible is the day the constraint set closes to one word,
   * and it has to stay a fortnight-ish story rather than a weekend or a month.
   * Measured over 240 seeded PROFILE_SKILLED campaigns: p10 7, median 9,
   * p90 11, max 14.
   */
  it('the median campaign can READ fragment 16 between day 6 and day 16', () => {
    const m = medianOf(day16);
    expect(m, `median day-of-LEGIBLE-fragment-16 was ${m}`).toBeGreaterThanOrEqual(6);
    expect(m, `median day-of-LEGIBLE-fragment-16 was ${m}`).toBeLessThanOrEqual(16);
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
    // Same band as the legible one above, moved with it (round 19). Measured
    // p10 6, median 9, p90 11, max 14 — the lag is still there and still
    // nonzero on about half the campaigns, which is the seal doing its job.
    const mFiled = medianOf(day16Filed);
    expect(mFiled, `median day-of-FILED-fragment-16 was ${mFiled}`).toBeGreaterThanOrEqual(6);
    expect(mFiled, `median day-of-FILED-fragment-16 was ${mFiled}`).toBeLessThanOrEqual(16);
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
    // ROUND 16: the screen reads the THREE-VALUED `sanctumStanding` (a
    // boolean collapsed 'landing-sealed' into 'away' and told a player
    // standing on the landing to climb — AAA 4.16). `atDoor` is still the
    // gate; it is now derived from the shared predicate rather than from a
    // second one, and the sealed case must have its own branch.
    expect(view, 'SanctumView no longer consults the shared standing predicate')
      .toMatch(/sanctumStanding\(s\.manor\)/);
    expect(view, "atDoor must BE the 'at-door' standing, not a parallel predicate")
      .toMatch(/const atDoor = standing === 'at-door'/);
    expect(view, 'the sealed landing must be a case of its own, not folded into "away"')
      .toMatch(/const sealedLanding = standing === 'landing-sealed'/);
    // ── ROUND 19 (REVIEW_AA §5.2): THE MOUTH MOVED; THE CEREMONY DID NOT. ──
    // This lint used to require `{atDoor && (` around the guess row, which is
    // the round-7 rule the speaking tube retires: §5.2 asks for the door to be
    // "addressable from the Entrance Hall every day, at zero or near-zero step
    // cost". What must stay grepped is the pair of claims that outlive it —
    // that the row is gated on a SHARED predicate rather than on nothing, and
    // that the two mouths are the only two.
    expect(view, "the tube must be a case of the shared standing predicate")
      .toMatch(/const atTube = standing === 'at-tube'/);
    expect(view, 'the guess row must be gated on the door-or-tube predicate')
      .toMatch(/const canSpeak = atDoor \|\| atTube/);
    expect(view, 'the guess row must be gated on canSpeak, never unconditional')
      .toMatch(/\{canSpeak && \(/);
    // …and the CEREMONY is still the landing's, which is the half of the
    // round-7 gate §5.2 explicitly keeps ("it does not move the ceremony").
    expect(view, 'a word said down the tube must not play the win')
      .toMatch(/setPhase\(atDoor \? 'won-reveal' : 'answered'\)/);
    expect(view, "the Portrait's audience must be gated on the landing")
      .toMatch(/phase === 'idle' && atDoor && audienceButton/);
    expect(view, 'the arrival line must be keyed by arrivalShade').toMatch(/portrait\.arrive\.\$\{shade\}/);
  });

  it('the store refuses a word spoken from anywhere but a mouth', () => {
    const slice = readFileSync(join(root, 'src', 'app', 'slices', 'journal.ts'), 'utf8');
    // Round 19: the gate is the tube's own predicate now (door OR the brass in
    // the Entrance Hall), and it is still enforced on the MODEL so a UI
    // regression cannot reopen it — which was always this lint's real point.
    expect(slice, 'guessAtSanctum must not trust the screen')
      .toMatch(/canAddressSanctum\(get\(\)\.manor\)/);
    // And the volume still cannot be won from the hall: a right word away from
    // the door sets the answered flag and leaves the volume ACTIVE.
    expect(slice, 'a right word down the tube must not close the volume')
      .toMatch(/status: 'active'/);
    expect(slice, 'the tube must set the write-once answered flag')
      .toMatch(/sanctumAnsweredFlag\(content\.id\)/);
  });

  it('the journal points at the door instead of teleporting to it', () => {
    const journal = readFileSync(join(root, 'src', 'ui', 'journal', 'JournalView.tsx'), 'utf8');
    const at = journal.indexOf('Take it to the Sanctum');
    expect(at, 'the journal lost its Sanctum pointer entirely').toBeGreaterThan(0);
    expect(journal.slice(at - 400, at), 'the Sanctum link is unconditional again').toMatch(/atLanding/);
  });

  /**
   * ROUND 13 — THIS TEST USED TO DEFEND THE BUG IN ITS OWN COMMENT.
   *
   * It measured the floor on FILING, and said so: *"A sealed page still counts
   * as something arriving — it is hers, it is in the journal, and it is a
   * reason to go solve a room."* Which is true about a page and false about a
   * PITY FLOOR. 4.14's [BEAT] guarantee is about the mystery moving; a smudge
   * moves nothing, and counting it reset the drought to zero and switched the
   * mercy channel off for exactly the player it exists for. Both halves are
   * measured now: filing keeps its cozy promise, legibility carries the floor.
   */
  /**
   * The window the guarantee actually covers: days on which the volume still
   * had a page to give. Once all seventeen are filed no channel owes her "one
   * new fragment", so a dry run past that point measures nothing about mercy —
   * it measures a finished drip. (The old version of this test dodged the
   * question by stopping at the last event, which is the same thing said by
   * accident and stops being true the moment the drought rule changes.)
   */
  const owedDays = (run: DripRun) => run.perDay.filter((d) => d.unfoundAtDawn > 0);
  const worstDryRun = (days: DripRun['perDay'], of: 'filed' | 'legible') => {
    let dry = 0;
    let worst = 0;
    for (const d of days) {
      dry = d[of] > 0 ? 0 : dry + 1;
      worst = Math.max(worst, dry);
    }
    return worst;
  };

  it('the pity floor holds on LEGIBILITY: never PITY_DROUGHT_DAYS+1 days without learning', () => {
    for (const run of runs) {
      expect(
        worstDryRun(owedDays(run), 'legible'),
        'a campaign went too long without making anything out',
      ).toBeLessThanOrEqual(PITY_DROUGHT_DAYS);
    }
  });

  /**
   * FILING IS NO LONGER THE GUARANTEED QUANTITY, AND THIS TEST SAYS SO OUT LOUD.
   *
   * Before round 13 the drought counted filings, so "filing is never dry for
   * more than PITY_DROUGHT_DAYS" was true by construction — the test was
   * measuring its own definition. Now that mercy keys off legibility, a stretch
   * where she makes out backlog pages (learning plenty) but files nothing new
   * can run one day longer, and it does: measured over 240 seeded campaigns,
   * worst filing dry run 0 ×28 · 1 ×94 · 2 ×68 · 3 ×46 · 4 ×4, against a
   * LEGIBLE worst of 0 ×18 · 1 ×94 · 2 ×63 · 3 ×65, max 3 — the floor exactly
   * where PITY_DROUGHT_DAYS puts it. The band below is the measurement, not a
   * target; if filing ever drifts further the drip has thinned and that is worth
   * a look even though the guarantee still holds.
   */
  it('filing stays close behind: never more than one day past the legible floor', () => {
    for (const run of runs) {
      expect(worstDryRun(owedDays(run), 'filed')).toBeLessThanOrEqual(PITY_DROUGHT_DAYS + 1);
    }
  });
});

/**
 * ═══ THE SEAL'S BITE, FOR BOTH PLAYERS (AAA 4.10g, round 14) ═══════════════
 *
 * 4.10g published the overnight clause explicitly for "a skilled player's
 * days" and stated NOTHING for the median player — the owner, the evening
 * 4.10b clocks — so the criterion had no row a critic could pass or fail for
 * the person the mechanic was built for ("solving needs to matter"). That is
 * the round-6/11/12 escape shape exactly: a number verified against a player
 * the game is not describing.
 *
 * Her rates are now measured here, beside his, and the ASYMMETRY is asserted
 * rather than assumed — violet share is a function of ROW (`deckMixAt`: ≈2.0%
 * at row 0, ≈10.5% at row 6), she tops out around the third landing and he
 * climbs past it, so his numbers must stay strictly above hers. If that ever
 * inverts, a profile has stopped describing the player it is named for.
 *
 * These live in the MYSTERY's suite because the seal is the mystery's
 * mechanic; A2's tests/economy-simulation.test.ts holds the same shape for the
 * skilled player and owns the economy side of it (see the report's
 * cross-agent request).
 */
describe('the seal bites for the median player too, and the split is measured (AAA 4.10g)', () => {
  const N = 200;
  const DAYS = 45;
  const daysOf = (profile: typeof PROFILE_DECENT) =>
    simulateCampaigns(profile, N, DAYS, 31).flatMap((c) => c.days);
  const share = (days: ReturnType<typeof daysOf>, f: (d: (typeof days)[number]) => boolean) =>
    days.filter(f).length / days.length;

  const decent = daysOf(PROFILE_DECENT);
  const skilled = daysOf(PROFILE_SKILLED);

  const metViolet = (d: (typeof decent)[number]) => d.fragmentsFound > 0;
  const madeOut = (d: (typeof decent)[number]) => d.pagesMadeOut > 0;
  const overnight = (d: (typeof decent)[number]) => d.sealedBacklog > 0;

  /**
   * HER OVERNIGHT RATE, PUBLISHED. Measured 13.6–14.9% across seeds and
   * campaign counts; the band is wide enough to survive a re-seed and narrow
   * enough that a retune has to come and change this line on purpose.
   */
  it('a sealed page survives to the median player’s next dawn on 10–20% of her days', () => {
    const r = share(decent, overnight);
    expect(r, `median-player overnight rate was ${(100 * r).toFixed(1)}%`)
      .toBeGreaterThanOrEqual(0.10);
    expect(r, `median-player overnight rate was ${(100 * r).toFixed(1)}%`)
      .toBeLessThanOrEqual(0.20);
  });

  it('and on 25–50% of a skilled player’s days — the clause 4.10g already published', () => {
    const r = share(skilled, overnight);
    expect(r).toBeGreaterThanOrEqual(0.25);
    expect(r).toBeLessThanOrEqual(0.50);
  });

  it('a solve makes a page out on ≥1 day in 5 for her, ≥1 in 3 for him', () => {
    expect(share(decent, madeOut)).toBeGreaterThanOrEqual(0.20);
    expect(share(skilled, madeOut)).toBeGreaterThanOrEqual(0.33);
  });

  /**
   * THE PREMISE OF THE QUALIFICATION, PINNED. 4.10g qualifies her made-out
   * clause rather than tuning it, on the grounds that the ceiling is
   * ARITHMETIC: a page can only be made out if she is holding one, and her
   * overnight backlog median is 0 — so her made-out rate is pinned to how often
   * she MEETS a violet room. If the backlog median ever rises, that argument
   * has expired and the clause owes a retune instead of a footnote.
   */
  it('her made-out rate is pinned to her violet-met rate (backlog median 0)', () => {
    expect(medianOf(decent.map((d) => d.sealedBacklog))).toBe(0);
    const met = share(decent, metViolet);
    const out = share(decent, madeOut);
    expect(out).toBeLessThanOrEqual(met);
    // ...and she meets one often enough to be a mechanic, rarely enough to
    // stay a rare room (4.10g's own two bounds).
    expect(met).toBeGreaterThan(0.15);
    expect(met).toBeLessThan(0.50);
  });

  it('the climb is what separates the two profiles — his rates strictly exceed hers', () => {
    expect(share(skilled, metViolet)).toBeGreaterThan(share(decent, metViolet));
    expect(share(skilled, madeOut)).toBeGreaterThan(share(decent, madeOut));
    expect(share(skilled, overnight)).toBeGreaterThan(share(decent, overnight));
  });

  /** The tripwire 4.10g names: solve nothing, make out nothing, all campaign. */
  it('a player who solves nothing makes out nothing', () => {
    const idle = simulateCampaigns(
      { ...PROFILE_DECENT, attemptRate: 0, solveRate: 0, perfectRate: 0 }, 40, DAYS, 9,
    ).flatMap((c) => c.days);
    expect(idle.some((d) => d.pagesMadeOut > 0)).toBe(false);
  });
});

/**
 * ═══ THE TRIPWIRE: THE PLAYER THE SEAL IS DESIGNED TO PRESS ════════════════
 *
 * The round-13 blocker in one campaign. She drafts violet rooms and solves
 * nothing — the profile the seal exists to lean on. Every day a page is filed,
 * so `DayRecord.fragmentsFound` is never zero, so the old drought counter never
 * reached PITY_DROUGHT_DAYS, so the mercy letter never came and the one [BEAT]
 * guarantee in 4.14 was withdrawn by the very documents that taught her
 * nothing.
 *
 * Everything below is the shipped machinery: the real volume content, the real
 * `sealedFragmentFlag` / `legibleDayFlag` families the slice writes, the real
 * `legibleDroughtDays` the letter tray and the digest now read, and the real
 * `arrivedLetters` / `letterGrants` mercy channel including its synthesized
 * house-written letters. Nothing here is a hand-tuned curve.
 */
describe('the pity floor survives a player who cannot read her own pages (AAA 4.14)', () => {
  const HORIZON = 24;

  interface WalkerDay {
    day: number;
    filed: number;      // what the chronicles would print
    legible: number;    // what she can actually reason from
    unfoundAtDawn: number;
  }

  /** She walks `violetPerDay` violet rooms a day and never finishes a puzzle. */
  function walkTheVioletRooms(violetPerDay: number): WalkerDay[] {
    let state = freshVolumeState(content.id, 1);
    const flags = new Set<string>();
    const openedIds = new Set<string>();
    const records: DayRecord[] = [];
    const out: WalkerDay[] = [];

    for (let day = 1; day <= HORIZON; day++) {
      const unfoundAtDawn = content.fragments.length - state.foundFragmentIds.length;
      let filed = 0;
      let legible = 0;

      // Overnight post — the mercy channel, read through the SHIPPED drought.
      const droughtDays = legibleDroughtDays(content.id, flags, records);
      for (const letter of arrivedLetters(content, state, day, { droughtDays, openedIds })) {
        if (openedIds.has(letter.id)) continue;
        const resolved = findLetter(content, letter.id) ?? letter;
        for (const id of letterGrants(content, resolved, state)) {
          if (state.foundFragmentIds.includes(id)) continue;
          // A letter's enclosure arrives OPEN — she was handed it, not asked
          // to decipher it (app/slices/journal.openLetter files it unsealed).
          state = { ...state, foundFragmentIds: [...state.foundFragmentIds, id] };
          filed += 1; legible += 1;
        }
        openedIds.add(letter.id);
      }

      // The rooms she walks through. Filed forever, sealed, silent.
      for (let i = 0; i < violetPerDay; i++) {
        const frag = nextFragmentForRoom(content, state, 'mystery');
        if (!frag || state.foundFragmentIds.includes(frag.id)) continue;
        state = { ...state, foundFragmentIds: [...state.foundFragmentIds, frag.id] };
        flags.add(sealedFragmentFlag(content.id, frag.id));
        filed += 1;
      }

      // The two write-once families exactly as app/slices/journal.ts writes
      // them: the day is marked only when something LEGIBLE landed.
      if (legible > 0) flags.add(legibleDayFlag(content.id, day));
      records.push({
        day, endedAt: 0, cause: 'steps-exhausted',
        roomsDrafted: violetPerDay, roomsSolved: 0, stepsSpent: 18, fragmentsFound: filed,
      } as DayRecord);
      out.push({ day, filed, legible, unfoundAtDawn });
    }
    return out;
  }

  for (const violetPerDay of [1, 2]) {
    it(`walking ${violetPerDay} violet room(s) a day and solving nothing still learns something every ${PITY_DROUGHT_DAYS} days`, () => {
      const days = walkTheVioletRooms(violetPerDay);

      // The premise of the defect: she is never handed nothing, so a
      // filing-based drought counter can never fire. If this ever stops being
      // true the tripwire has stopped testing the shape it was written for.
      const dryFilingDays = days.filter((d) => d.unfoundAtDawn > 0 && d.filed === 0);
      expect(dryFilingDays, 'the walker must always be FILING — that is the trap')
        .toEqual([]);

      // The guarantee itself, measured on what she can read. Only while the
      // volume still has something to give: once every page is filed there is
      // no "new fragment" left for any channel to owe her.
      let dry = 0;
      let worst = 0;
      let worstDay = 0;
      for (const d of days) {
        if (d.unfoundAtDawn <= 0) break;
        dry = d.legible > 0 ? 0 : dry + 1;
        if (dry > worst) { worst = dry; worstDay = d.day; }
      }
      expect(
        worst,
        `${worst} consecutive days with nothing made out, ending day ${worstDay}`,
      ).toBeLessThanOrEqual(PITY_DROUGHT_DAYS);

      // And the mercy actually arrived — a floor that holds because the volume
      // ran out of pages is not a floor (the round-12 "lint that matches
      // nothing" lesson, applied to a simulation).
      expect(days.some((d) => d.day > 1 && d.legible > 0)).toBe(true);
    });
  }

  it('the same walk with the OLD filing-based drought never pays her at all (the defect, pinned)', () => {
    // The counterfactual, so the fix cannot be quietly reverted: reading the
    // drought off DayRecord.fragmentsFound — every day non-zero, because a
    // sealed page is found — leaves the mercy channel permanently asleep.
    let state = freshVolumeState(content.id, 1);
    const openedIds = new Set<string>();
    const records: DayRecord[] = [];
    let pityLettersEverDelivered = 0;

    for (let day = 1; day <= HORIZON; day++) {
      let filed = 0;
      // Only days the volume still owes her a page count: once all seventeen
      // are filed the drip runs dry on its own and the pity channel fires for a
      // reason that has nothing to do with the seal.
      const owed = content.fragments.length - state.foundFragmentIds.length > 0;
      const droughtDays = fragmentDroughtDays(records);   // the OLD reading
      for (const letter of arrivedLetters(content, state, day, { droughtDays, openedIds })) {
        if (openedIds.has(letter.id)) continue;
        if (letter.pity && owed) pityLettersEverDelivered += 1;
        for (const id of letterGrants(content, findLetter(content, letter.id) ?? letter, state)) {
          if (state.foundFragmentIds.includes(id)) continue;
          state = { ...state, foundFragmentIds: [...state.foundFragmentIds, id] };
          filed += 1;
        }
        openedIds.add(letter.id);
      }
      const frag = nextFragmentForRoom(content, state, 'mystery');
      if (frag && !state.foundFragmentIds.includes(frag.id)) {
        state = { ...state, foundFragmentIds: [...state.foundFragmentIds, frag.id] };
        filed += 1;
      }
      records.push({
        day, endedAt: 0, cause: 'steps-exhausted',
        roomsDrafted: 1, roomsSolved: 0, stepsSpent: 18, fragmentsFound: filed,
      } as DayRecord);
    }
    expect(
      pityLettersEverDelivered,
      'the filing-based drought is supposed to be broken — if it now pays, this tripwire is dead',
    ).toBe(0);
  });
});
