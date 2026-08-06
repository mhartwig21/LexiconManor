/**
 * Chronicles — OWNER: A8 (Platform). The manor's ledger of days.
 *
 * Accumulative, unloseable stats only (AAA R.3): days kept, rooms solved,
 * fragments found, keepsakes. The v1 era is archived as "earlier
 * expeditions" (chronicles.runHistoryV1, preserved verbatim by the
 * migration); the parked perk data stays untouched pending AAA §10.1.
 *
 * Also hosts the household settings (sound / music / ring-switch policy /
 * reduced motion — AAA 7.16), the travelling trunk (save-code export/import,
 * the Safari-tab ↔ installed-app storage bridge, AAA 7.19), and the hidden
 * storage debug panel (AAA 7.18).
 *
 * ROUND 9 — SECTION ORDER IS LOAD-BEARING (AAA 11.23, major).
 * The settings block used to start at scrollTop 1321 in a 589px scroller
 * (1462 in a 414px one at 375x667) and the trunk at ~1726 / ~1790: two and a
 * half to four screens of scrolling past the day ledger and the twelve-plate
 * keepsake shelf. Worse, the ledger grows a row per day played, so day 30
 * buried them further than day 1 — the burial deepened with campaign length.
 * The tap count technically read 2, but 11.23's shape ("one tap to the
 * surface, one to the control") is about what the player experiences.
 *
 * The order is therefore: everything BOUNDED first, the one thing that GROWS
 * last. Settings and the trunk at scroll 0; the keepsake shelf (fixed at the
 * catalog size) next, because it is what the Chronicles unread mark points at;
 * the day ledger, the only unbounded section, at the bottom where its growth
 * costs nothing. Any new section belongs above the ledger unless it also grows.
 */

import { useEffect, useRef, useState } from 'react';
import { useManorStore } from '../app/store';
import { exportSaveCode, importSaveCode, persistSave, SAVE_KEY } from '../app/save';
import { selectSave } from '../app/store';
import { getStorageDebugInfo, type StorageDebugInfo } from '../app/platform/persistence';
import { applyAudioSessionPolicy } from '../app/music/context';
import { KEEPSAKES, keepsakeShelf } from '../engine/achievements';
import { rowName } from '../engine/economy/steps';
import type { DayRecord } from '../engine/types';
import BackLink from '../ui/chrome/BackLink';
import HouseSoFar from '../ui/chrome/HouseSoFar';
import { keepsakeSeenFlag, unseenKeepsakes } from '../ui/moment/mantel';
import './chronicles.css';

const CAUSE_COPY: Record<string, string> = {
  'steps-exhausted': 'the dusk came softly',
  'retired-early': 'retired early, tea in hand',
  'volume-solved': 'the word was spoken',
};

function DayRow({ r }: { r: DayRecord }) {
  return (
    <div className="chron__day">
      <span className="chron__day-name">Day {r.day}</span>
      <span className="chron__day-detail">
        {CAUSE_COPY[r.cause] ?? r.cause} · {r.roomsSolved}/{r.roomsDrafted} rooms · {r.stepsSpent} steps
        {r.stepsRefunded ? ` · +${r.stepsRefunded} back` : ''}
        {r.highestRow ? ` · ${rowName(r.highestRow)}` : ''}
        {r.fragmentsFound > 0 ? ` · ${r.fragmentsFound} fragment${r.fragmentsFound === 1 ? '' : 's'}` : ''}
      </span>
    </div>
  );
}

function Setting(props: { label: string; hint?: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="chron__setting" onClick={props.onToggle}>
      <span>
        {props.label}
        {props.hint ? <div className="chron__hint">{props.hint}</div> : null}
      </span>
      <span className={`chron__pip${props.on ? ' is-on' : ''}`} aria-hidden />
    </button>
  );
}

