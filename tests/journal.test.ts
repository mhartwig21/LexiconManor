/**
 * The journal derivations + the journal slice — OWNER: A7 (Mystery).
 * Pure-engine tests for grouping/gaps/alphabet/nudges, plus an integration
 * pass through the real store (fileFragment → event spine, the Sanctum
 * guess flow, letters setting write-once flags).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ManorState, PlacedRoom, VolumeState } from '../src/engine/types';
import { cellKey, createManor, SANCTUM_DOOR_CELL } from '../src/engine/manor/grid';
import { freshVolumeState, openedLetterFlag, solvedFlag, type VolumeContent } from '../src/engine/volume';
import {
  alphabetFacts, arrivalShade, crossRefs, definitionSlots, displayedFragmentIds, foundByKind,
  guessHistory, guessVerdict, journalNudge, journalUnread, landingFlag, letterBoxes,
  nextUninterpreted, sanctumReadiness, SPENT_ARRIVAL_STEPS, THIN_FILE_THRESHOLD, VERDICT_TOKENS,
  viewedFragmentFlag, viewedFragmentIds,
  type GuessVerdict, type JournalTab,
} from '../src/engine/journal';
import { FLAG_REGEX } from '../src/engine/dialogue/validate';
import { getDialogueFile } from '../src/engine/dialogue/content';
import { useManorStore } from '../src/app/store';

const volume = JSON.parse(
  readFileSync(join(__dirname, '..', 'content', 'authored', 'volumes', 'volume-1.json'), 'utf8'),
) as VolumeContent;

const fresh = (): VolumeState => freshVolumeState(volume.id, 1);
const withFound = (...ids: string[]): VolumeState => ({ ...fresh(), foundFragmentIds: ids });

describe('definition poem — gaps keep the shape (— ? —)', () => {
  it('always renders six slots, found lines in revealOrder, the rest gaps', () => {
    const slots = definitionSlots(volume, withFound('v1-d3', 'v1-d1'));
    expect(slots.length).toBe(6);
    expect(slots[0]!.fragment?.id).toBe('v1-d1');
    expect(slots[1]!.fragment).toBeNull();
    expect(slots[2]!.fragment?.id).toBe('v1-d3');
    expect(slots.filter((s) => s.fragment === null).length).toBe(4);
  });

  it('groups by kind in revealOrder for the tabs', () => {
    const found = withFound('v1-e3', 'v1-e1', 'v1-t2');
    expect(foundByKind(volume, found, 'engraving').map((f) => f.id)).toEqual(['v1-e1', 'v1-e3']);
    expect(foundByKind(volume, found, 'testimony').map((f) => f.id)).toEqual(['v1-t2']);
  });

  it('cross-references only surface once both ends are found', () => {
    expect(crossRefs(volume, withFound('v1-e1'), 'v1-e1')).toEqual([]);
    const both = withFound('v1-e1', 'v1-t2');
    expect(crossRefs(volume, both, 'v1-e1').map((f) => f.id)).toContain('v1-t2');
  });
});

describe('alphabet plate — engravings rendered against the letters', () => {
  it('stays blank until an engraving is found', () => {
    expect(alphabetFacts(volume, fresh()).sources).toBe(0);
    expect(letterBoxes(alphabetFacts(volume, fresh()))).toBeNull();
  });

  it('accumulates eliminations, requirements, length and first letter', () => {
    const s = withFound('v1-e1', 'v1-e2', 'v1-e3', 'v1-e4', 'v1-e6');
    const facts = alphabetFacts(volume, s);
    expect(facts.knownLength).toBe(6);
    expect(facts.startsWith).toBe('L');
    for (const ch of 'WORDSMITH') expect(facts.eliminated.has(ch), ch).toBe(true);
    // vowel-sequence AUA also eliminates E, I, O and requires A + U
    expect(facts.eliminated.has('E')).toBe(true);
    expect(facts.required.has('A')).toBe(true);
    expect(facts.required.has('U')).toBe(true);
    expect(facts.required.has('C')).toBe(true);
    expect(facts.vowelSequence).toBe('AUA');
    const boxes = letterBoxes(facts)!;
    expect(boxes.length).toBe(6);
    expect(boxes[0]).toBe('L');
    expect(boxes.slice(1)).toEqual([null, null, null, null, null]);
  });

  it('never contradicts the answer (facts derived from found engravings only)', () => {
    const all = withFound(...volume.fragments.map((f) => f.id));
    const facts = alphabetFacts(volume, all);
    for (const ch of volume.answer.toUpperCase()) {
      expect(facts.eliminated.has(ch), ch).toBe(false);
    }
    for (const req of facts.required) {
      expect(volume.answer.toUpperCase().includes(req), req).toBe(true);
    }
  });
});

describe('guess history — her own elimination record (AAA 4.17)', () => {
  it('files the verdict per guess and marks the winning word', () => {
    const s: VolumeState = {
      ...fresh(),
      guesses: [
        { day: 2, guess: 'VELLUM' },
        { day: 3, guess: 'VELLUM' },
        { day: 4, guess: 'LACUNA' },
      ],
      status: 'solved',
    };
    const h = guessHistory(volume, s);
    expect(h[0]!.verdict).not.toBe('repeat');
    expect(h[1]!.verdict).toBe('repeat');
    expect(h[2]!.wasAnswer).toBe(true);
    expect(h[0]!.wasAnswer).toBe(false);
  });

  // The journal is a memory prosthetic, not an oracle (AAA 3.3 / 4.15): it
  // may only re-present what a character actually said. An exact shared-letter
  // COUNT — which the record used to publish, free, once a day, forever — is
  // a Mastermind channel that solves the letter set independently of the whole
  // engraving economy, and nobody in the fiction ever speaks a number.
  it('never exposes a numeric closeness anywhere in the record', () => {
    const s: VolumeState = { ...fresh(), guesses: [{ day: 2, guess: 'CANDLE' }] };
    const rec = guessHistory(volume, s)[0]!;
    expect(rec).not.toHaveProperty('closeness');
    for (const value of Object.values(rec)) {
      if (typeof value === 'object' && value !== null) {
        expect(Object.keys(value)).not.toContain('sharedLetters');
      }
    }
    expect(VERDICT_TOKENS[rec.verdict]).not.toMatch(/\d/);
  });

  // The five shades ARE the Portrait's authored variants, in his priority
  // order (repeat 720 > right-length 715 > warm-letters 710 > one-letter 705
  // > cold 700). Pinning them together stops the journal quoting a line he
  // does not have.
  it('the verdict taxonomy matches the Portrait\'s authored variants', () => {
    const nodeFor: Record<GuessVerdict, string> = {
      repeat: 'portrait.guess.repeat',
      'right-shape': 'portrait.guess.right-length',
      circling: 'portrait.guess.warm-letters',
      'one-letter': 'portrait.guess.one-letter',
      cold: 'portrait.guess.cold',
    };
    const portrait = getDialogueFile('portrait');
    const priority = (id: string) => {
      const n = portrait.nodes.find((x) => x.id === id);
      expect(n, `${id} must exist`).toBeTruthy();
      return n!.priority;
    };
    const order: GuessVerdict[] = ['repeat', 'right-shape', 'circling', 'one-letter', 'cold'];
    for (let i = 1; i < order.length; i++) {
      expect(priority(nodeFor[order[i - 1]!]), `${order[i - 1]} outranks ${order[i]}`)
        .toBeGreaterThan(priority(nodeFor[order[i]!]));
    }
    // And each shade the taxonomy names is the one that node actually fires on.
    expect(guessVerdict({ sharedLetters: 0, rightLength: false, repeat: true })).toBe('repeat');
    expect(guessVerdict({ sharedLetters: 0, rightLength: true, repeat: false })).toBe('right-shape');
    expect(guessVerdict({ sharedLetters: 2, rightLength: false, repeat: false })).toBe('circling');
    expect(guessVerdict({ sharedLetters: 1, rightLength: false, repeat: false })).toBe('one-letter');
    expect(guessVerdict({ sharedLetters: 0, rightLength: false, repeat: false })).toBe('cold');
  });
});

/**
 * The arrival taxonomy (round-8 defect): the Portrait used to open every
 * first visit with "So you have climbed far enough to ask" — measured live on
 * day 2 from the Entrance Hall, with nothing filed, reached by a link in the
 * journal. He was congratulating a climb nobody made. The shades below are
 * what he now answers, and each one must have an authored line, exactly the
 * way the five closeness shades do.
 */
