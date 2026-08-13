/**
 * Journal/mystery slice — OWNER: A7 (Mystery). Interface frozen by the
 * architect; A7 implements against engine/{journal,volume}.ts and
 * content/authored/volumes/*.
 *
 * The journal itself is pure derivation (engine/journal.ts) over
 * volume.foundFragmentIds — this slice owns the VolumeState machine.
 *
 * Persistence notes (no save-schema changes needed):
 *   - opened letters are write-once `vol.<id>.opened-<letterId>` flags
 *     (docs/flags.md `vol.*` pattern — set only by this machine)
 *   - letter *arrival* is pure derivation (engine/volume.ts arrivedLetters)
 *     over day number, fragments found, and the chronicles' drought record
 */

import type { StateCreator } from 'zustand';
import type { RoomCategory, SolveChannelId, Tier, VolumeState } from '../../engine/types';
import type { RoomPuzzleKind } from '../../engine/rooms/room-puzzle';
import type { ManorStore } from '../store';
import type { SaveV2 } from '../save';
import {
  advanceVolume, applyGuess, decipherYield, findLetter,
  fragmentsToDecipher, legibleDayFlag, legibleFragmentFlag, letterGrants, nextFragmentForRoom,
  normalizeGuess, openedLetterFlag, pageFromRoomFlag, pageReadByRoomFlag, reservedTestimonyIds,
  sealedFragmentFlag, sealedFragmentIds, solveChannelFor, solveChannelPage, solvedFlag,
} from '../../engine/volume';
import { glancedFragmentFlag, nextUninterpreted, viewedFragmentFlag } from '../../engine/journal';
import { atSanctumDoor, canAddressSanctum } from '../../engine/manor/grid';
import { sanctumAnsweredFlag, sanctumAnswered } from '../../engine/manor/tube';
import { DIALOGUE_FILES } from '../../engine/dialogue/content';
import { getVolumeContent, nextVolumeContent } from '../content/volumes';

export interface JournalSlice {
  volume: VolumeState;

  /**
   * File a fragment forever; auto-groups + cross-refs are derived.
   *
   * ROUND 10 — `opts.sealed` files it UNDECIPHERED (a torn leaf, a smudged
   * rubbing): hers immediately and permanently, visible in the journal,
   * required for nothing (AAA 4.18), but carrying no readable text, no
   * engraving constraint for the alphabet plate and nothing for Ellery to
   * read until a solved word game makes it out. Default is legible, so every
   * existing caller (letters, testimony, the solve channel) is unchanged.
   */
  fileFragment(
    fragmentId: string,
    opts?: { sealed?: boolean; via?: SolveChannelId; fromCardId?: string },
  ): void;
  /** Ellery's affinity service. Accepts a fragment id or 'next' (the first
   *  found-but-uninterpreted fragment) — DialogueEffects.interpretFragment. */
  interpretFragment(fragmentId: string): void;
  /**
   * The daily Sanctum guess: normalize, check accepted[]. Wrong → sympathetic
   * 'sanctum-guess-wrong' with closeness metadata; right → 'volume-solved' →
   * night sequence → advanceVolume. One guess per day, never a penalty.
   */
  guessAtSanctum(guess: string): void;
  /**
   * THE CEREMONY, FOR A WORD ALREADY SAID DOWN THE TUBE (round 19, §5.2).
   *
   * She named it in the Entrance Hall; the volume stayed open because the seal
   * and the monologue belong to the landing. When she finally arrives, the door
   * must not ask her to type it a second time — a second `guessAtSanctum` would
   * spend that day's one word on a word the door has already accepted, and on a
   * day she had spoken to it once already `hasGuessedOnDay` would refuse
   * outright and strand her at her own climax. So the arrival closes the
   * volume directly. No-op unless all three hold: at the door, answered, and
   * the volume still active (`engine/manor/tube.ceremonyAwaits`).
   */
  finishSanctumCeremony(): void;
  /** Overnight letters from Posy: micro-puzzles + side-quest chains. */
  openLetter(letterId: string): void;

