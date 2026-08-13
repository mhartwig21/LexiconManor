/**
 * THE MOMENT — the pure half. OWNER: the moment layer (src/ui/moment/*).
 *
 * Round-6 defect (AAA §0.5 escape 3, now §11.10–11.14): finding a clue
 * fragment — the core reward of the entire mystery — announced itself as a
 * 3.2s line in the blueprint footer, styled `.bp-foot__dewey`: literally the
 * same class as the cat's purr. It fired for four channels and only one of
 * them was ever on screen:
 *
 *   1. manor.ts  (mystery room drafted)     — player IS on the blueprint  ✓
 *   2. dialogue.ts (grantsFragmentIds)      — fired BEHIND the .dlg overlay
 *   3. journal.ts (openLetter → grants)     — fired while ManorPage was
 *      unmounted, and the mount-scoped `prev = useRef(count)` re-initialised
 *      on return, so the increment was never announced at all
 *   4. room.ts   (reward.fragmentId)        — inside a room, ManorPage gone
 *
 * The fix is structural, not cosmetic: every campaign-class grant is read off
 * the audited event spine (engine/events.ts) by an always-mounted layer, so
 * the notice cannot be tied to the screen the player happens to occupy.
 *
 * This file is the pure part — moment shape, the event→moment mapping, and
 * the queue reducers. No React, no DOM, no store: unit-testable in node
 * (tests/moment.test.ts).
 */

import type { GameEvent } from '../../engine/events';
import type { CharacterId } from '../../engine/types';
import { unquoted } from '../journal/quote';
import { rankUpNotice } from '../chrome/rank-up-lines';

/** What class of campaign grant this is — drives the seal's ink and shape. */
export type MomentKind =
  | 'fragment' | 'letter' | 'volume' | 'affinity' | 'reading'
  /** Round 9: permanent unlocks. AAA 11.12's table files "permanent unlock
   *  (room card, keepsake)" as Campaign class; both channels were silent. */
  | 'keepsake' | 'plate'
  /** Round 11: a sealed page made out by a solved room — the reward the
   *  round-10 legibility mechanic exists to create, which announced nothing
   *  anywhere until now (AAA 11.11/11.12). */
  | 'made-out';

export interface Moment {
  /** Dedup identity. One grant, one moment, however many times it re-derives. */
  key: string;
  kind: MomentKind;
  /**
   * The letter pressed into the wax. One Latin letterform, never a glyph that
   * can render as tofu or as an emoji: W/E/T/L are the four journal tabs, so
   * the seal itself says which page to open (AAA 6.3 double-encoding — the
   * moment survives a grayscale screenshot; the hue is never load-bearing).
   */
  sigil: string;
  /** The plain, recognisable words first (AAA 11.7). */
  title: string;
  /** The reward in its own voice: the fragment's opening words. */
  quote?: string;
  /** Where it now lives forever — the moment names its own persistent trace. */
  where: string;
  /**
   * ROUND 26 (COMPREHENSION.md fix 2) — THE ADDRESS, MADE WALKABLE.
   *
   * Every moment has always NAMED its trace ("Waiting in the Journal ·
   * Letters", "Kept in the Chronicles · Keepsakes") and the card's only verb
   * was `dismiss()`. Three blind testers' very first input in the game was a
   * reach for the day-1 letter card; all three hit nothing, and one wrote:
   * "every reward the game gave me announced itself in a card I could not
   * catch." The seal was telling her where to go and then refusing to take her
   * there.
   *
   * So the trace line becomes a destination. `route` is the hash route the
   * card's own `where` already promises — and it is OPTIONAL on purpose: a
   * rank-up ("There is more in her conversation now") has no screen to open,
   * and a card that offers a journey to nowhere is worse than one that does
   * not offer. Nothing about the docked/inert case changes (ui/moment/dock.ts):
   * over a playfield the card still takes no taps at all, so this can never
   * swallow a tap aimed at a cell or a door.
   */
  route?: string;
}

