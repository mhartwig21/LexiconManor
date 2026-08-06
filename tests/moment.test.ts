/**
 * THE MOMENT — queue logic + emitter reach. OWNER: the moment layer.
 *
 * Two halves, matching the two ways the round-6 defect could come back:
 *   1. the queue drops or repeats a grant (unit tests over the pure reducers)
 *   2. an emitter's grant never reaches the layer at all — which is exactly
 *      what shipped: four fragment channels, one of which was on screen
 *      (AAA §0.5 escape 3, §11.10). Every campaign-class emitter is driven
 *      through the REAL store here and asserted to produce a moment.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { freshVolumeState, type VolumeContent } from '../src/engine/volume';
import { useManorStore } from '../src/app/store';
import {
  advance, EMPTY_QUEUE, enqueue, keepsakeMoment, letterMoment, MAX_PENDING, momentForEvent,
  openingWords, plateMoment, type Moment, type MomentContext,
} from '../src/ui/moment/moments';
import {
  keepsakeSeenFlag, mantelLine, plateSeenFlag, unseenKeepsakes, unseenPlates,
} from '../src/ui/moment/mantel';
import { createMomentQueue } from '../src/ui/moment/queue';
import { createMomentWatcher, readSnapshot, liveContext } from '../src/ui/moment/watch';
import { KEEPSAKES } from '../src/engine/achievements';
import { UNLOCKABLE_CARDS } from '../src/engine/manor/deck';

const volume = JSON.parse(
  readFileSync(join(__dirname, '..', 'content', 'authored', 'volumes', 'volume-1.json'), 'utf8'),
) as VolumeContent;

const seal = (key: string): Moment => ({
  key, kind: 'fragment', sigil: 'W', title: key, where: 'Journal',
});

const ctx: MomentContext = {
  fragment: (id) => {
    const f = volume.fragments.find((x) => x.id === id);
    return f ? { kind: f.kind, text: f.text, interpretation: f.interpretation } : null;
  },
  answerFor: (id) => (id === volume.id ? volume.answer : null),
};

// ---------------------------------------------------------------------------
// 1. The queue — two grants in quick succession both get seen (AAA 11.13)
// ---------------------------------------------------------------------------

describe('the moment queue', () => {
  it('shows the first grant immediately and queues the second', () => {
    const one = enqueue(EMPTY_QUEUE, seal('a'));
    expect(one.current?.key).toBe('a');
    const two = enqueue(one, seal('b'));
    expect(two.current?.key).toBe('a');
    expect(two.pending.map((m) => m.key)).toEqual(['b']);
  });

  it('never drops a grant: dismissing promotes the next one, in order', () => {
    let q = enqueue(enqueue(enqueue(EMPTY_QUEUE, seal('a')), seal('b')), seal('c'));
    q = advance(q);
    expect(q.current?.key).toBe('b');
    q = advance(q);
    expect(q.current?.key).toBe('c');
    q = advance(q);
    expect(q.current).toBeNull();
    expect(advance(q)).toBe(q); // idle dismiss is a no-op, not a re-render
  });

  it('dedups by key — one grant is announced exactly once, ever', () => {
    const one = enqueue(EMPTY_QUEUE, seal('frag:v1-d1'));
    const again = enqueue(one, seal('frag:v1-d1'));
    expect(again).toBe(one);
    // Still deduped after it has been dismissed (the shown-memory guard).
    const dismissed = advance(one);
    expect(enqueue(dismissed, seal('frag:v1-d1'))).toBe(dismissed);
  });

  it('past the cap it drops the OLDEST waiting grant, never the newest', () => {
    let q = EMPTY_QUEUE;
    for (let i = 0; i <= MAX_PENDING; i++) q = enqueue(q, seal(`m${i}`));
    expect(q.current?.key).toBe('m0');
    expect(q.pending.length).toBe(MAX_PENDING);
    q = enqueue(q, seal('newest'));
    expect(q.pending.length).toBe(MAX_PENDING);
    expect(q.pending[q.pending.length - 1]?.key).toBe('newest');
    expect(q.pending.map((m) => m.key)).not.toContain('m1');
  });

  it('the observable queue notifies subscribers on push and dismiss', () => {
    const queue = createMomentQueue();
    let notified = 0;
    const off = queue.subscribe(() => { notified++; });
    queue.push(seal('a'));
    queue.push(seal('a')); // deduped → no notification
    expect(notified).toBe(1);
    expect(queue.getState().current?.key).toBe('a');
    queue.dismiss();
    expect(notified).toBe(2);
    expect(queue.getState().current).toBeNull();
    off();
    queue.push(seal('b'));
    expect(notified).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. The copy — a reward in its own voice, never flavour (AAA 11.14)
// ---------------------------------------------------------------------------

describe('the seal’s words', () => {
  it('carries the opening words, cut on a word boundary, in the journal’s quotes', () => {
    const q = openingWords('Where a thing is missing, I am what remains: not nothing — the shape that nothing takes.');
    expect(q.startsWith('“')).toBe(true);
    expect(q.endsWith('…”')).toBe(true);
    expect(q).not.toMatch(/\s…”$/); // no orphaned space before the ellipsis
    expect(q.length).toBeLessThan(70);
  });

  it('strips the content’s own outer quotes and demotes nested speech', () => {
    const q = openingWords('“Six candles, always six.”', 200);
    expect(q).toBe('“Six candles, always six.”');
    const nested = openingWords('He wrote “lacuna” in the margin.', 200);
    expect(nested).toBe('“He wrote ‘lacuna’ in the margin.”');
  });

  it('maps every campaign event to a moment, and session/flavour events to none', () => {
    const frag = momentForEvent({ type: 'fragment-found', fragmentId: 'v1-t2' }, ctx)!;
    expect(frag.kind).toBe('fragment');
    expect(frag.sigil).toBe('T');                       // the journal tab it filed to
    expect(frag.where).toMatch(/Journal/);              // names its own trace (11.12)
    expect(frag.quote).toContain('Six candles');

    expect(momentForEvent({ type: 'fragment-found', fragmentId: 'v1-e1' }, ctx)!.sigil).toBe('E');
    expect(momentForEvent({ type: 'fragment-found', fragmentId: 'v1-d1' }, ctx)!.sigil).toBe('W');
    expect(momentForEvent({ type: 'volume-solved', volumeId: volume.id }, ctx)!.quote)
      .toBe('“LACUNA”');
    expect(momentForEvent({ type: 'affinity-rank-up', character: 'bramble', rank: 1 }, ctx)!.title)
      .toContain('Mrs. Bramble');
    expect(letterMoment({ id: 'first-post', from: 'posy', subject: 'On the matter' }).sigil)
      .toBe('L');

    // Session-class and flavour events never take the glass (11.14 / the
    // Campaign/Session/Flavour table in §11).
    expect(momentForEvent({ type: 'dewey-petted' }, ctx)).toBeNull();
    expect(momentForEvent({ type: 'day-started', day: 2 }, ctx)).toBeNull();
    expect(momentForEvent(
      { type: 'room-solved', cellKey: '2,1', kind: 'hive', tier: 1, perfect: true }, ctx,
    )).toBeNull();
    // An unknown fragment id still announces, it just cannot quote itself.
    const unknown = momentForEvent({ type: 'fragment-found', fragmentId: 'nope' }, ctx)!;
    expect(unknown.quote).toBeUndefined();
    expect(unknown.title).toMatch(/fragment/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Emitter reach — every campaign channel lands on the layer (AAA 11.10/11.11)
// ---------------------------------------------------------------------------

describe('every campaign-class emitter reaches the moment layer', () => {
  const queue = createMomentQueue();
  const watcher = createMomentWatcher(
    queue,
    () => readSnapshot(useManorStore.getState()),
    liveContext,
  );

  /** Every key announced by one pass of the watcher over the live store. */
  const drain = (): string[] => {
    watcher.sync();
    const out: string[] = [];
    let s = queue.getState();
    while (s.current) {
      out.push(s.current.key);
      queue.dismiss();
      s = queue.getState();
    }
    return out;
  };

  /**
   * The same, minus the two mantel channels (round 9). Filing the first
   * fragment genuinely also presses 'a-line-in-his-hand' onto the mantel, and
   * closing the volume awards more — real campaign moments, with their own
   * cases below. Filtering them here keeps each channel case about ITS channel,
   * and means adding a keepsake to the catalog cannot break six unrelated
   * assertions about fragments and letters.
   */
  const announced = (): string[] =>
    drain().filter((k) => !k.startsWith('keepsake:') && !k.startsWith('plate:'));

  beforeEach(() => {
    useManorStore.setState({
      volume: freshVolumeState(volume.id, 1),
      flags: [],
      recentEvents: [],
      counters: {},
      affinities: { bramble: 0, ellery: 0, posy: 0, fern: 0, dewey: 0, portrait: 0 },
      day: { day: 1, phase: 'exploring', daySeed: 7, activeRoom: null },
      chronicles: { dayRecords: [] },
      // Round 9: the mantel and the cabinet are diffed channels too, so they
      // have to start empty or `prime()` adopts last case's grants.
      earnedAchievementIds: [],
      cabinet: { unlockedCardIds: [] },
    });
    queue.reset();
    watcher.prime(); // the world as she left it is not news
  });

  it('CHANNEL 1 — the mystery room’s drip (app/slices/manor.ts)', () => {
    // The exact expression manor.ts runs when a violet room is drafted.
    const id = useManorStore.getState().collectFragmentForRoom('mystery');
    expect(id).toBe('v1-d1');
    expect(announced()).toEqual(['fragment:v1-d1']);
  });

  it('CHANNEL 2 — testimony spoken behind the dialogue overlay (slices/dialogue.ts)', () => {
    useManorStore.getState().applyDialogueEffects({ grantsFragmentIds: ['v1-t2'] });
    expect(announced()).toEqual(['fragment:v1-t2']);
  });

  it('CHANNEL 3 — a letter opened on the journal, where ManorPage is unmounted', () => {
    useManorStore.getState().fileFragment('v1-d1');
    queue.reset();
    watcher.sync(); // adopt that one, so the letter’s grant stands alone
    queue.reset();
    useManorStore.getState().openLetter('readers-note'); // grants v1-d2
    expect(announced()).toEqual(['fragment:v1-d2']);
  });

  it('CHANNEL 4 — a room’s reward, from inside the room (slices/room.ts)', () => {
    useManorStore.setState({
      day: {
        day: 1, phase: 'exploring', daySeed: 7,
        activeRoom: { cellKey: '2,3', kind: 'hive', puzzleId: 'p', tier: 2 },
      },
    });
    useManorStore.getState().applyRoomEvents(
      [{ type: 'reward', fragmentId: 'v1-e1' }],
      { status: 'active', perfect: false },
    );
    expect(announced()).toEqual(['fragment:v1-e1']);
  });

  it('a letter ARRIVING is announced — it emits no event at all, so the tray is diffed', () => {
    // Day 1 primed with 'first-post' in the tray. Ellery's returned leaf wants
    // day 2 AND one fragment filed; both, and it is in the post.
    useManorStore.getState().fileFragment('v1-d1');
    expect(announced()).toEqual(['fragment:v1-d1']);
    useManorStore.setState({ day: { day: 2, phase: 'morning', daySeed: 8, activeRoom: null } });
    expect(announced()).toEqual(['letter:readers-note']);
    // And never twice, however many passes run while it sits there unopened.
    expect(announced()).toEqual([]);
  });

  it('volume progress and a rank-up take the glass too', () => {
    // Round 8's SECOND GATE (AAA 4.10e): the word only counts from the landing
    // at (2,5) with a matched north door overhead. Stand her there, then speak.
    useManorStore.setState({
      manor: {
        daySeed: 7,
        playerCell: { col: 2, row: 5 },
        rooms: {
          '2,5': {
            cardId: 'reading-nook', cell: { col: 2, row: 5 }, doors: ['N', 'S'],
            solved: false, kind: 'parlor',
          },
          '2,6': {
            cardId: 'sanctum', cell: { col: 2, row: 6 }, doors: ['S'],
            solved: false, kind: 'mystery',
          },
        },
      },
    });
    useManorStore.getState().guessAtSanctum('the lacuna');
    // The closing seal, and the epilogue letter the solve puts in the tray.
    expect(announced()).toEqual([`volume:${volume.id}`, 'letter:after-the-door']);
    useManorStore.getState().adjustAffinity('ellery', 40);
    const keys = announced();
    expect(keys.some((k) => k.startsWith('affinity:ellery:'))).toBe(true);
  });

  it('two grants in the same tick are both seen, in order, neither dropped', () => {
    const s = useManorStore.getState();
    s.applyDialogueEffects({ grantsFragmentIds: ['v1-d1', 'v1-e1'] });
    expect(announced()).toEqual(['fragment:v1-d1', 'fragment:v1-e1']);
  });

  it('a grant landing while nothing is mounted still waits on the queue', () => {
    // No layer, no screen: the queue is not component state, so the moment is
    // still there whenever the player next surfaces (AAA 11.13).
    useManorStore.getState().fileFragment('v1-d3');
    watcher.sync();
    expect(queue.getState().current?.key).toBe('fragment:v1-d3');
  });

  it('re-syncing without a new grant announces nothing (idempotent passes)', () => {
    useManorStore.getState().fileFragment('v1-d1');
    expect(announced()).toEqual(['fragment:v1-d1']);
    expect(announced()).toEqual([]);
    expect(announced()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // ROUND 9 — the two permanent-unlock channels (AAA 11.12's Campaign table
  // lists "permanent unlock (room card, keepsake)" explicitly). Both were
  // banked live in round 8 with nothing said anywhere in the app.
  // -------------------------------------------------------------------------

  it('CHANNEL 5 — a keepsake banked by meta.syncEarnedRewards (the day roll)', () => {
    useManorStore.setState({
      chronicles: {
        dayRecords: [{
          day: 1, endedAt: 1000, cause: 'retired-early',
          roomsDrafted: 2, roomsSolved: 1, stepsSpent: 12, fragmentsFound: 0,
        }],
      },
    });
    useManorStore.getState().syncEarnedRewards();
    expect(useManorStore.getState().earnedAchievementIds).toContain('first-morning');
    expect(drain()).toEqual(['keepsake:first-morning']);
    // ...and exactly once, however many passes run afterwards.
    expect(drain()).toEqual([]);
  });

  it('CHANNEL 6 — a floorplan plate filled by the flag that names it', () => {
    // The authored flag Posy's favour chain sets; meta.syncEarnedRewards turns
    // it into a cabinet plate. Before round 9 that plate was silent everywhere.
    useManorStore.getState().setFlag('posy.deputy');
    useManorStore.getState().syncEarnedRewards();
    expect(useManorStore.getState().cabinet.unlockedCardIds).toContain('map-room');
    expect(drain()).toEqual(['plate:map-room']);
    expect(drain()).toEqual([]);
  });

  it('an unauthored volume does not silence the mantel', () => {
    // readSnapshot used to return early on a missing volume; keepsakes are not
    // volume-scoped and must survive that branch.
    useManorStore.setState({
      volume: freshVolumeState('volume-not-authored', 1),
      earnedAchievementIds: ['first-morning'],
    });
    expect(drain()).toEqual(['keepsake:first-morning']);
  });
});

// ---------------------------------------------------------------------------
// 4. The mantel's persistent trace (AAA 11.19/11.20/11.21)
// ---------------------------------------------------------------------------

describe('the mantel’s unread chain', () => {
  it('marks a banked keepsake unread until its viewed-flag is written', () => {
    expect(unseenKeepsakes(['first-morning'], []).map((k) => k.id)).toEqual(['first-morning']);
    expect(unseenKeepsakes(['first-morning'], [keepsakeSeenFlag('first-morning')])).toEqual([]);
  });

  it('never mints a marker for an id the shelf cannot show (11.21)', () => {
    // A legacy v1 achievement that slipped the migration's prune: it has no
    // plate on the shelf, so a mark for it could never be cleared by viewing.
    expect(unseenKeepsakes(['boss-slayer'], [])).toEqual([]);
    expect(unseenPlates(['no-such-card'], [])).toEqual([]);
  });

  it('marks a filled plate unread until the cabinet has shown it', () => {
    expect(unseenPlates(['map-room'], []).map((c) => c.id)).toEqual(['map-room']);
    expect(unseenPlates(['map-room'], [plateSeenFlag('map-room')])).toEqual([]);
  });

  it('the viewed flags obey the frozen docs/flags.md grammar', () => {
    const grammar = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*){1,2}$/;
    for (const k of KEEPSAKES) expect(keepsakeSeenFlag(k.id)).toMatch(grammar);
    for (const c of UNLOCKABLE_CARDS) expect(plateSeenFlag(c.id)).toMatch(grammar);
  });

  it('gives the night digest a line, and stays silent when nothing waits', () => {
    expect(mantelLine(0, 0)).toBeNull();
    expect(mantelLine(1, 0)).toMatch(/keepsake/);
    expect(mantelLine(2, 1)).toMatch(/Two keepsakes/);
    expect(mantelLine(0, 1)).toMatch(/floorplan/);
  });

  it('the seal names a trace the player can actually reach', () => {
    const k = keepsakeMoment({ id: 'first-morning', name: 'The First Morning', description: 'Keep a day.' });
    expect(k.key).toBe('keepsake:first-morning');
    expect(k.where).toMatch(/Chronicles/);
    expect(k.title).toContain('The First Morning');
    const p = plateMoment({ id: 'map-room', name: 'The Map Room' });
    expect(p.where).toMatch(/Cabinet/);
    // AAA 6.3/11.22: one Latin letterform, never a glyph that can tofu.
    expect(k.sigil).toMatch(/^[A-Z]$/);
    expect(p.sigil).toMatch(/^[A-Z]$/);
  });
});
