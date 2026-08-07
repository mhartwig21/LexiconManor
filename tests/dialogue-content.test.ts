import { describe, expect, it } from 'vitest';
import type { CharacterId } from '../src/engine/types';
import { CHARACTER_IDS } from '../src/engine/types';
import type { DialogueQuery, GameEvent, RecordedEvent } from '../src/engine/events';
import type { DialogueNode } from '../src/engine/dialogue/schema';
import { isSubstantive, MAX_LINE_CHARS } from '../src/engine/dialogue/schema';
import { selectDialogue, findNode, selectTaggedLine } from '../src/engine/dialogue/select';
import { validateDialogueSet } from '../src/engine/dialogue/validate';
import { DIALOGUE_FILES, getDialogueFile } from '../src/engine/dialogue/content';
import { deriveLegibleFragmentCount } from '../src/engine/dialogue/conditions';
import { DEDUCTION_FLOOR } from '../src/engine/journal';
import { ROW_NAMES } from '../src/engine/economy/steps';

/**
 * A6 — the authored Volume 1 cast, held to the AAA bar:
 *  - the build validator passes over the real JSON (AAA 5.5, 5.11, flags.md)
 *  - Hypnos floor: Bramble's day-end reaction bucket (AAA 5.2)
 *  - Dewey has zero spoken lines, forever (AAA 5.6)
 *  - 15-day greedy-talker simulation: zero repeated substantive
 *    conversations; repeats land only in the idle pool (AAA 5.3), and no
 *    character ever falls silent (Supergiant's rule).
 */

const ALL_FILES = Object.values(DIALOGUE_FILES);

