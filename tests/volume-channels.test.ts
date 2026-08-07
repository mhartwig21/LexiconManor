/**
 * SOURCE-CATEGORY CHANNELS — every label the volume wears has a live emitter.
 * OWNER: A7 (Mystery). AAA 11.17 ("no dead reward class") · 4.14 (fragment
 * source diversity) · MANOR_DESIGN §6 ("the Study feeds the meta-mystery
 * directly").
 *
 * ROUND-8 DEFECT. `collectFragmentForRoom` had exactly one call site — the
 * violet branch of `chooseCard` — so drafting a mystery room was the whole of
 * the room→mystery wiring, and `RoomEvent.reward.fragmentId` was consumed by
 * `app/slices/room.ts` while no adapter emitted it. Meanwhile the authored
 * volume labelled fragments `sourceRoomCategory: "puzzle"`, which no puzzle
 * room could ever file: they arrived only through the mystery fallback, a
 * letter, or pity. The word games and the mystery were mechanically disjoint,
 * and the Study — the room the design calls the mystery's engine — moved the
 * mystery not at all.
 *
 * 11.17 is explicit about what counts as evidence: "a test that drives the
 * award path, not the existence of a checker function." So §2 walks the
 * MANIFEST — every `sourceRoomCategory` the authored volume actually uses —
 * and drives each one through the REAL store the way play drives it (a solve
 * on the spine, a drafted violet room, an authored testimony effect). A label
 * with no emitter fails here rather than shipping as decoration.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RoomCategory, VolumeState } from '../src/engine/types';
import type { DialogueFile } from '../src/engine/dialogue/schema';
import {
  declaredSourceCategories, fragmentForSolveChannel, freshVolumeState, isChannelFragment,
  LINTEL_CHANNEL, solveChannelFiledToday, solveChannelFor, STUDY_CHANNEL,
  type VolumeContent,
} from '../src/engine/volume';
import { DIALOGUE_FILES } from '../src/engine/dialogue/content';
import { useManorStore } from '../src/app/store';

const root = join(__dirname, '..');
const volume = JSON.parse(
  readFileSync(join(root, 'content', 'authored', 'volumes', 'volume-1.json'), 'utf8'),
) as VolumeContent;

const ALL_IDS = volume.fragments.map((f) => f.id);

/** A store standing where play would stand it: day 1, exploring, clean spine. */
function resetStore(state: VolumeState = freshVolumeState(volume.id, 1)) {
  useManorStore.setState({
    volume: state,
    recentEvents: [],
    counters: {},
    flags: [],
    seenNodeIds: [],
    day: { day: 1, phase: 'exploring', daySeed: 7, activeRoom: null },
  });
}

const store = () => useManorStore.getState();
const found = () => store().volume.foundFragmentIds;

/** Put every fragment BUT this one in the journal, so it is unambiguously the
 *  next thing any channel that can reach it would hand over. */
function onlyMissing(id: string) {
  resetStore({ ...freshVolumeState(volume.id, 1), foundFragmentIds: ALL_IDS.filter((x) => x !== id) });
}

/** The authored dialogue node that grants this fragment, if any (the
 *  testimony channel — parlor rooms and the morning scene). */