describe('arrival shades — the climax answers the walk she had (AAA 4.16 / 5.1)', () => {
  it('classifies first / spent / again off the real movement table', () => {
    expect(arrivalShade({ firstEver: true, stepsLeft: 40 })).toBe('first');
    // Even on fumes, a first arrival is a first arrival.
    expect(arrivalShade({ firstEver: true, stepsLeft: 0 })).toBe('first');
    expect(arrivalShade({ firstEver: false, stepsLeft: SPENT_ARRIVAL_STEPS })).toBe('spent');
    expect(arrivalShade({ firstEver: false, stepsLeft: SPENT_ARRIVAL_STEPS + 1 })).toBe('again');
    // "Spent" is priced off the climb itself, never a magic number.
    expect(SPENT_ARRIVAL_STEPS).toBeGreaterThan(0);
  });

  it('every shade has an authored portrait.arrive.* line on the door screen', () => {
    const portrait = getDialogueFile('portrait');
    for (const shade of ['first', 'spent', 'again'] as const) {
      const node = portrait.nodes.find((n) => n.id === `portrait.arrive.${shade}`);
      expect(node, `portrait.arrive.${shade} is missing — the fallback would carry it alone`).toBeTruthy();
      expect(node!.trigger, 'arrival lines ride the door screen\'s own slot').toBe('sanctum-idle');
      expect(node!.once, 'an arrival line is not a one-shot').toBe(false);
    }
  });

  it('only the first-arrival line is allowed to mention the climb', () => {
    const portrait = getDialogueFile('portrait');
    const text = (id: string) =>
      portrait.nodes.find((n) => n.id === id)!.lines.map((l) => l.text).join(' ');
    expect(text('portrait.arrive.first')).toMatch(/climb|stair|storey/i);
    // A repeat visit must not be told it has "climbed far enough to ask" —
    // the exact sentence that shipped, on a day with no climb in it.
    expect(text('portrait.arrive.again')).not.toMatch(/climbed far enough/i);
  });

  it('the landing flag is a legal vol.* write-once flag (docs/flags.md)', () => {
    expect(landingFlag(volume.id)).toBe(`vol.${volume.id}.landing-reached`);
    expect(landingFlag(volume.id)).toMatch(FLAG_REGEX);
  });
});

