/**
 * WHEREABOUTS — the aside. OWNER: A6 (Dialogue).
 *
 * One thing Mrs. Bramble says in passing on the morning card, about somebody
 * the player has not met. Where it comes from, why it is here and not in her
 * morning conversation, and how it is paced: engine/dialogue/whereabouts.ts.
 *
 * The copy is authored (`bramble.where.*` in her own JSON, typeset and
 * voice-linted with the rest of her lines) and RENDERED via `selectTaggedLine`
 * — no scene is played, no pacing valve is spent, nothing is marked seen, and
 * the day's conversation is exactly what it would have been. The same
 * mechanism the Sanctum door uses to quote the Portrait (AAA 5.13).
 *
 * It renders nothing at all — no empty band, no placeholder — on the two-out-
 * of-three mornings that are not mention mornings, and forever once everyone
 * is met. The card must not develop a hole where a hint sometimes goes.
 */

import { useManorStore } from '../../app/store';
import { getDialogueFile } from '../../engine/dialogue/content';
import { selectTaggedLine } from '../../engine/dialogue/select';
import { whereaboutsPrefix, whereaboutsRotation } from '../../engine/dialogue/whereabouts';
import { quoted } from '../journal/quote';
import './dialogue.css';

export default function WhereaboutsAside() {
  const day = useManorStore((s) => s.day?.day ?? s.volume.day);
  const buildDialogueQuery = useManorStore((s) => s.buildDialogueQuery);

  const rotation = whereaboutsRotation(day);
  let text: string | null = null;
  if (rotation.length > 0) {
    const file = getDialogueFile('bramble');
    const query = buildDialogueQuery('bramble', 'morning');
    for (const who of rotation) {
      // A met character has no eligible line (the authored `not met.<c>` gate),
      // so the turn simply passes on down the rotation.
      const node = selectTaggedLine(file, query, whereaboutsPrefix(who));
      if (node) { text = node.lines[0]?.text ?? null; break; }
    }
  }
  if (!text) return null;

  return (
    <p className="dlg-passing">
      {/* The quotes belong to the UI, never to the content (ui/journal/quote). */}
      <span className="dlg-passing__said">{quoted(text)}</span>
      <span className="dlg-passing__who">Mrs. Bramble, on her way past</span>
    </p>
  );
}
