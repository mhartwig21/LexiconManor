import type { SaveFile } from '../engine/types';
import { createEmptySave } from '../engine/run';

/**
 * Save persistence: one versioned object in localStorage.
 * All game state flows through the store; this module only (de)serializes.
 */

const KEY = 'lexicon-loop-save-v2';

export function loadSave(): SaveFile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createEmptySave('Player');
    const parsed = JSON.parse(raw) as SaveFile;
    if (parsed.version !== 1) return createEmptySave('Player');
    // Backfill fields added since the save was written.
    return { ...createEmptySave(parsed.profileName), ...parsed };
  } catch {
    return createEmptySave('Player');
  }
}

export function persistSave(save: SaveFile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch (err) {
    console.error('Failed to persist save', err);
  }
}

/** Export/import as a "save code" — the cross-device story with no server. */
export function exportSaveCode(save: SaveFile): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(save))));
}

export function importSaveCode(code: string): SaveFile | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(code.trim())))) as SaveFile;
    return parsed.version === 1 ? { ...createEmptySave(parsed.profileName), ...parsed } : null;
  } catch {
    return null;
  }
}
