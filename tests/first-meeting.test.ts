import { beforeEach, describe, expect, it } from 'vitest';
import type { CharacterId } from '../src/engine/types';
import { CHARACTER_IDS } from '../src/engine/types';
import type { DialogueQuery } from '../src/engine/events';
import { PRIORITY } from '../src/engine/dialogue/schema';
import { selectDialogue, selectTaggedLine } from '../src/engine/dialogue/select';
import { DIALOGUE_FILES, CHARACTER_NAMES, getDialogueFile } from '../src/engine/dialogue/content';
import {
  DEWEY_MEET_NODE, MEETING_CARDS, isFirstMeetingNode, meetingCardFor,
} from '../src/engine/dialogue/meeting';
import {
  WHEREABOUTS_EVERY, WHEREABOUTS_FIRST_DAY, WHEREABOUTS_ORDER,
  whereaboutsPrefix, whereaboutsRotation,
} from '../src/engine/dialogue/whereabouts';
import { PROFILE_DECENT } from '../src/engine/economy/simulate';
import { letterGrants, nextFragmentForRoom, PITY_DROUGHT_DAYS } from '../src/engine/volume';
import { fragmentDays, VOLUME, type DripRun } from './support/fragment-drip';
import { ceremonyGate } from '../src/ui/moment/ceremony';
import { momentQueue } from '../src/ui/moment/queue';

/**
 * THE FIRST MEETING (round 12).
 *
 * Owner directive: *"there needs to be a moment in how the panel is delivered
 * so its clear you've met someone new by whatever the trigger is."*
 *
 * Discovery stays random — nothing here asserts an order, a roster, or that
 * anybody is ever met at all. What is pinned is that WHEN a meeting happens,
 * on whichever of the four triggers, the ceremony is armed by the same
 * write-once state the meeting itself runs on, and that it can fire exactly
 * once per character.
 */

/** A fresh save, standing in front of `character` on the slot her screen mounts. */
const freshQuery = (character: CharacterId, slot: DialogueQuery['slot']): DialogueQuery => ({
  day: 1,
  slot,
  character,
  seen: new Set(),
  flags: new Set(),
  affinities: { bramble: 0, ellery: 0, posy: 0, fern: 0, dewey: 0, portrait: 0 },
  counters: {},
  recentEvents: [],
  talkedToday: new Set(),
  giftedToday: new Set(),
  volumeId: 'volume-1',
  fragmentsFound: 0,
  fragmentsLegible: 0,
});

/** The slot the character's own mount site opens with (validate.ts TRIGGER_MOUNTS). */
const MEETING_SLOT: Readonly<Record<CharacterId, DialogueQuery['slot']>> = {
  bramble: 'morning',
  ellery: 'parlor',
  posy: 'parlor',
  fern: 'parlor',
  dewey: 'parlor',
  portrait: 'parlor',
};

