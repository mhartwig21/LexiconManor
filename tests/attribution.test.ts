/**
 * ═══ ROUND 49 — A PAGE MUST SAY WHICH ROOM PRODUCED IT ══════════════════════
 *
 * THE OWNER'S RULING, 13 Aug, which this round exists to serve:
 *
 *   *"I think we want to keep true to Blue Prince where certain clues about the
 *    benefits of rooms aren't immediately apparent. Saying +1 page feeds
 *    everything to the player. But when a page is revealed, the player has to
 *    be able to figure out — oh, this room provided me a page!"*
 *
 * The first half is a deletion and is gated where the deletion is
 * (`tests/word-room-face.test.ts`: no card prints a page clause). THIS file is
 * the second half, which is the harder one and the one the round is really for.
 *
 * ── WHAT CAN AND CANNOT BE GATED HERE ─────────────────────────────────────
 * A rule the player is meant to DEDUCE cannot be gated by asserting she has
 * deduced it; that is what the cold read is for, and it is the only signal the
 * builders cannot game. What IS checkable, and what the ruling actually
 * obliges, is ATTRIBUTION: every page-granting event names its room. This file
 * holds the pure half — the copy composers and the record they read — and
 * `tests/round49-attribution-live.mjs` holds the half that matters more, which
 * is that the name is PAINTED, on a phone, at both sizes.
 *
 * ── THE INSTRUMENT DOES NOT SHARE THE THING'S ASSUMPTIONS ────────────────
 * STATUS §3.2: never verify a fix with an instrument blind in the same way.
 * The composers under test build sentences out of a card ID and a deck; this
 * file asserts on the SENTENCE, by searching it for the room's own printed name
 * — not by asking the composer which card it used. A composer that resolved the
 * wrong card, or dropped the name, fails here even though its inputs were fine.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { cardById, deckFor } from '../src/engine/manor/deck';
import { FLAG_REGEX } from '../src/engine/dialogue/validate';
import {
  pageFromRoom, pageFromRoomFlag, pageReadByRoom, pageReadByRoomFlag,
  type VolumeContent,
} from '../src/engine/volume';
import { pageWhence, roomInSentence, sealedLeafLabel } from '../src/ui/journal/whence';
import { madeOutMoment, momentForEvent, type MomentContext } from '../src/ui/moment/moments';

const VOLUME_FILES = ['volume-1.json'];
const volumes = VOLUME_FILES.map((f) => JSON.parse(
  readFileSync(join(__dirname, '..', 'content', 'authored', 'volumes', f), 'utf8'),
) as VolumeContent);

const VOL = volumes[0]!.id;

// ---------------------------------------------------------------------------
// 1. The record — flags, and the one way this encoding could lie
// ---------------------------------------------------------------------------

describe('the provenance record', () => {
  it('round-trips a card id through a flag, both families', () => {
    const flags = [
      pageFromRoomFlag(VOL, 'v1-e4', 'long-gallery'),
      pageReadByRoomFlag(VOL, 'v1-e4', 'darkroom'),
    ];
    expect(pageFromRoom(VOL, 'v1-e4', flags)).toBe('long-gallery');
    expect(pageReadByRoom(VOL, 'v1-e4', flags)).toBe('darkroom');
    // A page nothing recorded reports nothing — never a guess, never a throw.
    expect(pageFromRoom(VOL, 'v1-e5', flags)).toBeNull();
    expect(pageReadByRoom(VOL, 'v1-e5', flags)).toBeNull();
    // …and the two families do not read each other's flags.
    expect(pageFromRoom(VOL, 'v1-e4', [flags[1]!])).toBeNull();
    expect(pageReadByRoom(VOL, 'v1-e4', [flags[0]!])).toBeNull();
  });

  it('is legal under docs/flags.md for every card in the shipped deck', () => {
    // The grammar is enforced at `setFlag` with a console.warn and a DROP, so a
    // flag that fails it does not crash — it silently records nothing, which
    // would make attribution vanish for one room and nobody would see it.
    for (const card of deckFor([])) {
      for (const frag of volumes[0]!.fragments) {
        expect(FLAG_REGEX.test(pageFromRoomFlag(VOL, frag.id, card.id)), card.id).toBe(true);
        expect(FLAG_REGEX.test(pageReadByRoomFlag(VOL, frag.id, card.id)), card.id).toBe(true);
      }
    }
  });

  /**
   * THE CONTENT INVARIANT THE ENCODING RESTS ON, gated rather than assumed.
   *
   * The reader takes `from-<fragmentId>-` as a prefix and returns the tail. If a
   * volume ever authored `v1-e1` and `v1-e1-b`, the flag for the SECOND would
   * be read as the first's card id (`b-<something>`), so a page would name a
   * room it never came from. `content:verify` cannot see this — both ids are
   * perfectly legal — so it is checked here, over every shipped volume.
   *
   * The near miss is real and lives in volume 1 already: `v1-e1` and `v1-e10`.
   * They are safe because the character after the shared run is `0`, not `-`,
   * and the case is asserted explicitly below so a future rename cannot break
   * it quietly.
   */
  it('no fragment id is a dash-prefix of another, in any shipped volume', () => {
    for (const v of volumes) {
      const ids = v.fragments.map((f) => f.id);
      const clashes: string[] = [];
      for (const a of ids) {
        for (const b of ids) {
          if (a !== b && b.startsWith(`${a}-`)) clashes.push(`${a} ⊂ ${b}`);
        }
      }
      expect(clashes, `${v.id}: ambiguous provenance flags`).toEqual([]);
    }
  });

  it('does not confuse v1-e1 with v1-e10 (the near miss volume 1 already has)', () => {
    const flags = [
      pageFromRoomFlag(VOL, 'v1-e10', 'gallery'),
      pageFromRoomFlag(VOL, 'v1-e1', 'library'),
    ];
    expect(pageFromRoom(VOL, 'v1-e1', flags)).toBe('library');
    expect(pageFromRoom(VOL, 'v1-e10', flags)).toBe('gallery');
  });
});

