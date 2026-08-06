/**
 * The journal derivations + the journal slice — OWNER: A7 (Mystery).
 * Pure-engine tests for grouping/gaps/alphabet/nudges, plus an integration
 * pass through the real store (fileFragment → event spine, the Sanctum
 * guess flow, letters setting write-once flags).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { VolumeState } from '../src/engine/types';
import { freshVolumeState, openedLetterFlag, solvedFlag, type VolumeContent } from '../src/engine/volume';
import {
  alphabetFacts, crossRefs, definitionSlots, filedToday, foundByKind, guessHistory,
  journalNudge, letterBoxes, nextUninterpreted, sanctumReadiness, THIN_FILE_THRESHOLD,
} from '../src/engine/journal';
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
  it('recomputes closeness per guess and marks the winning word', () => {
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
    expect(h[0]!.closeness.repeat).toBe(false);
    expect(h[1]!.closeness.repeat).toBe(true);
    expect(h[2]!.wasAnswer).toBe(true);
    expect(h[0]!.wasAnswer).toBe(false);
  });
});

describe('nudges — sympathetic, never silence (AAA 4.16)', () => {
  it('a thin case file gets an explicit nudge, never a gate', () => {
    const r = sanctumReadiness(volume, fresh());
    expect(r.enough).toBe(false);
    expect(r.nudge).toBeTruthy();
  });

  it(`the nudge stands down at ${THIN_FILE_THRESHOLD} fragments`, () => {
    const ids = volume.fragments.slice(0, THIN_FILE_THRESHOLD).map((f) => f.id);
    const r = sanctumReadiness(volume, withFound(...ids));
    expect(r.enough).toBe(true);
    expect(r.nudge).toBeNull();
  });

  it('the journal nudge always has something warm to say while active', () => {
    expect(journalNudge(volume, fresh())).toBeTruthy();
    expect(journalNudge(volume, withFound('v1-d1'))).toBeTruthy();
    const all = withFound(...volume.fragments.map((f) => f.id));
    expect(journalNudge(volume, all)).toBeTruthy();
    expect(journalNudge(volume, { ...all, status: 'solved' })).toBeNull();
  });

  it('filedToday feeds the unread wax dots', () => {
    const events = [
      { day: 2, at: 1, event: { type: 'fragment-found', fragmentId: 'v1-d1' } as const },
      { day: 3, at: 2, event: { type: 'fragment-found', fragmentId: 'v1-e1' } as const },
    ];
    expect([...filedToday(events, 3)]).toEqual(['v1-e1']);
  });
});

describe('journal slice through the real store', () => {
  beforeEach(() => {
    // Reset only the pieces this suite exercises (the store is a singleton).
    useManorStore.setState({
      volume: fresh(),
      flags: [],
      recentEvents: [],
      counters: {},
      day: null,
    });
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

  it('collectFragmentForRoom walks the drip for A1’s violet rooms', () => {
    const s = useManorStore.getState();
    const first = s.collectFragmentForRoom('mystery');
    expect(first).toBe('v1-d1');
    const second = s.collectFragmentForRoom('puzzle');
    expect(second).toBe('v1-e1');
    expect(useManorStore.getState().volume.foundFragmentIds).toEqual(['v1-d1', 'v1-e1']);
  });
});
