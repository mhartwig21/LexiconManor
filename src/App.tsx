import { Route, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { Router } from 'wouter';
import HomePage from './pages/HomePage';
import MapPage from './pages/MapPage';
import PlayPage from './pages/PlayPage';
import ChroniclesPage from './pages/ChroniclesPage';
import { useGameStore } from './app/store';

/**
 * Hash routing so the static build works from any host/subpath
 * (GitHub Pages, file://) with zero server config.
 */
export default function App() {
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/map" component={MapPage} />
        <Route path="/play" component={PlayPage} />
        <Route path="/chronicles" component={ChroniclesPage} />
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
    <div className="bg-level bg-level--1">
      <div className="page" style={{ textAlign: 'center', paddingTop: '20vh' }}>
        <h2>Lost in the void</h2>
        <p>This page does not exist.</p>
        <button className="btn btn--primary" onClick={() => navigate('/')}>
          Return home
        </button>
      </div>
    </div>
  );
}

/** Background class for the active run's level (level 1 look when idle). */
export function useLevelBackground(): string {
  const level = useGameStore((s) => s.save.activeRun?.level ?? 1);
  return `bg-level bg-level--${Math.min(level, 3)}`;
}