// ---------------------------------------------------------------------------
// 2. The journal's sentence — the second chance, after a night's sleep
// ---------------------------------------------------------------------------

describe('the journal says where a page came from', () => {
  const name = (id: string) => cardById(id)!.name;

  it('names the room that filed it', () => {
    const line = pageWhence(VOL, 'v1-e3', [pageFromRoomFlag(VOL, 'v1-e3', 'long-gallery')])!;
    expect(line).toContain('Long Gallery');
    expect(line).toBe('Taken out of the Long Gallery.');
  });

  it('names BOTH rooms when a leaf was carried out of one and made out in another', () => {
    const line = pageWhence(VOL, 'v1-d1', [
      pageFromRoomFlag(VOL, 'v1-d1', 'archive'),
      pageReadByRoomFlag(VOL, 'v1-d1', 'darkroom'),
    ])!;
    expect(line).toContain(roomInSentence(name('archive')));
    expect(line).toContain(roomInSentence(name('darkroom')));
    // The order is the order it happened in: carried first, read second.
    expect(line.indexOf('Archive')).toBeLessThan(line.indexOf('Darkroom'));
  });

  it('does not credit one room twice when it both filed and made out the page', () => {
    const line = pageWhence(VOL, 'v1-d1', [
      pageFromRoomFlag(VOL, 'v1-d1', 'study'),
      pageReadByRoomFlag(VOL, 'v1-d1', 'study'),
    ])!;
    expect(line).toBe('Taken out of the Study.');
  });

  it('says nothing at all where nothing was recorded', () => {
    // A letter's enclosure, testimony spoken in a parlor, any page filed before
    // this round shipped. A blank is the correct output for "does not know" —
    // the failure this replaces was a page confidently pointing at the wrong
    // room, via the authored `source` line the player was reading as an answer.
    expect(pageWhence(VOL, 'v1-t1', [])).toBeNull();
    expect(pageWhence(VOL, 'v1-t1', ['vol.volume-1.viewed-v1-t1'])).toBeNull();
    // …and a card id the deck no longer knows is the same case.
    expect(pageWhence(VOL, 'v1-t1', [pageFromRoomFlag(VOL, 'v1-t1', 'no-such-room')])).toBeNull();
  });

  it('folds the room into the torn leaf’s own label, costing the Word tab no line', () => {
    const bare = sealedLeafLabel(VOL, 'v1-d2', []);
    const named = sealedLeafLabel(VOL, 'v1-d2', [pageFromRoomFlag(VOL, 'v1-d2', 'boxroom')]);
    expect(bare).toBe('A torn leaf, not yet made out.');
    expect(named).toContain('the Boxroom');
    expect(named).toMatch(/not yet made out\.$/);
    // One sentence either way: this is the surface round 13 lost to repetition.
    expect(named.split('.').filter(Boolean)).toHaveLength(1);
  });

  it('lowercases the article inside a sentence and never at the head of one', () => {
    expect(roomInSentence('The Counting House')).toBe('the Counting House');
    expect(roomInSentence('The Gallery')).toBe('the Gallery');
    // Every card in the deck is named "The …", so this is the whole deck.
    for (const card of deckFor([])) expect(roomInSentence(card.name)).not.toMatch(/^The /);
  });
});

