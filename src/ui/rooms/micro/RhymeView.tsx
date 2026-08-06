/**
 * The Music Room — rhyme chain view. OWNER: A5.
 *
 * "The ear decides, not the page" — the room's framing pre-warns the
 * eye-rhyme trap (fairness, the AAA 2.10 spirit). Misses and near-rhymes
 * are free with teaching toasts; found rhymes fill notes on a staff;
 * finishing a verse slides the next prompt in. Valid-word chime pitch
 * rises with progress (AAA 1.9's strict-upgrade idea, silent-safe R.4).
 * Input is a native field ≥16px (no iOS zoom, AAA 7.9).
 */

import { useEffect, useRef, useState } from 'react';
import type { RoomViewProps } from '../registry';
import { currentRhymeRound, type RhymePuzzle } from '../../../engine/puzzles/rhyme';
import type { RhymeAction, RhymeRoomState } from '../../../engine/puzzles/rhyme-adapter';
import { sfx } from '../../../app/sound';
import './a5micro.css';

type Toast = { kind: 'good' | 'bad' | 'info'; text: string } | null;

export default function RhymeView({ puzzle, state, tier, dispatch }: RoomViewProps<RhymePuzzle, RhymeRoomState, RhymeAction>) {
  const [word, setWord] = useState('');
  const [toast, setToast] = useState<Toast>(null);
  const [shaking, setShaking] = useState(false);
  const [promptIn, setPromptIn] = useState(false);

  const handledAttempt = useRef(0);
  const lastRound = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const won = state.rh.status === 'won';
  const round = currentRhymeRound(puzzle, state.rh);
  const stepCost = tier === 3 ? 3 : 2;

  // New round → prompt slides in.
  useEffect(() => {
    if (state.rh.round !== lastRound.current) {
      lastRound.current = state.rh.round;
      setPromptIn(true);
      later(() => setPromptIn(false), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.rh.round]);

  useEffect(() => {
    if (state.attempts === handledAttempt.current) return;
    handledAttempt.current = state.attempts;
    const fb = state.lastFeedback;
    if (!fb) return;
    const show = (t: Toast, ms = 1700) => { setToast(t); later(() => setToast(null), ms); };
    switch (fb.kind) {
      case 'found':
        sfx.correct();
        if (fb.roundComplete && !fb.won) show({ kind: 'good', text: 'The verse resolves — a new line begins.' });
        else if (!fb.won) show({ kind: 'good', text: 'It sings.' }, 1000);
        else sfx.victory();
        break;
      case 'decoy':
        sfx.wrong();
        setShaking(true);
        later(() => setShaking(false), 340);
        show({ kind: 'bad', text: `${fb.word} — spelled like kin, sounded a stranger. · −${stepCost} steps` });
        break;
      case 'near':
        show({ kind: 'info', text: `${fb.word} — the sound is there, but the stress falls elsewhere. No charge.` });
        break;
      case 'homophone':
        show({ kind: 'info', text: 'The very same sound — an echo, not a rhyme.' });
        break;
      case 'prompt':
        show({ kind: 'info', text: 'A word cannot rhyme with itself, dear.' }, 1100);
        break;
      case 'miss':
        setShaking(true);
        later(() => setShaking(false), 340);
        show({ kind: 'info', text: 'No rhyme the room can hear — no harm done.' }, 1200);
        break;
      case 'already-found':
        show({ kind: 'info', text: 'Already sung.' }, 900);
        break;
      case 'already-tried':
        show({ kind: 'info', text: 'Tried that one — it still doesn’t sing.' }, 1100);
        break;
      case 'hummed':
        sfx.glyph();
        break;
      case 'nothing-to-hum':
        show({ kind: 'info', text: 'The room has hummed all it knows.' }, 1100);
        break;
      case 'finished':
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempts]);

  const submit = () => {
    if (won || !word.trim()) return;
    dispatch({ type: 'submit', word });
    setWord('');
  };

  return (
    <div className="m2 m2--music">
      <header className="m2__head">
        <h2 className="m2__title">The Music Room</h2>
        <p className="m2__sub">The ear decides, not the page.</p>
      </header>

      {won ? (
        <div className="m2-done">
          <div className="m2-done__title">The chord lands.</div>
          <p className="m2-done__line">
            {state.rh.foundRounds.map((r) => r.join(' · ')).join('  —  ')}
          </p>
          <p className="m2-done__line">
            {state.rh.decoysHit.length === 0 && state.rh.hintsUsed === 0
              ? 'Sung clean, first breath to last.'
              : 'The Music Room applauds all the same.'}
          </p>
        </div>
      ) : (
        <>
          <div className={`m2-card mr-prompt${promptIn ? ' mr-prompt--in' : ''}`}>
            <div className="mr-prompt__eyebrow">
              Verse {state.rh.round + 1} of {puzzle.rounds.length} — rhymes with
            </div>
            <div className="mr-prompt__word">{round.prompt}</div>
            <div className="mr-prompt__meta tabular-nums">
              {state.rh.found.length} of {round.target} sung
            </div>
            <div className="mr-staff" aria-hidden>
              {Array.from({ length: round.target }, (_, i) => (
                <span key={i} className={`mr-note${i < state.rh.found.length ? ' mr-note--sung' : ''}`} />
              ))}
            </div>
          </div>

          {state.rh.silhouettes.length > 0 && (
            <div className="m2-row">
              {state.rh.silhouettes.map((s, i) => (
                <span key={i} className="mr-sil">
                  {s.first}{' ‒'.repeat(s.length - 1)}
                </span>
              ))}
            </div>
          )}

          <div className={`m2-row${shaking ? ' m2-shake' : ''}`} style={{ flexWrap: 'nowrap' }}>
            <input
              className="m2-input"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Sing a rhyme…"
              aria-label="Your rhyme"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
            />
            <button className="m2-btn m2-btn--primary" onClick={submit} disabled={!word.trim()}>
              Sing
            </button>
          </div>

          <div className="m2-toastslot" aria-live="polite">
            {toast && <span className={`m2-toast m2-toast--${toast.kind}`}>{toast.text}</span>}
          </div>

          <div className="m2-row">
            {state.rh.found.map((w) => (
              <span key={w} className="m2-chip m2-chip--accent m2-chip--in">{w}</span>
            ))}
            {state.rh.decoysHit.map((w) => (
              <span key={w} className="m2-chip m2-chip--wax">{w}</span>
            ))}
            {state.rh.triedMisses.map((w) => (
              <span key={w} className="m2-chip m2-chip--muted">{w}</span>
            ))}
          </div>

          <div className="m2-row">
            <button className="m2-btn" onClick={() => dispatch({ type: 'hum' })}>
              Hum a bar · −{stepCost} steps
            </button>
          </div>
        </>
      )}
    </div>
  );
}