export default function ChroniclesPage() {
  const records = useManorStore((s) => s.chronicles.dayRecords);
  // NB: never `?? []` inside a zustand selector — a fresh array every render
  // is a new snapshot and loops the subscription (React #185).
  const legacyRuns = useManorStore((s) => s.chronicles.runHistoryV1) ?? [];
  const earned = useManorStore((s) => s.earnedAchievementIds);
  const fragments = useManorStore((s) => s.volume.foundFragmentIds.length);
  const settings = useManorStore((s) => s.settings);
  const toggleSound = useManorStore((s) => s.toggleSound);
  const toggleMusic = useManorStore((s) => s.toggleMusic);
  const toggleReducedMotion = useManorStore((s) => s.toggleReducedMotion);

  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState(false);
  const trunkRef = useRef<HTMLTextAreaElement>(null);
  const [debug, setDebug] = useState<StorageDebugInfo | null>(null);

  useEffect(() => {
    void getStorageDebugInfo().then(setDebug);
  }, []);

  /**
   * THE MARKER RETIRES ON VIEWING, AND ON NOTHING ELSE (AAA 11.20).
   *
   * Not on mount: the shelf is the third section down, so "the page rendered"
   * is not "she looked at it". An IntersectionObserver against the scroller
   * makes the claim true — the flag is written when the plates are actually on
   * the glass. Where the observer does not exist (old engines, jsdom) the
   * fallback is to mark on mount, which errs toward clearing a marker rather
   * than showing one she can never clear (11.21's other half).
   */
  const shelfRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const markSeen = () => {
      const s = useManorStore.getState();
      for (const k of unseenKeepsakes(s.earnedAchievementIds, s.flags)) {
        s.setFlag(keepsakeSeenFlag(k.id));
      }
    };
    const node = shelfRef.current;
    if (typeof IntersectionObserver === 'undefined' || !node) { markSeen(); return; }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) markSeen(); },
      { root: node.closest('.chron__ledger'), threshold: 0.15 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const roomsSolved = records.reduce((n, r) => n + r.roomsSolved, 0);
  // The whole shelf, always — earned plates and named-but-empty ones. Before
  // round 7 this section rendered only `earned.length > 0`, over a catalog
  // nothing could ever award, so it was structurally invisible (AAA 11.17).
  const shelf = keepsakeShelf(earned);
  const earnedCount = shelf.filter((s) => s.earned).length;

  // Slice toggle landed (integration): flip the setting, then apply the
  // audio-session policy from the fresh state.
  const toggleMuteBypass = () => {
    useManorStore.getState().toggleMuteSwitchBypass();
    applyAudioSessionPolicy(useManorStore.getState().settings.muteSwitchBypass);
  };

  const copyCode = () => {
    const code = exportSaveCode(selectSave(useManorStore.getState()));
    if (trunkRef.current) trunkRef.current.value = code;
    try {
      void navigator.clipboard?.writeText(code);
    } catch {
      /* textarea still holds the code for manual copy */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const importCode = () => {
    const code = trunkRef.current?.value.trim();
    if (!code) return;
    const save = importSaveCode(code);
    if (!save) {
      setImportError(true);
      setTimeout(() => setImportError(false), 2000);
      return;
    }
    // Write directly and reload — the store hydrates from the key at boot.
    persistSave(save);
    try {
      if (localStorage.getItem(SAVE_KEY)) location.reload();
    } catch {
      setImportError(true);
    }
  };

  return (
    <div className="chron">
      <div className="chron__head">
        <BackLink />
        <h2 className="chron__title">Chronicles</h2>
      </div>

      <div className="chron__totals">
        <div className="chron__stat"><b>{records.length}</b><span>days</span></div>
        <div className="chron__stat"><b>{roomsSolved}</b><span>rooms solved</span></div>
        <div className="chron__stat"><b>{fragments}</b><span>fragments</span></div>
        <div className="chron__stat">
          <b>
            {earnedCount}
            <span className="chron__of">of {KEEPSAKES.length}</span>
          </b>
          <span>keepsakes</span>
        </div>
      </div>

      <div className="chron__ledger panel-scroll">
        {/* --- BOUNDED, AND FIRST (AAA 11.23) ------------------------------ */}
        <h3 className="chron__section">Household settings</h3>
        <Setting label="Sound" on={settings.soundEnabled} onToggle={toggleSound} />
        <Setting label="Music" on={settings.musicEnabled} onToggle={toggleMusic} />
        <Setting
          label="Play through the ring switch"
          hint="Sound even on silent."
          on={settings.muteSwitchBypass}
          onToggle={toggleMuteBypass}
        />
        <Setting label="Reduce motion" on={settings.reducedMotion} onToggle={toggleReducedMotion} />

        {/* ROUND 9 — UNFOLDED, AND THE VERBS LEAD (AAA 11.23/11.26).
            "Open the trunk" was a third tap in front of a two-tap contract, and
            after opening it the pack control measured outside the fold. Both
            verbs are simply here now, and they sit ABOVE the code box rather
            than below it: measured at 375x667 that is the ~70px that decides
            whether the recovery path is on the glass at scroll 0 or under it.
            The box is the workspace the verbs fill or read; the verbs are the
            controls 11.23 counts. */}
        <h3 className="chron__section">Travelling trunk</h3>
        <p className="chron__hint">
          Carry your journal between Safari, the installed app, and another device.
        </p>
        <div className="chron__trunk">
          <div className="chron__trunk-row chron__trunk-row--lead">
            <button type="button" onClick={copyCode}>{copied ? 'Copied' : 'Pack (copy code)'}</button>
            <button type="button" onClick={importCode}>
              {importError ? 'That code will not open' : 'Unpack (import)'}
            </button>
          </div>
          <textarea
            ref={trunkRef}
            placeholder="Your save code appears here — or paste one to unpack."
            aria-label="Save code"
          />
        </div>

        <h3 className="chron__section">Keepsakes</h3>
        <p className="chron__hint">
          Small things the house keeps for you. Nothing here can be lost.
        </p>
        <ul className="chron__keepsakes" ref={shelfRef}>
          {shelf.map(({ keepsake, earned: got }) => (
            <li
              key={keepsake.id}
              className={`chron__keepsake${got ? ' is-earned' : ''}`}
              data-state={got ? 'earned' : 'waiting'}
            >
              {/* Double-encoded per AAA 6.3/11.22: a pressed seal vs an empty
                  ring — the state survives a grayscale screenshot and needs no
                  motion to read. */}
              <span className="chron__seal" aria-hidden="true">{got ? '✦' : '◦'}</span>
              <span className="chron__keepsake-body">
                <span className="chron__keepsake-name">{keepsake.name}</span>
                <span className="chron__keepsake-note">{keepsake.description}</span>
              </span>
              <span className="chron__keepsake-state">{got ? 'kept' : 'not yet'}</span>
            </li>
          ))}
        </ul>

        {/* --- THE ONE SECTION THAT GROWS, LAST --------------------------- */}
        {/* The two meta-arcs, stated (AAA 4.10d / 11.16). Until round 7
            nothing in the shipped UI ever said the tea grows, what it is worth
            now, or what buys the next rung — so the player experienced the
            campaign's only progression as "some mornings I have more steps". */}
        <h3 className="chron__section">The house, so far</h3>
        <HouseSoFar />

        <h3 className="chron__section">Days in the manor</h3>
        {records.length === 0 ? (
          <p className="chron__empty">The ledger waits for your first day.</p>
        ) : (
          [...records].reverse().map((r) => <DayRow key={`${r.day}-${r.endedAt}`} r={r} />)
        )}

        {legacyRuns.length > 0 && (
          <>
            <h3 className="chron__section">Earlier expeditions</h3>
            <p className="chron__hint">
              {legacyRuns.length} expedition{legacyRuns.length === 1 ? '' : 's'} from before the manor,
              kept safe in the archive.
            </p>
          </>
        )}

        <details className="chron__debug">
          <summary>Beneath the floorboards</summary>
          <dl>
            <dt>storage.persist</dt>
            <dd>{debug ? (debug.persistGranted === null ? 'unknown' : debug.persistGranted ? 'granted' : 'not granted') : '…'}</dd>
            <dt>usage</dt>
            <dd>{debug?.usage != null ? `${Math.round(debug.usage / 1024)} KB` : 'n/a'}</dd>
            <dt>quota</dt>
            <dd>{debug?.quota != null ? `${Math.round(debug.quota / (1024 * 1024))} MB` : 'n/a'}</dd>
            <dt>save size</dt>
            <dd>{debug ? `${Math.round(debug.saveBytes / 1024)} KB` : '…'}</dd>
            <dt>mirror</dt>
            <dd>{debug ? (debug.mirrorHealthy ? 'healthy' : 'empty') : '…'}</dd>
          </dl>
        </details>
      </div>
    </div>
  );
}