// ---------------------------------------------------------------------------
// 3. The seal — the teachable instant
// ---------------------------------------------------------------------------

describe('the moment of reward names the room', () => {
  const facts = (sealed: boolean) => ({
    kind: 'engraving', text: 'Its breath runs A, then U, then A.', sealed,
  });
  const ctx = (room: string | null, sealed = false): MomentContext => ({
    fragment: () => facts(sealed),
    answerFor: () => 'lacuna',
    roomFor: () => room,
  });

  const found = { type: 'fragment-found' as const, fragmentId: 'v1-e3' };

  it('puts the room at the head of the seal on a page a solve handed over', () => {
    const m = momentForEvent(found, ctx('The Long Gallery'))!;
    expect(m.title).toBe('The Long Gallery gives up an engraving');
    // The room LEADS. Her eye lands on the cause, which is the whole teaching.
    expect(m.title.indexOf('The Long Gallery')).toBe(0);
    // …and the persistent trace is untouched: `where` is an address, not a
    // cause, and AAA 11.12 wants it to stay one.
    expect(m.where).toBe('Filed in the Journal · Engravings');
  });

  it('names the violet room on a torn leaf, without quoting a word of it', () => {
    const m = momentForEvent(found, ctx('The Archive', true))!;
    expect(m.title).toBe('The Archive gives up a rubbing, not yet made out');
    // Round 11's rule holds: a sealed arrival never quotes its own contents.
    expect(m.quote).toBeUndefined();
    expect(m.title).not.toContain('breath');
  });

  it('credits the room whose solve made the backlog out, and counts in words', () => {
    const page = (id: string) => ({ id, kind: 'engraving', text: 'A line.', room: 'The Darkroom' });
    expect(madeOutMoment([page('a')])!.title).toBe('The Darkroom makes out a page');
    expect(madeOutMoment([page('a'), page('b')])!.title).toBe('The Darkroom makes out two pages');
    expect(madeOutMoment([page('a'), page('b'), page('c')])!.title)
      .toBe('The Darkroom makes out three pages');
  });

  /**
   * ═══ THE RED PROOF ════════════════════════════════════════════════════════
   *
   * The build this round replaced, reachable through the shipped composers: a
   * context that knows no room. Every title below is exactly what the game
   * printed before this round — and not one of them contains a room, which is
   * why `docs/COMPREHENSION.md`'s only [blocker] blind spot is the one it is.
   * If a future refactor drops the attribution, these are the strings it falls
   * back to and the assertions above go red against them.
   */
  it('goes RED on the anonymous seal this round replaced', () => {
    const anonymous = momentForEvent(found, ctx(null))!;
    expect(anonymous.title).toBe('An engraving, taken down');
    const sealed = momentForEvent(found, ctx(null, true))!;
    expect(sealed.title).toBe('A rubbing, not yet made out');
    const madeOut = madeOutMoment([{ id: 'a', kind: 'engraving', text: 'A line.' }])!;
    expect(madeOut.title).toBe('A page made out');
    for (const t of [anonymous.title, sealed.title, madeOut.title]) {
      for (const card of deckFor([])) expect(t).not.toContain(card.name);
    }
  });

  /**
   * THE MANIFEST: every page-granting seal the game can build must carry the
   * room it was handed. Enumerated over the copy table's own keys plus the
   * fallback, so a fragment kind added later fails here rather than shipping an
   * anonymous reward — which is exactly how the blind spot happened the first
   * time (a channel built, and nothing checking that anyone could see it).
   */
  it('drops no attribution, for any fragment kind the game can file', () => {
    const kinds = ['definition-line', 'engraving', 'testimony', 'a-kind-invented-later'];
    for (const kind of kinds) {
      for (const sealed of [false, true]) {
        const m = momentForEvent(found, {
          fragment: () => ({ kind, text: 'A line of it.', sealed }),
          answerFor: () => null,
          roomFor: () => 'The Counting House',
        })!;
        expect(m.title, `${kind}/${sealed ? 'sealed' : 'legible'}`)
          .toContain('The Counting House');
      }
    }
  });
});