describe('nudges — sympathetic, never silence (AAA 4.16)', () => {
  it('a thin case file is flagged thin, never gated', () => {
    const r = sanctumReadiness(volume, fresh());
    expect(r.enough).toBe(false);
  });

  it(`the thin-file signal stands down at ${THIN_FILE_THRESHOLD} fragments`, () => {
    const ids = volume.fragments.slice(0, THIN_FILE_THRESHOLD).map((f) => f.id);
    const r = sanctumReadiness(volume, withFound(...ids));
    expect(r.enough).toBe(true);
  });

  // The nudge COPY is the Portrait's, and it lives in his authored JSON
  // (AAA 5.13) — it used to be two strings in engine/journal.ts written in
  // the housekeeper's voice ("…dear") and painted unattributed under his line
  // on the one screen where he is meant to be at his most forbidding.
  it('the thin-file nudge is authored, in the Portrait\'s register, and covers every thin count', () => {
    const portrait = getDialogueFile('portrait');
    const gates = portrait.nodes.filter((n) => n.id.startsWith('portrait.gate.'));
    expect(gates.length).toBeGreaterThan(0);
    for (const g of gates) {
      expect(g.once).toBe(false);
      // Round 5: moved off 'idle' onto its own trigger. On 'idle' these were
      // eligible in his ordinary rotation, so a parlor visit could serve
      // "your journal is empty" as small talk — the sentence only means
      // anything on the Sanctum door screen.
      expect(g.trigger).toBe('sanctum-idle');
      for (const line of g.lines) {
        expect(line.speaker).toBe('portrait');
        // His address term is "reader". "dear" belongs to Bramble, Ellery and Posy.
        expect(line.text.toLowerCase()).not.toMatch(/\bdear\b/);
      }
    }
    // Every fragment count below the threshold has a line waiting; the first
    // count at or above it has none (the signal stands down, AAA 4.16).
    const covers = (count: number) =>
      gates.some((g) =>
        (g.conditions ?? []).every((c) =>
          c.kind === 'fragmentCount' &&
          (c.gte === undefined || count >= c.gte) &&
          (c.lte === undefined || count <= c.lte)));
    for (let n = 0; n < THIN_FILE_THRESHOLD; n++) {
      expect(covers(n), `no authored gate line for ${n} fragments`).toBe(true);
    }
    expect(covers(THIN_FILE_THRESHOLD)).toBe(false);
  });

  // The engine must not have quietly regrown the strings.
  it('sanctumReadiness carries counts only — no prose', () => {
    const r = sanctumReadiness(volume, fresh());
    expect(Object.keys(r).sort()).toEqual(['enough', 'found', 'total']);
  });

  it('the journal nudge always has something warm to say while active', () => {
    expect(journalNudge(volume, fresh())).toBeTruthy();
    expect(journalNudge(volume, withFound('v1-d1'))).toBeTruthy();
    const all = withFound(...volume.fragments.map((f) => f.id));
    expect(journalNudge(volume, all)).toBeTruthy();
    expect(journalNudge(volume, { ...all, status: 'solved' })).toBeNull();
  });

});

