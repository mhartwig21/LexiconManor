/**
 * Trigger mounts + priority starvation — OWNER: A6 (Dialogue).
 *
 * Two bug classes that shipped as content and were caught by eye instead of
 * by the build, both now build failures:
 *
 * 1. UNMOUNTED CONTENT. `TRIGGER_MOUNTS` used to be keyed by trigger alone,
 *    so `parlor` counted as "mounted" because ManorPage mounts it for
 *    Ellery/Posy/Fern — while nothing anywhere mounted a scene for the
 *    Portrait. All ten of his `parlor` nodes (the entire first-meeting chain
 *    with its choice pair, arc.gathering, arc.read, his general pool) and,
 *    through the pacing valve that retargets to it, all six of his `idle`
 *    nodes — including arc.testimony, the ONLY authored delivery of v1-t5,
 *    "I did not destroy it. I unhoused it" — were dead in the shipped build.
 *    The manifest is now per (character, trigger).
 *
 * 2. PRIORITY STARVATION. `portrait.guess.thaw` (705) and `thaw-2` (708) sat
 *    UNDER three repeatable closeness variants (710/715/720) on the same
 *    trigger. right-length fires on any six-letter guess — and the journal
 *    draws a six-slot frame the moment the second fragment lands — so the
 *    two once-only beats carrying the Portrait's whole arc could essentially
 *    never be reached. Failure is supposed to be the channel he grows in
 *    (BENCHMARKS §5); it was a vending machine.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS, type CharacterId } from '../src/engine/types';
import type { DialogueFile, DialogueNode } from '../src/engine/dialogue/schema';
import { DIALOGUE_FILES, getDialogueFile } from '../src/engine/dialogue/content';
import {
  provablyDisjoint, TRIGGER_MOUNTS, validateDialogueFile, validateDialogueSet,
} from '../src/engine/dialogue/validate';
import { selectDialogue } from '../src/engine/dialogue/select';
import type { DialogueQuery, RecordedEvent } from '../src/engine/events';
import { BASE_DECK, UNLOCKABLE_CARDS } from '../src/engine/manor/deck';
import { PARLOR_HOSTS, parlorHostFor } from '../src/engine/manor/parlor';

const root = join(__dirname, '..');
const files = Object.values(DIALOGUE_FILES) as DialogueFile[];

/** Derived from the deck, never restated — a new parlor card joins this list. */
const PARLOR_CARD_IDS: string[] = [...BASE_DECK, ...UNLOCKABLE_CARDS]
  .filter((c) => c.category === 'parlor')
  .map((c) => c.id);

const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

