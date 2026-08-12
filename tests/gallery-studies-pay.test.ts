/**
 * ═══ THE GALLERY'S STUDIES PAY, AND THE DOOR STILL DOES NOT OPEN ══════════
 * OWNER: round 44 (the Gallery). See engine/economy/steps.ts `STUDY_REFUND`.
 *
 * THE OWNER, FROM PLAY: *"For the gallery, for the words that aren't part of
 * the gallery, it was confusing what their purpose was. It didn't automatically
 * add steps."* Two blind testers in `docs/COMPREHENSION.md` reached the same
 * belief before him — that only the pre-chosen words count — which is exactly
 * the belief round 28's two-class board was built to kill. Round 34 attacked
 * the evidence (a +1 on the kept chip, a caption over each pile) and the belief
 * survived, because that +1 was a SCORE point: a unit she cannot spend, printed
 * in the same shape as the one she can, beside a step counter that did not move.
 *
 * A study hands back the move she spent walking in now. Once a board. This file
 * is the gate on all four halves of that sentence, and it is deliberately built
 * out of things that can disagree with the code under test:
 *
 *   PAYS      driven through the LIVE STORE — the real adapter, the real room
 *             slice, the real ledger — and asserted on the ledger entry, never
 *             on the adapter's own feedback flag.
 *   ONCE      a second study on the same board adds nothing, and neither does
 *             leaving the room and coming back to it.
 *   NEVER OPENS THE DOOR   every study the board carries is fed to the room in
 *             one sitting and the exhibition must still be shut. This is round
 *             26's defect (five common words ending a room) and it is the one
 *             thing paying could have broken.
 *   AND IS NOT A WAGE      the counterfactual is computed, not asserted: what a
 *             study paid at the house wage would do to AAA 4.10h's published
 *             spread. If a later round decides to wage one anyway, this is the
 *             number it has to argue with.
 *
 * THE WORDS ARE NOT TAKEN FROM THE POOL'S OWN LISTS. Candidates are enumerated
 * off raw ENABLE with a path walker written here, and only then handed to the
 * room — so a bug that made the engine forget a class of word could not hide
 * from this file by also hiding from its fixtures.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { create } from 'zustand';
import type { ManorStore } from '../src/app/store';
import { createEmptySaveV2, type SaveV2 } from '../src/app/save';
import { createDaySlice } from '../src/app/slices/day';
import { createManorSlice } from '../src/app/slices/manor';
import { createRoomSlice } from '../src/app/slices/room';
import { createDialogueSlice } from '../src/app/slices/dialogue';
import { createJournalSlice } from '../src/app/slices/journal';
import { createMetaSlice } from '../src/app/slices/meta';
import { twistleAdapter, type TwistleRoomState } from '../src/engine/rooms/adapters/twistle';
import { centerIndex, puzzleSize, twistleRuleLines, STUDY_POINTS } from '../src/engine/twistle';
import {
  solvePayout, studyRefundDue, SOLVE_WAGE, STEP_TABLE, STUDY_REFUND,
} from '../src/engine/economy/steps';
import { effortMinutes, ROOM_EFFORT } from '../src/engine/economy/effort';
import { snapshotRoomSession, type RoomSession } from '../src/engine/rooms/room-session';
import { ROOM_PUZZLE_KINDS, type RoomPuzzleKind } from '../src/engine/rooms/room-puzzle';
import type { PlacedRoom, Tier, TwistlePuzzle } from '../src/engine/types';
import twistleData from '../content/generated/twistle.json';

const POOL = twistleData as TwistlePuzzle[];
const CELL = '1,1';

/** Enumerating whole boards against ENABLE is real work — yield the loop. */
const HEAVY_MS = 180_000;
const breathe = () => new Promise<void>((resolve) => { setImmediate(resolve); });

/* ─────────────────── AN ENUMERATOR THAT IS NOT THE ENGINE'S ─────────────── */

function loadEnable(): { words: Set<string>; prefixes: Set<string> } {
  const words = new Set<string>();
  const prefixes = new Set<string>();
  for (const line of readFileSync('content/data/enable1.txt', 'utf8').split('\n')) {
    const w = line.trim().toUpperCase();
    if (w.length < 5) continue;
    words.add(w);
    for (let i = 1; i <= w.length; i++) prefixes.add(w.slice(0, i));
  }
  return { words, prefixes };
}
const ENABLE = loadEnable();

function kingNeighbours(n: number): number[][] {
  const nb: number[][] = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n); const c = i % n; const out: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr; const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
        out.push(nr * n + nc);
      }
    }
    nb.push(out);
  }
  return nb;
}

