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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useManorStore } from '../app/store';
import {
  exportSaveCode, importSaveCode, newVolumeSave, persistSave, SAVE_KEY,
} from '../app/save';
import { selectSave } from '../app/store';
import {
  getStorageDebugInfo, resetPersistence, type StorageDebugInfo,
} from '../app/platform/persistence';
import { allVolumes, nextVolumeContent } from '../app/content/volumes';
import { poolsReady } from '../app/pools';
import { applyAudioSessionPolicy } from '../app/music/context';
import { KEEPSAKES, keepsakeShelf } from '../engine/achievements';
import { rowName } from '../engine/economy/steps';
import type { DayRecord } from '../engine/types';
import BackLink from '../ui/chrome/BackLink';
import HouseSoFar from '../ui/chrome/HouseSoFar';
import { keepsakeSeenFlag, unseenKeepsakes } from '../ui/moment/mantel';
import './chronicles.css';

/**
 * The build stamp, compiled in by vite.config.ts (`define`) from the same
 * object written to dist/build-stamp.json. REVIEW_AA §0: two hostile reviews
 * were written against a stale dist and nobody — including the reviewers —
 * could tell. A report that names its edition is auditable; one that doesn't
 * is a rumour. This costs one line at the foot of Chronicles.
 *
 * `id` is the first 7 of a sha256 over every source file that can affect the
 * bundle, so it changes on any real edit, committed or not — which a git SHA
 * alone would not. Always defined: dev and vitest get DEV_STAMP.
 */
declare const __MANOR_BUILD__: {
  id: string;
  source: string;
  git: string | null;
  builtAt: string;
  via: string;
  base: string;
  files: number;
};

function BuildStampLine() {
  const b = __MANOR_BUILD__;
  const dev = b.via === 'dev';
  const when = b.builtAt ? b.builtAt.slice(0, 16).replace('T', ' ') + ' UTC' : 'not built';
  return (
    <p
      className="chron__build"
      data-testid="build-stamp"
      data-build-id={b.id}
      data-build-git={b.git ?? ''}
      data-build-at={b.builtAt}
      title={`source ${b.source}\ngit ${b.git ?? 'unknown'}\nvia ${b.via}\n${b.files} watched files`}
    >
      {dev ? (
        <>Edition <b>dev</b> · running from source, unbuilt</>
      ) : (
        <>Edition <b>{b.id}</b>{b.git ? ` · ${b.git}` : ''} · {when}</>
      )}
    </p>
  );
}

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

type ResetScope = 'new-volume' | 'erase-everything';

