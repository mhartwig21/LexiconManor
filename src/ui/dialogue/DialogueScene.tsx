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
import { selectDialogue, findNode } from '../../engine/dialogue/select';
import { rankFor, MAX_AFFINITY_RANK } from '../../engine/dialogue/affinity';
import { useManorStore } from '../../app/store';
import CharacterPortrait from './portraits';
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
  const [node, setNode] = useState<DialogueNode | null>(
    () => selectDialogue(file, buildDialogueQuery(character, slot)) ?? null,
  );
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

  // Choices surface as soon as the last line settles; node effects land here
  // so closing at the choice row can never lose the conversation's beat.
  useEffect(() => {
    if (node && phase === 'lines' && lineDone && isLast) {
      applyNode(node);
      if (node.choices && node.choices.length > 0) setPhase('choices');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- transition on line completion
  }, [lineDone, isLast, phase, node]);

  if (!node) return null;
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
    if (node.choices && node.choices.length > 0) return; // choice row is up
    setPhase('end');
  };

  const handleChoice = (choice: DialogueChoice) => {
    applyDialogueEffects(choice.effects);
    const next = choice.goto ? findNode(file, choice.goto) : undefined;
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
              <ChoiceRow choices={node.choices} onChoose={handleChoice} />
            </div>
          )}

          {phase === 'end' && (
            <div className="dlg-choices" onPointerDown={(e) => e.stopPropagation()}>
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
