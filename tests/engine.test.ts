import { describe, expect, it } from 'vitest';
import {
  addGlyph,
  checkAchievements,
  completeNode,
  computeChronicleStats,
  computeLifetimeTotals,
  createRng,
  definitionForLevel,
  findPath,
  foundWordScores,
  gainMindPoints,
  hiveWordPoints,
  loseMindPoints,
  proximityHint,
  restoreLetter,
  rollGlyphDrop,
  scoreWordWeb,
  startForgottenWord,
  startHive,
  startRun,
  startTwistle,
  startWordWeb,
  submitGroup,
  submitGuess,
  submitHiveWord,
  submitTwistleWord,
  toRunRecord,
  unlockClue,
  useGlyph,
  type ForgottenWordPuzzle,
  type HivePuzzle,
  type RunRecord,
  type TwistlePuzzle,
  type WordWebPuzzle,
} from '../src/engine/index';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const webPuzzle: WordWebPuzzle = {
  id: 'web-1',
  difficulty: 'medium',
  groups: [
    { theme: 'Breakfast', tier: 'yellow', words: ['WAFFLE', 'PANCAKE', 'TOAST', 'BAGEL'] },
    { theme: 'Basketball', tier: 'green', words: ['DUNK', 'BLOCK', 'ASSIST', 'REBOUND'] },
    { theme: 'Iron ___', tier: 'blue', words: ['FIST', 'WILL', 'CURTAIN', 'MAN'] },
    { theme: '___ Bar', tier: 'purple', words: ['CANDY', 'SALAD', 'SPACE', 'CROW'] },
  ],
};

const hivePuzzle: HivePuzzle = {
  id: 'hive-1',
  difficulty: 'easy',
  center: 'E',
  outer: ['S', 'T', 'A', 'R', 'N', 'I'],
  pangrams: ['RETAINS'],
  validWords: ['RETAINS', 'STARE', 'TEARS', 'EARN', 'RATE', 'NEAR', 'SEAT', 'REIN'],
  pointThreshold: 15,
  totalPoints: 40,
};

const twistlePuzzle: TwistlePuzzle = {
  id: 'twistle-1',
  difficulty: 'easy',
  // S T O N E
  // A R A T S
  // L E X I C
  // P L A N T
  // G H O S T
  grid: [...'STONE', ...'ARATS', ...'LEXIC', ...'PLANT', ...'GHOST'],
  targetWords: ['STONE', 'PLAN', 'PLANT'],
  targetCount: 2,
  rules: { minLength: 4, centerRequired: false },
};

const fwPuzzle: ForgottenWordPuzzle = {
  id: 'fw-1',
  word: 'PETRICHOR',
  obscurity: 'rare',
  definitions: {
    plain: 'The pleasant smell after rain.',
    poetic: "Earth's first breath after rain's gentle kiss.",
    riddle: 'I am born when sky meets dust, and die when you look for me.',
  },
  etymology: 'Greek petra (stone) + ichor (the fluid of the gods).',
  usage: 'The ___ rose from the pavement after the storm.',
};

const firstFade = (candidates: string[]) => candidates[0]!;

// ---------------------------------------------------------------------------
// Word Web
// ---------------------------------------------------------------------------

