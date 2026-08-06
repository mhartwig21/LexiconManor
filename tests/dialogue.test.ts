import { describe, expect, it } from 'vitest';
import type { CharacterId } from '../src/engine/types';
import type { DialogueQuery, DialogueTrigger, GameEvent, RecordedEvent } from '../src/engine/events';
import type { DialogueFile, DialogueNode } from '../src/engine/dialogue/schema';
import { isSubstantive, PRIORITY } from '../src/engine/dialogue/schema';
import { evaluateCondition } from '../src/engine/dialogue/conditions';
import { selectDialogue, findNode } from '../src/engine/dialogue/select';
import {
  AFFINITY_RANK_THRESHOLDS, MAX_AFFINITY_RANK, pointsToNextRank, rankFor,
} from '../src/engine/dialogue/affinity';
import { getDialogueFile } from '../src/engine/dialogue/content';

/**
 * A6 — the Hades selection rules (AAA 5.4/5.9, BENCHMARKS §5): priority
 * bands, pacing valve, seen-tracking, cooldowns, never-silence fallback.
 */

const NO_AFFINITY: Record<CharacterId, number> = {
  bramble: 0, ellery: 0, posy: 0, fern: 0, dewey: 0, portrait: 0,
};

function rec(day: number, event: GameEvent): RecordedEvent {
  return { day, at: 0, event };
}

function query(partial: Partial<DialogueQuery> = {}): DialogueQuery {
  return {
    day: 1,
    slot: 'parlor',
    character: 'ellery',
    seen: new Set<string>(),
    flags: new Set<string>(),
    affinities: NO_AFFINITY,
    counters: {},
    recentEvents: [],
    talkedToday: new Set<CharacterId>(),
    giftedToday: new Set<CharacterId>(),
    volumeId: 'volume-1',
    fragmentsFound: 0,
    ...partial,
  };
}

function node(partial: Partial<DialogueNode> & { id: string }): DialogueNode {
  return {
    trigger: 'parlor',
    priority: PRIORITY.general,
    once: true,
    lines: [{ speaker: 'ellery', text: 'x' }],
    ...partial,
  };
}

const fixture: DialogueFile = {
  character: 'ellery',
  nodes: [
    node({ id: 'ellery.t.meet', priority: PRIORITY.forced }),
    node({
      id: 'ellery.t.react', priority: PRIORITY.eventReact,
      conditions: [{ kind: 'event', event: 'fragment-found' }],
    }),
    node({
      id: 'ellery.t.arc', priority: PRIORITY.arc,
      conditions: [{ kind: 'affinity', character: 'ellery', gte: 2 }],
    }),
    node({ id: 'ellery.t.gen', priority: PRIORITY.general }),
    node({ id: 'ellery.t.chain', priority: 0, chainOnly: true }),
    node({ id: 'ellery.t.idle-1', trigger: 'idle', priority: PRIORITY.idle, once: false }),
    node({ id: 'ellery.t.idle-2', trigger: 'idle', priority: PRIORITY.idle, once: false }),
    node({ id: 'ellery.t.idle-3', trigger: 'idle', priority: PRIORITY.idle, once: false }),
  ],
};

describe('selectDialogue — priority bands (AAA 5.4)', () => {
  const eventful = query({
    recentEvents: [rec(1, { type: 'fragment-found', fragmentId: 'f1' })],
    affinities: { ...NO_AFFINITY, ellery: 3 },
  });

  it('forced first-meeting beats an eligible event reaction and general line', () => {
    expect(selectDialogue(fixture, eventful)?.id).toBe('ellery.t.meet');
  });

  it('event reaction beats arc and general once the meeting is seen', () => {
    const q = query({ ...eventful, seen: new Set(['ellery.t.meet']) });
    expect(selectDialogue(fixture, q)?.id).toBe('ellery.t.react');
  });

  it('arc beats general; general is the floor of substantive content', () => {
    const q = query({
      seen: new Set(['ellery.t.meet']),
      affinities: { ...NO_AFFINITY, ellery: 3 },
    });
    expect(selectDialogue(fixture, q)?.id).toBe('ellery.t.arc');
    const q2 = query({ seen: new Set(['ellery.t.meet', 'ellery.t.arc']) });
    expect(selectDialogue(fixture, q2)?.id).toBe('ellery.t.gen');
  });

  it('chainOnly nodes are never selected directly', () => {
    const q = query({ seen: new Set(['ellery.t.meet', 'ellery.t.arc', 'ellery.t.gen']) });
    expect(selectDialogue(fixture, q)?.id).toMatch(/idle/);
  });

  it('deterministic: same query, same node', () => {
    expect(selectDialogue(fixture, eventful)?.id).toBe(selectDialogue(fixture, eventful)?.id);
  });
});