/** The one fragment fact the mapping needs; supplied by the caller so this
 *  module stays free of the content registry (and trivially testable). */
export interface FragmentFacts {
  kind: 'definition-line' | 'engraving' | 'testimony' | string;
  text: string;
  interpretation?: string;
  /**
   * ROUND-11 BLOCKER: THE NOTICE THAT READ THE SEALED PAGE ALOUD.
   *
   * Round 10 made entering a violet room file its fragment SEALED — a torn
   * leaf whose whole point is that it does not speak until a word game is
   * solved (engine/volume.ts LEGIBILITY, engine/journal.ts `alphabetFacts`).
   * The arrival moment then quoted `openingWords(facts.text)` with no sealed
   * check, so the seal had no teeth: the wax that landed on glass read
   * `W | A line of his definition | “Where a thing is missing, I am what
   * remains: not nothing…”` two taps before the journal rendered the same
   * page as a dotted rubbing over "not yet made out". Worse for the
   * engravings: every one of volume 1's four sealed arrivals gives its ENTIRE
   * machine-readable constraint away inside the 62-char quote budget ("Its
   * breath runs A, then U, then A…" is the whole vowel-sequence clue).
   *
   * A sealed fragment therefore gets its own copy class below: the document is
   * named, its contents are not, and `where` carries the redemption.
   */
  sealed: boolean;
}

export interface MomentContext {
  fragment(id: string): FragmentFacts | null;
  /** The answer of a solved volume, for the closing seal. */
  answerFor(volumeId: string): string | null;
  /**
   * ROUND 49 — THE ROOM THAT PRODUCED THIS PAGE, by its own name on the card
   * she drafted ("The Long Gallery", not "the Gallery" and not "twistle").
   * Null when nothing recorded one: a letter's enclosure, testimony spoken in a
   * parlor, a save written before the round. The seal then prints exactly what
   * it printed before, because an unattributed page is honest and an invented
   * room is not. See `engine/volume.pageFromRoom`.
   */
  roomFor(fragmentId: string): string | null;
}

const CHARACTER_NAMES: Record<CharacterId, string> = {
  bramble: 'Mrs. Bramble',
  ellery: 'Ellery',
  posy: 'Posy',
  fern: 'Fern',
  dewey: 'Dewey',
  portrait: 'The Portrait',
};

/** Longest preview the seal carries before it stops being a *moment*. */
export const QUOTE_CHARS = 62;

/**
 * The two screens a moment can send her to (hash routes — see App.tsx). They
 * are named here rather than spelled at seven call sites so the card and the
 * router can never disagree about where "the Journal" is.
 *
 * The Floorplan Cabinet deliberately has NO route: it is a modal opened from
 * the blueprint's footer, not a screen, and a card that navigated to /manor
 * would land her on a board with the plate nowhere in sight — a promise the
 * arrival does not keep. Same for a rank-up: "There is more in her
 * conversation now" is true and has no address.
 */
const JOURNAL = '/journal';
const CHRONICLES = '/chronicles';

/**
 * The reward's opening words, set in the journal's quoting convention (the
 * quotes belong to the UI, never to the content — ui/journal/quote.ts). Cut
 * on a word boundary; an ellipsis says "the rest is filed", which is exactly
 * the promise the moment is making.
 */
export function openingWords(text: string, max = QUOTE_CHARS): string {
  const bare = unquoted(text).replace(/\s+/g, ' ');
  if (!bare) return '';
  let body = bare;
  if (bare.length > max) {
    const cut = bare.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    const words = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;
    // Trailing punctuation and space are dropped so the ellipsis sits tight
    // against the last word ("nothing…", never "nothing — …").
    body = `${words.replace(/[\s,;:.—–-]+$/, '')}…`;
  }
  // Nested speech demoted to single curlies so the outer pair stays readable.
  let open = false;
  const nested = body.replace(/[“”"]/g, () => {
    open = !open;
    return open ? '‘' : '’';
  });
  return `“${nested}${open ? '’' : ''}”`;
}

