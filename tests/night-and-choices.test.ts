/**
 * THE NIGHT, AND PLAYER CHOICE (REVIEW_AA §5.11) — OWNER: A6 (Dialogue).
 *
 * Two censuses drove this round, and both are pinned here so neither can drift
 * back:
 *
 *   1. THE NIGHT. `NIGHT_LINES` was a three-entry Record keyed by end cause.
 *      Six consecutive nights were driven live and printed exactly two
 *      strings, alternating by nothing but why the day stopped, over a step
 *      total and two unread badges. The engine had declared a `night` trigger
 *      since the spine was written and `TRIGGER_MOUNTS` ended with its own
 *      confession: "'night' has no mount for anyone yet". So the day ended in
 *      a receipt, every day, forever.
 *
 *   2. THE CHOICES. 20 in the whole game, across 10 nodes of 253 — every one
 *      inside a first meeting (5), an arc opener (2) or a quest accept (3),
 *      i.e. all of them spent by about day five of a 22-day volume. The count
 *      is defensible; a pool that empties PERMANENTLY is not.
 *
 * The tests below are about the properties, not the prose: that the night
 * remembers the day, that it fits the digest, and that the verb menu is still
 * standing in week three with something on it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CharacterId } from '../src/engine/types';
import type { DialogueQuery, GameEvent, RecordedEvent } from '../src/engine/events';
import type { DialogueNode } from '../src/engine/dialogue/schema';
import { DIALOGUE_FILES, getDialogueFile } from '../src/engine/dialogue/content';
import {
  availableChoices, resolveChoiceTarget, selectAskMenu, selectTaggedLine,
} from '../src/engine/dialogue/select';
import { ASK_MENU_CHARACTERS, NIGHT_FLOOR, TRIGGER_MOUNTS } from '../src/engine/dialogue/validate';

const ALL_FILES = Object.values(DIALOGUE_FILES);

/** The prefix the night digest quotes. Stated once, here and in the screen. */
const NIGHT_PREFIX = 'bramble.night.';

function query(over: Partial<DialogueQuery> = {}): DialogueQuery {
  return {
    day: 4,
    slot: 'night',
    character: 'bramble',
    seen: new Set<string>(),
    flags: new Set<string>(['met.bramble']),
    affinities: { bramble: 3, ellery: 3, posy: 3, fern: 3, dewey: 0, portrait: 3 },
    counters: {},
    recentEvents: [],
    talkedToday: new Set<CharacterId>(),
    giftedToday: new Set<CharacterId>(),
    volumeId: 'volume-1',
    fragmentsFound: 4,
    fragmentsLegible: 4,
    ...over,
  };
}

const stamp = (day: number, events: GameEvent[]): RecordedEvent[] =>
  events.map((event) => ({ day, at: 0, event }));

// ---------------------------------------------------------------------------
// 1. Somebody says goodnight
// ---------------------------------------------------------------------------

