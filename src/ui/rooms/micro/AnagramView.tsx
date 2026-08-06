/**
 * The Vestibule — Anagram view. OWNER: A4.
 *
 * Tile tray + answer slots, built for 390px one-handed play: tap tiles to
 * place, tap a placed slot to take it back, free unlimited shuffle. A wrong
 * full arrangement shakes but is NOT auto-cleared (the player edits it —
 * Connections precedent, AAA 2.4). Wrong tries stay listed struck-through
 * (memory prosthetic, AAA 3.3). Hint turns over the next letter of the
 * answer (step-priced; the final letter is never revealed — the last step
 * is always hers). Win: staggered letter dance ≤2s, distinct from all
 * in-play juice (AAA 3.4).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import type { AnagramPuzzle } from '../../../engine/puzzles/anagram';
import type { AnagramAction, AnagramRoomState } from '../../../engine/puzzles/anagram-adapter';
import { currentRound } from '../../../engine/puzzles/anagram';
import { sfx } from '../../../app/sound';
import './micro.css';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

interface TrayTile { ch: string; key: number }

export default function AnagramView({ puzzle, state, tier, dispatch }: RoomViewProps<AnagramPuzzle, AnagramRoomState, AnagramAction>) {
  const [picked, setPicked] = useState<number[]>([]);   // tray keys, in slot order
  const [order, setOrder] = useState<number[]>([]);     // tray display order
  const [shuffling, setShuffling] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const handledAttempt = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const won = state.engine.status === 'won';
  const round = currentRound(puzzle, state.engine);
  const prefix = won ? '' : round.answer.slice(0, state.engine.revealedCount);
  const hintCost = tier === 3 ? 3 : 2;

  // Tray = the scramble minus the letters consumed by the revealed prefix.
  const tray = useMemo<TrayTile[]>(() => {
    const remaining = round.scramble.map((ch, key) => ({ ch, key }));
    for (const p of prefix) {
      const i = remaining.findIndex((t) => t.ch === p);
      if (i >= 0) remaining.splice(i, 1);
    }
    return remaining;
  }, [round, prefix]);

  // New round or new reveal → fresh tray, empty slots.
  useEffect(() => {
    setPicked([]);
    setOrder(tray.map((t) => t.key));
    setToast(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed to the inputs that change the tray
  }, [puzzle.id, state.engine.round, state.engine.revealedCount]);

  useEffect(() => {
    if (state.attempts === handledAttempt.current) return;
    handledAttempt.current = state.attempts;
    const fb = state.lastFeedback;
    if (!fb) return;
    switch (fb.kind) {
      case 'valid':
        if (fb.won) {
          sfx.victory();
        } else {
          sfx.correct();
          setToast({ kind: 'good', text: `“${fb.word}” — the letters settle. Another lock…` });
          later(() => setToast(null), 1400);
        }
        break;
      case 'invalid':
        if (fb.reason === 'not-a-word') {
          sfx.wrong();
          setShaking(true);
          later(() => setShaking(false), 340);
          setToast({ kind: 'bad', text: `“${fb.word}” isn't in the dictionary · −${hintCost} steps` });
          later(() => setToast(null), 1600);
        } else if (fb.reason === 'already-tried') {
          setToast({ kind: 'info', text: 'Already tried — it stays on the list below.' });
          later(() => setToast(null), 1200);
        }
        break;
      case 'letter-revealed':
        sfx.glyph();
        setToast({ kind: 'good', text: `A letter turns over: ${fb.letter}` });
        later(() => setToast(null), 1300);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempts]);

  const slotsTotal = round.answer.length;
  const freeSlots = slotsTotal - prefix.length;
  const trayByKey = useMemo(() => new Map(tray.map((t) => [t.key, t])), [tray]);
  const word = prefix + picked.map((k) => trayByKey.get(k)?.ch ?? '').join('');
  const full = picked.length === freeSlots;

  const pickTile = (key: number) => {
    if (won || picked.length >= freeSlots || picked.includes(key)) return;
    sfx.tap();
    setPicked([...picked, key]);
  };
  const unpick = (slotIndex: number) => {
    const i = slotIndex - prefix.length;
    if (won || i < 0 || i >= picked.length) return;
    sfx.tap();
    setPicked(picked.filter((_, j) => j !== i));
  };
  const shuffleTray = () => {
    if (shuffling) return;
    setShuffling(true);
    later(() => {
      setOrder((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [next[i], next[j]] = [next[j]!, next[i]!];
        }
        return next;
      });
      setShuffling(false);
    }, 180);
  };
  const submit = () => {
    if (!won && full) dispatch({ type: 'submit', word });
  };

  const canHint = !won && state.engine.revealedCount < round.answer.length - 1;

  return (
    <div className="mic mic--vestibule">
      <header className="mic__head">
        <h2 className="mic__title">The Vestibule</h2>
        <p className="mic__sub">The letters arrived jumbled. Set them right before you go further in.</p>
      </header>

      <div className="mic__meta tabular-nums">
        Word {Math.min(state.engine.round + 1, puzzle.rounds.length)} of {puzzle.rounds.length}
        {state.engine.solvedWords.length > 0 && ' · solved: '}
        {state.engine.solvedWords.map((w) => (
          <span key={w} className="mic-chip mic-chip--solved" style={{ marginLeft: 4 }}>{w}</span>
        ))}
      </div>

      {won && state.lastFeedback?.kind === 'valid' ? (
        <div className="mic-done">
          <div className="va-reveal">
            {[...state.lastFeedback.word].map((ch, i) => (
              <span key={i} className="va-reveal__ch" style={{ animationDelay: `${i * 90}ms` }}>{ch}</span>
            ))}
          </div>
          <p className="mic-done__line">
            {state.costedMistakes === 0 && state.hintsBought === 0
              ? 'Not a letter out of place. The Vestibule approves.'
              : 'The letters remember their order. Onward.'}
          </p>
        </div>
      ) : (
        <>
          <div className={`va-slots${shaking ? ' mic-shake' : ''}`}>
            {Array.from({ length: slotsTotal }, (_, i) => {
              if (i < prefix.length) {
                return <span key={`lock-${i}`} className="va-slot va-slot--locked">{prefix[i]}</span>;
              }
              const pickIdx = i - prefix.length;
              const key = picked[pickIdx];
              const ch = key !== undefined ? trayByKey.get(key)?.ch : undefined;
              return (
                <button
                  key={`slot-${i}`}
                  className={`va-slot${ch ? ' va-slot--filled' : ' va-slot--empty'}`}
                  onPointerDown={() => ch && unpick(i)}
                  aria-label={ch ? `Return ${ch} to the tray` : 'Empty slot'}
                >
                  {ch ?? ''}
                </button>
              );
            })}
          </div>

          <div className={`va-tray${shuffling ? ' va-tray--shuffling' : ''}`}>
            {order.map((key) => {
              const tile = trayByKey.get(key);
              if (!tile) return null;
              const used = picked.includes(key);
              return (
                <button
                  key={key}
                  className={`va-tile${used ? ' va-tile--used' : ''}`}
                  onPointerDown={() => !used && pickTile(key)}
                  aria-label={`Place ${tile.ch}`}
                >
                  {tile.ch}
                </button>
              );
            })}
          </div>

          <div className="mic-toastslot" aria-live="polite">
            {toast && <span className={`mic-toast mic-toast--${toast.kind}`}>{toast.text}</span>}
          </div>

          <div className="mic-row">
            <button className="mic-btn" onClick={shuffleTray}>Shuffle</button>
            <button className="mic-btn mic-btn--primary" onClick={submit} disabled={!full}>
              Set it right
            </button>
            <button className="mic-btn" onClick={() => dispatch({ type: 'reveal-letter' })} disabled={!canHint}>
              Turn a letter · −{hintCost}
            </button>
          </div>

          {state.engine.triedWrong.length > 0 && (
            <div className="mic-row">
              {state.engine.triedWrong.map((w) => (
                <span key={w} className="mic-chip mic-chip--missed">{w}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