/* ══ ROUND 49 — THE ROOM IS THE SUBJECT OF THE SENTENCE ═════════════════════
 *
 * THE OWNER'S RULING, 13 Aug: *"when a page is revealed, the player has to be
 * able to figure out — oh, this room provided me a page!"* The draft card no
 * longer says a word room feeds the mystery (economy/preview.ts), so this is
 * the surface that has to teach it — and it teaches by SHOWING the cause, never
 * by stating the rule. "Solve any word game to find a page" printed on a nudge
 * would be the deleted clause wearing different clothes.
 *
 * So each copy row carries a `noun` beside its standalone `title`, and where a
 * room is known the seal is built as **`<Room> gives up <noun>`**. The room's
 * name is the first thing on the card, in display type, at the instant she
 * finishes the room — which is the whole of the teaching. Where no room is
 * known the standalone title prints unchanged, so a letter's enclosure and a
 * testimony scene read exactly as they did.
 *
 * `where` never moves: it is the persistent trace (AAA 11.12) and it is not
 * where a cause belongs.
 */
/* ══ ROUND 54 — AND `where` STATES NO RULE EITHER ═══════════════════════════
 *
 * The block above ends *"'Solve any word game to find a page' printed on a
 * nudge would be the deleted clause wearing different clothes"* — and three
 * lines below it the sealed rows printed **"Filed in the Journal · finish a
 * room to make it out"**, which is that sentence, in the interface's own
 * voice, on the same card. Round 49 deleted the clause off the draft card and
 * left its twin here.
 *
 * The owner's line, 13 Aug: STATED ALWAYS are prices and rules of play — what a
 * move costs, what a wrong guess costs, what a solve pays back in MOVES, how
 * long a room asks for, which doors a plan leaves her. NEVER STATED is what a
 * room is WORTH TO THE MYSTERY. "Finish a room to make it out" is the second
 * of those, generalised into a rule, printed before she has ever seen it
 * happen. So it is gone, and `where` is what it was always for: the persistent
 * trace (AAA 11.12), the tab this page went to and nothing else.
 *
 * What teaches it instead is what round 49 built and round 54 finished: the
 * seal NAMES THE ROOM as the page lands ("The Long Gallery makes out two
 * pages"), the journal says it again afterwards, and somebody in the house
 * sends her to a room in the first place (docs/LEADS.md). Cause, twice, and a
 * person — never a rate.
 */
interface FragmentCopy { sigil: string; title: string; noun: string; where: string; tab?: string }

const FRAGMENT_COPY: Record<string, FragmentCopy> = {
  'definition-line': {
    sigil: 'W',
    title: 'A line of his definition',
    noun: 'a line of his definition',
    where: 'Filed in the Journal · The Word',
    tab: 'The Word',
  },
  engraving: {
    sigil: 'E',
    title: 'An engraving, taken down',
    noun: 'an engraving',
    where: 'Filed in the Journal · Engravings',
    tab: 'Engravings',
  },
  testimony: {
    sigil: 'T',
    title: 'Testimony, written down',
    noun: 'testimony',
    where: 'Filed in the Journal · Testimony',
    tab: 'Testimony',
  },
};

const FRAGMENT_FALLBACK: FragmentCopy = {
  sigil: 'W',
  title: 'A clue fragment, filed',
  noun: 'a clue fragment',
  where: 'Filed in the Journal',
};

/** `The Long Gallery` + `an engraving` → `The Long Gallery gives up an engraving`. */
function roomGaveTitle(room: string, noun: string): string {
  return `${room} gives up ${noun}`;
}

/**
 * The sealed arrival. The seal keeps its journal-tab letterform (W/E/T still
 * says which page to open — AAA 6.3) and the title names the DOCUMENT rather
 * than its contents. No `quote` is ever produced for these — that is the whole
 * fix, and tests/moment.test.ts asserts a sealed moment contains none of
 * frag.text.
 *
 * ROUND 54: `where` was the REDEMPTION ("finish a room to make it out") and is
 * a filing address again. See the ruling block above `FragmentCopy` — a smudge
 * is worth having because it is HIS and it is hers, not because a nudge has
 * costed it out for her.
 */