describe('the night is mounted, and it is a person (REVIEW_AA §5.11)', () => {
  it('the night trigger has a real mount, and only Bramble authors for it', () => {
    expect(TRIGGER_MOUNTS.bramble.night).toMatch(/DayTransitions\.tsx/);
    for (const f of ALL_FILES) {
      if (f.character === 'bramble') continue;
      expect(f.nodes.some((n) => n.trigger === 'night')).toBe(false);
    }
  });

  it('the digest quotes the night family and can never fall through to a daytime line', () => {
    // selectTaggedLine is the AAA 4.16 render path: no valve, no never-silence
    // fallback into the idle pool. A bedtime screen printing "Watering hour.
    // Can't talk through it." is the failure this shape rules out.
    const picked = selectTaggedLine(getDialogueFile('bramble'), query(), NIGHT_PREFIX);
    expect(picked?.id.startsWith(NIGHT_PREFIX)).toBe(true);
  });

  it('the pool clears its floors, and every beat fits the digest', () => {
    const night = getDialogueFile('bramble').nodes.filter((n) => n.trigger === 'night');
    expect(night.length).toBeGreaterThanOrEqual(NIGHT_FLOOR.minNodes);
    expect(night.filter((n) => (n.conditions ?? []).length > 0).length)
      .toBeGreaterThanOrEqual(NIGHT_FLOOR.minReactive);
    for (const n of night) {
      expect(n.lines.length, n.id).toBeLessThanOrEqual(NIGHT_FLOOR.maxLines);
      for (const l of n.lines) expect(l.text.length, n.id).toBeLessThanOrEqual(NIGHT_FLOOR.maxChars);
    }
  });

  /**
   * The nags are off the night. Asserted on the source because the property is
   * about WHICH SCENE renders them, and both scenes live in one file: the
   * digest keeps the mood line, the ledger and the goodnight; the waiting post
   * and the mantel open the day they can be acted on. (Live: driven across
   * eight consecutive nights at 390×844, no digest printed "post tray",
   * "mantel" or "cabinet".)
   */
  it('the night digest no longer carries the unread nags', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'ui', 'chrome', 'DayTransitions.tsx'), 'utf8');
    const digest = src.slice(src.indexOf('export function NightDigest'));
    expect(digest).not.toMatch(/waitingPostLine|mantelLine|WaitingLines/);
    const morning = src.slice(src.indexOf('export function MorningCard'), src.indexOf('export function DuskVeil'));
    expect(morning).toMatch(/<WaitingLines/);
  });

  /**
   * The old night could be reproduced from the end cause alone. This asserts
   * the opposite property: the SAME end cause, with different days behind it,
   * must give different goodnights.
   */
  it('the same end cause with a different day behind it says something different', () => {
    const file = getDialogueFile('bramble');
    const base: GameEvent[] = [{ type: 'day-ended', day: 4, cause: 'steps-exhausted' }];
    // A fortnight in, so the once-only FIRSTS have all been spent — this is
    // about the ordinary pool telling the days apart.
    const veteran = {
      'room-solved': 9, 'room-abandoned': 6, 'fragment-found': 5,
      'sanctum-guess-wrong': 6, 'letter-opened': 3,
    } as const;
    const beat = (extra: GameEvent[], over: Partial<DialogueQuery> = {}) =>
      selectTaggedLine(file, query({
        counters: { ...veteran }, recentEvents: stamp(4, [...base, ...extra]), ...over,
      }), NIGHT_PREFIX)?.id;

    const quiet = beat([]);
    const solved = beat([{ type: 'room-solved', cellKey: 'a', kind: 'hive', tier: 1, perfect: true }]);
    const guessed = beat([{
      type: 'sanctum-guess-wrong', guess: 'VELLUM',
      closeness: { sharedLetters: 3, rightLength: true, repeat: false },
    }]);
    const left = beat([{ type: 'room-abandoned', cellKey: 'b', kind: 'crossword' }]);

    expect(new Set([quiet, solved, guessed, left]).size).toBe(4);
    expect(solved).toBe('bramble.night.perfect');
    expect(guessed).toBe('bramble.night.guess');
    expect(left).toBe('bramble.night.abandoned');
  });

  it('the firsts land on the night they happen, and never twice', () => {
    const file = getDialogueFile('bramble');
    const first = selectTaggedLine(file, query({
      day: 2,
      recentEvents: stamp(2, [
        { type: 'fragment-found', fragmentId: 'v1-d1' },
        { type: 'day-ended', day: 2, cause: 'steps-exhausted' },
      ]),
      counters: { 'fragment-found': 1 },
    }), NIGHT_PREFIX);
    expect(first?.id).toBe('bramble.night.first-page');

    // Same night, replayed after it has been seen: the beat retires.
    const again = selectTaggedLine(file, query({
      day: 2,
      seen: new Set(['bramble.night.first-page']),
      recentEvents: stamp(2, [
        { type: 'fragment-found', fragmentId: 'v1-d2' },
        { type: 'day-ended', day: 2, cause: 'steps-exhausted' },
      ]),
      counters: { 'fragment-found': 1 },
    }), NIGHT_PREFIX);
    expect(again?.id).toBe('bramble.night.fragment');
  });

  it('the climb, the near-miss and the win each get their own goodnight', () => {
    const file = getDialogueFile('bramble');
    const pick = (over: Partial<DialogueQuery>) =>
      selectTaggedLine(file, query(over), NIGHT_PREFIX)?.id;
    expect(pick({ flags: new Set(['met.bramble', 'vol.volume-1.landing-reached']) }))
      .toBe('bramble.night.landing');
    expect(pick({ fragmentsFound: 22, fragmentsLegible: 22 })).toBe('bramble.night.close');
    expect(pick({
      recentEvents: stamp(4, [{ type: 'volume-solved', volumeId: 'volume-1' }]),
    })).toBe('bramble.night.won');
  });

  /**
   * The live pass drove six consecutive nights and got two strings. This is
   * that walk, run over the authored pool: a fortnight of ordinary evenings
   * with a plausible mix of days behind them.
   */
  it('a fortnight of nights is never silent and never a two-string loop', () => {
    const file = getDialogueFile('bramble');
    const seen = new Set<string>();
    const counters: Partial<Record<GameEvent['type'], number>> = {};
    const picked: string[] = [];

    for (let day = 1; day <= 14; day++) {
      const events: GameEvent[] = [{
        type: 'day-ended', day,
        cause: day % 4 === 0 ? 'retired-early' : 'steps-exhausted',
      }];
      if (day % 2 === 0) events.push({ type: 'room-solved', cellKey: 'a', kind: 'hive', tier: 1, perfect: day % 4 === 2 });
      if (day % 3 === 0) events.push({ type: 'room-abandoned', cellKey: 'b', kind: 'word-web' });
      if (day % 5 === 0) events.push({ type: 'fragment-found', fragmentId: `f${day}` });
      if (day % 7 === 0) events.push({ type: 'letter-opened', letterId: `l${day}` });
      for (const e of events) counters[e.type] = (counters[e.type] ?? 0) + 1;

      const node = selectTaggedLine(file, query({
        day, seen: new Set(seen), counters: { ...counters },
        recentEvents: stamp(day, events),
      }), NIGHT_PREFIX);
      expect(node, `night ${day} said nothing`).toBeDefined();
      picked.push(node!.id);
      seen.add(node!.id);
    }

    // The shipped night managed two distinct strings in six evenings.
    expect(new Set(picked).size).toBeGreaterThanOrEqual(10);
    // …and no evening repeats the one before it.
    for (let i = 1; i < picked.length; i++) expect(picked[i]).not.toBe(picked[i - 1]);
  });
});