// ---------------------------------------------------------------------------
// The unread chain (AAA 11.19-11.22)
// ---------------------------------------------------------------------------

const noLetters = { arrivedLetterIds: [] as string[], openedLetterIds: new Set<string>() };
const unread = (state: VolumeState, viewed: string[] = [], letters = noLetters) =>
  journalUnread(volume, state, { viewedIds: new Set(viewed), ...letters });

describe('unread is state, not recency', () => {
  it('is empty when nothing is filed — no marker where nothing is unread (11.21)', () => {
    const u = unread(fresh());
    expect(u.total).toBe(0);
    expect(u.fragments).toEqual([]);
  });

  it('marks every filed-but-unviewed fragment, grouped by the tab that shows it', () => {
    const state = withFound('v1-d1', 'v1-e1', 'v1-t2');
    const u = unread(state);
    expect(u.word).toEqual(['v1-d1']);
    expect(u.engravings).toEqual(['v1-e1']);
    expect(u.testimony).toEqual(['v1-t2']);
    // The entrance count is EXACTLY the number of unviewed items (11.21).
    expect(u.total).toBe(3);
    expect(u.total).toBe(u.fragments.length + u.letters.length);
  });

  it('retires only what has been viewed, and only that', () => {
    const state = withFound('v1-d1', 'v1-e1', 'v1-t2');
    const u = unread(state, ['v1-e1']);
    expect(u.engravings).toEqual([]);
    expect(u.total).toBe(2);
  });

  it('never marks a fragment the volume has not filed', () => {
    // Viewed-but-unfound and unfound-entirely both contribute nothing.
    expect(unread(fresh(), ['v1-d1']).total).toBe(0);
  });

  it('counts arrived-but-unopened letters, and drops them once opened', () => {
    const state = fresh();
    const tray = { arrivedLetterIds: ['first-post', 'readers-note'], openedLetterIds: new Set(['first-post']) };
    const u = unread(state, [], tray);
    expect(u.letters).toEqual(['readers-note']);
    expect(u.total).toBe(1);
  });

  it('takes no event stream and no day number — nothing dusk can prune (11.20)', () => {
    // The old `filedToday(recentEvents, day)` answered "filed on day N?" off
    // day.recentEvents, which pruneEventsAtDusk empties every night — so an
    // unviewed fragment silently lost its marker overnight and a fragment read
    // the instant it arrived kept one until dusk. The derivation's whole input
    // surface is now (content, volume state, viewed/opened ids): three
    // arguments, none of them day-scoped. The store-level proof that the
    // marker survives an actual day roll is in the slice suite below.
    expect(journalUnread.length).toBe(3);
  });
});

describe('viewed flags — the same write-once model as the letters', () => {
  it('round-trips a fragment id through the flag namespace', () => {
    const flag = viewedFragmentFlag('volume-1', 'v1-d1');
    expect(flag).toBe('vol.volume-1.viewed-v1-d1');
    expect([...viewedFragmentIds('volume-1', [flag, 'vol.volume-1.opened-first-post'])]).toEqual(['v1-d1']);
  });

  it('ignores flags belonging to another volume', () => {
    expect(viewedFragmentIds('volume-2', ['vol.volume-1.viewed-v1-d1']).size).toBe(0);
  });

  it('every authored fragment id yields a flag docs/flags.md accepts', () => {
    // setFlag silently REJECTS anything off-grammar, which would make the
    // marker un-clearable. A future volume authoring dotted ids (frag.v1.03)
    // must fail here, not in the wife's save.
    for (const f of volume.fragments) {
      expect(FLAG_REGEX.test(viewedFragmentFlag(volume.id, f.id))).toBe(true);
    }
  });
});