/** Every ENABLE word traceable on this grid under the rules the board PRINTS. */
function traceable(p: TwistlePuzzle): string[] {
  const n = puzzleSize(p);
  const centre = centerIndex(n);
  const nb = kingNeighbours(n);
  const found = new Set<string>();
  const used = new Array<boolean>(n * n).fill(false);
  const walk = (pos: number, prefix: string, hitCentre: boolean) => {
    const s = prefix + p.grid[pos]!;
    if (!ENABLE.prefixes.has(s)) return;
    used[pos] = true;
    const hit = hitCentre || pos === centre;
    if (s.length >= p.rules.minLength && ENABLE.words.has(s)
      && (hit || !p.rules.centerRequired)) found.add(s);
    for (const x of nb[pos]!) if (!used[x]) walk(x, s, hit);
    used[pos] = false;
  };
  for (let i = 0; i < n * n; i++) walk(i, '', false);
  return [...found];
}

/* ─────────────────────────────── THE LIVE STORE ─────────────────────────── */

function makeStore(save: SaveV2 = createEmptySaveV2('Player')) {
  return create<ManorStore>()((...a) => ({
    ...createDaySlice(save)(...a),
    ...createManorSlice(save)(...a),
    ...createRoomSlice(save)(...a),
    ...createDialogueSlice(save)(...a),
    ...createJournalSlice(save)(...a),
    ...createMetaSlice(save)(...a),
  }));
}

type Store = ReturnType<typeof makeStore>;

/** Stand her in a Gallery with a full purse, the way room-bank.test.ts does. */
function standInTheGallery(store: Store, puzzle: TwistlePuzzle): void {
  const placed = {
    kind: 'twistle', cell: { col: 1, row: 1 }, cardId: 'gallery',
    puzzleId: puzzle.id, solved: false,
  } as unknown as PlacedRoom;
  store.setState({
    day: { day: 3, phase: 'exploring', daySeed: 1, activeRoom: null },
    manor: { daySeed: 1, rooms: { [CELL]: placed }, playerCell: { col: 1, row: 1 } } as never,
    ledger: { budget: 40, entries: [] },
  });
  store.getState().enterRoom(CELL);
}

/** Trace one word through the real host loop and bank the session. */
function trace(
  store: Store, puzzle: TwistlePuzzle, session: RoomSession, word: string,
): RoomSession {
  const out = twistleAdapter.reduce(puzzle, session.state as TwistleRoomState, {
    type: 'submit', word,
  });
  const live: RoomSession = {
    puzzle,
    state: out.state,
    done: out.outcome.status !== 'active',
    solvedOnce: session.solvedOnce || out.events.some((e) => e.type === 'solved'),
  };
  store.getState().applyRoomEvents(out.events, out.outcome);
  store.getState().saveRoomSession(CELL, snapshotRoomSession(twistleAdapter, 1, live));
  return live;
}

function freshSession(puzzle: TwistlePuzzle): RoomSession {
  return {
    puzzle,
    state: twistleAdapter.start(puzzle, { tier: 1, seed: 1, volumeId: 'volume-1' }),
    done: false,
    solvedOnce: false,
  };
}

const entriesOf = (store: Store, reason: string) =>
  store.getState().ledger.entries.filter((e) => e.reason === reason);
const paidBy = (store: Store, reason: string) =>
  entriesOf(store, reason).reduce((s, e) => s + e.delta, 0);

/** A board at `tier`, and its studies — asked of the room, drawn from ENABLE. */
function boardAt(tier: Tier): { puzzle: TwistlePuzzle; studies: string[] } {
  const puzzle = POOL.find((p) => p.tier === tier)!;
  const works = new Set(puzzle.targetWords.map((w) => w.toUpperCase()));
  const studies: string[] = [];
  for (const w of traceable(puzzle)) {
    if (works.has(w)) continue;
    // Ask the ROOM what it does with the word — never assume. Only the ones it
    // really classes as studies are fixtures for a test about studies.
    const probe = twistleAdapter.reduce(puzzle, twistleAdapter.start(puzzle, {
      tier, seed: 1, volumeId: 'volume-1',
    }), { type: 'submit', word: w });
    if ((probe.state as TwistleRoomState).lastFeedback?.kind === 'study') studies.push(w);
  }
  return { puzzle, studies };
}

/* ───────────────────────────── THE MEASUREMENTS ─────────────────────────── */

