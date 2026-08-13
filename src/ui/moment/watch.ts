/**
 * The watcher — OWNER: the moment layer.
 *
 * Reads campaign-class grants off the audited event spine and pushes them into
 * the moment queue. This is the piece that fixes AAA 11.11/11.13: the notice
 * is produced by a subscription that starts at boot and never unmounts, so a
 * grant that happens while the player is inside a room, behind the dialogue
 * overlay, or reading the journal is still announced — and if the layer is
 * somehow not mounted at that instant, the moment WAITS in the queue instead
 * of expiring into an empty room.
 *
 * Two channels, because the game has two shapes of campaign grant:
 *   - EVENTS  (fragment-found from all four emitters, fragment-interpreted,
 *     volume-solved, affinity-rank-up) — read off `recentEvents`.
 *   - DERIVED (a letter arriving; round 9: a keepsake banked, a floorplan plate
 *     filled) — none of the three emits an event at all. Letter arrival is pure
 *     derivation over day/fragments/drought (engine/volume.arrivedLetters);
 *     keepsakes and plates are grow-only arrays written by
 *     `meta.syncEarnedRewards`. All three were therefore announced NOWHERE:
 *     they existed only as renders on screens the player had no reason to open.
 *     The watcher diffs them instead.
 */

import type { CharacterId } from '../../engine/types';
import type { RecordedEvent } from '../../engine/events';
import { useManorStore, type ManorStore } from '../../app/store';
import { getVolumeContent } from '../../app/content/volumes';
import {
  arrivedLetters, legibleDroughtDays, madeOutFragmentIds, openedLetterIds,
  pageFromRoom, pageReadByRoom, sealedFragmentIds,
} from '../../engine/volume';
import { keepsakeById } from '../../engine/achievements';
import { cardById } from '../../engine/manor/deck';
import {
  keepsakeMoment, letterMoment, madeOutMoment, momentForEvent, plateMoment,
  type MadeOutFacts, type MomentContext,
} from './moments';
import { momentQueue, type MomentQueue } from './queue';

export interface LetterFacts { id: string; from: CharacterId; subject?: string }
export interface KeepsakeFactsLite { id: string; name: string; description: string }
export interface PlateFacts { id: string; name: string }

/** Everything the watcher needs from the world, per pass. */
export interface WatchSnapshot {
  recentEvents: readonly RecordedEvent[];
  /** The tray as it stands: every letter that has arrived, opened or not. */
  letters: readonly LetterFacts[];
  /** The mantel as it stands: every keepsake banked (AAA 11.12, round 9). */
  keepsakes: readonly KeepsakeFactsLite[];
  /** The cabinet's filled plates — `unlockCard`'s sibling channel. */
  plates: readonly PlateFacts[];
  /**
   * Round 11: every page this volume has MADE OUT, oldest first on the drip.
   * `decipherFragments` writes only `legible-` flags — no spine event — so the
   * one reward the round-10 mechanic exists to pay was announced nowhere at
   * all, and it always fires while the player is inside a room. Diffed here,
   * exactly like the tray and the mantel (AAA 11.11/11.12).
   */
  madeOut: readonly MadeOutFacts[];
}

export interface MomentWatcher {
  /** Adopt the current world as "already known" — nothing is announced. */
  prime(): void;
  /** Announce anything that appeared since the last pass. */
  sync(): void;
}

/** Identity for one recorded event: day + wall clock + the event itself. */
export function eventKey(rec: RecordedEvent): string {
  return `${rec.day}|${rec.at}|${JSON.stringify(rec.event)}`;
}

export function createMomentWatcher(
  queue: MomentQueue,
  read: () => WatchSnapshot,
  ctx: MomentContext,
): MomentWatcher {
  let knownEvents = new Set<string>();
  let knownLetters = new Set<string>();
  let knownKeepsakes = new Set<string>();
  let knownPlates = new Set<string>();
  let knownMadeOut = new Set<string>();

  const pass = (announce: boolean) => {
    const snap = read();

    const events = new Set<string>();
    for (const rec of snap.recentEvents) {
      const key = eventKey(rec);
      events.add(key);
      if (announce && !knownEvents.has(key)) {
        const moment = momentForEvent(rec.event, ctx);
        if (moment) queue.push(moment);
      }
    }
    // Rebuilt (not merged) each pass: dusk prunes the stream, so this keeps
    // the key set bounded by one day's events rather than a whole campaign.
    knownEvents = events;

    const letters = new Set<string>();
    for (const letter of snap.letters) {
      letters.add(letter.id);
      if (announce && !knownLetters.has(letter.id)) queue.push(letterMoment(letter));
    }
    knownLetters = letters;

    // Round 9 — the two permanent-unlock channels. Grow-only arrays in the
    // save, so a plain diff is enough and a reload re-primes them silently.
    const keepsakes = new Set<string>();
    for (const k of snap.keepsakes) {
      keepsakes.add(k.id);
      if (announce && !knownKeepsakes.has(k.id)) queue.push(keepsakeMoment(k));
    }
    knownKeepsakes = keepsakes;

    const plates = new Set<string>();
    for (const p of snap.plates) {
      plates.add(p.id);
      if (announce && !knownPlates.has(p.id)) queue.push(plateMoment(p));
    }
    knownPlates = plates;

    // Round 11 — the decipher channel. ONE seal per batch, not one per page:
    // a tier-3 solve makes out three at once, and "Three pages come clear" is
    // what makes DECIPHER_YIELD_BY_TIER a felt lever rather than a constant.
    const madeOut = new Set<string>();
    const fresh: MadeOutFacts[] = [];
    for (const f of snap.madeOut) {
      madeOut.add(f.id);
      if (announce && !knownMadeOut.has(f.id)) fresh.push(f);
    }
    knownMadeOut = madeOut;
    const seal = madeOutMoment(fresh);
    if (seal) queue.push(seal);
  };

  return {
    prime: () => pass(false),
    sync: () => pass(true),
  };
}