  /**
   * Record that these fragments have actually been DISPLAYED to the player —
   * the only thing that retires an unread marker (AAA 11.20). Write-once
   * flags, the same shape as the letters' opened flags, so the state survives
   * the day roll and a force-quit.
   *
   * ROUND 12 — TWO FLAGS, BECAUSE SHE MAY HAVE SEEN A SMUDGE RATHER THAN A
   * SENTENCE: a sealed page records `vol.<id>.glanced-<fragmentId>`, a legible
   * one `vol.<id>.viewed-<fragmentId>`. The unread chain reads whichever one
   * the page's CURRENT state calls for (engine/journal.hasSeen), so a page she
   * looked at while smudged stops being unread — and becomes unread again the
   * moment a solve makes it out, which is the point: that is new information.
   *
   * Called by the journal sheet with `displayedFragmentIds(tab)` — never by a
   * navigation or focus edge. Ids that are not filed yet are ignored, and the
   * whole call is a no-op once everything passed is already viewed (so the
   * sheet may call it on every render without churning the save).
   */
  markFragmentsViewed(fragmentIds: readonly string[]): void;

  /**
   * A7 ADDITIVE (consumed by A1's mystery-room flow; also my pity channel):
   * file the next fragment on the volume's deterministic drip for a room
   * category (prefers matching sourceRoomCategory, falls back to the lowest
   * unfound revealOrder — AAA 4.14). Returns the filed fragment id for the
   * "found a fragment" moment, or null when the volume is fully filed.
   */
  collectFragmentForRoom(category: RoomCategory, fromCardId?: string): string | null;
  /**
   * A7 ADDITIVE — THE SOLVE CHANNEL (AAA 4.14 / 11.17, MANOR_DESIGN §6).
   *
   * The word games' payment into the mystery: a solved puzzle room hands over
   * the lowest unfound fragment on its channel (the Study a definition line,
   * every other puzzle room a lintel engraving — engine/volume.solveChannelFor),
   * once per day per channel. Returns the filed id, or null when the channel is
   * empty, valved, or the room paid nothing.
   *
   * Exposed rather than private because AAA 11.17 wants "a test that drives
   * the award path", and because a lifecycle that wants to force the check
   * should not have to fake a store notification (the meta slice's precedent).
   * In normal play NOTHING calls it by hand: the spine watcher below does.
   */
  collectFragmentForSolve(kind: RoomPuzzleKind, fromCardId?: string): string | null;
  /**
   * A7 ADDITIVE — THE DECIPHER CHANNEL (round 10, the owner's "solving needs
   * to matter"). Make out up to `count` of the sealed pages, oldest first on
   * the drip. Returns the ids that became legible.
   *
   * Write-once `vol.<id>.legible-<fragmentId>` flags, the same mechanism as
   * the letters' seals and the journal's viewed markers, so the state survives
   * the day roll and a force-quit with no save-schema change.
   */
  decipherFragments(count: number, fromCardId?: string): string[];
  /**
   * A7 ADDITIVE — everything one solved room pays the mystery, in one call:
   * the channel fragment (legible, because she solved for it), the tier-scaled
   * decipher of the sealed backlog, and — on a PERFECT solve — Ellery's
   * reading of the next made-out line, free, which she would otherwise charge
   * affinity for.
   *
   * Exposed rather than private for the same reason `collectFragmentForSolve`
   * is: AAA 11.17 wants a test that drives the award path. In normal play
   * nothing calls it by hand — the spine watcher below does, off `room-solved`.
   */
  creditSolve(kind: RoomPuzzleKind, tier: Tier, perfect: boolean, cellKey?: string): void;
  /**
   * A7 ADDITIVE (consumed by the Sanctum epilogue, after the ceremony):
   * roll the manor onto the next authored volume, if one exists. The closed
   * volume's journal stays readable forever (archived by volumeId).
   */
  beginNextVolume(): void;
}

