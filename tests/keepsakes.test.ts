/**
 * KEEPSAKES + FLOORPLAN UNLOCKS — the two dead reward classes (AAA 11.17).
 *
 * Round-7 defect, in two halves:
 *   1. `checkAchievements` had zero call sites in src/, `earnedAchievementIds`
 *      had no mutator, and the Chronicles' keepsakes total and section were
 *      structurally always empty.
 *   2. `meta.unlockCard` had zero call sites and the two unlockable cards were
 *      gated on ids ('posy-quest-1') nothing in the game ever produced, so
 *      AAA 4.7's unlock badges could never light.
 *
 * 11.17 is explicit about what counts as evidence: "a test that drives the
 * award path, not the existence of a checker function." So §3 and §4 below
 * mutate the REAL store the way play mutates it — record a solve on the spine,
 * bank a day record, set the flag Posy's authored chain sets — and assert the
 * reward lands. §5 walks the authored dialogue and fails if a cabinet plate is
 * gated on a flag no authored effect can set: the exact shape of the original
 * defect, made un-shippable.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkKeepsakes, KEEPSAKES, KEEPSAKE_IDS, keepsakeById, keepsakeFacts, keepsakeShelf,
  pruneUnknownKeepsakeIds,
} from '../src/engine/achievements';
import { ACHIEVEMENTS } from '../src/engine/effects';
import {
  cardsUnlockedByFlags, deckFor, UNLOCKABLE_CARDS, UNLOCK_QUEST_NAMES,
} from '../src/engine/manor/deck';
import { useManorStore } from '../src/app/store';
import { createEmptySaveV2 } from '../src/app/save';
import { migrate } from '../src/app/migrations';
import type { DayRecord } from '../src/engine/types';

const DIALOGUE_DIR = join(__dirname, '..', 'content', 'authored', 'dialogue');

const dayRecord = (over: Partial<DayRecord> = {}): DayRecord => ({
  day: 1, endedAt: 1000, cause: 'retired-early',
  roomsDrafted: 2, roomsSolved: 1, stepsSpent: 12, fragmentsFound: 0, ...over,
});

/** A store wiped back to a fresh save's meta state, between every case. */
function resetStore() {
  useManorStore.setState({
    counters: {},
    recentEvents: [],
    flags: [],
    chronicles: { dayRecords: [] },
    earnedAchievementIds: [],
    cabinet: { unlockedCardIds: [] },
    day: { day: 1, phase: 'exploring', daySeed: 11, activeRoom: null },
  });
}

const earnedIds = () => useManorStore.getState().earnedAchievementIds;

// ---------------------------------------------------------------------------
// 1. The catalog itself
// ---------------------------------------------------------------------------