describe('selectDialogue — pacing valve (AAA 5.9)', () => {
  it('spent valve retargets a parlor query to the idle pool, warmly', () => {
    const q = query({ talkedToday: new Set<CharacterId>(['ellery']) });
    const picked = selectDialogue(fixture, q);
    expect(picked?.trigger).toBe('idle');
  });

  it("the Portrait's sigh is never valved: sanctum-after-guess bypasses", () => {
    const file = getDialogueFile('portrait');
    const q = query({
      character: 'portrait',
      slot: 'sanctum-after-guess',
      talkedToday: new Set<CharacterId>(['portrait']),
      recentEvents: [rec(1, {
        type: 'sanctum-guess-wrong', guess: 'candle',
        closeness: { sharedLetters: 0, rightLength: false, repeat: true },
      })],
    });
    expect(selectDialogue(file, q)?.id).toBe('portrait.guess.repeat');
  });

  it('idle lines never spend the valve; morning/parlor do', () => {
    expect(isSubstantive(node({ id: 'x.a', trigger: 'idle' }))).toBe(false);
    expect(isSubstantive(node({ id: 'x.a', trigger: 'sanctum-after-guess' }))).toBe(false);
    expect(isSubstantive(node({ id: 'x.a', trigger: 'letter' }))).toBe(false);
    expect(isSubstantive(node({ id: 'x.a', trigger: 'parlor' }))).toBe(true);
    expect(isSubstantive(node({ id: 'x.a', trigger: 'morning' }))).toBe(true);
  });
});

describe('selectDialogue — seen, cooldown, never-silence', () => {
  it('once nodes drop out after being seen', () => {
    const q = query({ seen: new Set(['ellery.t.meet']) });
    expect(selectDialogue(fixture, q)?.id).toBe('ellery.t.gen');
  });

  it('same-day cooldown suppresses a just-heard repeatable line', () => {
    const q = query({
      slot: 'idle',
      recentEvents: [rec(1, { type: 'dialogue-seen', nodeId: 'ellery.t.idle-1', character: 'ellery' })],
    });
    const picked = selectDialogue(fixture, { ...q });
    expect(picked).toBeDefined();
    // rotation prefers lines not heard today
    expect(picked?.id).not.toBe('ellery.t.idle-1');
  });

  it('idle rotation varies by visit within a day, deterministically', () => {
    const first = selectDialogue(fixture, query({ slot: 'idle' }));
    const second = selectDialogue(fixture, query({
      slot: 'idle',
      recentEvents: [rec(1, { type: 'dialogue-seen', nodeId: first!.id, character: 'ellery' })],
    }));
    expect(second!.id).not.toBe(first!.id);
  });

  it('exhausted substantive pool falls back to idle — never silence', () => {
    const q = query({
      seen: new Set(['ellery.t.meet', 'ellery.t.arc', 'ellery.t.gen']),
    });
    const picked = selectDialogue(fixture, q);
    expect(picked).toBeDefined();
    expect(picked?.trigger).toBe('idle');
  });

  it('a fully-heard idle pool still repeats rather than going quiet', () => {
    const heardAll = fixture.nodes
      .filter((n) => n.trigger === 'idle')
      .map((n) => rec(1, { type: 'dialogue-seen', nodeId: n.id, character: 'ellery' } as GameEvent));
    const picked = selectDialogue(fixture, query({ slot: 'idle', recentEvents: heardAll }));
    expect(picked).toBeDefined();
  });
});