export const createJournalSlice =
  (initial: SaveV2): StateCreator<ManorStore, [], [], JournalSlice> =>
  (set, get, api) => {
    /**
     * THE SOLVE-CHANNEL WATCHER (round-8 defect, AAA 11.17 / 4.14).
     *
     * `collectFragmentForRoom` shipped with exactly one caller and
     * `RoomEvent.reward.fragmentId` with none, so violet rooms were the whole
     * of the room→mystery wiring and two authored `sourceRoomCategory:
     * "puzzle"` fragments could never arrive by the route their label names.
     *
     * The award is driven off the AUDITED EVENT SPINE, exactly like the meta
     * slice's keepsake/cabinet watcher and for the same reason recorded there:
     * a checker called from `room.ts`'s solve branch would be one more emitter
     * with one caller — the shape that has now shipped broken three times —
     * and it would also mean this slice reaching into another agent's file.
     * `room-solved` is a counter the watcher already has to read; new solve
     * paths (a future room kind, a scripted solve, a test) pay the mystery
     * automatically, because they all land on the same stream.
     *
     * Cheap identity gate first: the store notifies on every mutation,
     * including per-keystroke room state (AAA 9.4).
     */
    let seenSolves = initial.events.counters['room-solved'] ?? 0;
    api.subscribe((s) => {
      const solves = s.counters['room-solved'] ?? 0;
      if (solves === seenSolves) return;
      seenSolves = solves;
      // The solve must be the thing that JUST landed — the newest entry on the
      // stream, not merely the newest solve in it. A bulk state replacement
      // (an imported save hydrated into a live store, a fixture swap) moves the
      // counter without anything having happened, and this channel files a
      // permanent fragment, so it must not fire on one. (Re-entrancy is closed
      // by the gate above: filing does not move the 'room-solved' counter.)
      const last = s.recentEvents[s.recentEvents.length - 1];
      if (last?.event.type !== 'room-solved') return;
      // Round 10: the same spine event now also makes out the sealed backlog
      // and pays a perfect solve its free reading — see `creditSolve`.
      // Round 49: `cellKey` rides along so every page this solve pays can
      // remember WHICH room paid it. It is already on the event — the spine has
      // carried it since round 8 — so nothing new is emitted and no other
      // agent's file moves.
      get().creditSolve(
        last.event.kind, last.event.tier, last.event.perfect, last.event.cellKey,
      );
    });

    /**
     * The page a solve files: `engine/volume.solveChannelPage` holds the valve
     * and the stock together.
     *
     * ROUND 46 gave it a second caller — the draft card's `+1 page` clause,
     * asking without paying. ROUND 49 TOOK THAT CALLER AWAY on the owner's
     * ruling: the card states prices and rules of play, never what a room is
     * worth to the mystery. What replaced it is downstream, in `fileFragment`
     * and the moment layer — the page still arrives, and now it says which room
     * sent it.
     */
    const pageForSolve = (kind: RoomPuzzleKind) => {
      const v = get().volume;
      if (v.status !== 'active') return null;
      const content = getVolumeContent(v.volumeId);
      if (!content) return null;
      const reservedIds = reservedTestimonyIds(
        Object.values(DIALOGUE_FILES),
        new Set(get().seenNodeIds),
      );
      return solveChannelPage(
        content, v, solveChannelFor(kind), get().recentEvents,
        get().day?.day ?? v.day, { reservedIds },
      );
    };

    return {
    volume: initial.volume,

    fileFragment: (fragmentId, opts) => {
      const v = get().volume;
      if (v.foundFragmentIds.includes(fragmentId)) return;
      // Only file fragments the current volume actually defines — a stale id
      // (e.g. from an old letter after a volume roll) must never corrupt state.
      const content = getVolumeContent(v.volumeId);
      if (content && !content.fragments.some((f) => f.id === fragmentId)) return;
      set({ volume: { ...v, foundFragmentIds: [...v.foundFragmentIds, fragmentId] } });
      // Sealed BEFORE the event fires, so anything reading the spine (the
      // moment layer, the journal) already sees the page in the state it
      // actually arrived in.
      if (opts?.sealed) get().setFlag(sealedFragmentFlag(v.volumeId, fragmentId));
      // ROUND 49 — and WHICH ROOM handed it over, for the same reason and one
      // line earlier than it is read. The moment layer builds the seal off this
      // flag the instant `fragment-found` lands, so a room stamped after the
      // event would announce an anonymous page and then quietly become
      // attributable in the journal an hour later.
      if (opts?.fromCardId) {
        get().setFlag(pageFromRoomFlag(v.volumeId, fragmentId, opts.fromCardId));
      }
      // ROUND 13 (AAA 4.14 blocker): the pity floor counts what she can READ.
      // A sealed page taught her nothing, so it must not reset the drought —
      // it was resetting it, which switched the mercy channel off for exactly
      // the player the seal is designed to press. `fragment-found` still fires
      // for both (the chronicles print the filed count, correctly); only the
      // legible arrival marks the day. See engine/volume.legibleDayFlag.
      if (!opts?.sealed) get().setFlag(legibleDayFlag(v.volumeId, get().day?.day ?? v.day));
      // `via` stamps WHICH TAP paid, so the daily valve can tell a page earned
      // by solving from one the violet drip handed over (engine/events.ts).
      get().recordEvent({ type: 'fragment-found', fragmentId, ...(opts?.via ? { via: opts.via } : {}) });
    },

    interpretFragment: (fragmentId) => {
      const v = get().volume;
      const content = getVolumeContent(v.volumeId);
      if (!content) return;
      // Ellery reads English, not smudges: 'next' skips sealed pages, and a
      // sealed page named outright is refused (round 10).
      const sealedIds = sealedFragmentIds(v.volumeId, get().flags);
      const id = fragmentId === 'next' ? nextUninterpreted(content, v, { sealedIds }) : fragmentId;
      if (!id) return;
      if (sealedIds.has(id)) return;
      if (!v.foundFragmentIds.includes(id) || v.interpretedFragmentIds.includes(id)) return;
      if (!content.fragments.some((f) => f.id === id)) return;
      set({ volume: { ...v, interpretedFragmentIds: [...v.interpretedFragmentIds, id] } });
      get().recordEvent({ type: 'fragment-interpreted', fragmentId: id });
    },

    guessAtSanctum: (guess) => {
      const v = get().volume;
      const content = getVolumeContent(v.volumeId);
      if (!content) return;
      // ── THE SECOND GATE (AAA 4.10e, MANOR_DESIGN §7 — round-7 blocker). ──
      // Winning takes BOTH: knowing the word AND standing at the door that
      // day. The door was gated on neither — the journal's "Take it to the
      // Sanctum" button navigated here from anywhere, in any phase, for zero
      // steps, so a fresh save could solve Volume 1 on day 1 at the Entrance
      // Hall with 21 untouched steps. The climb is the other half of the game;
      // it is enforced here, on the model, so a UI regression cannot reopen
      // it. (Reading /sanctum stays free: the Portrait, the elimination list
      // and the nudge are journal-class information, AAA 4.15/4.16.)
      // ── ROUND 19 (REVIEW_AA §5.2): THE TUBE IS WIRED IN. ────────────────
      // Round 17 built the whole mechanic in the engine — `SPEAKING_TUBE_CELL`,
      // `atSpeakingTube`, `canAddressSanctum`, `sanctumAnsweredFlag`,
      // `doorsHeldOpen` — documented it at length in `engine/manor/tube.ts`,
      // re-tuned every published campaign band against it in
      // `economy/simulate.ts`, and then never connected it to a single live
      // surface: this line still read `atSanctumDoor`, so the shipped game went
      // on refusing every word not spoken from the top landing while the docs,
      // the model and four AAA clauses described a game where she may speak on
      // day 1. That is REVIEW_AA §0's finding in its purest form — the team
      // measuring a build that does not exist — and it is why `firstSpeakDay`
      // read "median 1" in a report about a game nobody could say a word to.
      //
      // The gate is now the predicate the mechanic was written around: the
      // Sanctum door, or the brass in the Entrance Hall. Which of the two she
      // used decides what a RIGHT word does, below.
      if (!canAddressSanctum(get().manor)) return;
      const atDoor = atSanctumDoor(get().manor);
      const day = get().day?.day ?? v.day;
      const { state, result } = applyGuess(content, v, guess, day);
      if (result.kind === 'gate' || result.kind === 'empty') return;
      if (result.kind === 'solved' && !atDoor) {
        // ── THE WORD WENT UP THE BRASS, AND THE CEREMONY IS STILL UPSTAIRS. ──
        // `applyGuess` returns `status: 'solved'`, which is right at the door
        // and wrong here: the seal, the reveal and the four-beat monologue play
        // on the landing or not at all (tube.ts, clause 3). So the guess is
        // journaled, the volume stays ACTIVE, and the house sets one write-once
        // flag — from which moment it stops gambling with her: the padlocks
        // between her and the top stand open (`doorsHeldOpen`, read by the
        // manor slice) and the landing offer's mercy slot is armed outright.
        set({ volume: { ...state, status: 'active' } });
        get().setFlag(sanctumAnsweredFlag(content.id));
        return;
      }
      set({ volume: state });
      if (result.kind === 'wrong') {
        // Consumes only the daily guess; journaled so she can see her own
        // elimination history; the Portrait's sigh keys off closeness (4.17).
        get().recordEvent({
          type: 'sanctum-guess-wrong',
          guess: result.guess,
          closeness: result.closeness,
        });
      } else {
        get().setFlag(solvedFlag(content.id));
        // ── ROUND 13 (AAA 4.15 blocker): THE VOLUME CLOSED, SO THE HOUSE GAVE
        //    HER THE REST. ────────────────────────────────────────────────────
        // The ceremony already prints every definition line IN CLEAR
        // (SanctumView's epilogue) and its own copy names the journal as the
        // permanent trace — "the journal keeps the rest". The journal was
        // rendering those same lines as dot-runs with "solve a room" written
        // under each of them, on a volume whose status is 'solved' and whose
        // rail and nudge both retire when solved: an archive contradicting its
        // own ceremony, with a dead instruction and no count left to act on.
        // Making the backlog out at the door retires the smudges EVERYWHERE at
        // once — journal, tabs, entrance, digest — so one rule governs both
        // surfaces and 4.15's "zero information exists only in a transient
        // scene" holds. Routed through `decipherFragments` so the spine, the
        // moment layer and the unread chain all see it the ordinary way.
        const stillSealed = sealedFragmentIds(v.volumeId, get().flags);
        if (stillSealed.size > 0) get().decipherFragments(stillSealed.size);
        get().recordEvent({ type: 'volume-solved', volumeId: content.id });
        // The night sequence (Sanctum epilogue → endDay('volume-solved') →
        // beginNextVolume) is driven by the Sanctum UI so the ceremony plays
        // before anything rolls over.
      }
    },

    finishSanctumCeremony: () => {
      const v = get().volume;
      const content = getVolumeContent(v.volumeId);
      if (!content) return;
      if (v.status !== 'active') return;
      if (!atSanctumDoor(get().manor)) return;
      if (!sanctumAnswered(v.volumeId, get().flags)) return;
      set({ volume: { ...v, status: 'solved' } });
      get().setFlag(solvedFlag(content.id));
      // Same closing rite as the door-typed win above: the backlog comes out
      // everywhere at once so the archive cannot contradict the ceremony.
      const stillSealed = sealedFragmentIds(v.volumeId, get().flags);
      if (stillSealed.size > 0) get().decipherFragments(stillSealed.size);
      get().recordEvent({ type: 'volume-solved', volumeId: content.id });
    },

    openLetter: (letterId) => {
      const v = get().volume;
      const content = getVolumeContent(v.volumeId);
      if (!content) return;
      // findLetter also resolves house-written pity letters ('pity-extra-N'),
      // which exist only as derivation, never in the authored letters array.
      const letter = findLetter(content, letterId);
      if (!letter) return;
      const flag = openedLetterFlag(v.volumeId, letterId);
      if (get().flags.includes(flag)) return; // already opened (write-once)
      // Resolve grants BEFORE filing (a pity letter grants the next unfound).
      const grants = letterGrants(content, letter, v);
      get().setFlag(flag);
      for (const fid of grants) get().fileFragment(fid);
      // Posy tucks a bookmark into every letter — the renewable gift-currency
      // source (AAA 5.7; empty-pocket copy in DialogueScene names letters).
      set((s) => ({
        currencies: { ...s.currencies, bookmarks: s.currencies.bookmarks + 1 },
      }));
      get().recordEvent({ type: 'letter-opened', letterId });
    },

    markFragmentsViewed: (fragmentIds) => {
      const v = get().volume;
      const have = new Set(get().flags);
      // ROUND 12: record what she saw IN THE STATE SHE SAW IT IN. A smudge she
      // has looked at is `glanced-`; only the words themselves are `viewed-`.
      // The seal set is read live here rather than passed in, so the sheet
      // cannot hand us a stale legibility and mint the wrong flag.
      const sealedIds = sealedFragmentIds(v.volumeId, get().flags);
      for (const id of fragmentIds) {
        // Only what the volume has actually filed can be "seen": a stale id
        // must never mint a flag that outlives its fragment.
        if (!v.foundFragmentIds.includes(id)) continue;
        const flag = sealedIds.has(id)
          ? glancedFragmentFlag(v.volumeId, id)
          : viewedFragmentFlag(v.volumeId, id);
        if (have.has(flag)) continue;
        have.add(flag);
        get().setFlag(flag); // write-once, validated against docs/flags.md
      }
    },

    collectFragmentForRoom: (category, fromCardId) => {
      const v = get().volume;
      const content = getVolumeContent(v.volumeId);
      if (!content) return null;
      // Testimony promised by a still-unseen character scene steps aside from
      // the room drip so the character actually gets to say it (AAA 4.14) —
      // nextFragmentForRoom ignores the reservation rather than strand a
      // fragment, and the pity/letter channel never skips.
      const reservedIds = reservedTestimonyIds(
        Object.values(DIALOGUE_FILES),
        new Set(get().seenNodeIds),
      );
      const frag = nextFragmentForRoom(content, v, category, { reservedIds });
      if (!frag) return null;
      // ── ROUND 10: ENTERING GETS THE DOCUMENT, SOLVING MAKES IT LEGIBLE. ──
      // This is A1's violet-room channel, fired the moment she steps in. The
      // page is hers forever from this instant — it is filed, it is in the
      // journal, nothing can take it away and nothing ever requires it — but
      // it arrives UNDECIPHERED. Walking into the Archive and walking out
      // still leaves her holding the leaf; it just does not speak until she
      // finishes a word game. (`decipherFragments` is the other half.)
      get().fileFragment(frag.id, { sealed: true, ...(fromCardId ? { fromCardId } : {}) });
      return frag.id;
    },

    decipherFragments: (count, fromCardId) => {
      const v = get().volume;
      const content = getVolumeContent(v.volumeId);
      if (!content) return [];
      const sealedIds = sealedFragmentIds(v.volumeId, get().flags);
      if (sealedIds.size === 0) return [];
      const ids = fragmentsToDecipher(content, v, sealedIds, count);
      if (ids.length === 0) return ids;
      for (const id of ids) {
        // ROUND 49 — THE ROOM FIRST, THE LEGIBILITY SECOND, AND THE ORDER IS
        // LOAD-BEARING. The moment layer announces a made-out page by DIFFING
        // the `legible-` flag set (ui/moment/watch.ts — `decipherFragments`
        // emits no spine event the seal can hang on), and every `setFlag`
        // notifies the store. Stamp the room after the legibility and the
        // watcher wakes on a page whose room is not written yet: the seal says
        // "Two pages made out" with nobody's name on it, and the attribution
        // appears in the journal a beat later, on the one surface where it was
        // never the teachable instant. Same rule as `sealed` in `fileFragment`.
        //
        // Deliberately a SECOND family from `from-`: a torn leaf carried out of
        // the Archive and made out in the Darkroom has two rooms in its history
        // and they teach two different rules.
        if (fromCardId) get().setFlag(pageReadByRoomFlag(v.volumeId, id, fromCardId));
        get().setFlag(legibleFragmentFlag(v.volumeId, id));
      }
      // The other half of the round-13 pity fix: making a page out IS learning
      // something, so it marks the day even though nothing new was filed.
      get().setFlag(legibleDayFlag(v.volumeId, get().day?.day ?? v.day));
      // ROUND 7 (verifier): the spine now carries the beat, per the architect's
      // grant of `fragment-made-out`. `fragment-found` said the page was HERS;
      // this says it finally SPEAKS. One event per batch, because the tier
      // yield is the thing the player is meant to feel — see
      // DECIPHER_YIELD_BY_TIER. Dialogue, achievements and the music director
      // can all read it; the moment layer keeps its own `legible-` flag diff
      // (it must survive a save loaded mid-campaign, which the day-stamped
      // stream cannot).
      get().recordEvent({ type: 'fragment-made-out', fragmentIds: ids });
      return ids;
    },

    creditSolve: (kind, tier, perfect, cellKey) => {
      // ROUND 49 — WHOSE SOLVE THIS IS, resolved once for both payments below.
      // Read off the manor at `cellKey`, which is the room she is standing in:
      // the card ID, not the kind, because "The Long Gallery" and "The Gallery"
      // are two cards of one kind and she chose one of them by name. A caller
      // with no cell (a lifecycle test, a scripted solve) attributes nothing
      // rather than guessing — an anonymous page is honest, a wrong room is not.
      const fromCardId = cellKey ? get().manor?.rooms[cellKey]?.cardId : undefined;
      // 1. The room's own channel fragment — legible, because she solved for
      //    it (the Study a definition line, every other room a lintel
      //    engraving; one per channel per day, valved off the spine).
      get().collectFragmentForSolve(kind, fromCardId);
      // 2. The sealed backlog: tier scales the yield (1 / 2 / 3), so a tier-3
      //    room near the top is worth three ground-floor ones in mystery
      //    material — engine/volume.ts DECIPHER_YIELD_BY_TIER.
      get().decipherFragments(decipherYield(tier), fromCardId);
      // 3. A PERFECT solve buys the reading Ellery charges affinity for
      //    (AAA 5.7's service tier, granted free): the next made-out line she
      //    has not yet annotated. A no-op when there is nothing legible left
      //    to read, so a flawless day never mints a phantom note.
      if (perfect) get().interpretFragment('next');
    },

    collectFragmentForSolve: (kind, fromCardId) => {
      const frag = pageForSolve(kind);
      if (!frag) return null;
      get().fileFragment(frag.id, {
        via: solveChannelFor(kind).id,
        ...(fromCardId ? { fromCardId } : {}),
      });
      return frag.id;
    },

    beginNextVolume: () => {
      const v = get().volume;
      if (v.status !== 'solved') return;
      const next = nextVolumeContent(v.volumeId);
      if (!next) return; // no further volume authored yet — archive stands
      const day = get().day?.day ?? v.day;
      set({ volume: advanceVolume(next, day) });
    },
    };
  };

/** Convenience re-export for UI callers (keeps imports on the slice seam). */
export { normalizeGuess };
