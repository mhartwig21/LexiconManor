import { useEffect, useState } from 'react';
import { Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { loadPools, poolsReady } from './app/pools';
import ManorPage from './pages/ManorPage';
import RoomPage from './pages/RoomPage';
import JournalPage from './pages/JournalPage';
import ChroniclesPage from './pages/ChroniclesPage';
import SanctumPage from './pages/SanctumPage';
import GameChrome from './ui/chrome/GameChrome';
import BootGate from './ui/chrome/BootGate';
import MomentLayer from './ui/moment/MomentLayer';

/**
 * ARCHITECT-OWNED (integration pass applied). Hash routing so the static
 * build works from any host/subpath (GitHub Pages) with zero server config —
 * deep links land on the single index.html.
 *
 * Routes: / and /manor are both the blueprint (the manor IS the home —
 * MANOR_DESIGN §2's loop starts on the front step) · /room (RoomHost) ·
 * /journal + /sanctum (A7) · /chronicles (A8).
 *
 * <GameChrome /> mounts once, after the Switch (A2's shared-file request):
 * DayHeader/StepMeter + the morning/dusk/night scenes overlay every route
 * and never unmount across navigation, so the candle and its floating ±N
 * survive room entry/exit.
 *
 * <MomentLayer /> mounts beside it (the moment layer's shared-file request),
 * and the ONE line is load-bearing: the layer used to bootstrap itself from
 * ManorPage's mount effect, which meant a cold deep-link straight to
 * #/journal left the campaign-grant watcher uninstalled until the player
 * happened to visit the manor. Mounted here it is live from first commit on
 * every route, and `retireBootstrapLayer()` makes the old path a no-op.
 * It is OUTSIDE the <Switch> for the same reason GameChrome is: no route
 * change may unmount the thing whose whole job is to outlive the screen.
 */
/**
 * How many silent retries the boot gate takes before it says something. At
 * 800ms apart that is ~2.4s of quiet — long enough that a merely slow fetch is
 * never accused of being a stall, short enough that a real one does not sit
 * there forever (AAA 11.1: a surface with no controls is a dead end, and the
 * installed PWA has no reload button to rescue it with).
 */
const BOOT_ATTEMPTS = 4;

export default function App() {
  // AAA 9.6/7.3 gate: content pools ride the lazy 'content' chunk
  // (app/pools.ts; bootPlatform warms the fetch right after first paint).
  // Every selector/adapter downstream reads pools synchronously, so the one
  // await lives here — the app shell paints instantly, then the manor wakes.
  const [ready, setReady] = useState(poolsReady);
  /**
   * ROUND 10 (AAA 11.1 / 11.8 / 11.26). This gate used to render one italic
   * line, "The manor is waking…", with no controls at all, and retry forever.
   * If the content chunk never arrived — offline before the service worker had
   * precached, a half-written cache, a bad deploy — that line was the entire
   * app, permanently, in a standalone window with no address bar, no back
   * button and no reload. The player could not even reach the travelling trunk
   * to export the save she still had. Silence is the right FIRST answer to a
   * slow network and the wrong last one.
   */
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (ready || stalled) return;
    let alive = true;
    let tries = 0;
    const attempt = () => {
      loadPools().then(
        () => { if (alive) setReady(true); },
        () => {                                  // flaky first fetch: retry, quietly
          if (!alive) return;
          tries += 1;
          if (tries >= BOOT_ATTEMPTS) { setStalled(true); return; }
          window.setTimeout(attempt, 800);
        },
      );
    };
    attempt();
    return () => { alive = false; };
  }, [ready, stalled]);

  if (!ready) {
    /**
     * The gate keeps a router, and the router keeps ONE door: /chronicles is
     * where settings and the save-code trunk live, and 11.26 says reaching the
     * trunk may cost the player no game state — least of all on the morning
     * the house will not open. Everything else falls through to the gate
     * itself, so tapping "The manor" on the Chronicles back-link returns here
     * rather than to a blank route.
     */
    return (
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/chronicles" component={ChroniclesPage} />
          <Route>
            {/* MEASURED, not assumed (tests/navigation-live.mjs): re-calling
                loadPools() in place can never recover. A dynamic import that
                failed is recorded as failed in the document's module map, so
                every later import() of the same specifier re-throws the stored
                error WITHOUT refetching — the first version of this control
                looked like it retried and could not have worked once. The only
                real retry is a fresh document, and the app asking for one is
                not the same thing as the player needing a reload button the
                standalone window does not have. */}
            <BootGate stalled={stalled} onRetry={() => { setStalled(false); window.location.reload(); }} />
          </Route>
        </Switch>
      </Router>
    );
  }

  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={ManorPage} />
        <Route path="/manor" component={ManorPage} />
        <Route path="/room" component={RoomPage} />
        <Route path="/journal" component={JournalPage} />
        <Route path="/chronicles" component={ChroniclesPage} />
        <Route path="/sanctum" component={SanctumPage} />
        <Route>
          <NotFound />
        </Route>
      </Switch>
      <GameChrome />
      <MomentLayer />
    </Router>
  );
}

function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: '20vh' }}>
      <h2>A door that leads nowhere</h2>
      <p>This corridor has not been drafted.</p>
      <button className="btn btn--primary" onClick={() => navigate('/')}>
        Back to the Entrance Hall
      </button>
    </div>
  );
}
