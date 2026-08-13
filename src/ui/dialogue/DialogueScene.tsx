/**
 * DialogueScene — OWNER: A6 (Dialogue). The Hades-style conversation surface
 * (MANOR_DESIGN §8, AAA 5.10): static portrait left, nameplate, typewriter
 * text (tap 1 completes, tap 2 advances), 2–3 choice buttons, bookmark
 * gifting. Mount it from any page with a character + trigger slot:
 *
 *   <DialogueScene character="bramble" slot="morning" onClose={...} />
 *
 * Selection runs once on mount against the frozen DialogueQuery snapshot;
 * skipping records seen + applies effects (AAA 5.10). Gifting immediately
 * re-queries so the bespoke keepsake scene (idle-trigger, priority 1000)
 * plays as the character's reaction (AAA 5.7).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CharacterId } from '../../engine/types';
import type { DialogueTrigger } from '../../engine/events';
import type { DialogueChoice, DialogueNode, PortraitExpression } from '../../engine/dialogue/schema';
import { CHARACTER_NAMES } from '../../engine/dialogue/content';
import {
  availableChoices, resolveChoiceTarget, selectAskMenu, selectDialogue, selectLead,
} from '../../engine/dialogue/select';
import { leadCardId, leadCardsSpokenToday } from '../../engine/leads';
import {
  rankFor, pointsToNextRank, rankProgress, MAX_AFFINITY_RANK,
} from '../../engine/dialogue/affinity';
import { meetingCardFor } from '../../engine/dialogue/meeting';
import { useManorStore } from '../../app/store';
import CharacterPortrait from './portraits';
import MeetingCard from './MeetingCard';
import TypewriterText from './TypewriterText';
import ChoiceRow from './ChoiceRow';
import './dialogue.css';

export interface DialogueSceneProps {
  character: CharacterId;
  slot: DialogueTrigger;
  onClose: () => void;
}

type Phase = 'lines' | 'choices' | 'end';

export default function DialogueScene({ character, slot, onClose }: DialogueSceneProps) {
  const buildDialogueQuery = useManorStore((s) => s.buildDialogueQuery);
  const applyDialogueEffects = useManorStore((s) => s.applyDialogueEffects);
  const markNodeSeen = useManorStore((s) => s.markNodeSeen);
  const giveGift = useManorStore((s) => s.giveGift);
  const affinity = useManorStore((s) => s.affinities[character] ?? 0);
  const canGift = useManorStore(
    (s) => character !== 'dewey' && !s.giftedToday.includes(character),
  );
  // Bookmarks are a scarce currency (AAA 5.7): the gift offer is gated on
  // having one, and — like any other spend — on having a step left to give.
  const bookmarks = useManorStore((s) => s.currencies.bookmarks);
  const outOfSteps = useManorStore((s) => s.stepsRemaining() < 1);
  const giftLocked = bookmarks <= 0 || outOfSteps;
  const settingsReduced = useManorStore((s) => s.settings.reducedMotion);
  const reducedMotion = useMemo(
    () =>
      settingsReduced ||
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    [settingsReduced],
  );

  /**
   * ROUND 54 — THE POOL THIS SCENE MAY BE DEALT FROM, frozen with the snapshot
   * it is dealt against.
   *
   * `dialogueFileFor` is the authored file minus every LEAD whose room cannot
   * pay a page right now (engine/leads.ts, docs/LEADS.md). It is frozen at
   * mount for the same reason `mountQuery` is: one snapshot, one decision, for
   * the life of the mount — a solve landing mid-conversation must not be able
   * to retract a line she is halfway through reading, and the house keeps the
   * promise either way (`leadCardSpokenToday`, app/slices/journal.ts).
   */
  const dialogueFileFor = useManorStore((s) => s.dialogueFileFor);
  const [file] = useState(() => dialogueFileFor(character));
  /** The frozen snapshot this scene was dealt from (ARCHITECTURE §5). */
  const [mountQuery] = useState(() => buildDialogueQuery(character, slot));
  const [node, setNode] = useState<DialogueNode | null>(
    () => selectDialogue(file, mountQuery) ?? null,
  );
  /**
   * ROUND 12 — THE FIRST MEETING IS DELIVERED, NOT MERELY PLAYED.
   *
   * Frozen at mount, from a non-subscribing read: the acquaintance flag this
   * scene is about to SET must not be allowed to cancel the ceremony halfway
   * through it (`met.<c>` lands when the last line settles). One snapshot,
   * one decision, for the life of the mount. See engine/dialogue/meeting.ts
   * for why this is a pre-roll here rather than a seal in the moment queue.
   */
  const [meeting, setMeeting] = useState(() => {
    if (!node) return null;
    const s = useManorStore.getState();
    return meetingCardFor(character, node, new Set(s.flags), new Set(s.seenNodeIds));
  });
  const [phase, setPhase] = useState<Phase>('lines');
  const [lineIdx, setLineIdx] = useState(0);
  const [lineInstant, setLineInstant] = useState(false);
  const [lineDone, setLineDone] = useState(false);
  const appliedRef = useRef(new Set<string>());

  // No eligible content anywhere = authoring-floor failure; close quietly.
  useEffect(() => {
    if (!node) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-time guard
  }, [node]);

  /** Apply a node's effects + record seen, exactly once (skip included). */
  const applyNode = (n: DialogueNode) => {
    if (appliedRef.current.has(n.id)) return;
    appliedRef.current.add(n.id);
    applyDialogueEffects(n.effects);
    markNodeSeen(n.id, character);
  };

  const playNode = (n: DialogueNode) => {
    setNode(n);
    setPhase('lines');
    setLineIdx(0);
    setLineInstant(false);
    setLineDone(false);
  };

  const isLast = node ? lineIdx >= node.lines.length - 1 : true;

  /**
   * ═══ ROUND 54 — AND THEN, ON YOUR WAY OUT, SHE MENTIONS THE SHELVES ══════
   *
   * A LEAD (docs/LEADS.md) is a person telling you about a place. It plays as a
   * TAIL on the conversation she was already having rather than as the
   * conversation itself, because the slot is spoken for: measured, a lead above
   * the reaction band breaks AAA 5.1 and a lead below the arc band never plays
   * at all (engine/dialogue/select.ts `selectLead` carries both numbers).
   *
   * Three gates, and each one is a clause of the ruling:
   *   · ONE A DAY, read off the spine (`leadCardsSpokenToday`) — several in an
   *     evening is a quest log, which is the failure the ruling names.
   *   · ONLY OFF A VISIT (`morning` / `parlor`). The Portrait's sigh after a
   *     wrong guess and Posy's aside over an opened letter are forced-context
   *     beats, and a rumour tacked onto one of those is the interface talking.
   *   · NEVER OFF A LEAD. A tail has no tail.
   *
   * `file` is already the honesty-filtered pool (see the mount above), so a
   * lead reached here is one whose room can pay tonight — and once she has been
   * told, the house keeps the promise whatever else she solves first
   * (app/slices/journal.ts).
   */
  const dueLead = (n: DialogueNode): DialogueNode | undefined => {
    if (slot !== 'morning' && slot !== 'parlor') return undefined;
    if (leadCardId(n.id) !== null) return undefined;
    const q = buildDialogueQuery(character, slot);
    if (leadCardsSpokenToday(q.recentEvents, q.day).size > 0) return undefined;
    return selectLead(file, q);
  };

  /** Close the scene — or hand it to the lead that was waiting to be mentioned. */
  const finish = (n: DialogueNode) => {
    const lead = dueLead(n);
    if (lead) playNode(lead);
    else setPhase('end');
  };

  /**
   * The verbs on offer RIGHT NOW. Recomputed against live state rather than
   * the mount snapshot, because asking is the one thing in a scene that
   * changes what may be asked next (REVIEW_AA §5.11) — a topic she has just
   * heard must not still be on the menu when the panel comes back.
   */
  const liveChoices = (n: DialogueNode): DialogueChoice[] =>
    availableChoices(file, buildDialogueQuery(character, n.trigger), n);

  // Choices surface as soon as the last line settles; node effects land here
  // so closing at the choice row can never lose the conversation's beat.
  useEffect(() => {
    if (node && phase === 'lines' && lineDone && isLast) {
      applyNode(node);
      if (liveChoices(node).length > 0) setPhase('choices');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- transition on line completion
  }, [lineDone, isLast, phase, node]);

  if (!node) return null;

  /* The card of introduction, and then the panel. It REPLACES the sheet
     rather than covering it, which is the whole point: the typewriter has not
     started, so the ceremony lands before the first line rather than over it
     (the brief's "before or as their first lines begin, not after"). Tapping
     or waiting hands off, the sheet arrives with its own entrance, and the
     line begins. `.dlg` keeps the overlay contract — the chrome stays inert
     and ui/chrome/overlay-watch still sees a scene up. */
  if (meeting) {
    return (
      <div
        className="dlg"
        role="dialog"
        aria-label={`Meeting ${CHARACTER_NAMES[character]}`}
      >
        <MeetingCard
          character={character}
          copy={meeting}
          reducedMotion={reducedMotion}
          onDone={() => setMeeting(null)}
        />
      </div>
    );
  }

  const line = node.lines[lineIdx]!;

  // Current expression: last explicit portrait key at or before this line.
  let expression: PortraitExpression = 'neutral';
  for (let i = lineIdx; i >= 0; i--) {
    const p = node.lines[i]?.portrait;
    if (p) { expression = p; break; }
  }

  const handleTap = () => {
    if (phase !== 'lines') return;
    if (!lineDone) { setLineInstant(true); return; }
    if (!isLast) {
      setLineIdx((i) => i + 1);
      setLineInstant(false);
      setLineDone(false);
      return;
    }
    if (liveChoices(node).length > 0) return; // choice row is up
    finish(node);
  };

  const handleChoice = (choice: DialogueChoice) => {
    applyDialogueEffects(choice.effects);
    // Resolved against live state: a `gotoPrefix` verb points at a FAMILY, and
    // which member answers depends on what happened today (select.ts).
    const next = resolveChoiceTarget(file, buildDialogueQuery(character, slot), choice);
    if (next) playNode(next);
    else finish(node);
  };

  const handleSkip = () => {
    applyNode(node);
    setPhase('end');
  };

  const handleGift = () => {
    giveGift(character);
    // The keepsake / thank-you plays as an immediate reaction: the valve is
    // spent, so selection lands in the idle pool where reaction nodes wait.
    const reaction = selectDialogue(file, buildDialogueQuery(character, slot));
    if (reaction && reaction.id !== node.id) playNode(reaction);
  };

  /**
   * ═══ ROUND 24 — THE POINTS, NOT ONLY THE RANK (COMPREHENSION, fix 4) ══════
   *
   * THE MOST WIDELY SHARED WRONG BELIEF IN THE COMPREHENSION TEST: *"gifts do
   * nothing — the four diamonds by each name never move, so either they aren't
   * a friendship meter or the gift system is broken."* All three testers held
   * it. One gave away every bookmark he owned across three characters and
   * listed it as the thing to fix before recommending the game.
   *
   * They were reading the meter correctly. A gift is +1 POINT; the pips render
   * RANK; and rank 1 costs 2 points (AFFINITY_RANK_THRESHOLDS = [0,2,5,9,14]).
   * So the first gift to anybody, ever, moved nothing on screen — in a game
   * whose tea arc, Ellery's interpretation service and Fern's key are all
   * affinity-gated, and whose scarcest currency is the thing being spent.
   *
   * `pointsToNextRank` has existed in engine/dialogue/affinity.ts since the
   * ranks were written and no surface has ever called it. Two calls, here:
   *
   *   1. THE NEXT PIP FILLS BY THE POINT. The diamond she is working on carries
   *      a proportional gilt fill (`--pip-fill`), so one gift is visibly half
   *      of the first rank rather than nothing at all. Shape, not hue: the
   *      filled area survives the grayscale pass (AAA 6.3).
   *   2. THE CLOSING PANEL COUNTS IT OUT, in words, beside the gift button —
   *      which is also where the gift CONFIRMATION lands, because the reaction
   *      node returns to `phase === 'end'` with the pip already moved and this
   *      line already decremented. "Two more kindnesses" → "One more kindness"
   *      is the receipt the test said the gift never gave.
   */
  const rank = rankFor(affinity);
  const toNextRank = pointsToNextRank(affinity);
  /** How far into the CURRENT rank she is, 0–1 (engine/dialogue/affinity.ts). */
  const pipFill = rankProgress(affinity);
  const kindnessLine = toNextRank === undefined
    ? null
    : toNextRank === 1
      ? 'One more kindness lights the next diamond.'
      : `${toNextRank} more kindnesses light the next diamond.`;

  /**
   * The closing panel's verb menu — the character's own `ask.menu` node,
   * quoted rather than played (no valve spent, nothing marked seen until she
   * actually asks something). Empty for a character with no menu, and empty
   * once every verb on it is exhausted, in which case the panel is exactly
   * what it always was.
   */
  const askMenu = phase === 'end' ? selectAskMenu(file, buildDialogueQuery(character, 'idle')) : undefined;
  const askChoices = askMenu ? availableChoices(file, buildDialogueQuery(character, 'idle'), askMenu) : [];

  return (
    <div className="dlg" role="dialog" aria-label={`Conversation with ${CHARACTER_NAMES[character]}`}>
      <div className="dlg__sheet" onPointerDown={handleTap}>
        <div className="dlg-portrait">
          <CharacterPortrait character={character} expression={expression} dimmed={!!line.narration} />
        </div>

        <div className="dlg__box">
          <div className="dlg__plate-row">
            <span className="dlg__nameplate">{CHARACTER_NAMES[character]}</span>
            {character !== 'dewey' && (
              <span
                className="dlg__pips"
                aria-label={
                  `Affinity rank ${rank} of ${MAX_AFFINITY_RANK}`
                  + (kindnessLine ? ` — ${kindnessLine}` : ' — as close as this house gets.')
                }
              >
                {Array.from({ length: MAX_AFFINITY_RANK }, (_, i) => (
                  <span
                    key={i}
                    className={
                      'dlg__pip'
                      + (i < rank ? ' dlg__pip--lit' : '')
                      + (i === rank && pipFill > 0 ? ' dlg__pip--part' : '')
                    }
                    style={i === rank && pipFill > 0
                      ? ({ '--pip-fill': `${Math.round(pipFill * 100)}%` } as CSSProperties)
                      : undefined}
                    aria-hidden="true"
                  />
                ))}
              </span>
            )}
            {phase === 'lines' && (
              <button
                type="button"
                className="dlg__skip"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleSkip}
              >
                Skip
              </button>
            )}
          </div>

          <div className="dlg__text-area">
            <TypewriterText
              key={`${node.id}#${lineIdx}`}
              text={line.text}
              instant={lineInstant}
              reducedMotion={reducedMotion}
              onDone={() => setLineDone(true)}
              className={`dlg__text${line.narration ? ' dlg__text--narration' : ''}`}
            />
          </div>

          {phase === 'lines' && lineDone && !(isLast && node.choices?.length) && (
            <div className="dlg__advance" aria-hidden="true">❧</div>
          )}

          {phase === 'choices' && node.choices && (
            <div onPointerDown={(e) => e.stopPropagation()}>
              <ChoiceRow choices={liveChoices(node)} onChoose={handleChoice} />
            </div>
          )}

          {phase === 'end' && (
            <div className="dlg-choices" onPointerDown={(e) => e.stopPropagation()}>
              {/* ── THE STANDING VERBS (REVIEW_AA §5.11) ──────────────────
                  The review counted twenty choices in the whole game and
                  found all of them inside a first meeting, an arc opener or
                  a quest ask — i.e. gone by about day five of a 22-day
                  volume. These are the Hades answer: not plot forks, verbs,
                  offered at the close of EVERY conversation with everyone
                  who has an authored menu, for as long as the menu has
                  something left to say. Two at a time, because the closing
                  panel also carries the gift offer and Farewell and the
                  whole panel has to fit above the fold at 390×844; the
                  third surfaces as soon as one of these is spent. */}
              {askChoices.slice(0, 2).map((ch) => (
                <button
                  key={ch.text}
                  type="button"
                  className="dlg-choice dlg-choice--ask"
                  onClick={() => handleChoice(ch)}
                >
                  {ch.text}
                </button>
              ))}
              {/* The price of a kindness, in the currency the pips are kept in
                  (round 24). It stands whether or not she can gift right now,
                  because the sentence it answers — "do gifts do anything?" —
                  was asked by a player who had already spent every bookmark. */}
              {character !== 'dewey' && kindnessLine && (
                <p className="dlg-kindness">{kindnessLine}</p>
              )}
              {canGift && !giftLocked && (
                <button type="button" className="dlg-choice dlg-choice--gift" onClick={handleGift}>
                  Offer a bookmark ({bookmarks} in pocket)
                </button>
              )}
              {canGift && giftLocked && (
                <p className="dlg-gift-empty">
                  {outOfSteps
                    ? 'No steps left for giving tonight — tomorrow, then.'
                    : 'Your pocket wants for bookmarks — the manor tucks them into rooms and letters.'}
                </p>
              )}
              <button type="button" className="dlg-choice dlg-choice--primary" onClick={onClose}>
                {character === 'dewey' ? 'Leave him to it' : 'Farewell'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