const FRAGMENT_SEALED_COPY: Record<string, FragmentCopy> = {
  'definition-line': {
    sigil: 'W',
    title: 'A page of his, not yet made out',
    noun: 'a page of his, not yet made out',
    where: 'Filed in the Journal · The Word',
  },
  engraving: {
    sigil: 'E',
    title: 'A rubbing, not yet made out',
    noun: 'a rubbing, not yet made out',
    where: 'Filed in the Journal · Engravings',
  },
  testimony: {
    sigil: 'T',
    title: 'A memory, not yet made out',
    noun: 'a memory, not yet made out',
    where: 'Filed in the Journal · Testimony',
  },
};

const FRAGMENT_SEALED_FALLBACK: FragmentCopy = {
  sigil: 'W',
  title: 'A page, filed and not yet made out',
  noun: 'a page, not yet made out',
  where: 'Filed in the Journal',
};

/** A letter waiting under an unbroken seal (arrival is pure derivation, so
 *  this one is built by the watcher, not by an event). */
export function letterMoment(letter: {
  id: string; from: CharacterId; subject?: string;
}): Moment {
  return {
    key: `letter:${letter.id}`,
    kind: 'letter',
    sigil: 'L',
    title: `A letter from ${CHARACTER_NAMES[letter.from]}`,
    quote: letter.subject ? openingWords(letter.subject) : undefined,
    where: 'Waiting in the Journal · Letters',
    route: JOURNAL,
  };
}

/**
 * A keepsake pressed onto the mantel (round 9, AAA 11.12). Like the letter
 * above, this is a DERIVED channel: `meta.syncEarnedRewards` grows
 * `earnedAchievementIds` without emitting a spine event, so watch.ts diffs the
 * shelf. The seal names its own persistent trace, which is the Chronicles page.
 */
export function keepsakeMoment(keepsake: { id: string; name: string; description: string }): Moment {
  return {
    key: `keepsake:${keepsake.id}`,
    kind: 'keepsake',
    // A mantel ornament, in the same one-Latin-letterform vocabulary as the
    // journal tabs' W/E/T/L — K is the Chronicles' shelf (AAA 6.3/11.22: the
    // seal survives a grayscale screenshot, the hue is never load-bearing).
    sigil: 'K',
    title: `A keepsake: ${keepsake.name}`,
    quote: openingWords(keepsake.description),
    where: 'Kept in the Chronicles · Keepsakes',
    route: CHRONICLES,
  };
}

/** "Two pages come clear." Counted in words, never a badge. */
const COUNT_WORDS = ['no', 'A', 'Two', 'Three', 'Four', 'Five', 'Six'];

/** One page that a solved room just made out. */
export interface MadeOutFacts {
  id: string;
  kind: FragmentFacts['kind'];
  text: string;
  /**
   * ROUND 49 — the room whose solve made it out, by name, or null on a save
   * that predates the record (and on the volume-closing mass decipher, which
   * no room paid for). One batch is one solve, so the batch's room is the
   * room of any page in it; the seal reads it off the first.
   */
  room?: string | null;
}

/**
 * ROUND-11 BLOCKER: DECIPHERING ANNOUNCED NOTHING, ANYWHERE.
 *
 * The round-10 loop is "solve a word game, make out the sealed backlog"
 * (engine/volume.ts LEGIBILITY, `DECIPHER_YIELD_BY_TIER`). The making-out half
 * — the reward the whole mechanic exists to create — was invisible: driven
 * live, `creditSolve` emptied the sealed set and the only wax on glass was the
 * *new* channel fragment. `decipherFragments` (app/slices/journal.ts) only sets
 * write-once `legible-` flags, so it emits no spine event and the event
 * watcher had nothing to diff, and the player is by definition INSIDE A ROOM
 * when it fires — the exact "notice rendered by a component that is unmounted
 * at fire time" shape AAA 11.11 fails.
 *
 * So it is a DERIVED channel, like the letter tray and the mantel: the watcher
 * diffs the volume's `legible-` flag set and hands the newly-made-out pages
 * here. One seal per batch, not one per page — "Two pages come clear" is the
 * sentence that makes `DECIPHER_YIELD_BY_TIER` felt, and the COUNT is the whole
 * of how it is felt: round 54 took the rate off the `where` line, because a
 * printed rate is the game explaining what a room is worth to the mystery.
 *
 * (A `{type:'fragment-made-out'}` spine event would be the tidier emitter and
 * is filed as a SHARED-FILE REQUEST; engine/events.ts is architect-owned, and
 * the diff channel is complete without it.)
 */