// ---------------------------------------------------------------------------
// 2. The verbs that outlive the introductions
// ---------------------------------------------------------------------------

const authoredChoiceCount = (): number =>
  ALL_FILES.reduce((n, f) => n + f.nodes.reduce((m, x) => m + (x.choices ?? []).length, 0), 0);

describe('player choice is a live pool, not an introduction (REVIEW_AA §5.11)', () => {
  it('the corpus carries more choices than the review counted, and they are not all first meetings', () => {
    expect(authoredChoiceCount()).toBeGreaterThan(20);
    const outsideIntros = ALL_FILES.flatMap((f) => f.nodes)
      .filter((n) => (n.choices ?? []).length > 0 && !/\.(meet|quest1|arc)\./.test(n.id));
    expect(outsideIntros.length).toBeGreaterThanOrEqual(5);
  });

  it('every speaking character keeps a standing menu, and it is repeatable', () => {
    for (const c of ASK_MENU_CHARACTERS) {
      const menu = getDialogueFile(c).nodes.find((n) => n.id === `${c}.ask.menu`);
      expect(menu, `${c} has no ask menu`).toBeDefined();
      expect(menu!.once).toBe(false);
      expect((menu!.choices ?? []).length).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * THE PROPERTY THE REVIEW ACTUALLY ASKED FOR. Not "there are more choices"
   * — "the pool does not empty". Every once-only topic in the file is marked
   * seen, i.e. a player who has asked everything there is to ask, and the menu
   * must still be offering her something.
   */
  it('after every once-topic has been asked, the menu still has a verb on it', () => {
    for (const c of ASK_MENU_CHARACTERS) {
      const file = getDialogueFile(c);
      const seen = new Set(file.nodes.filter((n) => n.once).map((n) => n.id));
      const q = query({ character: c, slot: 'idle', day: 21, seen, flags: new Set([`met.${c}`]) });
      const menu = selectAskMenu(file, q);
      expect(menu, `${c}'s menu is gone by day 21`).toBeDefined();
      expect(availableChoices(file, q, menu!).length, `${c} has no verb left`).toBeGreaterThanOrEqual(1);
    }
  });

  it('a topic she has already heard is not offered again', () => {
    const file = getDialogueFile('bramble');
    const fresh = query({ slot: 'idle' });
    const menu = selectAskMenu(file, fresh)!;
    const before = availableChoices(file, fresh, menu).map((ch) => ch.text);
    expect(before.length).toBe(3);

    const after = availableChoices(file, query({
      slot: 'idle', seen: new Set(['bramble.ask.master']),
    }), menu).map((ch) => ch.text);
    expect(after.length).toBe(2);
    expect(after).not.toContain(before[0]);
  });

  it('the evergreen verb answers about TODAY, not about the file', () => {
    const file = getDialogueFile('bramble');
    const menu = selectAskMenu(file, query({ slot: 'idle' }))!;
    const evergreen = menu.choices!.find((ch) => ch.gotoPrefix)!;

    const quiet = query({ slot: 'idle' });
    const busy = query({
      slot: 'idle',
      recentEvents: stamp(4, [{ type: 'room-solved', cellKey: 'a', kind: 'hive', tier: 1, perfect: false }]),
    });
    expect(resolveChoiceTarget(file, busy, evergreen)?.id).toBe('bramble.ask.today.solved');
    expect(resolveChoiceTarget(file, quiet, evergreen)?.id).toMatch(/^bramble\.ask\.today\.quiet-/);
  });

  it('asking is worth something: a topic carries a flag or a point, never nothing', () => {
    for (const c of ASK_MENU_CHARACTERS) {
      const topics = getDialogueFile(c).nodes.filter(
        (n) => n.id.startsWith(`${c}.ask.`) && n.chainOnly && n.once);
      expect(topics.length, `${c} offers no once-topics`).toBeGreaterThanOrEqual(2);
      for (const t of topics) {
        const eff = t.effects ?? {};
        expect(
          (eff.setFlags ?? []).length > 0 || Object.keys(eff.affinity ?? {}).length > 0,
          `${t.id} changes nothing`,
        ).toBe(true);
      }
    }
  });

  /**
   * A CHOICE WITH A CONSEQUENCE, END TO END. Asking Ellery about Mrs. Bramble
   * sets a flag in Ellery's file that BRAMBLE'S NIGHT reads — the one thing
   * the cast census said nothing anywhere did (no node gated on another
   * character's state). This is that path, walked.
   */
  it("a question asked downstairs changes what the housekeeper says at bedtime", () => {
    const ellery = getDialogueFile('ellery');
    const topic = ellery.nodes.find((n) => n.id === 'ellery.ask.bramble')!;
    const flagSet = topic.effects?.setFlags ?? [];
    expect(flagSet).toContain('ellery.asked.bramble');

    const bramble = getDialogueFile('bramble');
    const withoutIt = selectTaggedLine(bramble, query(), NIGHT_PREFIX)?.id;
    const withIt = selectTaggedLine(bramble, query({
      flags: new Set(['met.bramble', ...flagSet]),
    }), NIGHT_PREFIX)?.id;
    expect(withIt).toBe('bramble.night.asked-of-her');
    expect(withIt).not.toBe(withoutIt);
  });

  it('a choice whose conditions fail is not offered at all', () => {
    const file = getDialogueFile('bramble');
    const node: DialogueNode = {
      id: 'bramble.test', trigger: 'idle', priority: 0, once: false,
      lines: [{ speaker: 'bramble', text: 'Well?' }],
      choices: [
        { text: 'always' },
        { text: 'only when warm', conditions: [{ kind: 'affinity', character: 'bramble', gte: 9 }] },
      ],
    };
    expect(availableChoices(file, query({ slot: 'idle' }), node).map((c) => c.text)).toEqual(['always']);
    expect(availableChoices(file, query({
      slot: 'idle',
      affinities: { bramble: 12, ellery: 0, posy: 0, fern: 0, dewey: 0, portrait: 0 },
    }), node).length).toBe(2);
  });
});