describe('the first meeting is armed off the acquaintance itself', () => {
  it('every character has exactly one first-meeting node', () => {
    for (const id of CHARACTER_IDS) {
      const meets = DIALOGUE_FILES[id].nodes.filter((n) => isFirstMeetingNode(id, n));
      expect(meets.map((n) => n.id), `${id} has ${meets.length} first-meeting nodes`)
        .toHaveLength(1);
    }
  });

  /**
   * The load-bearing claim: on a fresh save, the node the scene selects on the
   * trigger her screen actually mounts IS the meeting node — so the ceremony
   * fires on arrival, not on some later visit, and not never.
   */
  it('a fresh save selects it on the slot the screen mounts', () => {
    for (const id of CHARACTER_IDS) {
      const picked = selectDialogue(getDialogueFile(id), freshQuery(id, MEETING_SLOT[id]));
      expect(picked, `${id} said nothing on first contact`).toBeDefined();
      expect(isFirstMeetingNode(id, picked!), `${id} opened with "${picked!.id}"`).toBe(true);
      expect(meetingCardFor(id, picked!, new Set(), new Set())).not.toBeNull();
    }
  });

  it('the meet node is `once`, so the selector can never serve it twice', () => {
    for (const id of CHARACTER_IDS) {
      const meet = DIALOGUE_FILES[id].nodes.find((n) => isFirstMeetingNode(id, n))!;
      expect(meet.once, `${id}'s meeting is repeatable`).toBe(true);
      expect(meet.priority).toBeGreaterThanOrEqual(PRIORITY.forced);
      // …and once it is seen, the character opens with something else.
      const after = selectDialogue(
        getDialogueFile(id),
        { ...freshQuery(id, MEETING_SLOT[id]), seen: new Set([meet.id]), flags: new Set([`met.${id}`]) },
      );
      expect(after).toBeDefined();
      expect(isFirstMeetingNode(id, after!)).toBe(false);
    }
  });

  it('the card never fires twice: the flag (or, for Dewey, the seen node) closes it', () => {
    for (const id of CHARACTER_IDS) {
      const meet = DIALOGUE_FILES[id].nodes.find((n) => isFirstMeetingNode(id, n))!;
      const already =
        id === 'dewey'
          ? meetingCardFor(id, meet, new Set(), new Set([meet.id]))
          : meetingCardFor(id, meet, new Set([`met.${id}`]), new Set());
      expect(already, `${id}'s introduction re-armed after the acquaintance was made`).toBeNull();
    }
  });

  it('an ordinary visit gets no card', () => {
    for (const id of CHARACTER_IDS) {
      const others = DIALOGUE_FILES[id].nodes.filter((n) => !isFirstMeetingNode(id, n));
      expect(others.length).toBeGreaterThan(0);
      for (const n of others) {
        expect(meetingCardFor(id, n, new Set(), new Set()), `${n.id} presented a card`).toBeNull();
      }
    }
  });

  /**
   * Dewey carries NO effects at all (the validator forbids them) and
   * docs/flags.md says there will never be a `met.dewey`, so his ceremony is
   * armed by name. Pinned here so the id cannot drift out from under it.
   */
  it("Dewey's meeting is his one forced node, by name", () => {
    const meet = DIALOGUE_FILES.dewey.nodes.find((n) => isFirstMeetingNode('dewey', n))!;
    expect(meet.id).toBe(DEWEY_MEET_NODE);
    // He has a second forced node (the victory beat), so "his forced node" is
    // not a definition — what makes the introduction unambiguous is that it is
    // the only UNCONDITIONED one, and first in file order, which is how ties
    // at equal priority break (select.ts).
    const forced = DIALOGUE_FILES.dewey.nodes.filter((n) => n.priority >= PRIORITY.forced && n.once);
    expect(forced.filter((n) => (n.conditions ?? []).length === 0).map((n) => n.id))
      .toEqual([DEWEY_MEET_NODE]);
    expect(forced[0]!.id).toBe(DEWEY_MEET_NODE);
    for (const n of DIALOGUE_FILES.dewey.nodes) expect(n.effects).toBeUndefined();
  });
});

describe('the card copy', () => {
  it('names everyone exactly as their nameplate will for the rest of the campaign', () => {
    for (const id of CHARACTER_IDS) {
      expect(MEETING_CARDS[id].name).toBe(CHARACTER_NAMES[id]);
    }
  });

  /** AAA 6.3 — one Latin letterform, so the seal survives a grayscale shot
   *  and no glyph can render as tofu or as an emoji. */
  it('presses one Latin capital into the wax, per character', () => {
    const sigils = CHARACTER_IDS.map((id) => MEETING_CARDS[id].sigil);
    for (const s of sigils) expect(s).toMatch(/^[A-Z]$/);
    expect(new Set(sigils).size, 'two characters share a seal letterform').toBe(sigils.length);
  });

  it('gives everyone a standing, in a full sentence, and no mechanic', () => {
    for (const id of CHARACTER_IDS) {
      const { standing } = MEETING_CARDS[id];
      expect(standing.length).toBeGreaterThan(20);
      expect(standing.length, `${id}'s standing will not fit the card`).toBeLessThanOrEqual(96);
      expect(standing).toMatch(/[.!?]$/);
      // The card introduces a person; it never teaches a system.
      expect(standing).not.toMatch(/\b(step|steps|gem|key|draft|room card|affinity|tap)\b/i);
    }
  });

  /** He does not give his name; the card is written about him, in narration
   *  (AAA 5.6). Nobody else gets that treatment. */
  it('only Dewey is narrated', () => {
    for (const id of CHARACTER_IDS) {
      expect(Boolean(MEETING_CARDS[id].narrated)).toBe(id === 'dewey');
    }
  });
});