export function madeOutMoment(fragments: readonly MadeOutFacts[]): Moment | null {
  if (fragments.length === 0) return null;
  // Oldest on the drip first (the slice deciphers in revealOrder), so the
  // quoted line is the one the poem has been waiting on.
  const first = fragments[0]!;
  const copy = FRAGMENT_COPY[first.kind] ?? FRAGMENT_FALLBACK;
  const n = fragments.length;
  const word = COUNT_WORDS[n] ?? String(n);
  // ROUND 49 — the room does the deciphering, out loud. `A page made out` never
  // said what made it out, and the decipher channel is the OTHER half of the
  // rule the draft card stopped stating: solve a word game and the smudged
  // backlog speaks. Room-first, so her eye lands on the cause; the count keeps
  // its word form either way, because the tier yield is the thing being felt.
  const room = fragments.find((f) => f.room)?.room ?? null;
  const lower = word === 'A' ? 'a' : word.toLowerCase();
  return {
    key: `made-out:${fragments.map((f) => f.id).join('+')}`,
    kind: 'made-out',
    // The seal still points at the tab the quoted page lives in (AAA 6.3).
    sigil: copy.sigil,
    // ROUND 13 (AAA 6.16): one verb for the page's two states. It is "made
    // out", never "comes clear"/"deciphered"/"legible" — the same two words the
    // journal's rail, its cards, Ellery's nudge and the sealed arrival all use.
    title: room
      ? `${room} makes out ${lower} ${n === 1 ? 'page' : 'pages'}`
      : `${word} ${n === 1 ? 'page' : 'pages'} made out`,
    quote: openingWords(first.text),
    // ROUND 54: this said "the higher the room, the more at once" — a RATE, and
    // the only surface in the game that still printed one. What a room is worth
    // to the mystery is discovered (docs/LEADS.md); the tier lever is felt in
    // the count on the card, which is why the count keeps its word form.
    where: copy.tab ? `Made out, in the Journal · ${copy.tab}` : 'Made out, in the Journal',
    route: JOURNAL,
  };
}

/** A floorplan plate filled in the cabinet (the unlockCard sibling channel). */
export function plateMoment(card: { id: string; name: string }): Moment {
  return {
    key: `plate:${card.id}`,
    kind: 'plate',
    sigil: 'F',
    title: `A new floorplan: ${card.name}`,
    quote: undefined,
    where: 'Filed in the Floorplan Cabinet · it may be dealt from tomorrow',
  };
}

/**
 * The campaign-class events, mapped to their moment. Session-class deltas
 * (steps, gems, keys, solves) are NOT here — they belong on their counters
 * (AAA 11.15), and flavour belongs nowhere near this layer (AAA 11.14).
 */
