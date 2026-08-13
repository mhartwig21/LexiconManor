/**
 * tests/leads.test.ts — LEADS: honesty, authoring, and the frequency band.
 * OWNER: A6 (Dialogue) × A7 (Mystery). Round 54, docs/LEADS.md.
 *
 * ═══ WHAT A LEAD IS, AND WHAT IS GATED HERE ════════════════════════════════
 *
 * A lead is a PERSON telling you about a PLACE — "draft the library, the old
 * codger left an important document on the shelves there, worth a read" — as
 * against a card printing `+1 page`, which is the GAME telling you a RULE
 * before you have played. The owner's ruling of 13 Aug names four things it
 * owes, and three of them are checkable:
 *
 *   1. HONESTY — "if Ellery says the shelves hold something, drafting the
 *      Library that day must actually pay." Two halves, both tested below: the
 *      lead is not sayable unless the room can pay (`withHonestLeads`), and
 *      once said the house keeps its promise even if the day's valve is spent
 *      elsewhere in between (`solveChannelPage({ valveWaived })`).
 *   2. IT MUST NOT BECOME A RULE — no numeral, no rate, no mechanic, `once`
 *      only, and spoken in a conversation rather than printed by a surface.
 *      `leadProblems` is the build-time half; the negative controls here prove
 *      it can go red on each clause rather than merely agreeing with the
 *      shipped content.
 *   3. FREQUENCY — "a design number to derive, not to guess: too rare and
 *      nobody meets one, too common and it is a quest log."
 *
 * ═══ THE BAND, AND HOW IT WAS CHOSEN ═══════════════════════════════════════
 *
 * Stated plainly, because the standing rule is to say how a band was chosen and
 * a band whose provenance is hidden is the way this codebase has lied to itself
 * before:
 *
 * · THE CEILING IS A CADENCE BORROWED FROM THE SIBLING CHANNEL, NOT A
 *   MEASUREMENT OF LEADS. The only other place in this game where somebody
 *   mentions something in passing is `WHEREABOUTS_EVERY = 3` — Mrs. Bramble
 *   naming one person she works alongside, one morning in three, a cadence the
 *   owner has shipped and nobody has called a checklist. A lead is a STRONGER
 *   act than a mention (it sends her somewhere), so one evening in three is the
 *   CEILING rather than the target. Above it the mentions have become a rota,
 *   which is the ruling's own failure mode: "if a player can predict the lead,
 *   it has become a rule."
 *
 * · THE FLOOR IS THE LOOP, AND IT IS A COUNT RATHER THAN A RATE. A lead only
 *   works if the reward closes it, and a rule is deduced from INSTANCES: one is
 *   an accident, two is a coincidence. So a campaign must carry at least THREE.
 *   Expressed against the measured campaign length rather than as a share, so
 *   the two numbers cannot drift apart when the campaign does.
 *
 * · AND THE FIRST ONE HAS A DEADLINE, taken from the only evidence in the repo
 *   about how long a stranger plays: every blind reader in docs/COMPREHENSION.md
 *   reached day 2 and one reached day 3. The only [blocker] that test has ever
 *   produced is that nobody learned where pages come from. A channel that
 *   answers it must open inside that window, so: A LEAD IS SPOKEN BY DAY 3, on
 *   every campaign. Measured, it lands on day 2 on all six — the tail rides on
 *   the morning tea, so Mrs. Bramble finishes her own introduction and then
 *   mentions the linen closet, and neither has to give way to the other. The
 *   band keeps a day of slack against the measurement because the thing being
 *   gated is that the channel OPENS in the window, not that it opens on a
 *   particular morning.
 *
 * ═══ THE INSTRUMENT, AND WHAT IT ASSUMES ═══════════════════════════════════
 *
 * The evenings are REAL: `simulateCampaign` rolls real offers through
 * `rollCards` and takes real cards through `chooseCard`, and the walk below
 * reads the card ids it actually drafted, in the order it drafted them. The
 * selection is REAL: the shipped authored JSON through the shipped
 * `selectDialogue`, behind the shipped `withHonestLeads`. What is MODELLED,
 * stated so a later round can attack it:
 *
 *   a. SHE TALKS TO THE HOST. Standing in a parlor is drafting it (the sim
 *      enters every room it drafts) and the visit is one tap. Not free, but the
 *      alternative — modelling whether she taps — is a number nobody has.
 *   b. THE CAT IS ABSENT. Dewey stands on one cell a day and the sim does not
 *      track whether her path crosses it, so his lead is counted as never
 *      spoken. The measured share is therefore a LOWER bound, which is the
 *      conservative direction for a floor and the generous one for a ceiling —
 *      said plainly, because the ceiling is the band the cat could push
 *      through, and a round that models him owes this number a re-run.
 *   c. SHE IS GENEROUS TO A FAULT. Affinity climbs by one a day for everyone
 *      she meets, which unlocks the arc band as fast as it can be unlocked.
 *      Since round 54 a lead does not compete with an arc (it is a tail, not a
 *      slot), this no longer suppresses leads — it is kept because it is the
 *      same shape the campaign sweep in tests/dialogue-content.test.ts walks,
 *      and two instruments that model the same player can be compared.
 *   d. THE CHANNEL IS SPENT AT HER FIRST SOLVE. The sim reports how many rooms
 *      she solved, not which; the walk pays the day's channel on the first
 *      puzzle room she drafted. That is the earliest it can go, which makes it
 *      the harshest reading of the WAIVER's price (every later lead she obeys
 *      is then a second page) — so the "pages the waiver paid" figure below is
 *      an upper bound rather than a hope.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CharacterId, VolumeState } from '../src/engine/types';
import type { DialogueQuery, RecordedEvent } from '../src/engine/events';
import type { DialogueNode } from '../src/engine/dialogue/schema';
import { DIALOGUE_FILES, getDialogueFile } from '../src/engine/dialogue/content';
import { selectDialogue, selectLead } from '../src/engine/dialogue/select';
import { deriveLegibleFragmentCount } from '../src/engine/dialogue/conditions';
import { leadProblems } from '../src/engine/dialogue/validate';
import {
  leadCardId, leadCardSpokenToday, leadCardsSpokenToday, leadNodes, leadableCardIds,
  payableLeadCardIds, withHonestLeads,
} from '../src/engine/leads';
import {
  freshVolumeState, fragmentForSolveChannel, LINTEL_CHANNEL, reservedTestimonyIds,
  solveChannelFor, solveChannelPage, STUDY_CHANNEL,
} from '../src/engine/volume';
import { cardById } from '../src/engine/manor/deck';
import { PARLOR_HOSTS } from '../src/engine/manor/parlor';
import { WHEREABOUTS_EVERY } from '../src/engine/dialogue/whereabouts';
import { PROFILE_DECENT, simulateCampaign } from '../src/engine/economy/simulate';
import { getVolumeContent } from '../src/app/content/volumes';

const VOLUME_ID = 'volume-1';
const content = getVolumeContent(VOLUME_ID)!;
const CHARACTERS: CharacterId[] = ['bramble', 'ellery', 'posy', 'fern', 'dewey', 'portrait'];

const ALL_LEADS: DialogueNode[] = CHARACTERS.flatMap((c) => leadNodes(getDialogueFile(c)));

// ---------------------------------------------------------------------------
// 1. The authoring rules — and proof each one can fail
// ---------------------------------------------------------------------------

describe('a lead is a person naming a place (docs/LEADS.md)', () => {
  it('the house has leads at all, spread across more than one voice', () => {
    expect(ALL_LEADS.length).toBeGreaterThanOrEqual(6);
    const voices = new Set(ALL_LEADS.map((n) => n.id.split('.')[0]));
    expect(voices.size).toBeGreaterThanOrEqual(4);
  });

  it('every shipped lead names a room that pays a page and the ground floor can draw', () => {
    for (const node of ALL_LEADS) {
      const card = cardById(leadCardId(node.id)!)!;
      expect(card, `${node.id} names no card`).toBeTruthy();
      expect(card.category).toBe('puzzle');
      expect(card.tierRange[0]).toBe(1);
      expect(leadableCardIds()).toContain(card.id);
    }
  });

  it('every shipped lead clears the authoring rules', () => {
    for (const node of ALL_LEADS) expect(leadProblems(node), node.id).toEqual([]);
  });

  /**
   * THE NEGATIVE CONTROL. Six ways to write a bad lead, one clause each. A
   * validator that only ever agrees with the shipped corpus is the failure mode
   * this project keeps repeating (STATUS §3.3) — every rule above has to be
   * shown killing something.
   */
  it('…and the rules kill each way of getting one wrong', () => {
    const base: DialogueNode = {
      id: 'ellery.lead.library.probe',
      trigger: 'parlor',
      priority: 450,
      once: true,
      chainOnly: true,
      lines: [{ speaker: 'ellery', text: 'Something is on the shelves, and it is not a book.' }],
    };
    expect(leadProblems(base)).toEqual([]);

    const bad = (patch: Partial<DialogueNode> & { id?: string }) =>
      leadProblems({ ...base, ...patch } as DialogueNode);

    // a room that is not in the deck
    expect(bad({ id: 'ellery.lead.scullery.probe' }).join()).toMatch(/not a card/);
    // a room that pays no page
    expect(bad({ id: 'ellery.lead.kitchen.probe' }).join()).toMatch(/pays no page/);
    // a room the ground floor cannot draw
    expect(bad({ id: 'ellery.lead.study.probe' }).join()).toMatch(/cannot draw/);
    // a tip that repeats — a checklist
    expect(bad({ once: false }).join()).toMatch(/must be "once"/);
    // an interface nudge in the house voice
    expect(bad({ trigger: 'night' }).join()).toMatch(/must be spoken in a conversation/);
    // …or a lead that takes the conversation's own slot, displacing a reaction
    expect(bad({ chainOnly: false }).join()).toMatch(/must be chainOnly/);
    // a payout figure
    expect(bad({
      lines: [{ speaker: 'ellery', text: 'The shelves there are worth 2 of anything else.' }],
    }).join()).toMatch(/numeral/);
    // the rulebook's own vocabulary
    expect(bad({
      lines: [{ speaker: 'ellery', text: 'Solve any word game and a page files itself, dear.' }],
    }).join()).toMatch(/rulebook/);
  });

  /**
   * The mount seam. `dialogueFileFor` is the only pool a scene may be dealt
   * from — a screen reaching past it to `getDialogueFile` would deal leads the
   * honesty filter has never seen, which is the one way a character here can
   * still be wrong.
   */
  it('no screen deals a conversation from the unfiltered file', () => {
    const scene = readFileSync(resolve(__dirname, '../src/ui/dialogue/DialogueScene.tsx'), 'utf8');
    expect(scene).toMatch(/dialogueFileFor/);
    expect(scene).not.toMatch(/getDialogueFile\(/);
  });
});