describe('trigger mounts are per character, and real (AAA 5.5)', () => {
  it('every (character, trigger) pair an authored node uses has a mount site', () => {
    const missing: string[] = [];
    for (const f of files) {
      for (const n of f.nodes) {
        if (!TRIGGER_MOUNTS[f.character]?.[n.trigger]) {
          missing.push(`${f.character}/${n.trigger} (${n.id})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('the manifest names no mount a character does not author for', () => {
    for (const c of CHARACTER_IDS) {
      const used = new Set(getDialogueFile(c).nodes.map((n) => n.trigger));
      for (const trigger of Object.keys(TRIGGER_MOUNTS[c] ?? {})) {
        expect(used.has(trigger as never), `${c} registers "${trigger}" but authors nothing for it`).toBe(true);
      }
    }
  });

  // The manifest is prose, and prose lies. These check the named files really
  // do mount the slot they claim to.
  it('the Portrait is actually mounted at the Sanctum — the regression itself', () => {
    const sanctum = read('src', 'ui', 'sanctum', 'SanctumView.tsx');
    expect(sanctum).toMatch(/character="portrait"[\s\S]{0,80}slot="parlor"/);
    expect(sanctum).toMatch(/character="portrait"[\s\S]{0,80}slot="sanctum-after-guess"/);
  });

  it('every registered mount site that names a screen mounts that slot', () => {
    for (const c of CHARACTER_IDS) {
      for (const [trigger, site] of Object.entries(TRIGGER_MOUNTS[c] ?? {})) {
        if (trigger === 'idle') continue;   // reached by retarget, never mounted
        const path = /(src[\w/.-]+\.tsx)/.exec(site)?.[1];
        expect(path, `${c}/${trigger} names no screen`).toBeTruthy();
        const src = read(...path!.split('/'));
        // A trigger reaches the screen one of two ways: PLAYED as a scene
        // (<DialogueScene slot="x">), or RENDERED in place by quoting an
        // authored line (selectTaggedLine over buildDialogueQuery(_, 'x') —
        // the Sanctum door's gate nudge, AAA 4.16). Both are real mounts;
        // only "the manifest names a file that never mentions the trigger"
        // is the lie this test exists to catch.
        const played = src.includes(`slot="${trigger}"`);
        const rendered = src.includes(`'${trigger}'`);
        expect(played || rendered, `${path} neither mounts nor renders "${trigger}"`).toBe(true);
      }
    }
  });

  it('an unmounted (character, trigger) pair fails the build', () => {
    // 'night' is registered for nobody — authoring one must go red.
    const rogue: DialogueFile = {
      character: 'fern',
      nodes: [{
        id: 'fern.night.rogue', trigger: 'night', priority: 100, once: true,
        lines: [{ speaker: 'fern', text: 'The greenhouse breathes at night.' }],
      }],
    };
    const issues = validateDialogueFile(rogue);
    expect(issues.some((i) => /no screen mounts/.test(i.message))).toBe(true);
  });
});

describe('priority starvation is a build failure (AAA 5.5)', () => {
  const node = (over: Partial<DialogueNode>): DialogueNode => ({
    id: 'fern.x', trigger: 'parlor', priority: 100, once: true,
    lines: [{ speaker: 'fern', text: 'Mind the seedlings.' }],
    ...over,
  });

  it('flags a once node a repeatable one always outranks', () => {
    const issues = validateDialogueFile({
      character: 'fern',
      nodes: [
        node({ id: 'fern.arc.milestone', once: true, priority: 500 }),
        node({ id: 'fern.gen.rotating', once: false, priority: 600 }),
      ],
    });
    expect(issues.some((i) => /starved by repeatable/.test(i.message))).toBe(true);
  });

  it('does not flag when the rival rides an event gate the once node lacks', () => {
    const issues = validateDialogueFile({
      character: 'fern',
      nodes: [
        node({ id: 'fern.arc.milestone', once: true, priority: 500 }),
        node({
          id: 'fern.react.gift', once: false, priority: 800,
          conditions: [{ kind: 'event', event: 'gift-given', withinDays: 0 }],
        }),
      ],
    });
    expect(issues.filter((i) => /starved by repeatable/.test(i.message))).toEqual([]);
  });

  it('does not flag when the condition sets are provably disjoint', () => {
    const issues = validateDialogueFile({
      character: 'fern',
      nodes: [
        node({
          id: 'fern.arc.early', once: true, priority: 500,
          conditions: [{ kind: 'fragmentCount', lte: 3 }],
        }),
        node({
          id: 'fern.gen.late', once: false, priority: 600,
          conditions: [{ kind: 'fragmentCount', gte: 4 }],
        }),
      ],
    });
    expect(issues.filter((i) => /starved by repeatable/.test(i.message))).toEqual([]);
  });

  it('provablyDisjoint is conservative: unknown overlap is NOT disjoint', () => {
    expect(provablyDisjoint(
      [{ kind: 'flag', flag: 'met.fern' }],
      [{ kind: 'not', cond: { kind: 'flag', flag: 'met.fern' } }],
    )).toBe(true);
    expect(provablyDisjoint([{ kind: 'day', gte: 10 }], [{ kind: 'day', lte: 4 }])).toBe(true);
    expect(provablyDisjoint([{ kind: 'day', gte: 10 }], [{ kind: 'fragmentCount', gte: 2 }])).toBe(false);
    expect(provablyDisjoint(undefined, undefined)).toBe(false);
  });

  it('the shipped corpus is clean', () => {
    expect(validateDialogueSet(files)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The arc the starvation buried: he must actually thaw.
// ---------------------------------------------------------------------------

describe("the Portrait's failure arc reaches the player (AAA 4.17, BENCHMARKS §5)", () => {
  /** A player who has been told the word is six letters and guesses like it:
   *  right length, several shared letters — i.e. every real deliberate guess
   *  for the rest of the campaign. This is the exact case that starved him. */
  function wrongGuessDay(day: number, wrongSoFar: number, seen: Set<string>): DialogueQuery {
    const recentEvents: RecordedEvent[] = [{
      day, at: 0,
      event: {
        type: 'sanctum-guess-wrong', guess: 'VELLUM',
        closeness: { sharedLetters: 3, rightLength: true, repeat: false },
      },
    }];
    return {
      day, slot: 'sanctum-after-guess', character: 'portrait',
      seen, flags: new Set(['met.portrait']),
      affinities: { bramble: 0, ellery: 0, posy: 0, fern: 0, dewey: 0, portrait: 1 },
      counters: { 'sanctum-guess-wrong': wrongSoFar },
      recentEvents, talkedToday: new Set(), giftedToday: new Set(),
      // No sealed flags in this fixture, so everything filed is readable.
      volumeId: 'volume-1', fragmentsFound: 8, fragmentsLegible: 8,
    };
  }

  it('thaw and thaw-2 both play across a campaign of six-letter wrong guesses', () => {
    const file = getDialogueFile('portrait');
    const seen = new Set<string>();
    const picked: string[] = [];
    for (let n = 1; n <= 12; n++) {
      const node = selectDialogue(file, wrongGuessDay(n, n, seen));
      expect(node, `silence on wrong guess ${n}`).toBeTruthy();
      picked.push(node!.id);
      if (node!.once) seen.add(node!.id);
    }
    expect(picked).toContain('portrait.guess.thaw');
    expect(picked).toContain('portrait.guess.thaw-2');
    // …and they land at their milestones, not whenever.
    expect(picked[2]).toBe('portrait.guess.thaw');     // the 3rd wrong guess
    expect(picked[5]).toBe('portrait.guess.thaw-2');   // the 6th
  });

  it('the closeness variants still carry every other day', () => {
    const file = getDialogueFile('portrait');
    const seen = new Set(['portrait.guess.thaw', 'portrait.guess.thaw-2']);
    const node = selectDialogue(file, wrongGuessDay(9, 9, seen));
    expect(node!.id).toBe('portrait.guess.right-length');
  });

  it('the thaw beats still deliver the day\'s verdict rather than swallowing it', () => {
    const file = getDialogueFile('portrait');
    for (const id of ['portrait.guess.thaw', 'portrait.guess.thaw-2']) {
      const n = file.nodes.find((x) => x.id === id)!;
      expect(n.lines.length).toBeGreaterThanOrEqual(2);
      expect(n.lines.some((l) => /journal|margin/i.test(l.text))).toBe(true);
    }
  });
});

/**
 * 3. HOSTLESS PARLORS. The third variant of the same defect, found while
 *    landing round 5's shared-file requests. `ManorPage` looked its parlor
 *    host up in a local `Record<string, CharacterId>` and ended the lookup
 *    `?? 'bramble'` — so a parlor card nobody had mapped sent the player to
 *    the one character who authors ZERO `parlor` nodes. `selectDialogue`'s
 *    never-silence rule kept it from crashing (it falls back to her idle
 *    pool), which is exactly why it would never have been noticed: the card
 *    promises a bespoke scene and quietly serves general chatter instead.
 *
 *    The table now lives in `engine/manor/parlor.ts` and is pinned here.
 */
describe('every parlor card has a host who can speak in it', () => {
  it('every parlor card in the deck names a host', () => {
    const unhosted = PARLOR_CARD_IDS.filter((id) => parlorHostFor(id) === null);
    expect(unhosted, `parlor cards with no host: ${unhosted.join(', ')}`).toEqual([]);
  });

  it('the table names no card the deck does not ship', () => {
    const shipped = new Set<string>(PARLOR_CARD_IDS);
    for (const id of Object.keys(PARLOR_HOSTS)) {
      expect(shipped.has(id), `PARLOR_HOSTS names "${id}", which is not a parlor card`).toBe(true);
    }
  });

  it('every host has something to say when she is stood in front of', () => {
    // `parlor` nodes ideally; `idle` at minimum, since selectDialogue falls
    // back there. A host with neither would open an empty scene.
    for (const id of PARLOR_CARD_IDS) {
      const host = parlorHostFor(id)!;
      const triggers = new Set(getDialogueFile(host).nodes.map((n) => n.trigger));
      expect(
        triggers.has('parlor') || triggers.has('idle'),
        `${id} → ${host}, who authors neither parlor nor idle nodes`,
      ).toBe(true);
    }
  });

  it('KNOWN GAP: morning-room is the only card riding the idle fallback', () => {
    // Pinned deliberately, so round 6 either authors Bramble a parlor pool or
    // re-hosts the card — and so no OTHER card joins her without a test going
    // red. Flip the expectation when the gap closes.
    const onIdleOnly = PARLOR_CARD_IDS.filter((id) => {
      const host = parlorHostFor(id)!;
      return !getDialogueFile(host).nodes.some((n) => n.trigger === 'parlor');
    });
    expect(onIdleOnly).toEqual(['morning-room']);
  });
});