describe('conditions', () => {
  it('event `where` matches dot paths into the payload', () => {
    const q = query({
      recentEvents: [rec(1, {
        type: 'sanctum-guess-wrong', guess: 'x',
        closeness: { sharedLetters: 3, rightLength: true, repeat: false },
      })],
    });
    expect(evaluateCondition(
      { kind: 'event', event: 'sanctum-guess-wrong', where: { 'closeness.rightLength': true } }, q,
    )).toBe(true);
    expect(evaluateCondition(
      { kind: 'event', event: 'sanctum-guess-wrong', where: { 'closeness.repeat': true } }, q,
    )).toBe(false);
    expect(evaluateCondition(
      { kind: 'event', event: 'sanctum-guess-wrong', whereGte: { 'closeness.sharedLetters': 2 } }, q,
    )).toBe(true);
  });

  it('withinDays windows the day-stamped stream', () => {
    const q = query({ day: 3, recentEvents: [rec(2, { type: 'fragment-found', fragmentId: 'f' })] });
    expect(evaluateCondition({ kind: 'event', event: 'fragment-found', withinDays: 1 }, q)).toBe(true);
    expect(evaluateCondition({ kind: 'event', event: 'fragment-found', withinDays: 0 }, q)).toBe(false);
  });

  it('counter, fragmentCount, day, seen, volume, not', () => {
    const q = query({
      day: 5,
      counters: { 'room-solved': 4 },
      fragmentsFound: 3,
      seen: new Set(['ellery.t.meet']),
    });
    expect(evaluateCondition({ kind: 'counter', event: 'room-solved', gte: 4 }, q)).toBe(true);
    expect(evaluateCondition({ kind: 'counter', event: 'room-solved', gte: 5 }, q)).toBe(false);
    expect(evaluateCondition({ kind: 'fragmentCount', gte: 3 }, q)).toBe(true);
    expect(evaluateCondition({ kind: 'day', gte: 2, lte: 5 }, q)).toBe(true);
    expect(evaluateCondition({ kind: 'seen', node: 'ellery.t.meet' }, q)).toBe(true);
    expect(evaluateCondition({ kind: 'volume', id: 'volume-1' }, q)).toBe(true);
    expect(evaluateCondition({ kind: 'not', cond: { kind: 'fragmentCount', gte: 9 } }, q)).toBe(true);
  });
});

describe('affinity ranks', () => {
  it('thresholds are monotonic and rankFor honors them', () => {
    for (let i = 1; i < AFFINITY_RANK_THRESHOLDS.length; i++) {
      expect(AFFINITY_RANK_THRESHOLDS[i]!).toBeGreaterThan(AFFINITY_RANK_THRESHOLDS[i - 1]!);
    }
    expect(rankFor(0)).toBe(0);
    expect(rankFor(2)).toBe(1);
    expect(rankFor(14)).toBe(MAX_AFFINITY_RANK);
    expect(pointsToNextRank(0)).toBe(2);
    expect(pointsToNextRank(14)).toBeUndefined();
  });
});

describe('real content spot checks', () => {
  it('day one, fresh save: Bramble opens with her first meeting', () => {
    const file = getDialogueFile('bramble');
    const picked = selectDialogue(file, query({ character: 'bramble', slot: 'morning' }));
    expect(picked?.id).toBe('bramble.meet.1');
    expect(findNode(file, picked!.choices![0]!.goto!)).toBeDefined();
  });

  it('gifting unlocks the bespoke keepsake scene on the very next tap (AAA 5.7)', () => {
    const file = getDialogueFile('ellery');
    const q = query({
      character: 'ellery',
      slot: 'parlor',
      flags: new Set(['met.ellery', 'sys.first-gift.ellery']),
      talkedToday: new Set<CharacterId>(['ellery']),
      giftedToday: new Set<CharacterId>(['ellery']),
    });
    expect(selectDialogue(file, q)?.id).toBe('ellery.arc.keepsake');
  });

  it('the morning after a dry Library day, Bramble names the room (AAA 5.2)', () => {
    const file = getDialogueFile('bramble');
    const q = query({
      character: 'bramble',
      slot: 'morning',
      day: 4,
      seen: new Set(['bramble.meet.1', 'bramble.meet.2']),
      flags: new Set(['met.bramble']),
      recentEvents: [
        rec(3, { type: 'room-abandoned', cellKey: '1,2', kind: 'word-web' }),
        rec(3, { type: 'day-ended', day: 3, cause: 'steps-exhausted' }),
      ],
    });
    expect(selectDialogue(file, q)?.id).toBe('bramble.recap.dry-library');
  });
});