describe('word web', () => {
  it('solves a correct group and removes its words', () => {
    const s0 = startWordWeb(webPuzzle);
    const { state, result } = submitGroup(webPuzzle, s0, ['WAFFLE', 'PANCAKE', 'TOAST', 'BAGEL']);
    expect(result).toMatchObject({ kind: 'solved', theme: 'Breakfast', won: false });
    expect(state.remainingWords).toHaveLength(12);
    expect(state.wrongAttempts).toBe(0);
  });

  it('reports one-away when 3 of 4 match', () => {
    const s0 = startWordWeb(webPuzzle);
    const { state, result } = submitGroup(webPuzzle, s0, ['WAFFLE', 'PANCAKE', 'TOAST', 'DUNK']);
    expect(result.kind).toBe('one-away');
    expect(state.wrongAttempts).toBe(1);
  });

  it('wins after all four groups', () => {
    let s = startWordWeb(webPuzzle);
    for (const g of webPuzzle.groups) {
      s = submitGroup(webPuzzle, s, g.words).state;
    }
    expect(s.status).toBe('won');
    expect(s.remainingWords).toHaveLength(0);
  });

  it('rejects selections that are not 4 known remaining words', () => {
    const s0 = startWordWeb(webPuzzle);
    expect(submitGroup(webPuzzle, s0, ['WAFFLE']).result.kind).toBe('invalid');
    expect(submitGroup(webPuzzle, s0, ['WAFFLE', 'PANCAKE', 'TOAST', 'ZEBRA']).result.kind).toBe('invalid');
  });

  it('proximity hint reports the largest single-group overlap', () => {
    expect(proximityHint(webPuzzle, ['WAFFLE', 'PANCAKE', 'DUNK', 'FIST'])).toBe(2);
  });

  it('scores perfect and penalized games', () => {
    expect(scoreWordWeb({ wrongAttempts: 0 })).toBe(400);
    expect(scoreWordWeb({ wrongAttempts: 2 })).toBe(260);
    expect(scoreWordWeb({ wrongAttempts: 10 })).toBe(200); // penalty capped
  });
});

// ---------------------------------------------------------------------------
// Hive
// ---------------------------------------------------------------------------

describe('hive builder', () => {
  it('accepts valid words and scores pangrams with the +7 bonus', () => {
    const s0 = startHive(hivePuzzle);
    const r1 = submitHiveWord(hivePuzzle, s0, 'stare', { entropyImmune: false, fadePick: firstFade });
    expect(r1.result).toMatchObject({ kind: 'valid', points: 5, isPangram: false });
    const r2 = submitHiveWord(hivePuzzle, r1.state, 'RETAINS', { entropyImmune: false, fadePick: firstFade });
    expect(r2.result).toMatchObject({ kind: 'valid', points: 14, isPangram: true, won: true });
    expect(r2.state.status).toBe('won');
  });

  it('4-letter words score 1 point', () => {
    expect(hiveWordPoints('EARN', false)).toBe(1);
  });

  it('raises entropy and fades a letter on fake words, losing at 6', () => {
    let s = startHive(hivePuzzle);
    for (let i = 1; i <= 6; i++) {
      const { state, result } = submitHiveWord(hivePuzzle, s, `XQZE${i}A`.slice(0, 4) + 'E', {
        entropyImmune: false,
        fadePick: firstFade,
      });
      s = state;
      expect(result.kind).toBe('invalid');
    }
    expect(s.entropy).toBe(6);
    expect(s.status).toBe('lost');
    expect(s.fadedLetters.length).toBe(6);
  });

  it('does not raise entropy for mechanical slips (too short, missing center, dupes)', () => {
    const s0 = startHive(hivePuzzle);
    expect(submitHiveWord(hivePuzzle, s0, 'EAR', { entropyImmune: false, fadePick: firstFade }).state.entropy).toBe(0);
    expect(submitHiveWord(hivePuzzle, s0, 'STAT', { entropyImmune: false, fadePick: firstFade }).state.entropy).toBe(0); // no center E... STAT has no E
  });

  it('entropy immunity blocks entropy rise', () => {
    const { state, result } = submitHiveWord(hivePuzzle, startHive(hivePuzzle), 'TEAE', {
      entropyImmune: true,
      fadePick: firstFade,
    });
    expect(result.kind).toBe('invalid');
    expect(state.entropy).toBe(0);
  });

  it('blocks words that use faded letters until restored', () => {
    let s = startHive(hivePuzzle);
    s = submitHiveWord(hivePuzzle, s, 'ZEEE', { entropyImmune: false, fadePick: () => 'S' }).state;
    expect(s.fadedLetters).toContain('S');
    const blocked = submitHiveWord(hivePuzzle, s, 'STARE', { entropyImmune: false, fadePick: firstFade });
    expect(blocked.result).toMatchObject({ kind: 'invalid', reason: 'faded-letter', entropyRose: false });
    s = restoreLetter(s, 'S');
    expect(s.fadedLetters).not.toContain('S');
    expect(s.entropy).toBe(0);
    const ok = submitHiveWord(hivePuzzle, s, 'STARE', { entropyImmune: false, fadePick: firstFade });
    expect(ok.result.kind).toBe('valid');
  });

  it('foundWordScores mirrors submissions', () => {
    let s = startHive(hivePuzzle);
    s = submitHiveWord(hivePuzzle, s, 'EARN', { entropyImmune: false, fadePick: firstFade }).state;
    s = submitHiveWord(hivePuzzle, s, 'STARE', { entropyImmune: false, fadePick: firstFade }).state;
    expect(foundWordScores(hivePuzzle, s)).toEqual([1, 5]);
  });
});