function testimonyNodeFor(fragmentId: string) {
  for (const file of Object.values(DIALOGUE_FILES) as DialogueFile[]) {
    for (const node of file.nodes) {
      const blocks = [node.effects, ...(node.choices ?? []).map((c) => c.effects)];
      for (const eff of blocks) {
        if (eff?.grantsFragmentIds?.includes(fragmentId)) return { file, node, eff };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. The channels themselves (pure)
// ---------------------------------------------------------------------------

describe('solve channels — strict, authored, never a silent fallback', () => {
  /**
   * ROUND 17 (REVIEW_AA §5.1) — THIS TEST USED TO BE TITLED AFTER THE BUG.
   *
   * It read "the Study pays definition lines; every other puzzle room pays
   * engravings", which is what the code did and what the review measured the
   * cost of: welding the channel to the fragment KIND put all six definition
   * lines — the best prose in the repository — behind a `rarity: 'rare'`,
   * `gemCost: 2`, tier-3-only room, and left the ordinary word games able to
   * pay exactly two fragments in the whole volume.
   *
   * The mapping asserted below never was about kinds; it is ROOM KIND → CHANNEL,
   * and it is unchanged. WHAT each channel pays is now the volume's authoring
   * decision, asserted against the authored JSON further down this file.
   */
  it('the Study solves into its own channel; every other word game into the lintel', () => {
    expect(solveChannelFor('forgotten-word')).toBe(STUDY_CHANNEL);
    for (const kind of ['hive', 'twistle', 'word-web', 'cipher', 'crossword', 'sudoku'] as const) {
      expect(solveChannelFor(kind)).toBe(LINTEL_CHANNEL);
    }
  });

  it('never falls back off its own channel (that is what the violet drip is for)', () => {
    const fresh = freshVolumeState(volume.id, 1);
    // Drain the Study channel: it must go quiet rather than start handing out
    // engravings or testimony.
    const studyIds = volume.fragments.filter((f) => isChannelFragment(f, STUDY_CHANNEL)).map((f) => f.id);
    expect(studyIds.length).toBeGreaterThan(0);
    const drained: VolumeState = { ...fresh, foundFragmentIds: studyIds };
    expect(fragmentForSolveChannel(volume, drained, STUDY_CHANNEL)).toBeNull();
    // …while the lintel channel is untouched by the Study's exhaustion.
    expect(fragmentForSolveChannel(volume, drained, LINTEL_CHANNEL)).not.toBeNull();
  });

  it('serves the lowest unfound revealOrder in the channel', () => {
    const fresh = freshVolumeState(volume.id, 1);
    const inOrder = volume.fragments
      .filter((f) => isChannelFragment(f, STUDY_CHANNEL))
      .sort((a, b) => a.revealOrder - b.revealOrder);
    expect(fragmentForSolveChannel(volume, fresh, STUDY_CHANNEL)?.id).toBe(inOrder[0]!.id);
  });

  it('the daily valve reads the spine, so it survives a reload and resets at dawn', () => {
    const line = volume.fragments.find((f) => isChannelFragment(f, STUDY_CHANNEL))!;
    const spine = [{
      day: 3, at: 0,
      event: { type: 'fragment-found', fragmentId: line.id, via: 'study' } as const,
    }];
    expect(solveChannelFiledToday(volume, STUDY_CHANNEL, spine, 3)).toBe(true);
    expect(solveChannelFiledToday(volume, STUDY_CHANNEL, spine, 4)).toBe(false);
    // Channels are valved independently — a solved Library does not silence
    // the Study for the rest of the evening.
    expect(solveChannelFiledToday(volume, LINTEL_CHANNEL, spine, 3)).toBe(false);
  });

  /**
   * ═══ ROUND-18 REGRESSION: THE VALVE COUNTS THE TAP, NOT THE PAGE ═══════════
   *
   * REVIEW_AA §5.1's re-route put lintel-labelled pages into the violet drip so
   * the ordinary word games would carry the spine. That silently broke the
   * valve, which asked "did a page BELONGING to this channel arrive today?" —
   * so *entering a mystery room* spent the lintel's daily allowance, and on
   * exactly the days the player drew the good room, solving every board in the
   * house paid nothing. §5.1's own finding, reintroduced through a side door.
   *
   * The valve asks about the FAUCET now (`fragment-found.via`), which is what
   * "has this channel paid today" always meant.
   */
  it('a violet draw does NOT spend the solve channel it happens to be labelled with', () => {
    const drip = volume.fragments.find(
      (f) => isChannelFragment(f, LINTEL_CHANNEL) && f.sourceRoomCategory === 'mystery',
    );
    expect(drip, 'volume-1 must still route a lintel page through the violet drip').toBeTruthy();
    // Filed by walking into a violet room: no `via`, because no channel paid.
    const spine = [{
      day: 3, at: 0, event: { type: 'fragment-found', fragmentId: drip!.id } as const,
    }];
    expect(solveChannelFiledToday(volume, LINTEL_CHANNEL, spine, 3)).toBe(false);
    expect(solveChannelFiledToday(volume, STUDY_CHANNEL, spine, 3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. THE MANIFEST — every declared source category, driven through the store
// ---------------------------------------------------------------------------

/**
 * How the game actually delivers a fragment of each declared category. These
 * are the REAL paths: the violet-room branch calls `collectFragmentForRoom`,
 * a solved room lands `room-solved` on the spine (the journal slice's watcher
 * does the rest), and testimony rides an authored dialogue effect through
 * `applyDialogueEffects` — the same call DialogueScene makes.
 */
const DRIVERS: Record<RoomCategory, (fragmentId: string) => void> = {
  mystery: () => {
    store().collectFragmentForRoom('mystery');
  },
  puzzle: (fragmentId) => {
    // Which room has to be solved to file this page is the fragment's CHANNEL,
    // not its kind. Before §5.1 the two were the same fact and this line read
    // `frag.kind === 'definition-line' ? 'forgotten-word' : 'hive'` — which
    // silently stopped driving the real emitter the moment a definition line
    // was routed to the lintel, and would have reported "no puzzle channel can
    // file it" for a page an ordinary solve now files on day 1.
    const frag = volume.fragments.find((f) => f.id === fragmentId)!;
    const kind = isChannelFragment(frag, STUDY_CHANNEL) ? 'forgotten-word' : 'hive';
    store().recordEvent({ type: 'room-solved', cellKey: '2,1', kind, tier: 1, perfect: false });
  },
  parlor: (fragmentId) => {
    const hit = testimonyNodeFor(fragmentId);
    if (!hit) return; // asserted separately below — a parlor label with no scene
    store().applyDialogueEffects(hit.eff);
  },
  utility: () => {
    /* volume 1 declares none; a future volume that does must add a driver
       here, which is the point: the manifest is walked, not assumed. */
  },
};

describe('the manifest — a labelled source category with no emitter fails the build', () => {
  beforeEach(() => resetStore());

  const declared = declaredSourceCategories(volume);

  it('volume 1 declares the categories it is documented to declare', () => {
    expect(declared).toContain('mystery');
    expect(declared).toContain('puzzle');
    expect(declared).toContain('parlor');
  });

  for (const category of declared) {
    const fragments = volume.fragments.filter((f) => f.sourceRoomCategory === category);

    it(`"${category}" has a live emitter that files every fragment it labels`, () => {
      for (const frag of fragments) {
        onlyMissing(frag.id);
        DRIVERS[category](frag.id);
        expect(
          found(),
          `${frag.id} is labelled sourceRoomCategory:"${category}" but no ${category} channel can file it`,
        ).toContain(frag.id);
      }
    });
  }

  it('every "parlor" fragment is spoken by an authored scene, not just labelled', () => {
    for (const frag of volume.fragments.filter((f) => f.sourceRoomCategory === 'parlor')) {
      const hit = testimonyNodeFor(frag.id);
      expect(hit, `${frag.id} claims the parlor channel but no authored node grants it`).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Source diversity per fragment class (AAA 4.14, the Blue Prince fix)
// ---------------------------------------------------------------------------

describe('every fragment class is reachable by >= 2 distinct source types', () => {
  /** Everything that can put a fragment in the journal, named. */
  function sourcesFor(fragmentId: string): string[] {
    const frag = volume.fragments.find((f) => f.id === fragmentId)!;
    const out: string[] = [];
    // 1. The violet drip. `nextFragmentForRoom` falls back to the global
    //    lowest unfound, so a mystery room can reach ANY fragment eventually.
    out.push('violet-room');
    // 2. A solve channel.
    for (const channel of [STUDY_CHANNEL, LINTEL_CHANNEL]) {
      if (isChannelFragment(frag, channel)) out.push(`solve:${channel.id}`);
    }
    // 3. An authored letter grant, or the pity channel (which grants the next
    //    unfound fragment, whatever it is — so it reaches everything).
    if (volume.letters.some((l) => l.grantsFragmentIds?.includes(fragmentId))) out.push('letter');
    out.push('pity-letter');
    // 4. Testimony spoken in person.
    if (testimonyNodeFor(fragmentId)) out.push('testimony');
    return out;
  }

  for (const kind of ['definition-line', 'engraving', 'testimony'] as const) {
    it(`"${kind}" fragments have at least two source types each`, () => {
      const of = volume.fragments.filter((f) => f.kind === kind);
      expect(of.length).toBeGreaterThan(0);
      for (const frag of of) {
        const sources = sourcesFor(frag.id);
        expect(sources.length, `${frag.id}: only ${sources.join(', ')}`).toBeGreaterThanOrEqual(2);
      }
    });
  }

  it('the word games are a real channel, not a rounding error', () => {
    const viaSolve = volume.fragments.filter(
      (f) => isChannelFragment(f, STUDY_CHANNEL) || isChannelFragment(f, LINTEL_CHANNEL),
    );
    // Round-8 baseline: 3 definition lines from the Study + 2 lintel
    // engravings. Below this the word games stop mattering to the mystery
    // (MANOR_DESIGN §6) and the wiring is decorative again.
    expect(viaSolve.length, 'the puzzle rooms pay too little into the mystery').toBeGreaterThanOrEqual(4);
    expect(viaSolve.some((f) => f.kind === 'definition-line')).toBe(true);
    expect(viaSolve.some((f) => f.kind === 'engraving')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. The Study, specifically (MANOR_DESIGN §6)
// ---------------------------------------------------------------------------

describe('the Study feeds the meta-mystery directly', () => {
  beforeEach(() => resetStore());

  it('solving it hands over a line of the definition — every volume authors some', () => {
    const studyLines = volume.fragments.filter((f) => isChannelFragment(f, STUDY_CHANNEL));
    expect(
      studyLines.length,
      'no definition line is reachable from the Study — the room the design calls the mystery\'s engine pays nothing',
    ).toBeGreaterThan(0);

    store().recordEvent({
      type: 'room-solved', cellKey: '2,1', kind: 'forgotten-word', tier: 3, perfect: false,
    });
    const filed = found();
    expect(filed.length).toBe(1);
    const frag = volume.fragments.find((f) => f.id === filed[0])!;
    expect(frag.kind).toBe('definition-line');
  });

  /**
   * ═══ REVIEW_AA §5.1, AS A TEST ════════════════════════════════════════════
   *
   * This assertion used to read `.kind).toBe('engraving')` — i.e. it pinned the
   * defect. The review's finding, verbatim: *"All six definition lines — the
   * best prose in the repository, the 'In my mother Latin I was a little pool'
   * register — are behind violet draws and a rare tier-3 room. The game is
   * choosing not to give the player its best writing."*
   *
   * Its "done looks like" is one sentence — *"at least one definition line
   * reachable by a normal anchor solve on day 1"* — so that is what is asserted
   * here, on the real store, on day 1, from a tier-1 Library on the ground
   * floor: the cheapest, commonest room in the house, solved once.
   */
  it('§5.1 — a day-1 anchor solve hands over a line of the definition', () => {
    store().recordEvent({
      type: 'room-solved', cellKey: '1,1', kind: 'word-web', tier: 1, perfect: false,
    });
    const filed = found();
    expect(filed.length).toBe(1);
    const frag = volume.fragments.find((f) => f.id === filed[0])!;
    expect(
      frag.kind,
      `a day-1 Library solve filed ${frag.id} (${frag.kind}); §5.1 wants a definition line`,
    ).toBe('definition-line');
    // …and it is legible the instant it lands. A page the lintel pays is one
    // she solved for, never one of the violet rooms' sealed leaves.
    expect(store().volume.foundFragmentIds).toContain(frag.id);
  });

  /**
   * The counterweight, so §5.1 cannot be "fixed" by routing the whole volume
   * through one channel: the lintel must carry the SPINE, not the lot. The
   * violet rooms and the parlor keep authored stock of their own, or the seal
   * mechanic and the testimony channel become decoration.
   */
  it('the re-route did not empty the other channels', () => {
    const byChannel = (id: string) => volume.fragments.filter(
      (f) => (f as { channel?: string }).channel === id,
    ).length;
    const violet = volume.fragments.filter((f) => f.sourceRoomCategory === 'mystery').length;
    const parlor = volume.fragments.filter((f) => f.sourceRoomCategory === 'parlor').length;
    expect(byChannel('lintel'), 'the lintel channel is starved again').toBeGreaterThanOrEqual(6);
    expect(byChannel('study'), 'the Study pays nothing').toBeGreaterThanOrEqual(2);
    expect(violet, 'the violet rooms have nothing of their own to keep').toBeGreaterThanOrEqual(6);
    expect(parlor, 'the characters have nothing to say').toBeGreaterThanOrEqual(4);
  });

  it('one per day per channel — a five-room evening is not a firehose', () => {
    store().recordEvent({ type: 'room-solved', cellKey: '1,1', kind: 'word-web', tier: 1, perfect: false });
    store().recordEvent({ type: 'room-solved', cellKey: '3,1', kind: 'twistle', tier: 1, perfect: false });
    store().recordEvent({ type: 'room-solved', cellKey: '1,2', kind: 'cipher', tier: 1, perfect: false });
    expect(found().length, 'the lintel channel paid more than once in a day').toBe(1);

    // …but the Study keeps its own slot the same evening.
    store().recordEvent({
      type: 'room-solved', cellKey: '2,3', kind: 'forgotten-word', tier: 2, perfect: false,
    });
    expect(found().length).toBe(2);

    // Tomorrow it pays again.
    useManorStore.setState({ day: { day: 2, phase: 'exploring', daySeed: 8, activeRoom: null } });
    store().recordEvent({ type: 'room-solved', cellKey: '2,4', kind: 'hive', tier: 2, perfect: false });
    expect(found().length).toBe(3);
  });

  it('files nothing once the volume is closed', () => {
    resetStore({ ...freshVolumeState(volume.id, 1), status: 'solved' });
    store().recordEvent({ type: 'room-solved', cellKey: '1,1', kind: 'hive', tier: 1, perfect: false });
    expect(found()).toEqual([]);
  });

  it('the award path emits fragment-found on the spine, so the moment layer sees it', () => {
    store().recordEvent({ type: 'room-solved', cellKey: '1,1', kind: 'hive', tier: 1, perfect: false });
    const filed = found()[0]!;
    const announced = useManorStore
      .getState()
      .recentEvents.some((r) => r.event.type === 'fragment-found' && r.event.fragmentId === filed);
    expect(announced, 'a fragment filed by a solve announced nothing on the spine').toBe(true);
  });
});
