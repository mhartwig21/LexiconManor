import { Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import HomePage from './pages/HomePage';
import ManorPage from './pages/ManorPage';
import RoomPage from './pages/RoomPage';
import JournalPage from './pages/JournalPage';
import ChroniclesPage from './pages/ChroniclesPage';
import SanctumPage from './pages/SanctumPage';

/**
 * ARCHITECT-OWNED. Hash routing so the static build works from any
 * host/subpath (GitHub Pages) with zero server config — deep links land on
 * the single index.html.
 *
 * Route ownership: / (architect) · /manor (A1) · /room (A3 via RoomHost) ·
 * /journal + /sanctum (A7) · /chronicles (A8). Agents implement their PAGE
 * component; this file's route table stays frozen.
 */
export default function App() {
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/manor" component={ManorPage} />
        <Route path="/room" component={RoomPage} />
        <Route path="/journal" component={JournalPage} />
        <Route path="/chronicles" component={ChroniclesPage} />
        <Route path="/sanctum" component={SanctumPage} />
        <Route>
          <NotFound />
        </Route>
      </Switch>
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