describe('the keepsake catalog', () => {
  it('is manor-native — no v1 roguelike ids survive into it', () => {
    expect(KEEPSAKES.length).toBeGreaterThanOrEqual(8);
    for (const legacy of ACHIEVEMENTS) {
      expect(KEEPSAKE_IDS.has(legacy.id)).toBe(false);
    }
  });

  it('has unique ids and copy on every plate (nothing renders blank)', () => {
    expect(new Set(KEEPSAKES.map((k) => k.id)).size).toBe(KEEPSAKES.length);
    for (const k of KEEPSAKES) {
      expect(k.name.trim().length).toBeGreaterThan(0);
      expect(k.description.trim().length).toBeGreaterThan(0);
      expect(keepsakeById(k.id)).toBe(k);
    }
  });

  it('awards nothing on a fresh save, and everything at full facts', () => {
    const empty = createEmptySaveV2('Player');
    const none = keepsakeFacts({
      counters: empty.events.counters,
      dayRecords: empty.chronicles.dayRecords,
      flags: empty.journal.flags,
    });
    expect(checkKeepsakes([], none)).toEqual([]);

    const everything = keepsakeFacts({
      counters: {
        'room-solved': 99, 'room-notable': 9, 'fragment-found': 20, 'letter-opened': 9,
        'volume-solved': 1, 'dewey-petted': 30, 'affinity-rank-up': 12,
      },
      dayRecords: Array.from({ length: 30 }, (_, i) =>
        dayRecord({ day: i + 1, roomsSolved: 6, highestRow: 6 })),
      flags: ['posy.quest1.done'],
    });
    // Every plate is winnable — a keepsake no possible facts satisfy is the
    // same dead advertisement in a smaller box.
    expect(checkKeepsakes([], everything).map((k) => k.id))
      .toEqual(KEEPSAKES.map((k) => k.id));
  });

  it('is idempotent: an already-held keepsake is never re-awarded', () => {
    const facts = keepsakeFacts({ counters: {}, dayRecords: [dayRecord()], flags: [] });
    const first = checkKeepsakes([], facts).map((k) => k.id);
    expect(first).toContain('first-morning');
    expect(checkKeepsakes(first, facts)).toEqual([]);
  });

  it('renders the whole shelf, earned and unearned (never an empty section)', () => {
    const shelf = keepsakeShelf(['first-morning']);
    expect(shelf).toHaveLength(KEEPSAKES.length);
    expect(shelf.filter((s) => s.earned).map((s) => s.keepsake.id)).toEqual(['first-morning']);
  });

  it('is reachable early: at least three plates fall inside one first evening', () => {
    const firstEvening = keepsakeFacts({
      counters: { 'room-solved': 2, 'fragment-found': 1 },
      dayRecords: [dayRecord()],
      flags: [],
    });
    expect(checkKeepsakes([], firstEvening).length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 2. Facts are derived only from state that PERSISTS (AAA 11.20's principle:
//    permanent progress must not be derived from anything dusk erases).
// ---------------------------------------------------------------------------

describe('keepsake facts', () => {
  it('reads lifetime spine counters, the day ledger and the flag set', () => {
    const f = keepsakeFacts({
      counters: { 'room-solved': 7, 'letter-opened': 3, 'dewey-petted': 2 },
      dayRecords: [
        dayRecord({ day: 1, roomsSolved: 2, highestRow: 3 }),
        dayRecord({ day: 2, roomsSolved: 5, highestRow: 1 }),
      ],
      flags: ['posy.quest1.done'],
    });
    expect(f.daysKept).toBe(2);
    expect(f.roomsSolved).toBe(7);
    expect(f.bestRoomsSolvedInADay).toBe(5);   // best ever, not the last day's
    expect(f.highestRowEver).toBe(3);          // highest ever, not the last day's
    expect(f.lettersOpened).toBe(3);
    expect(f.flags.has('posy.quest1.done')).toBe(true);
  });

  it('tolerates a day record with no highestRow (older saves)', () => {
    const f = keepsakeFacts({ counters: {}, dayRecords: [dayRecord()], flags: [] });
    expect(f.highestRowEver).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. THE AWARD PATH, DRIVEN THROUGH THE REAL STORE (AAA 11.17).
//    Each case mutates the store exactly as play mutates it and asserts the
//    keepsake is banked — no fake checker call anywhere in this block.
// ---------------------------------------------------------------------------

describe('the live keepsake emitter', () => {
  beforeEach(resetStore);

  it('ROOM SOLVED — the room slice records the spine event, the shelf fills', () => {
    expect(earnedIds()).not.toContain('a-door-opened');
    // Verbatim the event app/slices/room.ts records on a solve.
    useManorStore.getState().recordEvent({
      type: 'room-solved', cellKey: '2,1', kind: 'hive', tier: 1, perfect: false,
    });
    expect(earnedIds()).toContain('a-door-opened');
  });

  it('DAY END — banking a day record keeps the first morning', () => {
    expect(earnedIds()).not.toContain('first-morning');
    // Verbatim what endDay does: recordEvent, then appendDayRecord.
    useManorStore.getState().recordEvent({ type: 'day-ended', day: 1, cause: 'retired-early' });
    useManorStore.getState().appendDayRecord(dayRecord({ roomsSolved: 4, highestRow: 5 }));
    expect(earnedIds()).toContain('first-morning');
    expect(earnedIds()).toContain('a-full-days-work');   // 4 rooms in one day
    expect(earnedIds()).toContain('the-upper-gallery');  // highestRow 5
  });

  it('VOLUME SOLVED — the word spoken at the Sanctum door', () => {
    useManorStore.getState().recordEvent({ type: 'volume-solved', volumeId: 'volume-1' });
    expect(earnedIds()).toContain('the-word-spoken');
  });

  it('FRAGMENT FILED / LETTER OPENED / NOTABLE MOMENT / RANK-UP all land', () => {
    const s = useManorStore.getState();
    s.recordEvent({ type: 'fragment-found', fragmentId: 'v1-d1' });
    expect(earnedIds()).toContain('a-line-in-his-hand');

    for (const letterId of ['a', 'b', 'c']) s.recordEvent({ type: 'letter-opened', letterId });
    expect(earnedIds()).toContain('the-morning-post');

    s.recordEvent({ type: 'room-notable', kind: 'hive', note: 'pangram' });
    expect(earnedIds()).toContain('every-petal');

    for (let i = 0; i < 4; i++) {
      s.recordEvent({ type: 'affinity-rank-up', character: 'posy', rank: 1 });
    }
    expect(earnedIds()).toContain('warmly-regarded');
  });

  it('POSY’S FAVOR — the flag her authored chain sets keeps a keepsake too', () => {
    useManorStore.getState().setFlag('posy.quest1.done');
    expect(earnedIds()).toContain('a-favour-repaid');
  });

  it('banks each keepsake exactly once, however many events follow', () => {
    const s = useManorStore.getState();
    for (let i = 0; i < 12; i++) {
      s.recordEvent({ type: 'room-solved', cellKey: `2,${i}`, kind: 'hive', tier: 1, perfect: false });
    }
    const ids = earnedIds();
    expect(ids.filter((id) => id === 'a-door-opened')).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never awards a keepsake the facts do not deserve (11.21, both directions)', () => {
    useManorStore.getState().recordEvent({
      type: 'room-solved', cellKey: '2,1', kind: 'hive', tier: 1, perfect: false,
    });
    const ids = earnedIds();
    expect(ids).not.toContain('the-word-spoken');
    expect(ids).not.toContain('a-fortnight-of-mornings');
    expect(ids).not.toContain('deweys-regard');
    for (const id of ids) expect(KEEPSAKE_IDS.has(id)).toBe(true);
  });

  it('the mutator is directly callable and converges (no store event needed)', () => {
    useManorStore.setState({ chronicles: { dayRecords: [dayRecord()] } });
    useManorStore.getState().syncEarnedRewards();
    expect(earnedIds()).toContain('first-morning');
    const before = earnedIds();
    useManorStore.getState().syncEarnedRewards();
    expect(earnedIds()).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// 4. THE FLOORPLAN CABINET — locked plates actually fill (AAA 4.7 / 11.17)
// ---------------------------------------------------------------------------

describe('the cabinet’s unlockable plates', () => {
  beforeEach(resetStore);

  it('every unlockable card is gated on a flag, and named on its locked plate', () => {
    expect(UNLOCKABLE_CARDS.length).toBeGreaterThan(0);
    for (const card of UNLOCKABLE_CARDS) {
      expect(card.unlockedBy).toBeTruthy();
      // docs/flags.md grammar — the gate IS a story flag, not a private id.
      expect(card.unlockedBy!).toMatch(/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*){1,2}$/);
      expect(UNLOCK_QUEST_NAMES[card.unlockedBy!]).toBeTruthy();
    }
  });

  it('WINTER GARDEN — setting Posy’s favor flag deals it into the live deck', () => {
    expect(useManorStore.getState().cabinet.unlockedCardIds).not.toContain('winter-garden');
    expect(deckFor(useManorStore.getState().cabinet.unlockedCardIds).map((c) => c.id))
      .not.toContain('winter-garden');

    // Exactly what applyDialogueEffects does for posy.quest1.done's setFlags.
    useManorStore.getState().setFlag('posy.quest1.done');

    expect(useManorStore.getState().cabinet.unlockedCardIds).toContain('winter-garden');
    expect(deckFor(useManorStore.getState().cabinet.unlockedCardIds).map((c) => c.id))
      .toContain('winter-garden');
  });

  it('MAP ROOM — the deputy sash fills the second plate', () => {
    useManorStore.getState().setFlag('posy.deputy');
    expect(useManorStore.getState().cabinet.unlockedCardIds).toContain('map-room');
  });

  it('unlocks are write-once and do not disturb an already-open cabinet', () => {
    const s = useManorStore.getState();
    s.setFlag('posy.quest1.done');
    s.setFlag('posy.deputy');
    s.setFlag('posy.quest1.done'); // write-once flag, second set is a no-op
    const ids = useManorStore.getState().cabinet.unlockedCardIds;
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(2);
  });

  it('a flag nobody has unlocks nothing', () => {
    expect(cardsUnlockedByFlags([])).toEqual([]);
    expect(cardsUnlockedByFlags(['met.posy'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. REACHABILITY IN AUTHORED CONTENT — the original defect, made un-shippable.
//    A gate whose flag no authored effect can set is a plate that can never
//    light, however complete the code around it is.
// ---------------------------------------------------------------------------

describe('every advertised unlock has an authored award', () => {
  /** Every flag any authored dialogue node or choice can set. */
  const authoredFlags = (): Set<string> => {
    const out = new Set<string>();
    for (const file of readdirSync(DIALOGUE_DIR).filter((f) => f.endsWith('.json'))) {
      const parsed = JSON.parse(readFileSync(join(DIALOGUE_DIR, file), 'utf8')) as {
        nodes?: { effects?: { setFlags?: string[] }; choices?: { effects?: { setFlags?: string[] } }[] }[];
      };
      for (const node of parsed.nodes ?? []) {
        for (const flag of node.effects?.setFlags ?? []) out.add(flag);
        for (const choice of node.choices ?? []) {
          for (const flag of choice.effects?.setFlags ?? []) out.add(flag);
        }
      }
    }
    return out;
  };

  it('each unlockable card’s gate is a flag authored dialogue actually sets', () => {
    const settable = authoredFlags();
    expect(settable.size).toBeGreaterThan(0);
    for (const card of UNLOCKABLE_CARDS) {
      expect(
        settable.has(card.unlockedBy!),
        `${card.id} is gated on "${card.unlockedBy}", which no authored dialogue effect sets`,
      ).toBe(true);
    }
  });

  it('the keepsake that names a quest flag names one the content can set', () => {
    const settable = authoredFlags();
    expect(settable.has('posy.quest1.done')).toBe(true);
    // …and the keepsake keyed to it is genuinely awarded by that flag alone.
    expect(
      checkKeepsakes([], keepsakeFacts({
        counters: {}, dayRecords: [], flags: ['posy.quest1.done'],
      })).map((k) => k.id),
    ).toContain('a-favour-repaid');
  });
});

// ---------------------------------------------------------------------------
// 6. THE SAVE — the shelf survives a reload, and an old save is backfilled.
// ---------------------------------------------------------------------------

describe('keepsakes across the save boundary', () => {
  it('prunes v1 roguelike ids that would inflate the count (11.21)', () => {
    expect(pruneUnknownKeepsakeIds(['five-nodes', 'first-morning', 'boss-slayer']))
      .toEqual(['first-morning']);
  });

  it('backfills a v2 save written before keepsakes existed', () => {
    const stale = {
      ...createEmptySaveV2('Player'),
      earnedAchievementIds: ['five-nodes'],           // v1 leftovers
      events: { recent: [], counters: { 'room-solved': 6, 'fragment-found': 2 } },
      chronicles: { dayRecords: [dayRecord({ roomsSolved: 4, highestRow: 6 })] },
    };
    const migrated = migrate(JSON.parse(JSON.stringify(stale)));
    expect(migrated.earnedAchievementIds).not.toContain('five-nodes');
    expect(migrated.earnedAchievementIds).toEqual(
      expect.arrayContaining([
        'first-morning', 'a-door-opened', 'a-line-in-his-hand',
        'a-full-days-work', 'the-upper-gallery',
      ]),
    );
    // Idempotent: migrating the migrated save changes nothing.
    expect(migrate(JSON.parse(JSON.stringify(migrated))).earnedAchievementIds)
      .toEqual(migrated.earnedAchievementIds);
  });

  it('a v1 save migrates to an empty, honest shelf', () => {
    const v1 = { version: 1, profileName: 'W', earnedAchievementIds: ['five-nodes', 'first-web'] };
    expect(migrate(v1).earnedAchievementIds).toEqual([]);
  });

  it('the cabinet unlock survives a reload: the flag re-derives it', () => {
    const save = { ...createEmptySaveV2('Player') };
    save.journal = { ...save.journal, flags: [...save.journal.flags, 'posy.quest1.done'] };
    // The flag is what persists; the unlock is re-applied from it at boot.
    expect(cardsUnlockedByFlags(migrate(JSON.parse(JSON.stringify(save))).journal.flags))
      .toContain('winter-garden');
  });
});