/** How long an armed confirm stays live before it forgets it was asked. */
const DISARM_MS = 5000;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * START OVER — the manor's two fresh starts (owner request, round 14).
 *
 * There was no way to begin again at all: once Volume 1's word was known the
 * campaign had no second act, and a tester could not get back to day 1 without
 * opening devtools. Two scopes, because they are genuinely different promises:
 *
 *  1. START A NEW VOLUME — a fresh forgotten word. Rolls the mystery onto the
 *     next authored volume through the volume machine's own `freshVolumeState`
 *     (what `advanceVolume` delegates to) and applies `endDay`'s nightly
 *     resets, so it is the ceremony's own path taken on demand rather than a
 *     second definition of "a new volume". Everything MANOR_DESIGN §9 calls
 *     permanent survives: affinity, dialogue-seen, the floorplan cabinet, the
 *     keepsake shelf, the Chronicles.
 *  2. ERASE EVERYTHING — a true factory reset. Every owned key, the v1 backup
 *     blob, the session guard and the IndexedDB mirror, then the front step as
 *     a first-time visitor. This is the one testing needs.
 *
 * SAFETY (AAA 11.7, and this is far past the retire control's blast radius).
 * The recognisable words lead each control ("Start a new volume", "Erase
 * everything") — the house's voice rides underneath as the note, never as the
 * label. Nothing destructive can fire from the section itself: opening a scope
 * only OPENS A PANEL, which names in plain numbers what goes and what stays,
 * offers the travelling trunk's export inline first, and then still requires
 * the two-tap arm/confirm the chrome's retire control established. Three
 * deliberate actions, an auto-disarm, and a "Never mind" that is the larger of
 * the two buttons on the row.
 *
 * COMPLETENESS. The commit ends in a document reload, always. A partial
 * in-memory reset cannot be trusted here: the moment queue, the notice rail,
 * the manor slice's module-scope draft session and three store watchers all
 * hold state outside zustand, and a fresh document is the only reset that is
 * provably complete for every one of them.
 */
function FreshStart({ onExport, exported }: { onExport: () => void; exported: boolean }) {
  const volumeId = useManorStore((s) => s.volume.volumeId);
  const fragments = useManorStore((s) => s.volume.foundFragmentIds.length);
  const keepsakes = useManorStore((s) => s.earnedAchievementIds.length);
  const days = useManorStore((s) => s.chronicles.dayRecords.length);
  const cards = useManorStore((s) => s.cabinet.unlockedCardIds.length);

  const [scope, setScope] = useState<ResetScope | null>(null);
  const [armed, setArmed] = useState(false);
  const [working, setWorking] = useState(false);
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (disarm.current) clearTimeout(disarm.current); }, []);

  /**
   * THE PANEL ANSWERS WHERE THE TAP WAS (AAA 11.3/11.11, round 16).
   *
   * `.chron__confirm` mounts INLINE inside the `.chron__ledger` scroller, and
   * the restart controls sit at the bottom of a long ledger. Measured at
   * 390x844 immediately after the tap, with no manual scrolling: the ledger
   * clipped at y=816 while the confirm spanned y=562..974 — the heading showed,
   * and all three of its controls ("Pack a copy first", "Never mind", "Erase
   * everything") sat below the clip and hit-tested null. Nothing was
   * unreachable, but the answer to her tap — INCLUDING the cancel, and
   * including the export the copy itself recommends taking first — was off
   * glass at the moment it appeared. "Never mind" being the invisible one is
   * the wrong half to hide on a destructive path.
   *
   * `block: 'nearest'` rather than 'center': it scrolls the minimum needed, so
   * on a viewport where the panel already fits nothing moves at all.
   */
  const confirmEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scope === null) return;
    const node = confirmEl.current;
    if (!node || typeof node.scrollIntoView !== 'function') return;
    node.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [scope]);

  /**
   * The volume to roll onto. The Chronicles page also renders UNDER the boot
   * gate (App.tsx keeps this one door open when the content chunk stalls), so
   * the pools may not be loaded — `getPools()` throws by design in that state.
   * Guarded rather than assumed: the new-volume control simply waits, while
   * "Erase everything" stays live, because a reset needs no content at all and
   * a stalled boot is exactly when someone wants it.
   */
  const target = useMemo(() => {
    if (!poolsReady()) return null;
    try {
      return nextVolumeContent(volumeId) ?? allVolumes()[0] ?? null;
    } catch {
      return null;
    }
  }, [volumeId]);
  const rereading = target !== null && target.id === volumeId;

  const close = () => {
    if (disarm.current) clearTimeout(disarm.current);
    setArmed(false);
    setScope(null);
  };

  const open = (next: ResetScope) => {
    if (disarm.current) clearTimeout(disarm.current);
    setArmed(false);
    setScope((cur) => (cur === next ? null : next));
  };

  const commit = () => {
    if (working || !scope) return;
    if (!armed) {
      setArmed(true);
      if (disarm.current) clearTimeout(disarm.current);
      disarm.current = setTimeout(() => setArmed(false), DISARM_MS);
      return;
    }
    if (disarm.current) clearTimeout(disarm.current);
    setArmed(false);
    setWorking(true);
    const replacement = scope === 'new-volume' && target
      ? newVolumeSave(selectSave(useManorStore.getState()), target.id)
      : null;
    // Home is the front step, whichever scope ran: the run is gone, and landing
    // back on the Chronicles would be landing on the control that just fired.
    // Hash first, then the reload that re-initialises everything. Runs on the
    // rejection path too — writes are already suspended and the keys are
    // already gone, so a half-failed teardown must still end in a fresh
    // document rather than leave the player on a dead button (AAA 11.1).
    const home = () => {
      try { window.location.hash = '#/'; } catch { /* no hash routing here */ }
      window.location.reload();
    };
    void resetPersistence(replacement).then(home, home);
  };

  const copy = scope === 'new-volume'
    ? {
      title: 'Start a new volume?',
      lost: `This volume’s journal — ${plural(fragments, 'fragment')} filed, every letter you have opened, and today’s climb. The manor opens again at day one, in the Entrance Hall.`,
      kept: `Every friendship and every conversation, ${plural(keepsakes, 'keepsake')} on the shelf, ${plural(cards, 'floorplan card')}, and all ${plural(days, 'day')} in the Chronicles.`,
      go: target ? `Begin ${target.title}` : 'Begin',
      armedGo: 'Tap again to begin',
    }
    : {
      title: 'Erase everything?',
      lost: `Everything, with nothing left behind: the journal and its ${plural(fragments, 'fragment')}, every friendship and conversation, ${plural(keepsakes, 'keepsake')}, ${plural(cards, 'floorplan card')}, all ${plural(days, 'day')} in the Chronicles, your household settings, and the archived save from the old game.`,
      kept: 'Nothing at all. You arrive at the front step as a first-time visitor.',
      go: 'Erase everything',
      armedGo: 'Tap again to erase',
    };

  return (
    <>
      <h3 className="chron__section">Start over</h3>
      <p className="chron__hint">
        Two ways to begin again. One keeps the household; the other forgets you were ever here.
      </p>

      <div className="chron__restart">
        {/* AAA 11.7: the recognisable words lead and never leave. The house's
            voice is the note underneath, where it cannot be mistaken for the
            control's meaning. */}
        <button
          type="button"
          className="chron__restart-choice"
          data-testid="restart-new-volume"
          aria-expanded={scope === 'new-volume'}
          disabled={!target}
          onClick={() => open('new-volume')}
        >
          <span className="chron__restart-verb">Start a new volume</span>
          <span className="chron__restart-note">
            {target
              ? 'A fresh forgotten word. The household remembers you.'
              : 'The shelf is still waking.'}
          </span>
        </button>
        <button
          type="button"
          className="chron__restart-choice chron__restart-choice--grave"
          data-testid="restart-erase"
          aria-expanded={scope === 'erase-everything'}
          onClick={() => open('erase-everything')}
        >
          <span className="chron__restart-verb">Erase everything</span>
          <span className="chron__restart-note">Back to the front step, as a stranger.</span>
        </button>
      </div>

      {scope !== null && (
        <div
          ref={confirmEl}
          className="chron__confirm"
          data-scope={scope}
          data-testid="restart-confirm"
          role="group"
          aria-label={copy.title}
        >
          <h4 className="chron__confirm-title">{copy.title}</h4>
          {scope === 'new-volume' && rereading && (
            /* AAA 11.21 — truthful in both directions. With one volume on the
               shelf the "new" mystery is this one re-opened, and the word will
               be the word she already knows. Saying so is the difference
               between a fresh start and a broken promise. */
            <p className="chron__confirm-caveat" data-testid="restart-rereading">
              No further volume is bound yet, so the house re-opens this one from the first page.
              The forgotten word will be the same.
            </p>
          )}
          <dl className="chron__confirm-ledger">
            <dt>What goes</dt>
            <dd data-testid="restart-lost">{copy.lost}</dd>
            <dt>What stays</dt>
            <dd data-testid="restart-kept">{copy.kept}</dd>
          </dl>
          {/* The trunk, offered before the door closes (AAA 11.26): one tap
              here packs the current save into the code box above, so a copy
              can be kept without leaving the panel. */}
          <button
            type="button"
            className="chron__confirm-export"
            data-testid="restart-export"
            onClick={onExport}
          >
            {exported ? 'Packed — the code is in the trunk above' : 'Pack a copy first'}
          </button>
          <div className="chron__confirm-row">
            <button
              type="button"
              className="chron__confirm-cancel"
              data-testid="restart-cancel"
              onClick={close}
            >
              Never mind
            </button>
            <button
              type="button"
              className={`chron__confirm-go${armed ? ' is-armed' : ''}`}
              data-testid="restart-commit"
              data-armed={armed ? 'yes' : 'no'}
              disabled={working}
              onClick={commit}
            >
              {working ? 'Closing the book…' : armed ? copy.armedGo : copy.go}
            </button>
          </div>
          <p className="chron__confirm-foot">
            {armed ? 'This cannot be undone.' : 'You will be asked once more.'}
          </p>
        </div>
      )}
    </>
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

        {/* Directly beneath the trunk, and above the keepsake shelf, for two
            reasons: it is BOUNDED (the round-9 ordering rule above), and the
            export the confirm panel offers is the control immediately over its
            head — the copy names "the trunk above" and means it literally.
            Two taps from the blueprint stays intact (AAA 11.23): one to
            Chronicles, one to the scope. */}
        <FreshStart onExport={copyCode} exported={copied} />

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

        {/* Above the ledger deliberately — see the ROUND 9 note at the top of
            this file. The ledger is the one UNBOUNDED section, so anything
            placed after it sinks a row deeper every day played. A build stamp
            that is three screens down on day 30 is a build stamp nobody quotes,
            which defeats the entire point of having one (REVIEW_AA §0). Here
            its depth is constant for the life of the campaign. */}
        <BuildStampLine />

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
            <dt>source</dt>
            <dd>{__MANOR_BUILD__.source.slice(0, 16)}</dd>
            <dt>built via</dt>
            <dd>{__MANOR_BUILD__.via}</dd>
          </dl>
        </details>
      </div>
    </div>
  );
}