// ---------------------------------------------------------------------------
// 2. Honesty — the filter, and the promise
// ---------------------------------------------------------------------------

/** A day-stamped `fragment-found` through a channel — the live valve's input. */
const filed = (day: number, fragmentId: string, via: 'lintel' | 'study'): RecordedEvent =>
  ({ day, at: 0, event: { type: 'fragment-found', fragmentId, via } });

describe('a lead is not sayable unless the room can pay', () => {
  const fresh = (): VolumeState => freshVolumeState(VOLUME_ID, 1);

  it('at dawn, every room that pays a page is leadable', () => {
    const payable = payableLeadCardIds(content, fresh());
    expect(payable.has('library')).toBe(true);
    expect(payable.has('darkroom')).toBe(true);
    expect(payable.has('study')).toBe(true);      // its own channel, its own stock
    expect(payable.has('kitchen')).toBe(false);   // green rooms pay no page
  });

  /**
   * THE VALVE IS NOT PART OF THE QUESTION, and this is the assertion that says
   * so out loud. Asking `solveChannelPage` here — the obvious thing, and the
   * first build — made leads a morning-only channel worth one or two a
   * campaign, because she solves a word room early most evenings and the valve
   * then shuts every word room out of every mouth until dusk. What the valve
   * would have been protecting is protected instead by the waiver on the other
   * side: she is sent there, so the room pays (see "the house keeps its
   * promise" below). The lead stays honest because STOCK is what it promises.
   */
  it('a channel already tapped today does NOT silence the cast', () => {
    const state = fresh();
    const lintelPaid = [filed(1, fragmentForSolveChannel(content, state, LINTEL_CHANNEL)!.id, 'lintel')];
    expect(solveChannelPage(content, state, LINTEL_CHANNEL, lintelPaid, 1)).toBeNull();
    const payable = payableLeadCardIds(content, state);
    expect(payable.has('library')).toBe(true);
    expect(payable.has('gallery')).toBe(true);
  });

  it('an exhausted channel takes them out for good', () => {
    const drained: VolumeState = {
      ...fresh(),
      foundFragmentIds: content.fragments
        .filter((f) => solveChannelFor('word-web').id === (f.channel ?? '') || f.kind === 'engraving')
        .map((f) => f.id),
    };
    // Everything the lintel channel could ever pay is filed.
    let state = drained;
    while (fragmentForSolveChannel(content, state, LINTEL_CHANNEL)) {
      const next = fragmentForSolveChannel(content, state, LINTEL_CHANNEL)!;
      state = { ...state, foundFragmentIds: [...state.foundFragmentIds, next.id] };
    }
    expect(payableLeadCardIds(content, state).has('library')).toBe(false);
  });

  it('the filter takes the lead out of the pool, not out of the conversation', () => {
    const ellery = getDialogueFile('ellery');
    const withNone = withHonestLeads(ellery, new Set());
    expect(leadNodes(withNone)).toHaveLength(0);
    expect(withNone.nodes.length).toBe(ellery.nodes.length - leadNodes(ellery).length);
    // Nothing else is touched, and an unfiltered pool is the same object.
    expect(withHonestLeads(ellery, new Set(leadableCardIds()))).toBe(ellery);
  });
});

