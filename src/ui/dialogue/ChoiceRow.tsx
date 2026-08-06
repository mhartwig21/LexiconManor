/**
 * ChoiceRow — OWNER: A6 (Dialogue). 2–3 verb-shaped choices (AAA 5.13):
 * cosmetic-plus-flag, never plot forks. 44px targets, pressed state from
 * pointerdown (AAA U.1).
 */

import type { DialogueChoice } from '../../engine/dialogue/schema';

interface ChoiceRowProps {
  choices: DialogueChoice[];
  onChoose: (choice: DialogueChoice) => void;
}

export default function ChoiceRow({ choices, onChoose }: ChoiceRowProps) {
  return (
    <div className="dlg-choices">
      {choices.map((choice) => (
        <button
          key={choice.text}
          type="button"
          className="dlg-choice"
          onClick={() => onChoose(choice)}
        >
          {choice.text}
        </button>
      ))}
    </div>
  );
}
