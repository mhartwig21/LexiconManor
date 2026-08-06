/**
 * Authored dialogue content — OWNER: A6 (Dialogue).
 *
 * Lazy views over the per-character JSON in content/authored/dialogue/,
 * served through app/pools.ts (AAA 9.6 — the one runtime importer of content
 * JSON: data, not code — the engine stays pure). Shapes are validated at build time
 * by content/validate-dialogue.ts and in tests/dialogue-content.test.ts; the
 * casts below are backed by that validator, not by hope.
 */

import type { CharacterId } from '../types';
import type { DialogueFile } from './schema';

import { getPools, lazyContent } from '../../app/pools';

export const DIALOGUE_FILES: Readonly<Record<CharacterId, DialogueFile>> = lazyContent<
  Record<CharacterId, DialogueFile>
>(() => getPools().dialogue as unknown as Record<CharacterId, DialogueFile>, {});

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