describe('displayedFragmentIds — viewing is what a tab puts on the glass', () => {
  const state = withFound('v1-d1', 'v1-e1', 'v1-t2');
  it('reports exactly the found fragments each tab renders', () => {
    expect(displayedFragmentIds(volume, state, 'word')).toEqual(['v1-d1']);
    expect(displayedFragmentIds(volume, state, 'engravings')).toEqual(['v1-e1']);
    expect(displayedFragmentIds(volume, state, 'testimony')).toEqual(['v1-t2']);
  });
  it('never claims a letter was viewed by opening the tab — the seal is the marker', () => {
    expect(displayedFragmentIds(volume, state, 'letters')).toEqual([]);
  });
  it('viewing every tab in turn clears the whole chain, and nothing else does', () => {
    const tabs: JournalTab[] = ['word', 'engravings', 'testimony', 'letters'];
    const viewed = tabs.flatMap((t) => displayedFragmentIds(volume, state, t));
    expect(unread(state, viewed).total).toBe(0);
  });
});

/**
 * A manor with the player standing on the landing, through a north door into
 * the sealed Sanctum — the ONLY place the door hears a word (AAA 4.10e). The
 * guess fixtures below stand here because the game makes her stand here.
 */
function manorAtTheDoor(): ManorState {
  const base = createManor(1);
  const landing: PlacedRoom = {
    cardId: 'reading-nook', cell: SANCTUM_DOOR_CELL, doors: ['N', 'S'],
    solved: true, kind: 'parlor',
  };
  return {
    ...base,
    rooms: { ...base.rooms, [cellKey(SANCTUM_DOOR_CELL)]: landing },
    playerCell: { ...SANCTUM_DOOR_CELL },
  };
}

