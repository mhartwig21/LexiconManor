import { useState } from 'react';
import { useGameStore } from '../app/store';
import { glyphById } from '../engine/effects';
import type { GameMode } from '../engine/types';

const EFFECT_ICON: Record<string, string> = {
  heal_mind: '♥',
  damage_shield: '⛨',
  score_multiplier: '✕',
  reveal_hint: '☼',
  time_extension: '⌛',
  entropy_immunity: '❄',
  instant_solve: '⚡',
  skip_puzzle: '➤',
};

/**
 * In-game glyph inventory. Run-level glyphs (heal/shield/multiplier/immunity)
 * resolve internally; puzzle-level ones call back into the active mode.
 */
export function GlyphTray({
  mode,
  canExtendTime = false,
  onPuzzleAction,
}: {
  mode: GameMode;
  canExtendTime?: boolean;
  onPuzzleAction: (action: 'reveal_hint' | 'extend_time' | 'instant_solve' | 'skip', value: number) => void;
}) {
  const run = useGameStore((s) => s.save.activeRun);
  const useGlyphInGame = useGameStore((s) => s.useGlyphInGame);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (!run || run.glyphInventory.length === 0) return null;

  const activate = (glyphId: string) => {
    setConfirming(null);
    const result = useGlyphInGame(glyphId, mode);
    if ('error' in result) {
      const messages: Record<string, string> = {
        'wrong-mode': 'That glyph has no power here.',
        'insufficient-mind': 'Not enough mind points to pay its price.',
        'not-in-inventory': 'The glyph is gone.',
        'no-run': '',
      };
      setNotice(messages[result.error] ?? 'The glyph resists.');
      setTimeout(() => setNotice(null), 2500);
      return;
    }
    const glyph = glyphById(glyphId);
    if (result.action === 'none') {
      setNotice(`${glyph.name} takes hold.`);
      setTimeout(() => setNotice(null), 2500);
    } else {
      onPuzzleAction(result.action as Parameters<typeof onPuzzleAction>[0], result.value);
    }
  };

  return (
    <div className="glyph-tray">
      {run.glyphInventory.map((id, i) => {
        const glyph = glyphById(id);
        const unusableHere =
          (glyph.modes && !glyph.modes.includes(mode)) || (glyph.effect.type === 'time_extension' && !canExtendTime);
        const key = `${id}-${i}`;
        return (
          <button
            key={key}
            className={`glyph-chip glyph-chip--${glyph.rarity}${unusableHere ? ' glyph-chip--dim' : ''}`}
            title={`${glyph.name} — ${glyph.description}${unusableHere ? ' (no power here)' : ''}`}
            onClick={() => !unusableHere && setConfirming(confirming === key ? null : key)}
            disabled={unusableHere}
          >
            <span className="glyph-chip__icon">{EFFECT_ICON[glyph.effect.type] ?? '◆'}</span>
            <span className="glyph-chip__name">{glyph.name.replace('Glyph of the ', '').replace('Glyph of ', '')}</span>
          </button>
        );
      })}
      {confirming && (
        <div className="glyph-confirm pop-in">
          <span style={{ fontSize: 'var(--text-sm)' }}>{glyphById(confirming.replace(/-\d+$/, '')).description}</span>
          <button className="btn btn--primary" style={{ minHeight: 34, padding: '0.2rem 0.8rem' }} onClick={() => activate(confirming.replace(/-\d+$/, ''))}>
            Invoke
          </button>
          <button className="btn" style={{ minHeight: 34, padding: '0.2rem 0.8rem' }} onClick={() => setConfirming(null)}>
            Keep
          </button>
        </div>
      )}
      {notice && (
        <div className="glyph-confirm rise-fade" style={{ color: 'var(--info)' }}>
          {notice}
        </div>
      )}
    </div>
  );
}
