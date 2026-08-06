import { useLocation } from 'wouter';
import RoomHost from '../ui/rooms/RoomHost';
import { useManorStore } from '../app/store';

/**
 * The /room route: renders RoomHost for day.activeRoom. Architect-owned glue;
 * the interesting parts live in RoomHost + the per-kind views.
 */
export default function RoomPage() {
  const [, navigate] = useLocation();
  const hasActiveRoom = useManorStore((s) => Boolean(s.day?.activeRoom));

  if (!hasActiveRoom) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: '18vh' }}>
        <h2>No room entered</h2>
        <p style={{ opacity: 0.85 }}>Pick a door on the blueprint first.</p>
        <button className="btn" onClick={() => navigate('/manor')}>To the blueprint</button>
      </div>
    );
  }
  return <RoomHost />;
}
