/**
 * The Journal — OWNER: A7 (Mystery). The auto-filing cozy-detective case
 * file (MANOR_DESIGN §7, AAA 4.15): fragments group themselves, engravings
 * render against the alphabet, letters wait under wax seals, and every
 * document ever seen is re-readable in ≤2 taps from anywhere (Home →
 * Journal → tab). The deduction is the player's; the filing is not.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useManorStore } from '../../app/store';
import { getVolumeContent } from '../../app/content/volumes';
import {
  alphabetFacts, ALPHABET, crossRefs, definitionSlots, displayedFragmentIds, foundByKind,
  guessHistory, isInterpreted, journalNudge, letterBoxes, sanctumReadiness, smudge,
  VERDICT_TOKENS,
  type JournalTab,
} from '../../engine/journal';
import {
  arrivedLetters, legibleDroughtDays, openedLetterIds, sealedFragmentIds,
  type FragmentContent,
} from '../../engine/volume';
import type { CharacterId } from '../../engine/types';
import { sanctumStanding } from '../../engine/manor/grid';
import { getDialogueFile } from '../../engine/dialogue/content';
import { selectDialogue } from '../../engine/dialogue/select';
import DialogueScene from '../dialogue/DialogueScene';
import BackLink from '../chrome/BackLink';
import UnreadMark, { UnreadPip } from './UnreadMark';
import SealedMark, { SealedPip } from './SealedMark';
import { useJournalUnread } from './useJournalUnread';
import { sfx } from '../../app/sound';
import { quoted } from './quote';
import './journal.css';

type Tab = JournalTab;

const CHARACTER_NAMES: Record<CharacterId, string> = {
  bramble: 'Mrs. Bramble',
  ellery: 'Ellery',
  posy: 'Posy',
  fern: 'Fern',
  dewey: 'Dewey',
  portrait: 'The Portrait',
};

export default function JournalView() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>('word');
  const [openLetterId, setOpenLetterId] = useState<string | null>(null);
  // Posy's seal-break aside (the 'letter' slot) — forced-context, never spends
  // the daily valve; mounted only when selection actually has a letter node
  // (cooldown throttles it to one aside per day; re-reads stay quiet).
  const [letterAside, setLetterAside] = useState(false);

  const volume = useManorStore((s) => s.volume);
  const day = useManorStore((s) => s.day?.day ?? s.volume.day);
  const flags = useManorStore((s) => s.flags);
  const dayRecords = useManorStore((s) => s.chronicles.dayRecords);
  const openLetter = useManorStore((s) => s.openLetter);
  const markFragmentsViewed = useManorStore((s) => s.markFragmentsViewed);
  const buildDialogueQuery = useManorStore((s) => s.buildDialogueQuery);
  /** Where is she actually standing? (See the Word tab's nudge.) THREE-VALUED
   *  on purpose: as a boolean this collapsed 'landing-sealed' into 'away' and
   *  told a player already on the landing that "all that is left is the
   *  climb", which is false and reads as the screen not knowing where she is
   *  (round-15 finding, AAA 4.16). One predicate, shared with the blueprint
   *  and the Sanctum (engine/manor/grid.ts `sanctumStanding`). */
  const standing = useManorStore((s) => sanctumStanding(s.manor));
  const atLanding = standing === 'at-door';
  /**
   * ROUND 19 (REVIEW_AA §5.2): the brass in the Entrance Hall is a mouth too.
   * This rail printed "the door … only hears a word from someone standing at
   * it" on the very cell the speaking tube hangs in — the copy was written
   * before the tube and never revisited, so the one surface that tells her
   * where to take her file was, from round 17 on, telling her the opposite of
   * what the game does. `sanctumStanding` already answered 'at-tube'; nothing
   * asked it.
   */
  const atTube = standing === 'at-tube';

  const content = getVolumeContent(volume.volumeId);
  const unread = useJournalUnread();

  /**
   * ROUND 10 — the pages she has but cannot read yet (engine/volume.ts).
   * Entering a violet room files the document; solving a word game makes it
   * out. Every derivation below is handed this set, so a sealed leaf renders
   * as a sealed leaf, contributes nothing to the alphabet plate, and offers
   * Ellery nothing to annotate — while still being hers, visibly, forever.
   */
  const sealedIds = sealedFragmentIds(volume.volumeId, flags);
  const isSealed = (id: string) => sealedIds.has(id);
  /** The backlog number the rail prints — off the SAME derivation the tab
   *  rings and the entrance count come from, so the four levels of the seal
   *  chain cannot disagree with each other (AAA 11.19's rule, applied to the
   *  second marker). */
  const stillSealed = unread.sealed.total;

  /**
   * What was unread when she got here — and it STAYS marked for this visit.
   *
   * Two different questions wear the same wax, and conflating them is what
   * produced the round-5 bug: the tabs and the entrance answer "is there
   * something you have not looked at?" (live, and it clears permanently as she
   * looks); the card markers answer "which of these is the new one?" (frozen
   * for as long as she is standing here, so the answer does not vanish out from
   * under her the instant the tab paints). Additive, so a fragment that arrives
   * mid-visit — a letter's grant — gets its marker too.
   */
  const shownNew = useRef<Set<string>>(new Set());
  for (const id of unread.fragments) shownNew.current.add(id);

  /**
   * Viewing — and only viewing — retires the marker (AAA 11.20). This fires on
   * what the sheet actually PUT ON THE GLASS, so it is not a focus edge and not
   * a navigation edge; the slice makes it a no-op once nothing is left to mark,
   * so it is safe to re-run on every tab change and every filing.
   *
   * ROUND 12: sealed cards are in here too. She has looked at them — that is
   * what "on the glass" means — and the slice records the glance against the
   * page's sealed state, so the wax retires while the smudge marker stands and
   * a later decipher raises wax again (engine/journal.ts, the round-12 block).
   */
  const displayed = content ? displayedFragmentIds(content, volume, tab) : [];
  const displayedKey = displayed.join(',');
  useEffect(() => {
    if (displayed.length > 0) markFragmentsViewed(displayed);
    // displayedKey stands in for the array identity; markFragmentsViewed is a
    // stable store action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedKey, markFragmentsViewed]);
  if (!content) {
    return (
      <div className="jrn-page">
        <div className="jrn">
          {/* Round-5 nav audit: this branch used to render NO way out at all —
              a hard strand on an unauthored/imported volume. */}
          <header className="jrn__head">
            <BackLink flavour="Put it down" />
          </header>
          <p className="jrn-empty">The journal's pages are still being sewn in.</p>
        </div>
      </div>
    );
  }

  const solved = volume.status === 'solved';
  const isNew = (id: string) => shownNew.current.has(id);
  // Derived from the write-once flags directly (NOT by filtering
  // content.letters) so opened synthesized pity letters ('pity-extra-N',
  // never in the authored array) stay marked opened and readable.
  const openedIds = openedLetterIds(content.id, flags);
  const letters = arrivedLetters(content, volume, day, {
    droughtDays: legibleDroughtDays(volume.volumeId, flags, dayRecords),
    openedIds,
  });
  const engravings = foundByKind(content, volume, 'engraving');
  const testimony = foundByKind(content, volume, 'testimony');
  const slots = definitionSlots(content, volume, { sealedIds });

  const switchTab = (t: Tab) => {
    if (t !== tab) sfx.tap();
    setTab(t);
  };

  return (
    <div className="jrn-page">
      <div className="jrn">
        {/* Back control FIRST and left, where a back control is looked for. */}
        <header className="jrn__head">
          <BackLink flavour="Put it down" />
          <h2 className="jrn__title">The Journal</h2>
        </header>
        <div className="jrn__volume">
          Volume I — {content.title}{solved ? ' · closed' : ''}
        </div>

        {/* Two marks, two meanings, two places (round 12). The wax count is
            live persisted unread — it retires when the tab's contents have been
            on the glass and does not come back. The seal count is the tab's
            share of the backlog: pages she has, that are not made out yet. A
            tab can carry either, both, or neither, and each number is exactly
            the number of items of ITS kind behind that tab (AAA 11.21). */}
        <nav className="jrn-tabs" aria-label="Journal tabs">
          <TabButton label="The Word" noun="lines of the definition" nounSingular="line of the definition" sealedNoun="lines not yet made out" sealedNounSingular="line not yet made out" active={tab === 'word'} unread={unread.word.length} sealed={unread.sealed.word.length} onClick={() => switchTab('word')} />
          <TabButton label="Engravings" noun="engravings" nounSingular="engraving" sealedNoun="engravings not yet made out" sealedNounSingular="engraving not yet made out" active={tab === 'engravings'} unread={unread.engravings.length} sealed={unread.sealed.engravings.length} onClick={() => switchTab('engravings')} />
          <TabButton label="Testimony" noun="pieces of testimony" nounSingular="piece of testimony" sealedNoun="pieces not yet made out" sealedNounSingular="piece not yet made out" active={tab === 'testimony'} unread={unread.testimony.length} sealed={unread.sealed.testimony.length} onClick={() => switchTab('testimony')} />
          {/* Letters arrive whole or not at all — there is no sealed-letter
              state, so the seal chain has nothing to say here. */}
          <TabButton label="Letters" noun="letters" nounSingular="letter" active={tab === 'letters'} unread={unread.letters.length} sealed={0} onClick={() => switchTab('letters')} />
        </nav>

        <div className="jrn-sheet">
          {tab === 'word' && <WordTab />}
          {tab === 'engravings' && (
            engravings.length === 0 ? (
              <EmptyPlate
                mark={<RubbingMark />}
                title="Nothing rubbed yet"
                body="Lintels, inkstands, the brass under the hall clock — he cut notes to himself all over this house."
                how="The manor takes the rubbing for you the moment you walk into a room that has one. The violet rooms have the most."
              />
            ) : (
              <>
                {engravings.map((f) => (
                  <EngravingCard key={f.id} frag={f} isNew={isNew(f.id)} sealed={isSealed(f.id)} />
                ))}
                <SheetTail
                  cap="Where the rest of them are"
                  text="Cut into lintels, inkstands and the brass under the hall clock. The manor takes the rubbing as you pass — the violet rooms keep the most of him."
                />
              </>
            )
          )}
          {tab === 'testimony' && (
            testimony.length === 0 ? (
              <EmptyPlate
                mark={<TeacupMark />}
                title="No one has said anything worth filing"
                body="Not yet. They will — this house has kept its mouth shut about him for eleven years and it is beginning to itch."
                how="Sit with someone. Tea in the parlour, a gift, a second conversation on a second day; the ones who liked him best take the longest."
              />
            ) : (
              <>
                {testimony.map((f) => (
                  <TestimonyCard key={f.id} frag={f} isNew={isNew(f.id)} sealed={isSealed(f.id)} />
                ))}
                <SheetTail
                  cap="How the rest of it comes out"
                  text="Tea in the parlour, a gift, a second conversation on a second day. The ones who liked him best take the longest."
                />
              </>
            )
          )}
          {tab === 'letters' && (
            letters.length === 0 ? (
              <EmptyPlate
                mark={<PostTrayMark />}
                title="The post tray is empty"
                body="Posy walks the drive before you are up. Whatever she finds, she leaves here, unopened, seal down."
                how="Letters arrive overnight — the more of the house you have been through, the more there is for someone to write to you about."
              />
            ) : (
              <>
                {letters.map((l) => (
                <LetterCard
                  key={l.id}
                  letter={l}
                  opened={openedIds.has(l.id)}
                  expanded={openLetterId === l.id}
                  onToggle={() => {
                    if (!openedIds.has(l.id)) {
                      sfx.glyph();
                      openLetter(l.id);
                      setOpenLetterId(l.id);
                      // The 'letter-opened' event is on the stream now — if
                      // the letter slot has an eligible aside (posy.react.
                      // letter-*, withinDays 0, cooldownDays 1), play it over
                      // the sheet. Null / idle-fallback → no aside.
                      const node = selectDialogue(
                        getDialogueFile('posy'),
                        buildDialogueQuery('posy', 'letter'),
                      );
                      if (node && node.trigger === 'letter') setLetterAside(true);
                    } else {
                      setOpenLetterId(openLetterId === l.id ? null : l.id);
                    }
                  }}
                />
                ))}
                <SheetTail
                  cap="When the next one comes"
                  text="Posy walks the drive before you are up and leaves whatever she finds here, seal down. The more of the house you have been through, the more there is for someone to write to you about."
                />
              </>
            )
          )}
        </div>

        {/* ══ THE FOOTER RAIL (round-6 §11 gap, fixed round 10) ═══════════════
            The Sanctum control used to be the LAST child of `.jrn-sheet` —
            an internally scrolled panel — so on a 390×844 screen with any
            filed content above it, the control sat below the fold: present in
            the DOM, `elementFromPoint` at its centre returning the sheet, and
            photographing exactly like a working button (AAA §0.1.7, 11.3).
            It is now a sibling of the sheet inside the flex column, so it is
            pinned to the bottom of the journal at every scroll position and
            on every tab, and it carries the round-10 backlog counter beside
            it — the two things the player needs to decide what to do next. */}
        <FooterRail />
      </div>

      {/* Posy's aside as the wax gives way — an overlay above the journal
          sheet (DialogueScene is a fixed overlay; the sheet stays put). */}
      {letterAside && (
        <DialogueScene
          character="posy"
          slot="letter"
          onClose={() => setLetterAside(false)}
        />
      )}
    </div>
  );

  // -- The Word tab -----------------------------------------------------------

  function WordTab() {
    const facts = alphabetFacts(content!, volume, { sealedIds });
    const boxes = letterBoxes(facts);
    const guesses = guessHistory(content!, volume);
    const nudge = journalNudge(content!, volume, { sealedIds });
    const anyLine = slots.some((s) => s.fragment);

    return (
      <>
        {solved && (
          <div className="jrn-solved">
            <div className="jrn-solved__word">{content!.answer.toUpperCase()}</div>
            <div className="jrn-solved__closed">Spoken at the door. The volume closes.</div>
          </div>
        )}

        {boxes && !solved && (
          <>
            <div className="jrn-boxes" aria-label={`The word has ${boxes.length} letters`}>
              {boxes.map((ch, i) => (
                <span key={i} className={`jrn-box${ch ? ' jrn-box--known' : ''}`}>{ch ?? ''}</span>
              ))}
            </div>
            <div className="jrn-caption" style={{ textAlign: 'center' }}>
              What the engravings agree on so far.
            </div>
          </>
        )}

        <div className="jrn-caption">His definition, as recovered:</div>
        {anyLine ? (
          <div className="jrn-poem">
            {slots.map((s) =>
              s.fragment && s.sealed ? (
                /* Hers, filed, permanent — and not yet made out. The slot is
                   occupied by a torn leaf rather than a gap, because the
                   difference between "I do not have this" and "I have this
                   and cannot read it yet" is the whole point of the round-10
                   loop. Never required for anything (AAA 4.18). */
                <div key={s.revealOrder} className="jrn-poem__line jrn-poem__line--sealed">
                  {/* Both marks, and they mean different things (round 12):
                      wax = you have not looked at this leaf; ring = the hand
                      is not made out yet. A leaf can wear both, either, or
                      neither, and each is true on its own. */}
                  {isNew(s.fragment.id) && <UnreadPip label="a leaf you have not looked at" />}
                  <SealedPip label="a leaf not yet made out" />{' '}
                  <span className="jrn-smudge" aria-hidden>{smudge(s.fragment.text)}</span>
                  {/* ROUND 13 (AAA 6.16): STATE ONLY, AND ONCE.
                      This line used to end "Solve a room." — three times over on
                      the Word tab, once per sealed slot, in body serif, taking
                      more vertical room than the documents it annotated and
                      pushing the sheet into internal scroll before the alphabet
                      plate existed. With Ellery's nudge and the rail underneath
                      it, one screen carried the same instruction FIVE times in
                      three different verbs, which does not read as an invitation
                      — it reads as an error repeated. The instruction now lives
                      exactly once, in the rail (pinned outside the scroll, and
                      already carrying the count and the tier hint); every other
                      surface says only what a thing IS, and the seal pip carries
                      the rest. */}
                  <span className="jrn-sealed__label">A torn leaf, not yet made out.</span>
                </div>
              ) : s.fragment ? (
                <div key={s.revealOrder} className="jrn-poem__line">
                  {/* The item level of the chain (AAA 11.19): the line itself
                      carries the mark, not only the tab above it. */}
                  {isNew(s.fragment.id) && <UnreadPip label="a line you have not read" />}{' '}
                  {quoted(s.fragment.text)}
                  {isInterpreted(volume, s.fragment.id) && s.fragment.interpretation && (
                    <div className="jrn-note">{s.fragment.interpretation}</div>
                  )}
                </div>
              ) : (
                <div key={s.revealOrder} className="jrn-poem__gap" aria-label="a line still missing">— ? —</div>
              ),
            )}
          </div>
        ) : (
          <p className="jrn-empty">Not one line of it recovered yet. The violet rooms keep his torn pages.</p>
        )}

        {facts.sources > 0 && (
          <>
            <div className="jrn-caption">The alphabet, as the engravings leave it:</div>
            <div className="jrn-plate" role="img" aria-label="Alphabet plate showing eliminated and required letters">
              {ALPHABET.map((ch) => {
                const out = facts.eliminated.has(ch);
                const inn = facts.required.has(ch);
                return (
                  <span key={ch} className={`jrn-plate__cell${out ? ' jrn-plate__cell--out' : ''}${inn ? ' jrn-plate__cell--in' : ''}`}>
                    {ch}
                  </span>
                );
              })}
            </div>
            <div className="jrn-facts">
              {facts.knownLength !== null && <span>· Six candles — {facts.knownLength} letters.</span>}
              {facts.startsWith && <span>· It begins with {facts.startsWith}.</span>}
              {facts.vowelSequence && (
                <span>· Its vowels, in order: {facts.vowelSequence.split('').join(' · ')}.</span>
              )}
              {facts.oneLetterTwice && <span>· Exactly one letter appears twice.</span>}
            </div>
          </>
        )}

        {guesses.length > 0 && (
          <>
            <div className="jrn-caption">Words the door refused:</div>
            <div className="jrn-guesses">
              {guesses.map((g, i) => (
                <div key={i} className="jrn-guess">
                  <span className={`jrn-guess__word${g.wasAnswer ? ' jrn-guess__word--answer' : ''}`}>
                    {g.guess}
                  </span>
                  {/* The Portrait's own verdict, filed verbatim-in-spirit —
                      never a letter count. An exact distinct-letter
                      intersection, free and permanent, is a Mastermind
                      channel that solves the word past the engraving economy,
                      and no one in the fiction ever speaks a number
                      (AAA 3.3 / 4.15: re-present what she was told). */}
                  <span className="jrn-guess__meta">
                    day {g.day}
                    {g.wasAnswer ? ' · the word itself' : ` · ${VERDICT_TOKENS[g.verdict]}`}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* The pointer is somebody's voice, not the furniture's: Ellery reads
            over your shoulder, so the pencilled margin is hers and signed.
            (It carries the "dear" the Portrait never says — AAA 5.13.) */}
        {nudge && (
          <div className="jrn-nudge jrn-nudge--margin">
            <span className="jrn-nudge__text">{nudge}</span>
            <span className="jrn-nudge__sign" aria-label="a pencilled note from Ellery">— E.</span>
          </div>
        )}
      </>
    );
  }

  // -- The footer rail --------------------------------------------------------

  /**
   * ROUND-8: the Sanctum control used to be an unconditional shortcut to
   * /sanctum, and it was how the owner reached the climax on day 2 from the
   * Entrance Hall with nothing filed — the Portrait duly congratulated her on
   * a climb she had not made. The door is at the top of the house now
   * (ui/sanctum/SanctumView.tsx), so the journal points at it rather than
   * teleporting to it: a live link only from the landing, and otherwise a
   * plain sentence saying where the door is. No dead end either way —
   * /sanctum keeps its blueprint entrance (AAA 11.9).
   *
   * ROUND-10: and it lives HERE, in a rail pinned outside the scrolling
   * sheet, because "in the DOM" was never the bar (AAA 11.2/11.3).
   */
  function FooterRail() {
    if (solved) return null;
    /**
     * ROUND 14 (AAA 4.16): the rail speaks in the same two bands the door
     * does. `enough` is the thin-file edge — the file is worth carrying
     * upstairs — and `deducible` is the point at which the constraint set can
     * actually pin a word (engine/journal.DEDUCTION_FLOOR, derived from the
     * mystery's own `FRAGMENTS_TO_DEDUCE`). The rail used to say "Enough to
     * take upstairs" from four readable pages and say exactly that same
     * sentence at sixteen, which is the flat version of the silence the
     * Portrait's nudge bands were built to end.
     */
    const readiness = sanctumReadiness(content!, volume, { sealedIds });
    const showSanctum = readiness.enough;
    return (
      <div className="jrn-rail">
        {stillSealed > 0 && (
          <div className="jrn-rail__backlog">
            <span className="jrn-rail__count" aria-hidden>{stillSealed}</span>
            {/* THE ONE PLACE THE INSTRUCTION IS PRINTED (round 13, AAA 6.16).
                The rail is pinned outside the scrolling sheet, it is on every
                tab, and it is the only surface that also carries the count and
                the tier hint — so it is the surface that can afford the
                sentence. Verb discipline: the page is "made out", never
                "deciphered"/"comes clear"; the action is "finish a room", never
                "solve a room". Same two words in ui/moment/moments.ts. */}
            <span>
              {stillSealed === 1 ? 'page filed but not made out' : 'pages filed but not made out'}
              {' · '}finish a room to make {stillSealed === 1 ? 'it' : 'them'} out{' '}
              <span className="jrn-rail__hint">(more of them, the higher the room)</span>
            </span>
          </div>
        )}
        {showSanctum && (
          <div className="jrn-nudge jrn-rail__sanctum">
            {atLanding ? (
              <button className="jrn-nudge__link" onClick={() => navigate('/sanctum')}>
                Take it to the Sanctum
              </button>
            ) : atTube ? (
              <button className="jrn-nudge__link" onClick={() => navigate('/sanctum')}>
                {readiness.deducible
                  ? 'Say it down the speaking tube'
                  : 'Try a word down the speaking tube'}
              </button>
            ) : standing === 'landing-sealed' ? (
              /* She is ON the landing already — "all that is left is the
                 climb" is false, and printing it was the round-15 defect.
                 Name the real obstacle instead (AAA 4.16). */
              <span className="jrn-nudge__text">
                {readiness.deducible
                  ? 'This file can name a word, and you are on the landing. But this room does not open north — the door needs a plan that does.'
                  : 'You are on the landing, but this room does not open north — the door needs a plan that does.'}
              </span>
            ) : readiness.deducible ? (
              <span className="jrn-nudge__text">
                This file can name a word. Say it to the brass tube in the entrance hall, any
                day — or carry it up to the door itself, which is where he wants to hear it.
              </span>
            ) : (
              <span className="jrn-nudge__text">
                Enough to try. The speaking tube is in the entrance hall and it hears one word
                a day; the door itself is on the top landing, for when you can get up there.
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
}

/**
 * One sealed document, in whichever tab it lives. State only (round 13, AAA
 * 6.16) — the instruction belongs to the rail, which says it once and says it
 * with the count. See the note on the Word tab's sealed line.
 */
function SealedBody({ text }: { text: string }) {
  return (
    <>
      <p className="jrn-card__text jrn-smudge" aria-hidden>{smudge(text)}</p>
      <div className="jrn-sealed__label">Filed, and not yet made out — the ink has run.</div>
    </>
  );
}

/* ══ THE EMPTY PAGE (round 8) ════════════════════════════════════════════════
 *
 * An empty tab is where this game most looks unfinished, and the numbers said
 * so: the composition harness measured the largest featureless vertical band on
 * every surface, and the three journal tabs were the three worst in the app —
 * Letters 63.5% of the glass, Testimony 55%, Engravings 50.2%. Each was one
 * italic sentence at the top of a 340px sheet and then nothing at all, which
 * reads as a rendering gap rather than as a page with room left on it.
 *
 * The replacement is a real composition rather than a longer sentence: a drawn
 * mark, a Fell heading, the in-voice line about what lives here, and — pinned
 * to the foot of the sheet, so the band is broken at the bottom as well as in
 * the middle — the thing the player actually wants, which is HOW TO EARN IT.
 * Nothing here is a control and nothing here is state: the unread/sealed
 * vocabulary (§11.19–11.22) is untouched, because an empty tab by definition
 * has nothing unread in it.
 *
 * The marks are inline SVG in `currentColor` at 1.6/1.1 stroke weights, no
 * fill and no hue, so they cost nothing to load, invert correctly in the dark
 * theme, survive the grayscale pass (AAA 6.3) and add no saturated pixels to
 * the neutral budget (6.5).
 */
function EmptyPlate({
  mark, title, body, how,
}: { mark: React.ReactNode; title: string; body: string; how: string }) {
  return (
    <div className="jrn-void">
      <div className="jrn-void__crest" aria-hidden />
      <div className="jrn-void__plate">
        {mark}
        <h3 className="jrn-void__title">{title}</h3>
        <p className="jrn-void__body">{body}</p>
      </div>
      <div className="jrn-void__how">
        <span className="jrn-void__howcap">How it finds you</span>
        <span className="jrn-void__howtext">{how}</span>
      </div>
    </div>
  );
}

/**
 * The foot of a filed tab (round 8). A tab with ONE card in it measured the
 * same featureless band as an empty one — Engravings 50.2% of the glass,
 * Letters 63.5% — because a sheet with a single short document on it is
 * mostly parchment, and round 7's answer (ruling the page with a background
 * gradient) is invisible to the eye and to the measurement alike: a gradient
 * is not ink, it is wallpaper.
 *
 * This is the same sentence the empty plate ends on — where the rest of them
 * are and what brings them — ruled off and pinned to the bottom of the sheet
 * (`margin-top: auto`), so it holds the foot of a short list and simply
 * follows a long one. It is copy, not state: no marker, no count, nothing the
 * unread chain owns.
 */
function SheetTail({ cap, text }: { cap: string; text: string }) {
  return (
    <div className="jrn-tail">
      <span className="jrn-tail__cap">{cap}</span>
      <span className="jrn-tail__text">{text}</span>
    </div>
  );
}

/** A rubbing plate: brass, three cut lines, one corner lifted. */
function RubbingMark() {
  return (
    <svg className="jrn-void__mark" viewBox="0 0 72 72" role="presentation" focusable="false">
      <path d="M14 12h34l10 10v38H14z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M48 12v10h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M22 34h28M22 42h28M22 50h18" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M22 26h12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/** A cup and saucer, waiting. (Testimony is bought with tea and patience.) */
function TeacupMark() {
  return (
    <svg className="jrn-void__mark" viewBox="0 0 72 72" role="presentation" focusable="false">
      <path d="M18 30h30v10a15 15 0 0 1-30 0z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M48 33h5a6 6 0 0 1 0 12h-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 58h44" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M28 22c0-4 4-4 4-8M38 22c0-4 4-4 4-8" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

/** A shallow tray with nothing in it, and the shadow of a letter that isn't. */
function PostTrayMark() {
  return (
    <svg className="jrn-void__mark" viewBox="0 0 72 72" role="presentation" focusable="false">
      <path d="M10 40h52v14a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 40l8-12h36l8 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M24 16h24v12H24z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeDasharray="3 3" />
      <path d="M24 16l12 8 12-8" fill="none" stroke="currentColor" strokeWidth="1.1" strokeDasharray="3 3" />
    </svg>
  );
}

function TabButton({
  label, noun, nounSingular, sealedNoun, sealedNounSingular, active, unread, sealed, onClick,
}: {
  label: string; noun: string; nounSingular?: string;
  sealedNoun?: string; sealedNounSingular?: string;
  active: boolean; unread: number; sealed: number; onClick: () => void;
}) {
  /**
   * This used to render `dot && !active` — suppress the marker while the tab is
   * selected — and that is the bug AAA 11.20 is written against. Selecting a tab
   * is not viewing it, and DEselecting it is certainly not un-viewing it: leave
   * /journal, come back, and the dot was handed straight back for the rest of
   * the day. The marker now tracks persisted viewed-state, so the tab she is
   * reading loses its dot because its contents have genuinely been displayed,
   * and it does not return.
   *
   * The Letters tab is the exception that proves it: opening the tab shows a
   * row of unbroken seals, not their contents, so its count stands until she
   * breaks each seal (openLetter's write-once flag).
   *
   * ROUND 12: and the wax no longer stands in for the OTHER thing it was made
   * to say. A tab whose sealed pages she has looked at loses its wax and keeps
   * its ring — "nothing new here, and there is still something to make out" —
   * which is two facts a single dot could never carry.
   */
  return (
    <button
      className={`jrn-tab unread-host${active ? ' jrn-tab--active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
      {/* Wax pins to the corner; the seal rides INLINE after the label. Both
          positions are ones nothing else occupies, which is the positional
          half of the double-encoding — and measured at 390px a bottom-corner
          ring landed on the descender of "The Word". A mark that has to sit
          on top of the word it qualifies is a layout to fix, not a corner to
          pick: inline participates in layout, so it can never overlap. */}
      {/* ROUND 16 (AAA 11.7/11.19): both nouns come in as a singular/plural
          PAIR. The entrance and lifecycle levels of this chain already computed
          one; the tabs passed a bare plural, so at a count of 1 the control
          that tells her which tab to open announced "1 unread letters". The
          marks themselves now choose, so this is the last place it can be got
          wrong and the pair is right here. */}
      <UnreadMark count={unread} noun={noun} nounSingular={nounSingular} corner />
      <SealedMark count={sealed} noun={sealedNoun} nounSingular={sealedNounSingular} />
    </button>
  );
}

function EngravingCard({
  frag, isNew, sealed,
}: { frag: FragmentContent; isNew: boolean; sealed: boolean }) {
  const volume = useManorStore((s) => s.volume);
  const flags = useManorStore((s) => s.flags);
  const content = getVolumeContent(volume.volumeId)!;
  const sealedIds = sealedFragmentIds(volume.volumeId, flags);
  const refs = crossRefs(content, volume, frag.id, { sealedIds });
  const interpreted = isInterpreted(volume, frag.id);
  return (
    <div className={`jrn-card jrn-card--rubbing${sealed ? ' jrn-card--sealed' : ''}`}>
      <div className="jrn-card__source">
        {isNew && <UnreadPip />}
        {sealed && <SealedPip label="an engraving not yet made out" />}
        {frag.source}
      </div>
      {sealed ? (
        <SealedBody text={frag.text} />
      ) : (
        <p className="jrn-card__text">{quoted(frag.text)}</p>
      )}
      {sealed ? null : interpreted && frag.interpretation ? (
        <div className="jrn-note">{frag.interpretation}</div>
      ) : (
        /* ROUND 24 (COMPREHENSION, fix 12). This read "Ellery might read more in
           this, over something warm" — a gesture the game has no verb for. The
           service is `ellery.arc.interpret-offer`: Ellery affinity >= 2 with
           >= 1 legible fragment, met in a PARLOR. The tester who reads every
           word finished with two half-read engravings, certain he was failing
           at an action that does not exist, one bookmark from the real lever. */
        <div className="jrn-card__sealednote">
          Ellery would read more in this, once she trusts you a little further — call on her in a
          parlor, a bookmark in hand.
        </div>
      )}
      {refs.length > 0 && (
        <div className="jrn-refs">
          {refs.map((r) => (
            <span key={r.id} className="jrn-ref">see also: {r.source ?? r.id}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function TestimonyCard({
  frag, isNew, sealed,
}: { frag: FragmentContent; isNew: boolean; sealed: boolean }) {
  const volume = useManorStore((s) => s.volume);
  const flags = useManorStore((s) => s.flags);
  const content = getVolumeContent(volume.volumeId)!;
  const sealedIds = sealedFragmentIds(volume.volumeId, flags);
  const refs = crossRefs(content, volume, frag.id, { sealedIds });
  const name = frag.speaker ? CHARACTER_NAMES[frag.speaker] : 'Someone';
  return (
    <div className={`jrn-card${sealed ? ' jrn-card--sealed' : ''}`}>
      <div className="jrn-card__speakerrow">
        <span className="jrn-medallion" aria-hidden>{name.replace('Mrs. ', '').replace('The ', '')[0]}</span>
        <div>
          <div className="jrn-card__speaker">{name}</div>
          <div className="jrn-card__source">
            {isNew && <UnreadPip />}
            {sealed && <SealedPip label="testimony not yet made out" />}
            {frag.source}
          </div>
        </div>
      </div>
      {/* Testimony arrives from the volume file already wearing its own curly
          quotes; the journal owns the quoting now (see ./quote.ts), so the
          authored pair is stripped and re-set — one convention on every card,
          and no doubling however the content is authored later. */}
      {sealed ? (
        <SealedBody text={frag.text} />
      ) : (
        <p className="jrn-card__text">{quoted(frag.text)}</p>
      )}
      {refs.length > 0 && (
        <div className="jrn-refs">
          {refs.map((r) => (
            <span key={r.id} className="jrn-ref">see also: {r.source ?? r.id}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function LetterCard({
  letter, opened, expanded, onToggle,
}: {
  letter: { id: string; from: CharacterId; subject?: string; body: string };
  opened: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const showBody = opened && expanded;
  return (
    <div className="jrn-letter">
      <button className="jrn-letter__head" onClick={onToggle}>
        <span className={`jrn-seal${opened ? ' jrn-seal--broken' : ''}`} aria-label={opened ? 'seal broken' : 'sealed'} />
        <span>
          <span className="jrn-letter__from">From {CHARACTER_NAMES[letter.from]} · </span>
          <span className="jrn-letter__subject">{letter.subject ?? 'A letter'}</span>
          {!opened && <span className="jrn-letter__from"> — break the seal</span>}
        </span>
      </button>
      {showBody && (
        <div className="jrn-letter__body">
          {letter.body.split('\n\n').map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
    </div>
  );
}
