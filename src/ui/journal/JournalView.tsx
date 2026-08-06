/**
 * The Journal — OWNER: A7 (Mystery). The auto-filing cozy-detective case
 * file (MANOR_DESIGN §7, AAA 4.15): fragments group themselves, engravings
 * render against the alphabet, letters wait under wax seals, and every
 * document ever seen is re-readable in ≤2 taps from anywhere (Home →
 * Journal → tab). The deduction is the player's; the filing is not.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { useManorStore } from '../../app/store';
import { getVolumeContent } from '../../app/content/volumes';
import {
  alphabetFacts, ALPHABET, crossRefs, definitionSlots, filedToday, foundByKind,
  guessHistory, isInterpreted, journalNudge, letterBoxes, sanctumReadiness,
} from '../../engine/journal';
import {
  arrivedLetters, fragmentDroughtDays, openedLetterFlag, type FragmentContent,
} from '../../engine/volume';
import type { CharacterId } from '../../engine/types';
import { sfx } from '../../app/sound';
import './journal.css';

type Tab = 'word' | 'engravings' | 'testimony' | 'letters';

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

  const volume = useManorStore((s) => s.volume);
  const day = useManorStore((s) => s.day?.day ?? s.volume.day);
  const flags = useManorStore((s) => s.flags);
  const recentEvents = useManorStore((s) => s.recentEvents);
  const dayRecords = useManorStore((s) => s.chronicles.dayRecords);
  const openLetter = useManorStore((s) => s.openLetter);

  const content = getVolumeContent(volume.volumeId);
  if (!content) {
    return (
      <div className="jrn-page">
        <div className="jrn"><p className="jrn-empty">The journal's pages are still being sewn in.</p></div>
      </div>
    );
  }

  const solved = volume.status === 'solved';
  const newToday = filedToday(recentEvents, day);
  const openedIds = new Set(
    content.letters
      .filter((l) => flags.includes(openedLetterFlag(content.id, l.id)))
      .map((l) => l.id),
  );
  const letters = arrivedLetters(content, volume, day, {
    droughtDays: fragmentDroughtDays(dayRecords),
    openedIds,
  });
  const unreadLetters = letters.filter((l) => !openedIds.has(l.id)).length;
  const engravings = foundByKind(content, volume, 'engraving');
  const testimony = foundByKind(content, volume, 'testimony');

  const hasNew = (frags: FragmentContent[]) => frags.some((f) => newToday.has(f.id));
  const slots = definitionSlots(content, volume);

  const switchTab = (t: Tab) => {
    if (t !== tab) sfx.tap();
    setTab(t);
  };

  return (
    <div className="jrn-page">
      <div className="jrn">
        <header className="jrn__head">
          <div>
            <h2 className="jrn__title">The Journal</h2>
            <div className="jrn__volume">
              Volume I — {content.title}{solved ? ' · closed' : ''}
            </div>
          </div>
          <button className="jrn__back" onClick={() => navigate('/')}>Put it down</button>
        </header>

        <nav className="jrn-tabs" aria-label="Journal tabs">
          <TabButton label="The Word" active={tab === 'word'} dot={hasNew(slots.flatMap((s) => (s.fragment ? [s.fragment] : [])))} onClick={() => switchTab('word')} />
          <TabButton label="Engravings" active={tab === 'engravings'} dot={hasNew(engravings)} onClick={() => switchTab('engravings')} />
          <TabButton label="Testimony" active={tab === 'testimony'} dot={hasNew(testimony)} onClick={() => switchTab('testimony')} />
          <TabButton label="Letters" active={tab === 'letters'} dot={unreadLetters > 0} onClick={() => switchTab('letters')} />
        </nav>

        <div className="jrn-sheet">
          {tab === 'word' && <WordTab />}
          {tab === 'engravings' && (
            engravings.length === 0 ? (
              <p className="jrn-empty">No engravings found yet. They are cut into lintels and inkstands about the house — the manor will file them as you pass.</p>
            ) : (
              engravings.map((f) => <EngravingCard key={f.id} frag={f} isNew={newToday.has(f.id)} />)
            )
          )}
          {tab === 'testimony' && (
            testimony.length === 0 ? (
              <p className="jrn-empty">No one has said anything worth filing. Yet. Try tea, and patience.</p>
            ) : (
              testimony.map((f) => <TestimonyCard key={f.id} frag={f} isNew={newToday.has(f.id)} />)
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
                    } else {
                      setOpenLetterId(openLetterId === l.id ? null : l.id);
                    }
                  }}
                />
              ))
            )
          )}
        </div>
      </div>
    </div>
  );

  // -- The Word tab -----------------------------------------------------------

  function WordTab() {
    const facts = alphabetFacts(content!, volume);
    const boxes = letterBoxes(facts);
    const guesses = guessHistory(content!, volume);
    const readiness = sanctumReadiness(content!, volume);
    const nudge = journalNudge(content!, volume);
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
              s.fragment ? (
                <div key={s.revealOrder} className="jrn-poem__line">
                  “{s.fragment.text}”
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
                  <span className="jrn-guess__meta">
                    day {g.day}
                    {g.wasAnswer
                      ? ' · the word itself'
                      : ` · ${g.closeness.sharedLetters} letter${g.closeness.sharedLetters === 1 ? '' : 's'} shared${g.closeness.rightLength ? ' · right length' : ''}`}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {nudge && <div className="jrn-nudge">{nudge}</div>}
        {!solved && readiness.enough && (
          <div className="jrn-nudge">
            <button className="jrn__back" style={{ textDecoration: 'underline' }} onClick={() => navigate('/sanctum')}>
              Take it to the Sanctum
            </button>
          </div>
        )}
      </>
    );
  }
}

function TabButton({ label, active, dot, onClick }: { label: string; active: boolean; dot: boolean; onClick: () => void }) {
  return (
    <button className={`jrn-tab${active ? ' jrn-tab--active' : ''}`} onClick={onClick} aria-pressed={active}>
      {label}
      {dot && <span className="jrn-tab__dot" aria-label="new" />}
    </button>
  );
}

function EngravingCard({ frag, isNew }: { frag: FragmentContent; isNew: boolean }) {
  const volume = useManorStore((s) => s.volume);
  const content = getVolumeContent(volume.volumeId)!;
  const refs = crossRefs(content, volume, frag.id);
  const interpreted = isInterpreted(volume, frag.id);
  return (
    <div className="jrn-card jrn-card--rubbing">
      <div className="jrn-card__source">
        {isNew && <span className="jrn-card__new" aria-label="filed today" />}
        {frag.source}
      </div>
      <p className="jrn-card__text">“{frag.text}”</p>
      {interpreted && frag.interpretation ? (
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

function TestimonyCard({ frag, isNew }: { frag: FragmentContent; isNew: boolean }) {
  const volume = useManorStore((s) => s.volume);
  const content = getVolumeContent(volume.volumeId)!;
  const refs = crossRefs(content, volume, frag.id);
  const name = frag.speaker ? CHARACTER_NAMES[frag.speaker] : 'Someone';
  return (
    <div className="jrn-card">
      <div className="jrn-card__speakerrow">
        <span className="jrn-medallion" aria-hidden>{name.replace('Mrs. ', '').replace('The ', '')[0]}</span>
        <div>
          <div className="jrn-card__speaker">{name}</div>
          <div className="jrn-card__source">
            {isNew && <span className="jrn-card__new" aria-label="filed today" />}
            {frag.source}
          </div>
        </div>
      </div>
      <p className="jrn-card__text">{frag.text}</p>
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
