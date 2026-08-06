/**
 * Authored dialogue content — OWNER: A6 (Dialogue).
 *
 * Static imports of the per-character JSON in content/authored/dialogue/
 * (same pattern as the puzzle adapters importing content/generated/*.json:
 * data, not code — the engine stays pure). Shapes are validated at build time
 * by content/validate-dialogue.ts and in tests/dialogue-content.test.ts; the
 * casts below are backed by that validator, not by hope.
 */

import type { CharacterId } from '../types';
import type { DialogueFile } from './schema';

import brambleJson from '../../../content/authored/dialogue/bramble.json';
import elleryJson from '../../../content/authored/dialogue/ellery.json';
import posyJson from '../../../content/authored/dialogue/posy.json';
import fernJson from '../../../content/authored/dialogue/fern.json';
import deweyJson from '../../../content/authored/dialogue/dewey.json';
import portraitJson from '../../../content/authored/dialogue/portrait.json';

export const DIALOGUE_FILES: Readonly<Record<CharacterId, DialogueFile>> = {
  bramble: brambleJson as unknown as DialogueFile,
  ellery: elleryJson as unknown as DialogueFile,
  posy: posyJson as unknown as DialogueFile,
  fern: fernJson as unknown as DialogueFile,
  dewey: deweyJson as unknown as DialogueFile,
  portrait: portraitJson as unknown as DialogueFile,
};

export function getDialogueFile(character: CharacterId): DialogueFile {
  return DIALOGUE_FILES[character];
}

/** Nameplate strings (display names, not ids). */
export const CHARACTER_NAMES: Readonly<Record<CharacterId, string>> = {
  bramble: 'Mrs. Bramble',
  ellery: 'Ellery',
  posy: 'Posy',
  fern: 'Fern',
  dewey: 'Dewey',
  portrait: 'The Portrait',
};
