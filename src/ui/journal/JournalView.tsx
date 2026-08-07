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
  guessHistory, isInterpreted, journalNudge, letterBoxes, sanctumReadiness, sealedCount,
  VERDICT_TOKENS,
  type JournalTab,
} from '../../engine/journal';
import {
  arrivedLetters, fragmentDroughtDays, openedLetterIds, sealedFragmentIds,
  type FragmentContent,
} from '../../engine/volume';
import type { CharacterId } from '../../engine/types';
import { atSanctumDoor } from '../../engine/manor/grid';
import { getDialogueFile } from '../../engine/dialogue/content';
import { selectDialogue } from '../../engine/dialogue/select';
import DialogueScene from '../dialogue/DialogueScene';
import BackLink from '../chrome/BackLink';
import UnreadMark, { UnreadPip } from './UnreadMark';
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
  /** Is she actually standing at the door? (See the Word tab's nudge.) */
  const atLanding = useManorStore((s) => atSanctumDoor(s.manor));

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
  const stillSealed = sealedCount(volume, { sealedIds });

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
   */
  const displayed = content ? displayedFragmentIds(content, volume, tab, { sealedIds }) : [];
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
    droughtDays: fragmentDroughtDays(dayRecords),
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

        {/* Every tab dot is live persisted unread — it retires when the tab's
            contents have been on the glass, and it does not come back. */}
        <nav className="jrn-tabs" aria-label="Journal tabs">
          <TabButton label="The Word" noun="lines of the definition" active={tab === 'word'} unread={unread.word.length} onClick={() => switchTab('word')} />
          <TabButton label="Engravings" noun="engravings" active={tab === 'engravings'} unread={unread.engravings.length} onClick={() => switchTab('engravings')} />
          <TabButton label="Testimony" noun="pieces of testimony" active={tab === 'testimony'} unread={unread.testimony.length} onClick={() => switchTab('testimony')} />
          <TabButton label="Letters" noun="letters" active={tab === 'letters'} unread={unread.letters.length} onClick={() => switchTab('letters')} />
        </nav>

        <div className="jrn-sheet">
          {tab === 'word' && <WordTab />}
          {tab === 'engravings' && (
            engravings.length === 0 ? (
              <p className="jrn-empty">No engravings found yet. They are cut into lintels and inkstands about the house — the manor will file them as you pass.</p>
            ) : (
              engravings.map((f) => (
                <EngravingCard key={f.id} frag={f} isNew={isNew(f.id)} sealed={isSealed(f.id)} />
              ))
            )
          )}
          {tab === 'testimony' && (
            testimony.length === 0 ? (
              <p className="jrn-empty">No one has said anything worth filing. Yet. Try tea, and patience.</p>
            ) : (
              testimony.map((f) => (
                <TestimonyCard key={f.id} frag={f} isNew={isNew(f.id)} sealed={isSealed(f.id)} />
              ))
            )
          )}
          {tab === 'letters' && (
            letters.length === 0 ? (
              <p className="jrn-empty">The post tray is empty. Letters arrive overnight — Posy sees to it.</p>
            ) : (
              letters.map((l) => (
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
              ))
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
                  {isNew(s.fragment.id) && <UnreadPip label="a leaf you have not made out" />}{' '}
                  <span className="jrn-smudge" aria-hidden>{smudge(s.fragment.text)}</span>
                  <span className="jrn-sealed__label">
                    A torn leaf, filed — the hand is too faded to make out. Solve a room.
                  </span>
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
    const showSanctum = sanctumReadiness(content!, volume, { sealedIds }).enough;
    return (
      <div className="jrn-rail">
        {stillSealed > 0 && (
          <div className="jrn-rail__backlog">
            <span className="jrn-rail__count" aria-hidden>{stillSealed}</span>
            <span>
              {stillSealed === 1 ? 'page filed but not made out' : 'pages filed but not made out'}
              {' · '}finishing a room makes them out{' '}
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
            ) : (
              <span className="jrn-nudge__text">
                Enough to take upstairs, when you can get up there — the door is on the top
                landing, and it only hears a word from someone standing at it.
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
}

/**
 * What an undeciphered page LOOKS like. Not the text: a run of ink-strokes the
 * same shape and length as the writing under it, so the card reads as a real
 * document she is holding rather than as an empty placeholder — and so nothing
 * of the fragment's content can leak through the DOM (the strokes are derived
 * from word LENGTHS only, and the element is aria-hidden; the sighted and the
 * screen-reader player learn exactly the same amount, which is nothing).
 */
export function smudge(text: string, maxWords = 22): string {
  return text
    .split(/\s+/)
    .slice(0, maxWords)
    .map((w) => '·'.repeat(Math.max(1, Math.min(9, w.replace(/[^\p{L}]/gu, '').length))))
    .join(' ');
}

/** One sealed document, in whichever tab it lives. */
function SealedBody({ text }: { text: string }) {
  return (
    <>
      <p className="jrn-card__text jrn-smudge" aria-hidden>{smudge(text)}</p>
      <div className="jrn-sealed__label">
        Filed, and not yet made out — the ink has run. Finish a room and it comes clear.
      </div>
    </>
  );
}

function TabButton({
  label, noun, active, unread, onClick,
}: {
  label: string; noun: string; active: boolean; unread: number; onClick: () => void;
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
   */
  return (
    <button
      className={`jrn-tab unread-host${active ? ' jrn-tab--active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
      <UnreadMark count={unread} noun={noun} corner />
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
        <div className="jrn-card__sealednote">Ellery might read more in this, over something warm.</div>
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