// ---------------------------------------------------------------------------
// WHEREABOUTS — where somebody has got to (round 12)
// ---------------------------------------------------------------------------

/**
 * Owner directive: *"maybe there could be clues for where to find certain
 * peoples"*, and, on the source: *"I like Bramble introducing the others too."*
 *
 * What is pinned here is the whole contract of the channel: it is optional, it
 * is oblique, it is only ever about somebody not yet met, it stops entirely
 * once she is met, and it never turns into a roster — one person, occasionally,
 * in the housekeeper's own voice. Discovery itself is untouched: nothing below
 * asserts that any room is ever offered, and no draft weight is involved.
 */
describe('whereabouts: Bramble mentions where somebody has got to', () => {
  const bramble = getDialogueFile('bramble');
  const whereNodes = bramble.nodes.filter((n) => n.id.startsWith('bramble.where.'));

  const morningQuery = (day: number, flags: string[] = []): DialogueQuery => ({
    ...freshQuery('bramble', 'morning'),
    day,
    flags: new Set(flags),
  });

  /** The line the morning card would print on this day, or null. */
  const asideOn = (day: number, flags: string[] = []): { who: CharacterId; text: string } | null => {
    for (const who of whereaboutsRotation(day)) {
      const node = selectTaggedLine(bramble, morningQuery(day, flags), whereaboutsPrefix(who));
      if (node) return { who, text: node.lines[0]!.text };
    }
    return null;
  };

  it('every character in the rotation has at least one authored line', () => {
    for (const who of WHEREABOUTS_ORDER) {
      const mine = whereNodes.filter((n) => n.id.startsWith(whereaboutsPrefix(who)));
      expect(mine.length, `nobody says anything about ${who}`).toBeGreaterThan(0);
    }
  });

  /** The card prints ONE authored line; a second would be silently dropped. */
  it('every whereabouts line is a single line, and fits the card', () => {
    for (const n of whereNodes) {
      expect(n.lines, `${n.id} would lose lines on the card`).toHaveLength(1);
      expect(n.lines[0]!.text.length, `${n.id} is too long for the card`).toBeLessThanOrEqual(150);
      expect(n.once, `${n.id} must be once — AAA 5.3 for the morning pool`).toBe(true);
      expect(n.summary, `${n.id} has no journal summary`).toBeTruthy();
    }
  });

  /**
   * The floor priority is what guarantees this channel can never cost her the
   * day's conversation: rendered in place, it is also still in the morning
   * pool, and there it must lose to everything.
   */
  it('sits at the floor of the morning pool, so it can never displace a reaction', () => {
    // chainOnly continuations are never selected on their own, so they are
    // not competition — the comparison is against everything that IS.
    const others = bramble.nodes.filter(
      (n) => n.trigger === 'morning' && !n.chainOnly && !n.id.startsWith('bramble.where.'),
    );
    const ceiling = Math.max(...whereNodes.map((n) => n.priority));
    expect(ceiling).toBeLessThan(Math.min(...others.map((n) => n.priority)));
  });

  it('only ever speaks about someone not yet met, and stops the moment she is', () => {
    for (const n of whereNodes) {
      const who = n.id.split('.')[2]!;
      expect(
        (n.conditions ?? []).some(
          (c) => c.kind === 'not' && c.cond.kind === 'flag' && c.cond.flag === `met.${who}`,
        ),
        `${n.id} would still be said after ${who} is met`,
      ).toBe(true);
    }
    // …and end to end: with everybody met, the card is silent forever.
    const allMet = WHEREABOUTS_ORDER.map((c) => `met.${c}`);
    for (let day = 1; day <= 40; day++) {
      expect(asideOn(day, [...allMet, 'vol.volume-1.landing-reached']), `day ${day} still gossiped`)
        .toBeNull();
    }
  });

  /** No roster, no recitation: silent for the first three mornings, then one
   *  mention every third — and never two people in one morning. */
  it('is quiet on days 1–3 and then speaks about one person every third morning', () => {
    for (let day = 1; day < WHEREABOUTS_FIRST_DAY; day++) {
      expect(whereaboutsRotation(day), `day ${day} spoke too early`).toEqual([]);
    }
    const spoke: number[] = [];
    for (let day = 1; day <= 31; day++) if (asideOn(day)) spoke.push(day);
    expect(spoke.slice(0, 5)).toEqual([4, 7, 10, 13, 16]);
    for (let i = 1; i < spoke.length; i++) {
      expect(spoke[i]! - spoke[i - 1]!).toBe(WHEREABOUTS_EVERY);
    }
  });

  /** Consecutive mentions are about different people — gossip, not a list. */
  it('rotates rather than reciting, and never repeats a name back to back', () => {
    const said = [4, 7, 10, 13, 16, 19].map((d) => asideOn(d, ['vol.volume-1.landing-reached']));
    for (const s of said) expect(s).not.toBeNull();
    const names = said.map((s) => s!.who);
    expect(new Set(names).size).toBeGreaterThanOrEqual(WHEREABOUTS_ORDER.length);
    for (let i = 1; i < names.length; i++) expect(names[i]).not.toBe(names[i - 1]);
  });

  /**
   * Fern is the reason the channel exists: hers is the only parlor the deck
   * can decline to offer for a whole campaign, so she must still be spoken
   * about deep into one — and not in the same words.
   */
  it('keeps speaking about Fern late, and not in the same words', () => {
    const early = asideOn(4);
    expect(early?.who).toBe('fern');
    const fernLines = whereNodes.filter((n) => n.id.startsWith(whereaboutsPrefix('fern')));
    expect(fernLines.length).toBeGreaterThanOrEqual(2);
    const late = selectTaggedLine(bramble, morningQuery(28), whereaboutsPrefix('fern'));
    expect(late).toBeDefined();
    expect(late!.lines[0]!.text).not.toBe(early!.text);
  });

  /** Oblique, in-voice, and never a mechanic: it teaches the ROOM, not the
   *  system that deals it (the owner's "Fern will be under glass at this
   *  hour" test — the Greenhouse, without the word). */
  it('names no mechanic and hands over no directory', () => {
    for (const n of whereNodes) {
      const t = n.lines[0]!.text;
      expect(t, `${n.id} names a mechanic`).not.toMatch(
        /\b(draft|drafts|deck|card|step|steps|gem|gems|key|keys|unlock|parlor|affinity|rank)\b/i,
      );
      // A hint that names its own room is a directory entry, not a clue.
      expect(t, `${n.id} reads out a room name`).not.toMatch(
        /\b(Greenhouse|Post Room|Reading Nook|Drawing Room|Morning Room)\b/i,
      );
    }
  });

  /** The Portrait is only mentioned once the climb has actually happened —
   *  a hint she cannot act on is worse than no hint. */
  it('waits for the landing before mentioning the Portrait', () => {
    const gate = whereNodes.find((n) => n.id.startsWith(whereaboutsPrefix('portrait')))!;
    expect(
      (gate.conditions ?? []).some(
        (c) => c.kind === 'flag' && c.flag === 'vol.volume-1.landing-reached',
      ),
    ).toBe(true);
    // On his turn in the rotation, with no climb yet, somebody else speaks.
    const turn =
      WHEREABOUTS_FIRST_DAY + WHEREABOUTS_EVERY * WHEREABOUTS_ORDER.indexOf('portrait');
    expect(asideOn(turn)?.who).not.toBe('portrait');
  });
});