describe('once said, the house keeps its promise', () => {
  const day = 5;
  const state = freshVolumeState(VOLUME_ID, day);
  const spent = [filed(day, fragmentForSolveChannel(content, state, LINTEL_CHANNEL)!.id, 'lintel')];

  it('the valve normally shuts the second word room of the evening out', () => {
    expect(solveChannelPage(content, state, LINTEL_CHANNEL, spent, day)).toBeNull();
  });

  it('…and does not, for the room somebody sent her to', () => {
    const kept = solveChannelPage(content, state, LINTEL_CHANNEL, spent, day, { valveWaived: true });
    expect(kept).not.toBeNull();
  });

  it('the waiver moves the valve and nothing else — an empty channel still pays nothing', () => {
    let drained = state;
    while (fragmentForSolveChannel(content, drained, LINTEL_CHANNEL)) {
      const next = fragmentForSolveChannel(content, drained, LINTEL_CHANNEL)!;
      drained = { ...drained, foundFragmentIds: [...drained.foundFragmentIds, next.id] };
    }
    expect(solveChannelPage(content, drained, LINTEL_CHANNEL, [], day, { valveWaived: true }))
      .toBeNull();
  });

  it('the promise is read off the spine, so it survives a reload and dies at dusk', () => {
    const heard: RecordedEvent[] = [
      { day, at: 0, event: { type: 'dialogue-seen', nodeId: 'ellery.lead.library.shelves', character: 'ellery' } },
    ];
    expect(leadCardSpokenToday('library', heard, day)).toBe(true);
    expect(leadCardSpokenToday('gallery', heard, day)).toBe(false);
    expect(leadCardSpokenToday('library', heard, day + 1)).toBe(false);
    // An ordinary conversation promises nothing.
    expect(leadCardSpokenToday('library', [
      { day, at: 0, event: { type: 'dialogue-seen', nodeId: 'ellery.arc.chair', character: 'ellery' } },
    ], day)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Frequency — the walk
// ---------------------------------------------------------------------------

interface LeadSighting {
  day: number;
  character: CharacterId;
  cardId: string;
  /** Was the room she was sent to dealt to her in a LATER offer that evening? */
  offeredAfter: boolean;
}

interface CampaignWalk {
  days: number;
  leadDays: Set<number>;
  sightings: LeadSighting[];
  /** Pages the house paid ONLY because a lead waived the day's valve. */
  extraPages: number;
  /** Pages filed through a solve channel across the whole campaign. */
  channelPages: number;
}

const DAYS = 24;
const SEEDS = [11, 23, 37, 51, 68, 79];

function walkCampaign(seed: number): CampaignWalk {
  const campaign = simulateCampaign(PROFILE_DECENT, DAYS, seed);
  const seen = new Set<string>();
  const flags = new Set<string>([`met.bramble`]);
  const affinities: Record<CharacterId, number> =
    { bramble: 0, ellery: 0, posy: 0, fern: 0, dewey: 0, portrait: 0 };
  const counters: Partial<Record<string, number>> = {};
  let volume = freshVolumeState(VOLUME_ID, 1);
  const sightings: LeadSighting[] = [];
  const leadDays = new Set<number>();
  let extraPages = 0;
  let channelPages = 0;

  for (let day = 1; day <= campaign.days.length; day++) {
    const result = campaign.days[day - 1]!;
    // The stream clears at dusk — that is what makes the valve a DAY valve.
    const recentEvents: RecordedEvent[] = [];
    const talkedToday = new Set<CharacterId>();

    const visit = (character: CharacterId, slot: 'morning' | 'parlor', draftIdx: number) => {
      const reservedIds = reservedTestimonyIds(Object.values(DIALOGUE_FILES), seen);
      const payable = payableLeadCardIds(content, volume, { reservedIds });
      const file = withHonestLeads(getDialogueFile(character), payable);
      const query: DialogueQuery = {
        day, slot, character,
        seen: new Set(seen),
        flags: new Set(flags),
        affinities: { ...affinities },
        counters: { ...counters } as DialogueQuery['counters'],
        recentEvents: [...recentEvents],
        talkedToday: new Set(talkedToday),
        giftedToday: new Set<CharacterId>(),
        volumeId: VOLUME_ID,
        fragmentsFound: volume.foundFragmentIds.length,
        fragmentsLegible: deriveLegibleFragmentCount(
          VOLUME_ID, flags, volume.foundFragmentIds.length,
        ),
      };
      const play = (n: DialogueNode) => {
        seen.add(n.id);
        for (const f of n.effects?.setFlags ?? []) flags.add(f);
        recentEvents.push({
          day, at: 0, event: { type: 'dialogue-seen', nodeId: n.id, character },
        });
      };
      const picked = selectDialogue(file, query);
      if (!picked) return;
      talkedToday.add(character);
      flags.add(`met.${character}`);
      play(picked);
      // …and then, on her way out, the tail — the live gates, in the live order
      // (ui/dialogue/DialogueScene.tsx `dueLead`): one a day, off a visit only.
      if (leadCardsSpokenToday(recentEvents, day).size > 0) return;
      const lead = selectLead(file, { ...query, recentEvents: [...recentEvents] });
      if (!lead) return;
      play(lead);
      const card = leadCardId(lead.id)!;
      leadDays.add(day);
      sightings.push({
        day, character, cardId: card,
        offeredAfter: result.offersDealt.slice(draftIdx + 1).some((o) => o.includes(card)),
      });
    };

    // Dawn: the tea, every morning, before anything has been solved.
    visit('bramble', 'morning', -1);

    // The evening, in the order the floorplan really happened.
    let solvesLeft = result.roomsSolved;
    result.cardsDrafted.forEach((cardId, i) => {
      const host = PARLOR_HOSTS[cardId];
      if (host && host !== 'bramble') visit(host, 'parlor', i);
      const card = cardById(cardId);
      if (!card || card.category !== 'puzzle' || !card.puzzleKind || solvesLeft <= 0) return;
      solvesLeft -= 1;
      const channel = solveChannelFor(card.puzzleKind);
      const waived = leadCardSpokenToday(cardId, recentEvents, day);
      const page = solveChannelPage(content, volume, channel, recentEvents, day, {
        valveWaived: waived,
      });
      if (!page) return;
      channelPages += 1;
      // The cost of the waiver, counted rather than argued: a page that would
      // not have been paid if she had not been sent here.
      if (waived && !solveChannelPage(content, volume, channel, recentEvents, day)) extraPages += 1;
      volume = { ...volume, foundFragmentIds: [...volume.foundFragmentIds, page.id] };
      recentEvents.push(filed(day, page.id, channel.id as 'lintel' | 'study'));
    });

    // (c) — generous to a fault, which is the harshest reading for a lead.
    for (const c of CHARACTERS) affinities[c] += 1;
  }

  return { days: campaign.days.length, leadDays, sightings, extraPages, channelPages };
}

describe('THE FREQUENCY BAND — occasional, never a rota (docs/LEADS.md)', () => {
  const walks = SEEDS.map(walkCampaign);
  const share = (w: CampaignWalk) => w.leadDays.size / w.days;
  const shares = walks.map(share);
  const firstDays = walks.map((w) => Math.min(...w.sightings.map((s) => s.day), Infinity));
  const counts = walks.map((w) => w.sightings.length);

  it('prints what it measured, every run', () => {
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    // eslint-disable-next-line no-console
    console.log(
      `[leads] evenings carrying a lead ${shares.map(pct).join(' / ')}`
      + ` · leads a campaign ${counts.join(' / ')}`
      + ` · first lead on day ${firstDays.join(' / ')}`
      + ` · named room dealt again that evening `
      + pct(
        walks.flatMap((w) => w.sightings).filter((s) => s.offeredAfter).length
        / Math.max(1, walks.flatMap((w) => w.sightings).length),
      ),
    );
    expect(walks.flatMap((w) => w.sightings).length).toBeGreaterThan(0);
  });

  /**
   * THE CEILING — `WHEREABOUTS_EVERY`, the shipped cadence of the game's only
   * other passing-mention channel. Read off the constant rather than typed, so
   * a round that re-paces the whereabouts aside re-paces this with it and the
   * provenance cannot quietly become a literal.
   */
  it('never becomes a rota: at most one evening in three carries one', () => {
    for (const [i, s] of shares.entries()) {
      expect(s, `seed ${SEEDS[i]} carried a lead on ${(s * 100).toFixed(1)}% of evenings`)
        .toBeLessThanOrEqual(1 / WHEREABOUTS_EVERY);
    }
  });

  /** THE FLOOR — three instances, because two is a coincidence. */
  it('closes the loop enough times to be deducible: three leads a campaign', () => {
    for (const [i, n] of counts.entries()) {
      expect(n, `seed ${SEEDS[i]} spoke ${n} lead(s) in ${DAYS} evenings`).toBeGreaterThanOrEqual(3);
    }
  });

  /** THE DEADLINE — the window every blind reader has actually played. */
  it('opens inside the window a stranger plays: a lead by day 3', () => {
    for (const [i, d] of firstDays.entries()) {
      expect(d, `seed ${SEEDS[i]} said nothing until day ${d}`).toBeLessThanOrEqual(3);
    }
  });

  /**
   * NOT A BAND, A PUBLISHED COST. A lead is a rumour about a place, not a
   * summons: the house is under no obligation to deal her that door tonight,
   * and nothing in this round biases the deck (which would move `deckMixAt` and
   * every clock calibrated against it). This is how often she CAN act on one
   * the same evening, measured rather than hoped, so a later round arguing for
   * a deck bias has the number it would have to beat.
   */
  /**
   * THE PRICE OF THE PROMISE, PUBLISHED. Waiving the valve for a room she was
   * sent to can pay a second page on an evening she had already been paid.
   * Bounded at one a day by the one-lead-a-day tail, and this is what it comes
   * to over a campaign — the number a later round would have to weigh if the
   * volume's pacing ever needs the pages back.
   */
  it('prices the promise it keeps', () => {
    const extra = walks.map((w) => w.extraPages);
    const total = walks.map((w) => w.channelPages);
    // eslint-disable-next-line no-console
    console.log(
      `[leads] pages the waiver paid ${extra.join(' / ')}`
      + ` of ${total.join(' / ')} channel pages a campaign`,
    );
    // It can never exceed one a day, and it must not become a second drip.
    for (const [i, n] of extra.entries()) {
      expect(n).toBeLessThanOrEqual(walks[i]!.days);
      expect(n / Math.max(1, total[i]!)).toBeLessThan(0.15);
    }
  });

  it('says how often the house obliges', () => {
    const all = walks.flatMap((w) => w.sightings);
    const obliged = all.filter((s) => s.offeredAfter).length / all.length;
    // eslint-disable-next-line no-console
    console.log(`[leads] the named room came up again on ${(obliged * 100).toFixed(1)}% of leads`);
    expect(obliged).toBeGreaterThan(0.2);
  });

  /** Every lead spoken in every walk named a room that could pay when it was
   *  said — the filter, exercised over real evenings rather than a fixture. */
  it('no character was ever wrong', () => {
    for (const w of walks) {
      for (const s of w.sightings) {
        const card = cardById(s.cardId)!;
        expect(card.category).toBe('puzzle');
        expect(STUDY_CHANNEL.id === solveChannelFor(card.puzzleKind!).id
          || LINTEL_CHANNEL.id === solveChannelFor(card.puzzleKind!).id).toBe(true);
      }
    }
  });
});
