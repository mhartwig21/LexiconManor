/**
 * useJournalUnread — OWNER: A7 (Mystery). The single source for every level of
 * the unread chain (AAA 11.19): the blueprint's Journal entrance, the journal's
 * ribbon tabs, and the per-card markers all read THIS, so a dot on the entrance
 * and a dot on a tab can never disagree about what is unread.
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
import { journalUnread, NOTHING_UNREAD, viewedFragmentIds, type JournalUnread } from '../../engine/journal';
import { arrivedLetters, fragmentDroughtDays, openedLetterIds } from '../../engine/volume';

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
      droughtDays: fragmentDroughtDays(dayRecords),
      openedIds: opened,
    });
    return journalUnread(content, volume, {
      viewedIds: viewedFragmentIds(volume.volumeId, flags),
      arrivedLetterIds: tray.map((l) => l.id),
      openedLetterIds: opened,
    });
  }, [volume, flags, day, dayRecords]);
}