describe('a study pays back the step she walked in on (round 44)', () => {
  it('pays ONE step, through the live ledger, the moment she traces one', () => {
    const { puzzle, studies } = boardAt(1);
    expect(studies.length, 'a tier-1 board with no study on it cannot test this')
      .toBeGreaterThan(1);
    const store = makeStore();
    standInTheGallery(store, puzzle);
    let session = freshSession(puzzle);

    expect(paidBy(store, 'study')).toBe(0);
    session = trace(store, puzzle, session, studies[0]!);

    // The ledger, not the adapter's flag: this is the number she spends.
    expect(paidBy(store, 'study'), 'the first study handed back nothing')
      .toBe(STUDY_REFUND.perStudy);
    expect(entriesOf(store, 'study')[0]!.roomKey).toBe(CELL);
    // And it cost her nothing to find: a study is not a mistake and never was.
    expect(paidBy(store, 'mistake')).toBe(0);
    expect(session.solvedOnce).toBe(false);
  });

  it('pays ONCE a board — a second study, and a re-entry, add nothing', () => {
    const { puzzle, studies } = boardAt(1);
    const store = makeStore();
    standInTheGallery(store, puzzle);
    let session = freshSession(puzzle);
    session = trace(store, puzzle, session, studies[0]!);
    const after1 = paidBy(store, 'study');

    for (const w of studies.slice(1, 8)) session = trace(store, puzzle, session, w);
    expect(paidBy(store, 'study'), 'the board paid for more than one study').toBe(after1);

    // She steps out onto the blueprint and walks back in — the session comes
    // with her, and so must the fact that this board has already paid.
    store.getState().leaveRoom();
    store.getState().enterRoom(CELL);
    if (studies.length > 8) session = trace(store, puzzle, session, studies[8]!);
    expect(paidBy(store, 'study'), 'a re-entry re-opened the payment').toBe(after1);
  });

  it('is bounded by the ECONOMY and not by the room: the ask is clamped', () => {
    // The adapter asks; `studyRefundDue` is what answers. Drive the bound
    // directly, so an adapter that lost track of its own counter still could
    // not pay twice — which is the shape of the §5.4 re-solve exploit.
    expect(studyRefundDue(0)).toBe(STUDY_REFUND.perStudy);
    expect(studyRefundDue(STUDY_REFUND.perStudy)).toBe(0);
    expect(studyRefundDue(99)).toBe(0);
    expect(STUDY_REFUND.perBoard).toBe(1);
    // The move it hands back IS the move she spent walking in, and it is the
    // cozy floor's own number — not a coincidence and not a second knob.
    expect(STUDY_REFUND.perStudy).toBe(-STEP_TABLE.moveAt(0));
    expect(STUDY_REFUND.perStudy).toBe(SOLVE_WAGE.floor);
  });

  it('NEVER opens the door: every study on a board leaves the room shut', { timeout: HEAVY_MS }, async () => {
    // Round 26's defect was five common words ending a room. Paying for a study
    // is the change most likely to bring it back, so it is asserted at every
    // tier, over the whole study population of a real board, in one sitting.
    for (const tier of [1, 2, 3] as Tier[]) {
      const { puzzle, studies } = boardAt(tier);
      expect(studies.length, `tier ${tier} has no studies to try`).toBeGreaterThan(5);
      const store = makeStore();
      standInTheGallery(store, puzzle);
      let session = freshSession(puzzle);
      let solvedEver = false;
      for (const w of studies) {
        session = trace(store, puzzle, session, w);
        solvedEver = solvedEver || session.solvedOnce;
      }
      await breathe();
      const state = session.state as TwistleRoomState;
      expect(solvedEver, `tier ${tier}: studies opened the exhibition`).toBe(false);
      expect(state.twistle.status, `tier ${tier}`).not.toBe('won');
      expect(state.twistle.foundWords.length, `tier ${tier}: a study counted as a work`).toBe(0);
      expect(paidBy(store, 'solve'), `tier ${tier}: studies paid a solve`).toBe(0);
      // …and the whole pile of them paid exactly one step, however long it was.
      expect(paidBy(store, 'study'), `tier ${tier}: ${studies.length} studies`)
        .toBe(STUDY_REFUND.perStudy);
    }
  });

  it('leaves an abandoned Gallery net non-positive — a refund, not a wage', () => {
    // THE GUARDRAIL, IN ONE ROOM. A study may make a Gallery she walks out of
    // break even and it may never make one profitable. She spends the move
    // reaching it, traces every study she can, and walks away.
    const { puzzle, studies } = boardAt(1);
    const store = makeStore();
    standInTheGallery(store, puzzle);
    store.getState().applyStepEntry({
      reason: 'move', delta: STEP_TABLE.moveAt(1), at: 0, roomKey: CELL,
    });
    let session = freshSession(puzzle);
    for (const w of studies.slice(0, 12)) session = trace(store, puzzle, session, w);
    const net = store.getState().ledger.entries
      .filter((e) => e.roomKey === CELL).reduce((s, e) => s + e.delta, 0);
    expect(net, `an abandoned Gallery paid ${net}`).toBeLessThanOrEqual(0);
  });
});