// ---------------------------------------------------------------------------
// THE TESTIMONY CHANNEL, WHEN THE CHARACTER IS NEVER MET (round 12)
// ---------------------------------------------------------------------------

/**
 * Eight of Volume 1's 28 fragments are spoken by a character, and discovery is
 * random: Fern keeps the Greenhouse, the Greenhouse is one card in a deck that
 * need never deal it, and a whole campaign can go by without the player ever
 * learning she exists. So "never meets Fern" is a reachable save, not a
 * pathological input, and the question is whether the mystery still reaches
 * her.
 *
 * THE ANSWER IS YES, AND IT IS YES BY THREE EXISTING MECHANISMS — none of
 * which had a test standing on this case, which is the only thing this block
 * changes:
 *
 *   1. `nextFragmentForRoom` honours a reservation ONLY while some other
 *      unfound page exists. When the reserved testimony is all that is left,
 *      the room wins and hands it over (engine/volume.ts, "fragments must
 *      never be stranded").
 *   2. `letterGrants` for a PITY letter takes `unfoundFragments[0]` with no
 *      reservation filter at all — deliberately (app/slices/journal.ts: "the
 *      pity/letter channel never skips"). Mercy outranks the reservation.
 *   3. The drought that arms mercy is measured on LEGIBILITY, so a stalled
 *      channel shows up as a drought rather than being papered over by
 *      sealed pages she cannot read (round 13).
 *
 * Measured over seeded campaigns at PROFILE_DECENT: never meeting Fern costs a
 * median of ONE day to the same legible page count; never meeting Fern, Posy,
 * Ellery and the Portrait together costs five. The mercy floor itself does not
 * move at all — worst legible dry run is PITY_DROUGHT_DAYS in every case.
 * "Knowledge is progression" is intact: nothing is given away, the pages just
 * arrive by the slower road.
 */
