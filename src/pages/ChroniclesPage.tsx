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
 */

import { useEffect, useRef, useState } from 'react';
import { useManorStore } from '../app/store';
import { exportSaveCode, importSaveCode, persistSave, SAVE_KEY } from '../app/save';
import { selectSave } from '../app/store';
import { getStorageDebugInfo, type StorageDebugInfo } from '../app/platform/persistence';
import { applyAudioSessionPolicy } from '../app/music/context';
import { ACHIEVEMENTS } from '../engine/effects';
import type { DayRecord } from '../engine/types';
import BackLink from '../ui/chrome/BackLink';
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

  const [trunkOpen, setTrunkOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState(false);
  const trunkRef = useRef<HTMLTextAreaElement>(null);
  const [debug, setDebug] = useState<StorageDebugInfo | null>(null);

  useEffect(() => {
    void getStorageDebugInfo().then(setDebug);
  }, []);

  const roomsSolved = records.reduce((n, r) => n + r.roomsSolved, 0);
  const badges = ACHIEVEMENTS.filter((a) => earned.includes(a.id));

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
        <div className="chron__stat"><b>{badges.length}</b><span>keepsakes</span></div>
      </div>

      <div className="chron__ledger panel-scroll">
        <h3 className="chron__section">Days in the manor</h3>
        {records.length === 0 ? (
          <p className="chron__empty">The ledger waits for your first day.</p>
        ) : (
          [...records].reverse().map((r) => <DayRow key={`${r.day}-${r.endedAt}`} r={r} />)
        )}

        {badges.length > 0 && (
          <>
            <h3 className="chron__section">Keepsakes</h3>
            <div className="chron__badges">
              {badges.map((a) => (
                <span key={a.id} className="chron__badge" title={a.name}>
                  {a.name}
                </span>
              ))}
            </div>
          </>
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

        <h3 className="chron__section">Household settings</h3>
        <Setting label="Sound" on={settings.soundEnabled} onToggle={toggleSound} />
        <Setting label="Music" on={settings.musicEnabled} onToggle={toggleMusic} />
        <Setting
          label="Play through the ring switch"
          hint="Hear the manor even with the phone switched to silent."
          on={settings.muteSwitchBypass}
          onToggle={toggleMuteBypass}
        />
        <Setting label="Reduce motion" on={settings.reducedMotion} onToggle={toggleReducedMotion} />

        <h3 className="chron__section">Travelling trunk</h3>
        <p className="chron__hint">
          Pack your journal into a code to carry it between Safari and the installed app, or to
          another device.
        </p>
        {!trunkOpen ? (
          <div className="chron__trunk-row">
            <button type="button" onClick={() => setTrunkOpen(true)}>Open the trunk</button>
          </div>
        ) : (
          <div className="chron__trunk">
            <textarea
              ref={trunkRef}
              placeholder="Your save code appears here — or paste one to unpack."
              aria-label="Save code"
            />
            <div className="chron__trunk-row">
              <button type="button" onClick={copyCode}>{copied ? 'Copied' : 'Pack (copy code)'}</button>
              <button type="button" onClick={importCode}>
                {importError ? 'That code will not open' : 'Unpack (import)'}
              </button>
            </div>
          </div>
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
