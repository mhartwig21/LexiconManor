/**
 * useJournalUnread — OWNER: A7 (Mystery). The single source for every level of
 * the unread chain (AAA 11.19): the blueprint's Journal entrance, the journal's
 * ribbon tabs, and the per-card markers all read THIS, so a dot on the entrance
 * and a dot on a tab can never disagree about what is unread.
 *
 * Round 12: it now carries BOTH chains — `.total`/`.word`/… is wax (you have
 * not looked at this) and `.sealed.*` is the smudge (this page is not made out
 * yet). They are separate fields on purpose; summing them is the defect this
 * change exists to end (engine/journal.ts, the round-12 block).
 *
 * Everything it returns is real persisted state (viewed-flags + the letters'
 * opened-flags), never `recentEvents` — which the day slice prunes at dusk and
 * which therefore made the old markers expire on their own overnight
 * (AAA 11.20).
 *
 * Zustand hygiene: it selects only stable references (the volume object, the
 * flags array, a number, the dayRecords array) and derives inside `useMemo`.
 * Returning a fresh object straight out of a selector is a new snapshot every
 * render and loops the subscription (React #185) — see the note in
 * ChroniclesPage.
 */

import { useMemo } from 'react';
import { useManorStore } from '../../app/store';
import { getVolumeContent } from '../../app/content/volumes';
import {
  glancedFragmentIds, journalUnread, NOTHING_UNREAD, viewedFragmentIds, type JournalUnread,
} from '../../engine/journal';
import {
  arrivedLetters, legibleDroughtDays, openedLetterIds, sealedFragmentIds,
} from '../../engine/volume';

export function useJournalUnread(): JournalUnread {
  const volume = useManorStore((s) => s.volume);
  const flags = useManorStore((s) => s.flags);
  const day = useManorStore((s) => s.day?.day ?? s.volume.day);
  const dayRecords = useManorStore((s) => s.chronicles.dayRecords);

  return useMemo(() => {
    const content = getVolumeContent(volume.volumeId);
    // An unauthored/imported volume has nothing filed and nothing to read —
    // and must not mint a marker the player can never clear (AAA 11.21).
    if (!content) return NOTHING_UNREAD;
    const opened = openedLetterIds(content.id, flags);
    const tray = arrivedLetters(content, volume, day, {
      // Round 13: the drought the mercy channel runs on counts days she LEARNED
      // something, not days a smudge arrived (engine/volume.legibleDroughtDays).
      droughtDays: legibleDroughtDays(volume.volumeId, flags, dayRecords),
      openedIds: opened,
    });
    return journalUnread(content, volume, {
      viewedIds: viewedFragmentIds(volume.volumeId, flags),
      // Round 12: the two other halves of the truth — which pages she has seen
      // as smudges, and which pages are still smudges. Both chains (wax and
      // seal) come out of the one derivation, so the entrance, the tabs and
      // the cards cannot disagree about either.
      glancedIds: glancedFragmentIds(volume.volumeId, flags),
      sealedIds: sealedFragmentIds(volume.volumeId, flags),
      arrivedLetterIds: tray.map((l) => l.id),
      openedLetterIds: opened,
    });
  }, [volume, flags, day, dayRecords]);
}