// ---------------------------------------------------------------------------
// Twistle
// ---------------------------------------------------------------------------

describe('twistle', () => {
  it('finds paths for placed words and rejects impossible ones', () => {
    expect(findPath(twistlePuzzle.grid, 'STONE', twistlePuzzle.rules)).not.toBeNull();
    expect(findPath(twistlePuzzle.grid, 'PLANT', twistlePuzzle.rules)).not.toBeNull();
    expect(findPath(twistlePuzzle.grid, 'QUIZ', twistlePuzzle.rules)).toBeNull();
  });

  it('enforces the center-required twist rule', () => {
    const centerRules = { minLength: 4, centerRequired: true };
    // STONE runs along the top row and never touches the center tile (index 12 = 'X').
    expect(findPath(twistlePuzzle.grid, 'STONE', centerRules)).toBeNull();
  });

  it('wins at targetCount and counts wrong attempts', () => {
    let s = startTwistle(twistlePuzzle);
    const w1 = submitTwistleWord(twistlePuzzle, s, 'stone');
    expect(w1.result).toMatchObject({ kind: 'valid', won: false });
    const bad = submitTwistleWord(twistlePuzzle, w1.state, 'ZZZZ');
    expect(bad.result.kind).toBe('invalid');
    expect(bad.state.wrongAttempts).toBe(1);
    const w2 = submitTwistleWord(twistlePuzzle, bad.state, 'PLANT');
    expect(w2.result).toMatchObject({ kind: 'valid', won: true });
    expect(w2.state.status).toBe('won');
  });

  it('rejects duplicates without penalty', () => {
    let s = startTwistle(twistlePuzzle);
    s = submitTwistleWord(twistlePuzzle, s, 'STONE').state;
    const dup = submitTwistleWord(twistlePuzzle, s, 'STONE');
    expect(dup.result).toMatchObject({ kind: 'invalid', reason: 'already-found' });
    expect(dup.state.wrongAttempts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Forgotten Word
// ---------------------------------------------------------------------------

describe('forgotten word', () => {
  it('definition clarity scales with level', () => {
    expect(definitionForLevel(fwPuzzle, 1)).toBe(fwPuzzle.definitions.plain);
    expect(definitionForLevel(fwPuzzle, 2)).toBe(fwPuzzle.definitions.poetic);
    expect(definitionForLevel(fwPuzzle, 3)).toBe(fwPuzzle.definitions.riddle);
  });

  it('accepts the word case/punctuation-insensitively', () => {
    const s = startForgottenWord(fwPuzzle, 1);
    const { state, result } = submitGuess(fwPuzzle, s, '  petrichor! ');
    expect(result.kind).toBe('correct');
    expect(state.status).toBe('won');
  });

  it('loses after maxGuesses wrong answers, fewer at higher levels', () => {
    let s = startForgottenWord(fwPuzzle, 3);
    expect(s.maxGuesses).toBe(3);
    for (const g of ['MIST', 'OZONE', 'DEW']) s = submitGuess(fwPuzzle, s, g).state;
    expect(s.status).toBe('lost');
  });

  it('rejects repeats without consuming a guess', () => {
    let s = startForgottenWord(fwPuzzle, 1);
    s = submitGuess(fwPuzzle, s, 'MIST').state;
    const { state, result } = submitGuess(fwPuzzle, s, 'mist');
    expect(result.kind).toBe('invalid');
    expect(state.guesses).toHaveLength(1);
  });

  it('unlocking clues raises hintsUsed for scoring', () => {
    let s = startForgottenWord(fwPuzzle, 1);
    s = unlockClue(s, 'etymology');
    s = unlockClue(s, 'etymology'); // idempotent
    expect(s.unlockedClues).toEqual(['etymology']);
    expect(s.hintsUsed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Run lifecycle, glyphs, shields
// ---------------------------------------------------------------------------

describe('run lifecycle', () => {
  const baseRun = () => startRun({ runId: 'r1', seed: 42, now: 1000, activePerkIds: [] });

  it('applies perks at run start', () => {
    const run = startRun({ runId: 'r1', seed: 1, now: 0, activePerkIds: ['mind-guardian', 'expanding-mind'] });
    expect(run.maxMindPoints).toBe(4);
    expect(run.mindPoints).toBe(4); // 3 + 1 guardian + 1 boost, capped at max 4
  });

  it('shields absorb losses before mind points', () => {
    let run = { ...baseRun(), shieldCharges: 2 };
    run = loseMindPoints(run, 3);
    expect(run.shieldCharges).toBe(0);
    expect(run.mindPoints).toBe(2);
    expect(run.status).toBe('active');
  });

  it('defeat at zero mind points', () => {
    const run = loseMindPoints(baseRun(), 3);
    expect(run.mindPoints).toBe(0);
    expect(run.status).toBe('defeat');
  });

  it('boss victory levels up and grants mind points; final boss wins the run', () => {
    let run = loseMindPoints(baseRun(), 2); // down to 1
    const boss = {
      nodeId: 'boss-1', mode: 'forgotten-word' as const, puzzleId: 'fw-1',
      isBoss: true, baseScore: 300, wrongAttempts: 0, durationMs: 60_000,
    };
    const o1 = completeNode(run, boss);
    expect(o1.leveledUp).toBe(true);
    expect(o1.run.level).toBe(2);
    expect(o1.run.mindPoints).toBe(3); // 1 + 2 bonus
    const o2 = completeNode(o1.run, { ...boss, nodeId: 'boss-2' });
    const o3 = completeNode(o2.run, { ...boss, nodeId: 'boss-3' });
    expect(o3.runWon).toBe(true);
    expect(o3.run.status).toBe('victory');
  });

  it('score multiplier is consumed by the next completion', () => {
    let run = { ...baseRun(), pendingScoreMultiplier: 50 };
    const o = completeNode(run, {
      nodeId: 'n1', mode: 'word-web', puzzleId: 'w1',
      isBoss: false, baseScore: 100, wrongAttempts: 0, durationMs: 1000,
    });
    // 100 * 1.0 (mode) * 1.0 (level 1) * 1.5 = 150
    expect(o.result.score).toBe(150);
    expect(o.run.pendingScoreMultiplier).toBe(0);
  });

  it('rejects double-completion of a node', () => {
    const input = {
      nodeId: 'n1', mode: 'hive' as const, puzzleId: 'h1',
      isBoss: false, baseScore: 100, wrongAttempts: 0, durationMs: 1000,
    };
    const { run } = completeNode(baseRun(), input);
    expect(() => completeNode(run, input)).toThrow();
  });

  it('glyphs: heal caps at max, shield stacks, instant-solve refunds when unaffordable', () => {
    let run = baseRun();
    run = addGlyph(run, 'restoration').run;
    run = addGlyph(run, 'steadfast').run;
    run = addGlyph(run, 'decay').run;

    const healed = useGlyph(run, 'restoration', 'hive');
    expect(healed.run.mindPoints).toBe(3); // already at max

    const shielded = useGlyph(healed.run, 'steadfast', 'hive');
    expect(shielded.run.shieldCharges).toBe(2);

    let poor = loseMindPoints({ ...shielded.run, shieldCharges: 0 }, 2); // at 1 MP
    const refused = useGlyph(poor, 'decay', 'hive');
    expect(refused.error).toBe('insufficient-mind');
    expect(refused.run.glyphInventory).toContain('decay'); // not consumed
  });

  it('glyphs enforce mode restrictions and inventory limit', () => {
    let run = baseRun();
    run = addGlyph(run, 'momentum').run;
    expect(useGlyph(run, 'momentum', 'word-web').error).toBe('wrong-mode');
    expect(useGlyph(run, 'momentum', 'hive').run.entropyImmunityCharges).toBe(2);

    for (const id of ['vitality', 'focus', 'fortune']) run = addGlyph(run, id).run;
    expect(run.glyphInventory).toHaveLength(4);
    expect(addGlyph(run, 'clarity').added).toBe(false);
  });

  it('glyph drops are deterministic under a seeded rng and guaranteed for bosses', () => {
    const rng = createRng(7);
    const drop = rollGlyphDrop(rng, { isBoss: true });
    expect(drop).not.toBeNull();
    const again = rollGlyphDrop(createRng(7), { isBoss: true });
    expect(again!.id).toBe(drop!.id);
  });
});

// ---------------------------------------------------------------------------
// Achievements & chronicle stats
// ---------------------------------------------------------------------------

function record(overrides: Partial<RunRecord>): RunRecord {
  return {
    runId: 'r', startedAt: 0, endedAt: 60_000, outcome: 'victory', levelReached: 3,
    nodesCompleted: 5, bossesDefeated: 1, totalScore: 2000, nodeResults: [],
    glyphsEarned: [], perksUnlocked: [], ...overrides,
  };
}

describe('achievements and stats', () => {
  it('unlocks achievements from lifetime totals and maps them to perks', () => {
    const results = Array.from({ length: 5 }, (_, i) => ({
      nodeId: `n${i}`, mode: 'word-web' as const, puzzleId: `p${i}`, isBoss: false,
      won: true, score: 300, wrongAttempts: 0, durationMs: 1000, level: 1,
    }));
    const totals = computeLifetimeTotals([], results);
    const earned = checkAchievements({ earnedAchievementIds: [] }, totals);
    const ids = earned.map((a) => a.id);
    expect(ids).toContain('five-nodes'); // 5 nodes
    expect(ids).toContain('first-web'); // word web win
    expect(ids).toContain('perfectionist'); // 3+ perfect clears
    expect(ids).not.toContain('boss-slayer');
  });

  it('computes chronicle stats with streaks and per-mode aggregates', () => {
    const history: RunRecord[] = [
      record({ runId: 'a', outcome: 'defeat', endedAt: 1000, nodeResults: [
        { nodeId: 'n', mode: 'hive', puzzleId: 'p', isBoss: false, won: true, score: 500, wrongAttempts: 1, durationMs: 5000, level: 1 },
      ]}),
      record({ runId: 'b', outcome: 'victory', endedAt: 2000, totalScore: 3000 }),
      record({ runId: 'c', outcome: 'victory', endedAt: 3000 }),
      record({ runId: 'd', outcome: 'abandoned', endedAt: 4000 }),
    ];
    const stats = computeChronicleStats(history);
    expect(stats.totalRuns).toBe(4);
    expect(stats.victories).toBe(2);
    expect(stats.bestRunScore).toBe(3000);
    expect(stats.currentStreak).toBe(2); // abandoned runs don't break streaks
    expect(stats.bestStreak).toBe(2);
    expect(stats.byMode.hive.played).toBe(1);
    expect(stats.byMode.hive.bestScore).toBe(500);
  });

  it('run records capture outcome and boss count', () => {
    let run = startRun({ runId: 'r9', seed: 1, now: 0, activePerkIds: [] });
    run = { ...run, level: 2, status: 'defeat' as const };
    const rec = toRunRecord(run, [], { endedAt: 100, glyphsEarned: [], perksUnlocked: [] });
    expect(rec.outcome).toBe('defeat');
    expect(rec.bossesDefeated).toBe(1); // reached level 2 = one boss down
  });
});