describe('why a study is REFUNDED and not WAGED — the counterfactual (AAA 4.10h)', () => {
  const everyRoom = ROOM_PUZZLE_KINDS.flatMap(
    (k) => ([1, 2, 3] as Tier[]).map((t) => [k, t] as [RoomPuzzleKind, Tier]),
  );
  const wageOf = (k: RoomPuzzleKind, t: Tier) => solvePayout(k, t) / effortMinutes(k, t);
  const spread = (ws: number[]) => Math.max(...ws) / Math.min(...ws);

  it('shows the Gallery is already the TOP of the wage table, on the cozy floor', () => {
    const ws = everyRoom.map(([k, t]) => wageOf(k, t));
    const top = Math.max(...ws);
    expect(wageOf('twistle', 1), 'the Gallery is no longer at the top — re-derive the note')
      .toBeCloseTo(top, 6);
    // It is there because the FLOOR catches it, not because it is generous: the
    // honest wage of a 1.25-minute room is 0.56 of a move, and the ledger has
    // no coin smaller than one. That is why there is no room above it to pay a
    // study out of.
    expect(SOLVE_WAGE.stepsPerMinute * ROOM_EFFORT['twistle'][0]).toBeLessThan(SOLVE_WAGE.floor);
    expect(solvePayout('twistle', 1)).toBe(SOLVE_WAGE.floor);
  });

  it('prices a WAGED study and shows what it would do to the published ratchet', () => {
    const published = spread(everyRoom.map(([k, t]) => wageOf(k, t)));
    // What the house wage says one study is really worth: a find at tier 1 costs
    // ROOM_EFFORT.twistle[0] / the ask in minutes, and a move buys 1/0.45 of them.
    const minutesPerFind = ROOM_EFFORT['twistle'][0] / POOL.find((p) => p.tier === 1)!.targetCount;
    const honest = SOLVE_WAGE.stepsPerMinute * minutesPerFind;
    expect(honest, `an honest study is worth ${honest.toFixed(3)} of a move`).toBeLessThan(0.2);
    // …which is more than eight studies to the move, and eight is not a number
    // that answers a woman who has traced ONE word. Paid at the ledger's
    // smallest coin instead — a solved tier-1 Gallery plus four studies:
    const wagedPay = solvePayout('twistle', 1) + 4 * STUDY_REFUND.perStudy;
    const wagedMinutes = ROOM_EFFORT['twistle'][0] + 4 * minutesPerFind;
    const wagedWage = wagedPay / wagedMinutes;
    const wouldBe = spread(
      everyRoom.map(([k, t]) => (k === 'twistle' && t === 1 ? wagedWage : wageOf(k, t))),
    );
    expect(wouldBe / published, `published ${published.toFixed(2)}x -> waged ${wouldBe.toFixed(2)}x`)
      .toBeGreaterThan(2.5);
    // So it is not a wage. The refund hands back the same one move and moves NO
    // wage at all, because it un-charges a cost instead of pricing work — and
    // this is the proof: `solvePayout` is untouched by round 44, so the
    // published spread is exactly where round 42 left it.
    expect(published, `published spread ${published.toFixed(2)}x`).toBeLessThanOrEqual(5.0);
  });
});

describe('the room says what a study is FOR, on the line that is never hidden', () => {
  it('states the payment in the RULE line at every tier, not in the flavour', () => {
    // THE FINDING THIS ROUND TURNED ON. The only sentence that said what a
    // study was for lived in `rules.studies`, which anchor.css classes as
    // decorative reserve and `@media (max-height: 700px)` DELETES — i.e. on the
    // 375×667 phone this game is judged on it was never on the glass at all.
    // It gates a step now, so it rides `rules.line`, which is never hidden.
    for (const tier of [1, 2, 3] as Tier[]) {
      const puzzle = POOL.find((p) => p.tier === tier)!;
      const rules = twistleRuleLines(puzzle);
      expect(rules.line, `tier ${tier}`).toContain(rules.pay);
      expect(rules.pay).toMatch(/step/);
      // And it carries no COUNT, so it cannot go false on the second study:
      // "buys back your step in" is bounded by there having been one step.
      expect(rules.pay).not.toMatch(/\bfirst\b|\bonce\b|\b1\b/);
    }
  });

  it('keeps the two ONES apart: a step is spent, a point is scored', () => {
    // Round 34's toast read "a study · +1" and that +1 was a SCORE point. The
    // chip still carries the point, under a caption that says so; the toast now
    // says the word "step". If a later round makes these two numbers equal AND
    // drops the word, the reader is back where the owner found her.
    expect(STUDY_POINTS).toBe(1);
    const view = readFileSync('src/ui/rooms/anchor/TwistleView.tsx', 'utf8');
    expect(view, 'the study toast no longer names the unit it paid in')
      .toContain('a study · +${stepWords(STUDY_REFUND.perStudy)} back');
    expect(view, "the studies caption no longer says what the chip's number is")
      .toContain('point each');
  });
});