// ---------------------------------------------------------------------------
// Wiring to the live store
// ---------------------------------------------------------------------------

/** The live fragment/answer lookup, over the volume the player is inside. */
export const liveContext: MomentContext = {
  fragment: (id) => {
    const s = useManorStore.getState();
    const { volumeId } = s.volume;
    const content = getVolumeContent(volumeId);
    const frag = content?.fragments.find((f) => f.id === id);
    if (!frag) return null;
    return {
      kind: frag.kind,
      text: frag.text,
      interpretation: frag.interpretation,
      // The arrival must know the state the page arrived IN. `fileFragment`
      // sets the sealed flag before it records 'fragment-found' precisely so
      // this read is already true when the watcher gets here.
      sealed: sealedFragmentIds(volumeId, s.flags).has(id),
    };
  },
  answerFor: (volumeId) => getVolumeContent(volumeId)?.answer ?? null,
  // ROUND 49 — the room's own card name, resolved through the deck the player
  // drafted from. `pageFromRoom` returns a card ID; `cardById` turns it into
  // the words printed on the card she chose, and an ID the deck no longer
  // knows resolves to null rather than to a slug on the glass.
  roomFor: (id) => {
    const s = useManorStore.getState();
    const cardId = pageFromRoom(s.volume.volumeId, id, s.flags);
    return (cardId && cardById(cardId)?.name) || null;
  },
};

/** Read the tray straight out of the store (the same derivation JournalView
 *  renders — one source of truth for what has arrived). */
export function readSnapshot(s: ManorStore): WatchSnapshot {
  // The mantel and the cabinet do not depend on the volume being authored, so
  // they are read before the early return — an imported/unauthored volume must
  // not silence the keepsake channel too.
  const keepsakes = s.earnedAchievementIds
    .map((id) => keepsakeById(id))
    .filter((k): k is NonNullable<typeof k> => Boolean(k))
    .map((k) => ({ id: k.id, name: k.name, description: k.description }));
  const plates = s.cabinet.unlockedCardIds
    .map((id) => cardById(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({ id: c.id, name: c.name }));

  const content = getVolumeContent(s.volume.volumeId);
  if (!content) {
    return { recentEvents: s.recentEvents, letters: [], keepsakes, plates, madeOut: [] };
  }
  const day = s.day?.day ?? s.volume.day;
  const letters = arrivedLetters(content, s.volume, day, {
    droughtDays: legibleDroughtDays(s.volume.volumeId, s.flags, s.chronicles.dayRecords),
    openedIds: openedLetterIds(content.id, s.flags),
  });
  // Pages a solved room has deciphered, oldest first on the drip — the same
  // order `fragmentsToDecipher` makes them out in, so the batch's quoted line
  // is the one the definition poem has been waiting on.
  const madeOutIds = madeOutFragmentIds(s.volume.volumeId, s.flags);
  const madeOut: MadeOutFacts[] = madeOutIds.size === 0 ? [] : content.fragments
    .filter((f) => madeOutIds.has(f.id))
    .sort((a, b) => a.revealOrder - b.revealOrder)
    .map((f) => {
      // ROUND 49 — the room whose solve made THIS page out (`readby-`), which
      // is a different question from who filed it: a leaf carried out of the
      // Archive is made out in the Darkroom, and the seal announcing the
      // deciphering must credit the Darkroom.
      const cardId = pageReadByRoom(s.volume.volumeId, f.id, s.flags);
      return {
        id: f.id, kind: f.kind, text: f.text,
        room: (cardId && cardById(cardId)?.name) || null,
      };
    });
  return { recentEvents: s.recentEvents, letters, keepsakes, plates, madeOut };
}

let unsubscribe: (() => void) | null = null;

/**
 * Start watching. Idempotent — the layer and its bootstrap both call it, and
 * whichever gets there first owns the subscription for the session.
 */
export function installMomentWatch(): void {
  if (unsubscribe) return;
  const watcher = createMomentWatcher(
    momentQueue,
    () => readSnapshot(useManorStore.getState()),
    liveContext,
  );
  // The world as she left it is not news: everything already in the save is
  // adopted silently, so a reload never replays last week's discoveries.
  watcher.prime();

  // Cheap identity gate first: the store notifies on every mutation (including
  // per-keystroke room state), and re-deriving the letter tray on each of them
  // would allocate for nothing (AAA 9.4).
  //
  // `earned` and `cabinet` are in the gate in their own right (round 9): the
  // meta slice banks them from ITS OWN subscription, so the write lands in a
  // later notification than the counters/records that caused it. Gating only on
  // the causes would make the announcement depend on subscriber order.
  const gate = (s: ManorStore) => ({
    recentEvents: s.recentEvents as unknown,
    volume: s.volume as unknown,
    flags: s.flags as unknown,
    records: s.chronicles.dayRecords as unknown,
    earned: s.earnedAchievementIds as unknown,
    cabinet: s.cabinet as unknown,
    day: s.day?.day ?? 0,
  });
  let seen = gate(useManorStore.getState());
  unsubscribe = useManorStore.subscribe((s) => {
    const now = gate(s);
    if (
      now.recentEvents === seen.recentEvents && now.volume === seen.volume &&
      now.flags === seen.flags && now.records === seen.records &&
      now.earned === seen.earned && now.cabinet === seen.cabinet && now.day === seen.day
    ) return;
    seen = now;
    watcher.sync();
  });
}

/** Tests only. */
export function uninstallMomentWatch(): void {
  unsubscribe?.();
  unsubscribe = null;
}
