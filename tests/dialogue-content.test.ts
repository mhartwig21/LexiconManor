import { describe, expect, it } from 'vitest';
import type { CharacterId } from '../src/engine/types';
import { CHARACTER_IDS } from '../src/engine/types';
import type { DialogueQuery, GameEvent, RecordedEvent } from '../src/engine/events';
import type { DialogueNode } from '../src/engine/dialogue/schema';
import { isSubstantive, MAX_LINE_CHARS } from '../src/engine/dialogue/schema';
import { selectDialogue, findNode } from '../src/engine/dialogue/select';
import { validateDialogueSet } from '../src/engine/dialogue/validate';
import { DIALOGUE_FILES, getDialogueFile } from '../src/engine/dialogue/content';
import { deriveLegibleFragmentCount } from '../src/engine/dialogue/conditions';
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
