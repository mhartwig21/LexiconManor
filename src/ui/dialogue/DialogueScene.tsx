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
import type { CharacterId } from '../../engine/types';
import type { DialogueTrigger } from '../../engine/events';
import type { DialogueChoice, DialogueNode, PortraitExpression } from '../../engine/dialogue/schema';
import { getDialogueFile, CHARACTER_NAMES } from '../../engine/dialogue/content';
import {
  availableChoices, resolveChoiceTarget, selectAskMenu, selectDialogue,
} from '../../engine/dialogue/select';
import { rankFor, MAX_AFFINITY_RANK } from '../../engine/dialogue/affinity';
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

  const file = getDialogueFile(character);
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
    setPhase('end');
  };

  const handleChoice = (choice: DialogueChoice) => {
    applyDialogueEffects(choice.effects);
    // Resolved against live state: a `gotoPrefix` verb points at a FAMILY, and
    // which member answers depends on what happened today (select.ts).
    const next = resolveChoiceTarget(file, buildDialogueQuery(character, slot), choice);
    if (next) playNode(next);
    else setPhase('end');
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

  const rank = rankFor(affinity);

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
              <span className="dlg__pips" aria-label={`Affinity rank ${rank} of ${MAX_AFFINITY_RANK}`}>
                {Array.from({ length: MAX_AFFINITY_RANK }, (_, i) => (
                  <span key={i} className={`dlg__pip${i < rank ? ' dlg__pip--lit' : ''}`} aria-hidden="true" />
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
