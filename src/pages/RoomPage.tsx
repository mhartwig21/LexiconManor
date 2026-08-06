import { useEffect } from 'react';
import { useLocation } from 'wouter';
import RoomHost from '../ui/rooms/RoomHost';
import { useManorStore } from '../app/store';

/**
 * The /room route: renders RoomHost for day.activeRoom. Architect-owned glue;
 * the interesting parts live in RoomHost + the per-kind views.
 *
 * Integration: leaving/abandoning a room clears day.activeRoom, so this page
 * walks the player back to the blueprint instead of stranding them on a
 * "no room entered" dead end (A1's shared-file request).
 */
export default function RoomPage() {
  const [, navigate] = useLocation();
  const hasActiveRoom = useManorStore((s) => Boolean(s.day?.activeRoom));

  useEffect(() => {
    if (!hasActiveRoom) navigate('/manor', { replace: true });
  }, [hasActiveRoom, navigate]);

  if (!hasActiveRoom) return null;
  return <RoomHost />;
}