describe('journal slice through the real store', () => {
  beforeEach(() => {
    // Reset only the pieces this suite exercises (the store is a singleton).
    useManorStore.setState({
      volume: fresh(),
      flags: [],
      recentEvents: [],
      counters: {},
      day: null,
      manor: manorAtTheDoor(),
    });
  });

  it('the door refuses a word spoken from anywhere but the landing', () => {
    // The round-7 blocker in one case: from the Entrance Hall the guess is
    // simply not heard — no attempt spent, nothing journaled, no penalty.
    useManorStore.setState({ manor: createManor(1) });
    useManorStore.getState().guessAtSanctum('lacuna');
    const st = useManorStore.getState();
    expect(st.volume.status).toBe('active');
    expect(st.volume.guesses).toEqual([]);
    expect(st.counters['sanctum-guess-wrong']).toBeUndefined();
  });

  it('fileFragment files once, forever, and rings the event spine', () => {
    const s = useManorStore.getState();
    s.fileFragment('v1-d1');
    s.fileFragment('v1-d1'); // idempotent
    s.fileFragment('not-a-real-fragment'); // stale ids never corrupt state
    const after = useManorStore.getState();
    expect(after.volume.foundFragmentIds).toEqual(['v1-d1']);
    expect(after.counters['fragment-found']).toBe(1);
  });

  it('interpretFragment: only found fragments, "next" resolves in revealOrder', () => {
    const s = useManorStore.getState();
    s.interpretFragment('v1-d1'); // not found yet → no-op
    expect(useManorStore.getState().volume.interpretedFragmentIds).toEqual([]);
    s.fileFragment('v1-e1');
    s.fileFragment('v1-d1');
    s.interpretFragment('next'); // lowest revealOrder found → v1-d1
    expect(useManorStore.getState().volume.interpretedFragmentIds).toEqual(['v1-d1']);
    expect(nextUninterpreted(volume, useManorStore.getState().volume)).toBe('v1-e1');
  });

  it('guessAtSanctum: wrong journals + emits closeness; the gate holds for the day', () => {
    const s = useManorStore.getState();
    s.guessAtSanctum('vellum');
    let st = useManorStore.getState();
    expect(st.volume.guesses.length).toBe(1);
    expect(st.counters['sanctum-guess-wrong']).toBe(1);
    s.guessAtSanctum('lagoon'); // same day → gate, nothing recorded
    st = useManorStore.getState();
    expect(st.volume.guesses.length).toBe(1);
    expect(st.counters['sanctum-guess-wrong']).toBe(1);
  });

  it('the winning word solves the volume, sets the reserved flag, rings the spine', () => {
    const s = useManorStore.getState();
    s.guessAtSanctum('  the Lacuna ');
    const st = useManorStore.getState();
    expect(st.volume.status).toBe('solved');
    expect(st.flags).toContain(solvedFlag(volume.id));
    expect(st.counters['volume-solved']).toBe(1);
    // beginNextVolume is a warm no-op until a volume-2 is authored.
    s.beginNextVolume();
    expect(useManorStore.getState().volume.volumeId).toBe(volume.id);
  });

  it('openLetter: write-once flag, grants filed before the event, pity grants drip', () => {
    const s = useManorStore.getState();
    s.fileFragment('v1-d1');
    s.openLetter('readers-note');
    let st = useManorStore.getState();
    expect(st.flags).toContain(openedLetterFlag(volume.id, 'readers-note'));
    expect(st.volume.foundFragmentIds).toContain('v1-d2');
    expect(st.counters['letter-opened']).toBe(1);
    s.openLetter('readers-note'); // sealed once, broken once
    expect(useManorStore.getState().counters['letter-opened']).toBe(1);

    s.openLetter('under-the-tray'); // pity: grants the lowest unfound (v1-e1)
    st = useManorStore.getState();
    expect(st.volume.foundFragmentIds).toContain('v1-e1');
  });

  it('openLetter resolves house-written pity letters (pity-extra-N) too', () => {
    const s = useManorStore.getState();
    s.openLetter('pity-extra-1'); // synthesized — not in content.letters
    const st = useManorStore.getState();
    expect(st.flags).toContain(openedLetterFlag(volume.id, 'pity-extra-1'));
    expect(st.volume.foundFragmentIds).toEqual(['v1-d1']); // grants the drip's next
    expect(st.counters['letter-opened']).toBe(1);
    s.openLetter('pity-extra-1'); // write-once, like any letter
    expect(useManorStore.getState().counters['letter-opened']).toBe(1);
    s.openLetter('not-a-letter-at-all'); // unknown ids stay a no-op
    expect(useManorStore.getState().counters['letter-opened']).toBe(1);
  });

  it('markFragmentsViewed writes the write-once flag, once, and only for filed ids', () => {
    const s = useManorStore.getState();
    s.fileFragment('v1-d1');
    s.fileFragment('v1-e1');
    s.markFragmentsViewed(['v1-d1', 'not-a-real-fragment']);
    let st = useManorStore.getState();
    expect(st.flags).toContain(viewedFragmentFlag(volume.id, 'v1-d1'));
    expect(st.flags).not.toContain(viewedFragmentFlag(volume.id, 'not-a-real-fragment'));
    // v1-e1 was never displayed, so it stays unread (11.20: viewing, and
    // nothing else, retires the marker).
    expect(st.flags).not.toContain(viewedFragmentFlag(volume.id, 'v1-e1'));

    const before = st.flags.length;
    s.markFragmentsViewed(['v1-d1']); // idempotent — no save churn
    st = useManorStore.getState();
    expect(st.flags.length).toBe(before);
  });

  it('an UNVIEWED fragment keeps its marker across the dusk that prunes the day (11.20)', () => {
    const s = useManorStore.getState();
    useManorStore.setState({
      day: {
        day: 3, phase: 'exploring', daySeed: 1, activeRoom: null,
      } as unknown as NonNullable<ReturnType<typeof useManorStore.getState>['day']>,
    });
    s.fileFragment('v1-e1');
    const seen = () =>
      journalUnread(volume, useManorStore.getState().volume, {
        viewedIds: viewedFragmentIds(volume.id, useManorStore.getState().flags),
        ...noLetters,
      });
    expect(seen().engravings).toEqual(['v1-e1']);

    // The day rolls. pruneEventsAtDusk keeps only the CLOSING day's events, so
    // it takes two dusks for a day-3 filing to leave the stream entirely —
    // which is exactly how long the old `filedToday` marker lasted, and why it
    // looked like it worked.
    const store = () => useManorStore.getState();
    store().endDay('steps-exhausted');   // dusk of day 3
    store().advanceDayPhase();           // → night
    store().startDay();                  // day 4
    store().endDay('steps-exhausted');   // dusk of day 4 — day 3 is gone
    expect(
      store().recentEvents.some((e) => e.event.type === 'fragment-found'),
    ).toBe(false);
    // The marker is still there, because it was never made of that.
    expect(seen().engravings).toEqual(['v1-e1']);
    expect(seen().total).toBe(1);

    // And it retires on viewing, permanently.
    useManorStore.getState().markFragmentsViewed(['v1-e1']);
    expect(seen().total).toBe(0);
  });

  it('collectFragmentForRoom walks the drip for A1’s violet rooms', () => {
    const s = useManorStore.getState();
    const first = s.collectFragmentForRoom('mystery');
    expect(first).toBe('v1-d1');
    const second = s.collectFragmentForRoom('puzzle');
    expect(second).toBe('v1-e1');
    expect(useManorStore.getState().volume.foundFragmentIds).toEqual(['v1-d1', 'v1-e1']);
  });
});