export function momentForEvent(event: GameEvent, ctx: MomentContext): Moment | null {
  switch (event.type) {
    case 'fragment-found': {
      const facts = ctx.fragment(event.fragmentId);
      // ROUND 49: which room handed it over, if anything recorded one. Asked
      // for BOTH arrival shapes — a violet room's torn leaf is as much a page a
      // room produced as a solved word game's engraving, and the two of them
      // together are the rule she is meant to assemble.
      const room = ctx.roomFor(event.fragmentId);
      // A sealed arrival is a DIFFERENT announcement, not the same one with the
      // quote trimmed: it names the document, promises the journal, and says
      // what makes it legible. Quoting it would hand back exactly what the
      // round-10 mechanic withholds (see FragmentFacts.sealed).
      if (facts?.sealed) {
        const sealedCopy = FRAGMENT_SEALED_COPY[facts.kind] ?? FRAGMENT_SEALED_FALLBACK;
        return {
          key: `fragment:${event.fragmentId}`,
          kind: 'fragment',
          sigil: sealedCopy.sigil,
          title: room ? roomGaveTitle(room, sealedCopy.noun) : sealedCopy.title,
          quote: undefined,
          where: sealedCopy.where,
          route: JOURNAL,
        };
      }
      const copy = (facts && FRAGMENT_COPY[facts.kind]) || FRAGMENT_FALLBACK;
      return {
        key: `fragment:${event.fragmentId}`,
        kind: 'fragment',
        sigil: copy.sigil,
        title: room ? roomGaveTitle(room, copy.noun) : copy.title,
        quote: facts ? openingWords(facts.text) : undefined,
        where: copy.where,
        route: JOURNAL,
      };
    }
    case 'fragment-interpreted': {
      const facts = ctx.fragment(event.fragmentId);
      if (!facts?.interpretation) return null; // nothing new is on the page
      return {
        key: `reading:${event.fragmentId}`,
        kind: 'reading',
        sigil: 'E',
        title: 'Ellery reads it again',
        quote: openingWords(facts.interpretation),
        where: 'Her note is filed beneath the line',
        route: JOURNAL,
      };
    }
    case 'volume-solved': {
      const word = ctx.answerFor(event.volumeId);
      return {
        key: `volume:${event.volumeId}`,
        kind: 'volume',
        sigil: 'W',
        title: 'The volume closes',
        quote: word ? `“${word.toUpperCase()}”` : undefined,
        where: 'The Journal keeps it, closed but readable',
        route: JOURNAL,
      };
    }
    case 'affinity-rank-up': {
      const name = CHARACTER_NAMES[event.character] ?? 'Someone';
      /* ROUND 9: the quote used to be undefined and the title was the whole
         moment — the SAME sentence for every character at every rank, which is
         exactly the generic "+1" AAA 5.7 forbids. The bespoke table already
         existed (ui/chrome/rank-up-lines.ts, 24 lines, one per character×rank,
         each a small ACT rather than a statement of feeling); it just had no
         reader here. The seal now carries the act as its quote, and the notice
         rail's duplicate branch was dropped in the same change so a rank-up
         announces ONCE. */
      const warm = rankUpNotice(event.character, event.rank);
      return {
        key: `affinity:${event.character}:${event.rank}`,
        kind: 'affinity',
        sigil: name.replace(/^(Mrs\. |The )/, '').charAt(0).toUpperCase(),
        title: `${name} warms to you`,
        quote: warm?.line,
        where: 'There is more in her conversation now',
      };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// The queue — two grants in quick succession both get seen (never dropped).
// ---------------------------------------------------------------------------

export interface QueueState {
  /** On the glass right now. */
  current: Moment | null;
  /** Waiting their turn, oldest first. */
  pending: readonly Moment[];
  /** Keys already shown (or queued) — a moment is announced exactly once. */
  shown: readonly string[];
}

export const EMPTY_QUEUE: QueueState = { current: null, pending: [], shown: [] };

/** A day cannot realistically bank more than a handful at once; the cap only
 *  exists so a pathological loop cannot grow the queue without bound. */
export const MAX_PENDING = 8;
/** Dedup memory, capped (ring). Fragment ids are unique forever, so this is
 *  belt-and-braces against a re-derivation storm, not the primary guard. */
export const SHOWN_MEMORY = 64;

export function enqueue(state: QueueState, moment: Moment): QueueState {
  if (state.shown.includes(moment.key)) return state;
  const shown = [...state.shown, moment.key].slice(-SHOWN_MEMORY);
  if (state.current === null) return { current: moment, pending: state.pending, shown };
  if (state.pending.length >= MAX_PENDING) {
    // Never drop the NEWEST grant (the one she just earned): drop the oldest
    // still-unseen one instead, and only past a cap she cannot reach in play.
    return { current: state.current, pending: [...state.pending.slice(1), moment], shown };
  }
  return { current: state.current, pending: [...state.pending, moment], shown };
}

/** Dismiss what is on the glass; the next one presses in behind it. */
export function advance(state: QueueState): QueueState {
  if (state.current === null && state.pending.length === 0) return state;
  const [next, ...rest] = state.pending;
  return { current: next ?? null, pending: rest, shown: state.shown };
}

// ---------------------------------------------------------------------------
// How long one seal sits on the glass (round 12)
// ---------------------------------------------------------------------------

/**
 * A LONE moment. Long enough to read a title, a line of found poetry and the
 * address it was filed at, without hurrying — this is the number the layer has
 * always used and it is right for the case it was chosen for.
 */
export const MOMENT_MS = 5600;

/**
 * A moment with others behind it.
 *
 * ROUND 12 — the round-7 "hold/release" item, answered in one direction only.
 *
 * HOLD is declined. Its two readings both make the burst worse or already
 * exist: pausing the timer LENGTHENS a parade that is already the complaint,
 * and 11.13(a)'s "wait for the player to return" is structural here rather
 * than temporal — the queue is a module singleton mounted outside the router,
 * so a grant pushed while no layer is mounted waits instead of expiring
 * (tests/moment.test.ts, "a grant landing while nothing is mounted still
 * waits"). There is nothing left for a hold to buy.
 *
 * RELEASE is the half worth having, and AAA §0.5 escape 4 is the reason: the
 * seal is a fixed layer that owns a band of whatever screen the player is on,
 * and the escape is recorded in the bar as "5.6s per queued grant, and grants
 * QUEUE". A four-grant solve (a sealed page filed, two pages made out, a
 * keepsake, a rank-up) parked wax over that band for 22.4 seconds. The player
 * who knows she can tap never felt it; the player who does not know is exactly
 * the player the escape was written about.
 *
 * The shortening is safe precisely because of the class these moments are in:
 * every one of them is Campaign, so 11.12 already owes it a persistent trace,
 * and each seal names its own ("Filed in the Journal · Testimony"). Nothing is
 * lost by moving on — and the player is demonstrably attending, because she
 * just read the one before it. It is never shortened below the point where the
 * title and the trace can be read, and it never applies to a moment that is
 * alone, which is the one that has to carry itself.
 */
export const MOMENT_QUEUED_MS = 4000;

/** The dwell for the seal on glass, given how many are waiting behind it. */
export function momentDwellMs(waiting: number): number {
  return waiting > 0 ? MOMENT_QUEUED_MS : MOMENT_MS;
}

/**
 * ROUND 26 — THE ONE MOMENT THAT DOES NOT RUN ON A CLOCK.
 *
 * The letter is the first thing the manor ever hands the player: it lands at
 * dawn, on the blueprint, before she has touched anything. All three blind
 * testers reached for that card and all three missed it — on the blueprint the
 * seal is deliberately inert (ui/moment/dock.ts, and that ruling stands: it
 * covers cells that are controls), so their reach fell through to parchment
 * and the card then expired on its own 5.6s timer. "Every reward the game gave
 * me announced itself in a card I could not catch."
 *
 * A letter therefore waits for HER instead of for a timer. It stays on the
 * glass until she touches something — anything, anywhere; the layer does not
 * swallow that touch, so whatever she reached for still happens (MomentLayer).
 * The reach that used to hit nothing now visibly puts the card away, which is
 * what "catching it" feels like.
 *
 * Only letters. Everything else keeps `momentDwellMs`: a solve can bank four
 * grants at once, and four cards each waiting on their own tap is the round-12
 * parade with an extra chore bolted to it.
 */
export function momentHolds(moment: Moment): boolean {
  return moment.kind === 'letter';
}
