import { Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import ManorPage from './pages/ManorPage';
import RoomPage from './pages/RoomPage';
import JournalPage from './pages/JournalPage';
import ChroniclesPage from './pages/ChroniclesPage';
import SanctumPage from './pages/SanctumPage';
import GameChrome from './ui/chrome/GameChrome';

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
 */
export default function App() {
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
