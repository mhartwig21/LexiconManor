/**
 * ui/dialogue — OWNER: A6 (Dialogue). Public surface for other pages:
 * mount <DialogueScene character slot onClose /> anywhere a character is
 * interacted with (A1's parlor visits, A2's morning beat, A7's Sanctum).
 */

export { default as DialogueScene } from './DialogueScene';
export type { DialogueSceneProps } from './DialogueScene';
export { default as CharacterPortrait } from './portraits';
export { default as TypewriterText } from './TypewriterText';
export { default as ChoiceRow } from './ChoiceRow';