describe('the testimony channel survives a character who is never met', () => {
  const CAMPAIGNS = 24;
  const HORIZON = 45;
  const owedDays = (run: DripRun) => run.perDay.filter((d) => d.unfoundAtDawn > 0);
  const worstDryRun = (days: DripRun['perDay'], of: 'filed' | 'legible') => {
    let dry = 0;
    let worst = 0;
    for (const d of days) { dry = d[of] > 0 ? 0 : dry + 1; worst = Math.max(worst, dry); }
    return worst;
  };
  const campaigns = (never: readonly CharacterId[]) =>
    Array.from({ length: CAMPAIGNS }, (_, i) =>
      fragmentDays((0x51ce + i * 0x9e37) | 0, HORIZON, PROFILE_DECENT, { never }));

  const CASES: { what: string; never: readonly CharacterId[] }[] = [
    { what: 'she never finds the Greenhouse', never: ['fern'] },
    { what: 'she meets nobody but Mrs. Bramble', never: ['fern', 'posy', 'ellery', 'portrait'] },
  ];

  for (const c of CASES) {
    it(`the mercy floor still holds when ${c.what}`, () => {
      for (const run of campaigns(c.never)) {
        expect(
          worstDryRun(owedDays(run), 'legible'),
          'a campaign went too long without making anything out',
        ).toBeLessThanOrEqual(PITY_DROUGHT_DAYS);
      }
    });

    it(`no page is stranded when ${c.what}`, () => {
      for (const run of campaigns(c.never)) {
        const last = run.perDay[run.perDay.length - 1]!;
        expect(last.unfoundAtDawn, 'the volume never finished filing').toBe(0);
      }
    });
  }

  /**
   * Mechanism 1, in isolation: the anti-strand escape is the thing standing
   * between a never-met character and a permanently unreachable page.
   */
  it('the room drip stops honouring the reservation once it is all that is left', () => {
    const content = VOLUME;
    const testimony = content.fragments.filter((f) => f.kind === 'testimony').map((f) => f.id);
    expect(testimony.length).toBeGreaterThanOrEqual(8);
    const reservedIds = new Set(testimony);
    // Everything else found; only the unspoken testimony remains.
    const state = {
      volumeId: content.id, day: 30,
      foundFragmentIds: content.fragments.map((f) => f.id).filter((id) => !reservedIds.has(id)),
      interpretedFragmentIds: [], guesses: [], status: 'active' as const,
    };
    const next = nextFragmentForRoom(content, state, 'mystery', { reservedIds });
    expect(next, 'the drip refused every remaining page and stranded the volume').not.toBeNull();
    expect(reservedIds.has(next!.id)).toBe(true);
  });

  /**
   * Mechanism 2, in isolation: mercy outranks the reservation outright, so a
   * drought reaches an unspoken page without waiting for the endgame. This is
   * load-bearing and easy to "tidy away" — a reservedIds filter added to
   * `letterGrants` for symmetry would silently reopen the hole.
   */
  it('a pity letter hands over unspoken testimony rather than skipping it', () => {
    const content = VOLUME;
    const first = content.fragments
      .slice()
      .sort((a, b) => a.revealOrder - b.revealOrder)
      .find((f) => f.kind === 'testimony')!;
    const state = {
      volumeId: content.id, day: 12,
      foundFragmentIds: content.fragments
        .filter((f) => f.revealOrder < first.revealOrder)
        .map((f) => f.id),
      interpretedFragmentIds: [], guesses: [], status: 'active' as const,
    };
    const pity = { id: 'pity-extra-1', from: 'posy' as CharacterId, pity: true, subject: '', body: '' };
    expect(letterGrants(content, pity, state)).toEqual([first.id]);
  });
});

