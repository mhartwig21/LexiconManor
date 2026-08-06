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
  | 'keepsake' | 'plate';

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
}

/** The one fragment fact the mapping needs; supplied by the caller so this
 *  module stays free of the content registry (and trivially testable). */
export interface FragmentFacts {
  kind: 'definition-line' | 'engraving' | 'testimony' | string;
  text: string;
  interpretation?: string;
}

export interface MomentContext {
  fragment(id: string): FragmentFacts | null;
  /** The answer of a solved volume, for the closing seal. */
  answerFor(volumeId: string): string | null;
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

const FRAGMENT_COPY: Record<string, { sigil: string; title: string; where: string }> = {
  'definition-line': {
    sigil: 'W',
    title: 'A line of his definition',
    where: 'Filed in the Journal · The Word',
  },
  engraving: {
    sigil: 'E',
    title: 'An engraving, taken down',
    where: 'Filed in the Journal · Engravings',
  },
  testimony: {
    sigil: 'T',
    title: 'Testimony, written down',
    where: 'Filed in the Journal · Testimony',
  },
};

const FRAGMENT_FALLBACK = {
  sigil: 'W',
  title: 'A clue fragment, filed',
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
      const copy = (facts && FRAGMENT_COPY[facts.kind]) || FRAGMENT_FALLBACK;
      return {
        key: `fragment:${event.fragmentId}`,
        kind: 'fragment',
        sigil: copy.sigil,
        title: copy.title,
        quote: facts ? openingWords(facts.text) : undefined,
        where: copy.where,
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