describe('authored content passes the build validator', () => {
  it('validateDialogueSet reports zero issues', () => {
    const issues = validateDialogueSet(ALL_FILES);
    expect(issues.map((i) => `[${i.file}] ${i.nodeId ?? ''} ${i.message}`)).toEqual([]);
  });

  it('every character file is present and self-consistent', () => {
    for (const id of CHARACTER_IDS) {
      expect(DIALOGUE_FILES[id].character).toBe(id);
      expect(DIALOGUE_FILES[id].nodes.length).toBeGreaterThan(0);
    }
  });

  it('longest authored line fits the 390px box budget (AAA 5.11)', () => {
    for (const f of ALL_FILES) {
      for (const n of f.nodes) {
        for (const line of n.lines) {
          expect(line.text.length).toBeLessThanOrEqual(MAX_LINE_CHARS);
        }
      }
    }
  });

  it('Dewey never speaks — narration only, forever (AAA 5.6)', () => {
    for (const n of DIALOGUE_FILES.dewey.nodes) {
      for (const line of n.lines) expect(line.narration).toBe(true);
      expect(n.choices ?? []).toEqual([]);
    }
  });

  /**
   * ═══ THE ENDEARMENT BUDGET (round 12; deferred since round 7) ════════════
   *
   * A term of address is the loudest and cheapest voice marker a cast has, and
   * three of the four speaking characters were spending the same one: the
   * housekeeper said "dear" 9 times, the ghost librarian 12, the postmistress
   * 14. Thirty-five vocatives, one word — the cast read as one writer doing
   * three accents, which is the exact failure AAA §5's Hades benchmark exists
   * to prevent (Hypnos, Nyx and Achilles do not share a pet name).
   *
   * The budget is a PARTITION: every endearment the game knows belongs to at
   * most one voice, so a new line cannot quietly borrow somebody else's word.
   * Fern, the Portrait and Dewey are deliberately empty — terseness is their
   * characterisation.
   *
   * Vocatives only. "You're becoming rather dear to this household", "a rule I
   * hold dear", "a parcel wrapped in love" and "one step for a pet" are the
   * ordinary words doing ordinary work, and are matched away by requiring the
   * term to sit against sentence punctuation, the way an address does.
   */
  const ENDEARMENT_BUDGET: Record<CharacterId, readonly string[]> = {
    bramble: ['pet'],
    ellery: ['dear'],
    posy: ['love', 'dear heart'],
    fern: [],
    portrait: [],
    dewey: [],
  };

  /** Every endearment the house knows — longest first, so "dear heart" wins
   *  the match before "dear" can claim its first word. */
  const ENDEARMENTS = [
    'dear heart', 'sweetheart', 'darling', 'poppet', 'dearie', 'ducky',
    'petal', 'treasure', 'dear', 'love', 'pet', 'duck', 'lamb', 'chick',
  ];
  const VOCATIVE = new RegExp(
    // preceded by the punctuation an address leans on, followed by the
    // punctuation that closes one (or the end of the line).
    String.raw`(?:^|[,—–:;]\s*)(${ENDEARMENTS.join('|')})\b(?=[\s]*(?:[,.!?—–…]|$))`,
    'giu',
  );

  const vocativesIn = (text: string): string[] => {
    const found: string[] = [];
    for (const m of text.matchAll(VOCATIVE)) found.push(m[1]!.toLowerCase());
    return found;
  };

  const authoredStrings = (id: CharacterId): { where: string; text: string }[] => {
    const out: { where: string; text: string }[] = [];
    for (const n of DIALOGUE_FILES[id].nodes) {
      n.lines.forEach((l, i) => out.push({ where: `${n.id}.lines[${i}]`, text: l.text }));
      (n.choices ?? []).forEach((c, i) => out.push({ where: `${n.id}.choices[${i}]`, text: c.text }));
      if (n.summary) out.push({ where: `${n.id}.summary`, text: n.summary });
    }
    return out;
  };

  it('no two voices share a term of endearment (the budget is a partition)', () => {
    const owner = new Map<string, CharacterId>();
    for (const id of CHARACTER_IDS) {
      for (const term of ENDEARMENT_BUDGET[id]) {
        expect(owner.get(term), `"${term}" is claimed twice`).toBeUndefined();
        owner.set(term, id);
      }
    }
  });

  it('every character addresses the player only in their own words (AAA 5.x voice)', () => {
    const trespasses: string[] = [];
    for (const id of CHARACTER_IDS) {
      const mine = new Set(ENDEARMENT_BUDGET[id]);
      for (const { where, text } of authoredStrings(id)) {
        for (const term of vocativesIn(text)) {
          if (!mine.has(term)) trespasses.push(`${id} @ ${where}: "${term}" — ${text}`);
        }
      }
    }
    expect(trespasses).toEqual([]);
  });

  it('the voices that own a word actually use it (no dead budget entry)', () => {
    for (const id of CHARACTER_IDS) {
      if (ENDEARMENT_BUDGET[id].length === 0) continue;
      const used = new Set(authoredStrings(id).flatMap((s) => vocativesIn(s.text)));
      for (const term of ENDEARMENT_BUDGET[id]) {
        expect(used.has(term), `${id} is budgeted "${term}" and never says it`).toBe(true);
      }
    }
  });

  it('the matcher is really looking (guards against a regex that finds nothing)', () => {
    // The shape it must catch, and the four ordinary uses it must not.
    expect(vocativesIn('Redraft, love. The best correspondents win.')).toEqual(['love']);
    expect(vocativesIn('Open, pet. I dusted past that thing for thirty years.')).toEqual(['pet']);
    expect(vocativesIn('The afternoon sort waits for no one, dear heart — not even you.'))
      .toEqual(['dear heart']);
    expect(vocativesIn('You’re becoming rather dear to this household.')).toEqual([]);
    expect(vocativesIn('every rule of conservation I hold dear')).toEqual([]);
    expect(vocativesIn('a parcel wrapped in love from one wrapped in duty')).toEqual([]);
    expect(vocativesIn('One step for a pet is the best exchange rate in the building.'))
      .toEqual([]);
    // …and the corpus is not silent: somebody, somewhere, says something warm.
    const all = CHARACTER_IDS.flatMap((id) => authoredStrings(id).flatMap((s) => vocativesIn(s.text)));
    expect(all.length).toBeGreaterThanOrEqual(20);
  });

  it('Hypnos floor: Bramble ships >=12 day-end-cause reactions (AAA 5.2)', () => {
    const dayEnd = DIALOGUE_FILES.bramble.nodes.filter((n) =>
      (n.conditions ?? []).some((c) => c.kind === 'event' && c.event === 'day-ended'));
    expect(dayEnd.length).toBeGreaterThanOrEqual(12);
    // ...including one per anchor-room archetype the player went dry in.
    for (const kind of ['word-web', 'hive', 'twistle', 'forgotten-word']) {
      expect(dayEnd.some((n) =>
        (n.conditions ?? []).some((c) =>
          c.kind === 'event' && c.event === 'room-abandoned' && c.where?.['kind'] === kind),
      )).toBe(true);
    }
  });

  it('every substantive morning/parlor node is once-only — repeats can land only in idle/reaction pools (AAA 5.3)', () => {
    for (const f of ALL_FILES) {
      for (const n of f.nodes) {
        if (isSubstantive(n)) expect(n.once, `${n.id} must be once`).toBe(true);
      }
    }
  });

  it('locked-rank favor quests exist for >=3 characters (AAA 5.8)', () => {
    const questFinishers = ALL_FILES.flatMap((f) => f.nodes).filter((n) =>
      /\.quest1\.done$/.test(n.id));
    expect(questFinishers.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * ═══ THE STOREY COUNT (round 13, AAA 4.16 / 4.10c) ═══════════════════════
   *
   * `portrait.arrive.first` — the one authored line that celebrates the climb —
   * opened "Seven storeys of other people's rooms". `MANOR_ROWS` is 7, but row
   * 6 is the SANCTUM: sealed, never drafted, never entered, and emphatically
   * not other people's. `ROW_NAMES` lists exactly six storeys below it, so she
   * has climbed six. This is the same off-by-one storey that AAA 4.10c's
   * round-6 correction and steps.ts's round-7 correction were both written
   * about, and it survived in the good version of the line while
   * `FALLBACK_ARRIVALS.first` — which avoids the number — was correct.
   *
   * Three drifts in three files across two rounds is a pattern, so the number
   * is now pinned to its source rather than to a reviewer noticing. Any
   * authored line naming a count of storeys must name the climbable count.
   */
  it('no authored line miscounts the storeys of the house (AAA 4.10c)', () => {
    const WORDS: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
      seven: 7, eight: 8, nine: 9, ten: 10,
    };
    // Row 6 is the Sanctum itself, which is never drafted and never entered —
    // so the storeys of OTHER PEOPLE'S rooms are ROW_NAMES minus that one.
    const climbable = ROW_NAMES.length - 1;
    const pattern = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten)[\s-]+(?:storey|storeys|story|stories|floor|floors)\b/gi;
    const offenders: string[] = [];
    let sawAny = false;
    for (const f of ALL_FILES) {
      for (const n of f.nodes) {
        for (const line of n.lines) {
          for (const m of line.text.matchAll(pattern)) {
            sawAny = true;
            const raw = m[1]!.toLowerCase();
            const n0 = WORDS[raw] ?? Number.parseInt(raw, 10);
            if (n0 !== climbable) offenders.push(`${n.id}: "${m[0]}" (expected ${climbable})`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
    // A lint that matches nothing passes forever (the round-12 lesson): the
    // celebrated climb line must actually be in the corpus for this to bite.
    expect(sawAny, 'the storey-count lint matched no authored line at all').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AAA 5.1 — REACTION LATENCY: the system sees you, at the NEXT opportunity.
// ---------------------------------------------------------------------------

/**
 * ═══ ROUND 14: THE TWO BIGGEST THINGS THAT HAPPEN, AND NOBODY MENTIONED THEM ═
 *
 * 5.1 asks for a scripted test over ten event types. There was none — the
 * corpus's reaction coverage was only ever checked in aggregate by the 15-day
 * greedy sim, which cannot tell "somebody said something" from "somebody said
 * something ABOUT THAT". Two states slipped through the gap, and they are the
 * two the player spends the most time in:
 *
 *   1. `vol.<id>.landing-reached` — written by SanctumView the first time she
 *      stands at the Sanctum door, whitelisted in the validator's CODE_SET_FLAGS
 *      *with a comment inviting authored content to condition on it*, and gated
 *      by NOT ONE NODE in any of the six files. 4.10c calls that arrival "a
 *      campaign event, not a Tuesday"; the morning after, the house said
 *      nothing.
 *   2. A FULL, LEGIBLE FILE. Nothing anywhere was gated above
 *      `portrait.arc.read` at `fragmentsLegible >= 6`, so the knowing-but-
 *      locked-out stretch — measured median 7 evenings, p90 17 for
 *      PROFILE_DECENT — had no line in it either.
 *
 * Every row below is scripted: one state, one character, one slot, and an
 * assertion that the node selected POSITIVELY REQUIRES that state. "A node was
 * returned" is not a pass — the never-silence fallback always returns one.
 */
describe('reaction latency: every notable state is spoken to (AAA 5.1)', () => {
  /** Warmed-up save: the forced first-meeting chain is behind her, so what
   *  wins is the reaction and not the introduction. */
  const meetsSeen = (id: CharacterId): Set<string> =>
    new Set(DIALOGUE_FILES[id].nodes.filter((n) => /\.meet\./.test(n.id)).map((n) => n.id));

  interface Shape {
    what: string;
    character: CharacterId;
    slot: DialogueQuery['slot'];
    events?: GameEvent[];
    flags?: string[];
    fragments?: number;
    /**
     * The valve is already spent with this character today. Gifting HAPPENS
     * inside a conversation, so the next opportunity after a gift is the
     * retargeted idle pool — which is exactly where the thank-you beats live.
     */
    talkedToday?: CharacterId[];
    /** Does the picked node positively require the thing that just happened? */
    requires: (n: DialogueNode) => boolean;
  }

  const requiresEvent = (type: GameEvent['type']) => (n: DialogueNode) =>
    (n.conditions ?? []).some((c) => c.kind === 'event' && c.event === type);
  const requiresFlag = (flag: string) => (n: DialogueNode) =>
    (n.conditions ?? []).some((c) => c.kind === 'flag' && c.flag === flag);
  const requiresLegible = (gte: number) => (n: DialogueNode) =>
    (n.conditions ?? []).some((c) => c.kind === 'fragmentsLegible' && (c.gte ?? 0) >= gte);

  const LANDING = 'vol.volume-1.landing-reached';

  const SHAPES: Shape[] = [
    // ── the ten event types (5.1's scripted list) ──────────────────────────
    { what: 'a fragment filed', character: 'bramble', slot: 'morning',
      events: [{ type: 'fragment-found', fragmentId: 'v1-d1' }],
      requires: requiresEvent('fragment-found') },
    { what: 'the day ran out of steps', character: 'bramble', slot: 'morning',
      events: [{ type: 'day-ended', day: 1, cause: 'steps-exhausted' }],
      requires: requiresEvent('day-ended') },
    { what: 'a room left for tomorrow', character: 'bramble', slot: 'morning',
      events: [{ type: 'room-abandoned', cellKey: '1,1', kind: 'word-web' }],
      requires: requiresEvent('room-abandoned') },
    { what: 'a pangram', character: 'bramble', slot: 'morning',
      events: [{ type: 'room-notable', kind: 'hive', note: 'pangram' }],
      requires: requiresEvent('room-notable') },
    { what: 'a perfect solve', character: 'bramble', slot: 'morning',
      events: [{ type: 'room-solved', cellKey: '1,1', kind: 'word-web', tier: 1, perfect: true }],
      requires: requiresEvent('room-solved') },
    { what: 'a wrong word at the door', character: 'portrait', slot: 'sanctum-after-guess',
      events: [{ type: 'sanctum-guess-wrong', guess: 'CANDLE',
        closeness: { sharedLetters: 0, rightLength: false, repeat: false } }],
      requires: requiresEvent('sanctum-guess-wrong') },
    { what: 'the volume won', character: 'portrait', slot: 'sanctum-after-guess',
      events: [{ type: 'volume-solved', volumeId: 'volume-1' }],
      requires: requiresEvent('volume-solved') },
    // The letter aside plays on its own slot, mounted by the journal the
    // instant the seal is broken — the next opportunity is immediate.
    { what: 'a letter opened', character: 'posy', slot: 'letter',
      events: [{ type: 'letter-opened', letterId: 'l1' }],
      requires: requiresEvent('letter-opened') },
    { what: 'a bookmark gifted', character: 'fern', slot: 'parlor',
      events: [{ type: 'gift-given', character: 'fern' }],
      talkedToday: ['fern'], requires: requiresEvent('gift-given') },
    { what: 'the cat petted', character: 'fern', slot: 'parlor',
      events: [{ type: 'dewey-petted' }],
      requires: requiresEvent('dewey-petted') },
    { what: 'an affinity rank-up', character: 'ellery', slot: 'parlor',
      events: [{ type: 'affinity-rank-up', character: 'ellery', rank: 2 }],
      requires: requiresEvent('affinity-rank-up') },
    { what: 'a fragment interpreted', character: 'ellery', slot: 'parlor',
      events: [{ type: 'fragment-interpreted', fragmentId: 'v1-d1' }],
      requires: requiresEvent('fragment-interpreted') },

    // ── the two round-14 shapes ────────────────────────────────────────────
    { what: 'she stood at the Sanctum door (morning after)',
      character: 'bramble', slot: 'morning', flags: [LANDING],
      requires: requiresFlag(LANDING) },
    { what: 'she stood at the Sanctum door (the librarian heard)',
      character: 'ellery', slot: 'parlor', flags: [LANDING],
      requires: requiresFlag(LANDING) },
    { what: 'she stood at the Sanctum door (the groundskeeper heard)',
      character: 'fern', slot: 'parlor', flags: [LANDING],
      requires: requiresFlag(LANDING) },
    { what: 'a full, legible file — she knows it', character: 'ellery', slot: 'parlor',
      fragments: DEDUCTION_FLOOR, requires: requiresLegible(DEDUCTION_FLOOR) },
  ];

  const queryFor = (s: Shape): DialogueQuery => {
    const flags = new Set<string>([`met.${s.character}`, ...(s.flags ?? [])]);
    const seen = meetsSeen(s.character);
    return {
      day: 12, slot: s.slot, character: s.character,
      seen, flags,
      affinities: { bramble: 4, ellery: 4, posy: 4, fern: 4, dewey: 0, portrait: 4 },
      counters: {},
      recentEvents: (s.events ?? []).map((event) => ({ day: 12, at: 0, event })),
      talkedToday: new Set<CharacterId>(s.talkedToday ?? []),
      giftedToday: new Set<CharacterId>(),
      volumeId: 'volume-1',
      fragmentsFound: s.fragments ?? 0,
      fragmentsLegible: deriveLegibleFragmentCount('volume-1', flags, s.fragments ?? 0),
    };
  };

  for (const s of SHAPES) {
    it(`${s.character} speaks to it: ${s.what}`, () => {
      const picked = selectDialogue(getDialogueFile(s.character), queryFor(s));
      expect(picked, `${s.character} said nothing at all`).toBeDefined();
      expect(
        s.requires(picked!),
        `${s.character} picked "${picked!.id}", which is not conditioned on ${s.what}`,
      ).toBe(true);
    });
  }

  it('covers at least the ten event types 5.1 asks for', () => {
    const evented = new Set(SHAPES.flatMap((s) => (s.events ?? []).map((e) => e.type)));
    expect(evented.size).toBeGreaterThanOrEqual(10);
  });

  /**
   * The Portrait's half of the knowing-but-locked-out shape. His line is
   * RENDERED on the stairwell rather than played (selectTaggedLine, no valve
   * spent), so it is selected the way the screen selects it, not by proxy.
   */
  it('the Portrait speaks to a player who knows the word and is downstairs', () => {
    const portrait = getDialogueFile('portrait');
    const q = (legible: number): DialogueQuery => ({
      ...queryFor({ what: '', character: 'portrait', slot: 'sanctum-idle', requires: () => true }),
      fragmentsFound: legible, fragmentsLegible: legible,
    });
    expect(selectTaggedLine(portrait, q(0), 'portrait.stair.')?.id).toBe('portrait.stair.away');
    expect(selectTaggedLine(portrait, q(DEDUCTION_FLOOR), 'portrait.stair.')?.id)
      .toBe('portrait.stair.knows');
  });

  /**
   * AAA 4.16 on the live selection path, not just on the JSON: the door has a
   * sympathetic line for EVERY count below the deduction floor and stands down
   * exactly at it. (The band-tiling proof lives in tests/journal.test.ts; this
   * is the same claim made through `selectTaggedLine`, which is what the screen
   * actually calls.)
   */
  it('the door is never silent below the deduction floor (AAA 4.16)', () => {
    const portrait = getDialogueFile('portrait');
    const q = (legible: number): DialogueQuery => ({
      ...queryFor({ what: '', character: 'portrait', slot: 'sanctum-idle', requires: () => true }),
      fragmentsFound: legible, fragmentsLegible: legible,
    });
    for (let n = 0; n < DEDUCTION_FLOOR; n++) {
      expect(
        selectTaggedLine(portrait, q(n), 'portrait.gate.'),
        `nothing to say to a player holding ${n} readable pages`,
      ).toBeDefined();
    }
    expect(selectTaggedLine(portrait, q(DEDUCTION_FLOOR), 'portrait.gate.')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 15-day greedy-talker simulation (AAA 5.3) over the real authored content.
// Models the requested event-retention semantics: the closing day's events
// stay visible through the following morning (AAA 5.2 requires it — see the
// A6 report's shared-file request on pruneEventsAtDusk).
// ---------------------------------------------------------------------------

type DayEvents = GameEvent[];

const closeness = (sharedLetters = 0, rightLength = false, repeat = false) =>
  ({ sharedLetters, rightLength, repeat });

/** A realistic, varied fortnight: mixed day-end causes, drip of discoveries. */
const SCHEDULE: Record<number, DayEvents> = {
  1: [{ type: 'fragment-found', fragmentId: 'f1' },
      { type: 'day-ended', day: 1, cause: 'steps-exhausted' }],
  2: [{ type: 'room-solved', cellKey: 'a', kind: 'word-web', tier: 1, perfect: true },
      { type: 'day-ended', day: 2, cause: 'retired-early' }],
  3: [{ type: 'sanctum-guess-wrong', guess: 'candle', closeness: closeness() },
      { type: 'room-abandoned', cellKey: 'b', kind: 'word-web' },
      { type: 'day-ended', day: 3, cause: 'steps-exhausted' }],
  4: [{ type: 'room-solved', cellKey: 'c', kind: 'hive', tier: 1, perfect: false },
      { type: 'letter-opened', letterId: 'l1' },
      { type: 'day-ended', day: 4, cause: 'steps-exhausted' }],
  5: [{ type: 'room-notable', kind: 'hive', note: 'pangram' },
      { type: 'day-ended', day: 5, cause: 'retired-early' }],
  6: [{ type: 'sanctum-guess-wrong', guess: 'lantern', closeness: closeness(3) },
      { type: 'dewey-petted' },
      { type: 'room-abandoned', cellKey: 'd', kind: 'hive' },
      { type: 'day-ended', day: 6, cause: 'steps-exhausted' }],
  7: [{ type: 'fragment-found', fragmentId: 'f2' },
      { type: 'gift-given', character: 'ellery' },
      { type: 'day-ended', day: 7, cause: 'steps-exhausted' }],
  8: [{ type: 'room-notable', kind: 'hive', note: 'tier-up:Full Bloom' },
      { type: 'room-abandoned', cellKey: 'e', kind: 'twistle' },
      { type: 'day-ended', day: 8, cause: 'steps-exhausted' }],
  9: [{ type: 'sanctum-guess-wrong', guess: 'inkwell', closeness: closeness(1, true) },
      { type: 'room-abandoned', cellKey: 'f', kind: 'forgotten-word' },
      { type: 'day-ended', day: 9, cause: 'steps-exhausted' }],
  10: [{ type: 'room-solved', cellKey: 'g', kind: 'word-web', tier: 2, perfect: false },
       { type: 'affinity-rank-up', character: 'ellery', rank: 2 },
       { type: 'day-ended', day: 10, cause: 'retired-early' }],
  11: [{ type: 'fragment-found', fragmentId: 'f3' },
       { type: 'day-ended', day: 11, cause: 'steps-exhausted' }],
  12: [{ type: 'sanctum-guess-wrong', guess: 'candle', closeness: closeness(0, false, true) },
       { type: 'room-solved', cellKey: 'h', kind: 'hive', tier: 2, perfect: true },
       { type: 'day-ended', day: 12, cause: 'steps-exhausted' }],
  13: [{ type: 'letter-opened', letterId: 'l2' },
       { type: 'room-solved', cellKey: 'i', kind: 'twistle', tier: 2, perfect: false },
       { type: 'day-ended', day: 13, cause: 'steps-exhausted' }],
  14: [{ type: 'room-notable', kind: 'hive', note: 'every-petal' },
       { type: 'day-ended', day: 14, cause: 'retired-early' }],
  15: [{ type: 'fragment-found', fragmentId: 'f4' },
       { type: 'day-ended', day: 15, cause: 'steps-exhausted' }],
};

interface SimResult {
  substantivePicks: { day: number; character: CharacterId; nodeId: string }[];
  silences: { day: number; character: CharacterId; slot: string }[];
  brambleReactionCount: number;
  guessSighs: string[];
}

function runGreedySim(days: number): SimResult {
  const seen = new Set<string>();
  const flags = new Set<string>();
  const affinities: Record<CharacterId, number> = {
    bramble: 0, ellery: 0, posy: 0, fern: 0, dewey: 0, portrait: 0,
  };
  const counters: Partial<Record<GameEvent['type'], number>> = {};
  const result: SimResult = {
    substantivePicks: [], silences: [], brambleReactionCount: 0, guessSighs: [],
  };
  let fragments = 0;

  const stamp = (day: number, evs: DayEvents): RecordedEvent[] =>
    evs.map((event) => ({ day, at: 0, event }));

  for (let day = 1; day <= days; day++) {
    const today = SCHEDULE[day] ?? [];
    const yesterday = SCHEDULE[day - 1] ?? [];
    for (const e of today) counters[e.type] = (counters[e.type] ?? 0) + 1;
    fragments += today.filter((e) => e.type === 'fragment-found').length;
    const talkedToday = new Set<CharacterId>();
    const sameDayDialogue: RecordedEvent[] = [];

    // Greedy: gift every character daily (valve allows one each).
    for (const c of CHARACTER_IDS) {
      if (c === 'dewey') continue;
      flags.add(`sys.first-gift.${c}`);
      affinities[c] += 1;
    }

    const visit = (character: CharacterId, slot: DialogueQuery['slot'], events: RecordedEvent[]) => {
      const q: DialogueQuery = {
        day, slot, character,
        seen: new Set(seen), flags: new Set(flags),
        affinities: { ...affinities },
        counters: { ...counters },
        recentEvents: [...events, ...sameDayDialogue],
        talkedToday: new Set(talkedToday),
        giftedToday: new Set<CharacterId>(),
        volumeId: 'volume-1',
        fragmentsFound: fragments,
        // Derived the way the slice derives it, not hardcoded: this sweep sets
        // no `sealed-` flags, so it resolves to `fragments` today and starts
        // modelling the seal for free the moment the sweep does set them.
        fragmentsLegible: deriveLegibleFragmentCount('volume-1', flags, fragments),
      };
      const file = getDialogueFile(character);
      const picked = selectDialogue(file, q);
      if (!picked) {
        result.silences.push({ day, character, slot });
        return;
      }
      const play = (n: DialogueNode) => {
        seen.add(n.id);
        sameDayDialogue.push({ day, at: 0, event: { type: 'dialogue-seen', nodeId: n.id, character } });
        for (const [who, d] of Object.entries(n.effects?.affinity ?? {})) {
          affinities[who as CharacterId] += d ?? 0;
        }
        for (const fl of n.effects?.setFlags ?? []) flags.add(fl);
        const first = n.choices?.[0];
        if (first) {
          for (const [who, d] of Object.entries(first.effects?.affinity ?? {})) {
            affinities[who as CharacterId] += d ?? 0;
          }
          for (const fl of first.effects?.setFlags ?? []) flags.add(fl);
          const next = first.goto ? findNode(file, first.goto) : undefined;
          if (next) play(next);
        }
      };
      if (isSubstantive(picked)) {
        talkedToday.add(character);
        result.substantivePicks.push({ day, character, nodeId: picked.id });
        if (character === 'bramble' && picked.priority >= 600 && picked.priority < 1000) {
          result.brambleReactionCount++;
        }
      }
      if (character === 'portrait' && slot === 'sanctum-after-guess') {
        result.guessSighs.push(picked.id);
      }
      play(picked);
    };

    // Morning: Bramble in the Entrance Hall (yesterday's events only).
    visit('bramble', 'morning', stamp(day - 1, yesterday));
    // Daytime parlor rounds (yesterday + today visible on the stream).
    const daytime = [...stamp(day - 1, yesterday), ...stamp(day, today)];
    for (const c of ['ellery', 'posy', 'fern', 'dewey', 'portrait'] as CharacterId[]) {
      visit(c, 'parlor', daytime);
    }
    // A wrong guess today → the Portrait sighs at the door.
    if (today.some((e) => e.type === 'sanctum-guess-wrong')) {
      visit('portrait', 'sanctum-after-guess', daytime);
    }
  }

  return result;
}

describe('15-day greedy-talker simulation (AAA 5.3)', () => {
  const sim = runGreedySim(15);

  it('zero repeated substantive conversations across the fortnight', () => {
    const ids = sim.substantivePicks.map((p) => p.nodeId);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect([...new Set(dupes)]).toEqual([]);
  });

  it('no character ever falls silent — idle fallback always answers', () => {
    expect(sim.silences).toEqual([]);
  });

  it("Bramble's morning recap reacts on most mornings (the Hypnos slot lives)", () => {
    expect(sim.brambleReactionCount).toBeGreaterThanOrEqual(8);
  });

  it('the Portrait sighs distinctly for each closeness shade (AAA 4.17)', () => {
    expect(sim.guessSighs.length).toBeGreaterThanOrEqual(4);
    expect(new Set(sim.guessSighs).size).toBe(sim.guessSighs.length);
  });

  it('the arcs actually progress: quests start and finish inside the fortnight', () => {
    const ids = new Set(sim.substantivePicks.map((p) => p.nodeId));
    expect(ids.has('ellery.quest1.ask')).toBe(true);
    expect(ids.has('fern.quest1.ask')).toBe(true);
    expect(ids.has('posy.quest1.ask')).toBe(true);
  });
});