// ---------------------------------------------------------------------------
// THE CEREMONY GATE — one wax card on the glass at a time (round 12)
// ---------------------------------------------------------------------------

/**
 * Measured, not theorised: day 1 opens with a letter from Posy in the tray, so
 * the campaign seal and Mrs. Bramble's introduction landed in the same tick and
 * the first screenshot of the round had two deckle-edged wax cards stacked up
 * the glass. The seal steps aside — and its dwell clock stops with it, which is
 * the half that matters: a suppressed notice whose timer kept running would be
 * AAA 11.13's defect, a moment timed out into a screen nobody was looking at.
 */
describe('the campaign seal steps aside for a first meeting', () => {
  beforeEach(() => ceremonyGate.reset());

  it('is closed by default and open only while a ceremony holds it', () => {
    expect(ceremonyGate.get()).toBe(false);
    const release = ceremonyGate.hold();
    expect(ceremonyGate.get()).toBe(true);
    release();
    expect(ceremonyGate.get()).toBe(false);
  });

  it('notifies subscribers on each edge, and only on the edges', () => {
    let ticks = 0;
    const off = ceremonyGate.subscribe(() => { ticks += 1; });
    const a = ceremonyGate.hold();
    const b = ceremonyGate.hold();   // overlapping cards — still one edge
    expect(ticks).toBe(1);
    a();
    expect(ceremonyGate.get()).toBe(true);
    expect(ticks).toBe(1);
    b();
    expect(ceremonyGate.get()).toBe(false);
    expect(ticks).toBe(2);
    off();
  });

  it('a release is idempotent, so a double unmount cannot strand the gate', () => {
    const release = ceremonyGate.hold();
    release();
    release();
    expect(ceremonyGate.get()).toBe(false);
  });

  /** The queue is never touched: the grant waits, it is not dropped. */
  it('holds nothing back from the queue itself', () => {
    momentQueue.reset();
    const release = ceremonyGate.hold();
    momentQueue.push({
      key: 'letter:posy-1', kind: 'letter', sigil: 'L',
      title: 'A letter from Posy', where: 'Waiting in the Journal · Letters',
    });
    expect(momentQueue.getState().current?.key).toBe('letter:posy-1');
    release();
    expect(momentQueue.getState().current?.key).toBe('letter:posy-1');
    momentQueue.reset();
  });
});
