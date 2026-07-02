import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useGameStore } from '../app/store';
import { isNodeCompleted, isNodeUnlocked, type LevelMap, type MapNode } from '../engine/map';
import { glyphById } from '../engine/effects';
import { RunHeader } from '../components/RunHeader';
import { OutcomeModal } from '../components/OutcomeModal';

const MODE_ICON: Record<string, string> = {
  'word-web': '✳',
  hive: '⬡',
  twistle: '▦',
  'forgotten-word': '❖',
};

const MAP_HEIGHT = 460;

function nodePos(node: MapNode, maxLayer: number): { x: number; y: number } {
  const x = 13 + (node.layer / maxLayer) * 74; // percent, keeps seals on the paper
  const y = 30 + ((node.slot + 1) / (node.slotCount + 1)) * (MAP_HEIGHT - 40); // clear the title banner
  return { x, y };
}

export default function MapPage() {
  const [, navigate] = useLocation();
  const run = useGameStore((s) => s.save.activeRun);
  const currentMap = useGameStore((s) => s.currentMap);
  const enterNode = useGameStore((s) => s.enterNode);
  const glyphInventory = useGameStore((s) => s.save.activeRun?.glyphInventory ?? []);

  useEffect(() => {
    if (!run || run.status !== 'active') navigate('/');
  }, [run, navigate]);
  if (!run || run.status !== 'active') return null;

  const map = currentMap();
  if (!map) return null;
  const maxLayer = Math.max(...map.nodes.map((n) => n.layer));

  return (
    <div className={`bg-level bg-level--${Math.min(run.level, 3)}`}>
      <div className="page">
        <RunHeader title="Your Journey" />
        <MapCanvas
          map={map}
          maxLayer={maxLayer}
          run={run}
          levelTitle={levelName(run.level)}
          onEnter={(node) => {
            enterNode(node.id);
            navigate('/play');
          }}
        />

        <p style={{ textAlign: 'center', fontSize: 'var(--text-sm)', fontStyle: 'italic', opacity: 0.7, margin: '0.8rem 0 0' }}>
          You have entered the Loop. Follow the trail, and break the seal that binds this realm.
        </p>

        <div className="card" style={{ marginTop: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 'var(--text-sm)' }}>
            <strong style={{ color: 'var(--golden)' }}>Glyphs:</strong>{' '}
            {glyphInventory.length === 0
              ? 'none yet'
              : glyphInventory.map((id) => glyphById(id).name.replace('Glyph of ', '')).join(', ')}
          </div>
          <button className="btn" style={{ minHeight: 36, padding: '0.3rem 0.9rem' }} onClick={() => navigate('/')}>
            Home
          </button>
        </div>

        <OutcomeModal />
      </div>
    </div>
  );
}

function MapCanvas({
  map,
  maxLayer,
  run,
  levelTitle,
  onEnter,
}: {
  map: LevelMap;
  maxLayer: number;
  run: { completedNodeIds: string[] };
  levelTitle: string;
  onEnter: (node: MapNode) => void;
}) {
  const posOf = (id: string) => {
    const n = map.nodes.find((n) => n.id === id)!;
    return nodePos(n, maxLayer);
  };

  return (
    <div className="map-canvas" style={{ height: MAP_HEIGHT + 24 }}>
      <div className="map-title">— {levelTitle} —</div>
      <CompassRose />
      <svg
        width="100%"
        height={MAP_HEIGHT}
        style={{ position: 'absolute', inset: 12, pointerEvents: 'none' }}
        preserveAspectRatio="none"
        viewBox={`0 0 100 ${MAP_HEIGHT}`}
      >
        {map.edges.map(([from, to]) => {
          const a = posOf(from);
          const b = posOf(to);
          const open = isNodeCompleted(map, run, from);
          const midX = (a.x + b.x) / 2;
          return (
            <path
              key={`${from}-${to}`}
              className={`map-edge${open ? ' map-edge--open' : ''}`}
              d={`M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      {map.nodes.map((node) => {
        const { x, y } = nodePos(node, maxLayer);
        const completed = isNodeCompleted(map, run, node.id);
        const unlocked = isNodeUnlocked(map, run, node.id);
        const playable = unlocked && !completed && node.id !== map.startId;
        const revealMode = node.kind !== 'mystery' || unlocked;
        const icon =
          node.id === map.startId ? '✦'
          : completed ? '✓'
          : !revealMode ? '?'
          : MODE_ICON[node.mode] ?? '✳';

        return (
          <button
            key={node.id}
            className={[
              'map-node',
              node.kind === 'boss' ? 'map-node--boss' : '',
              completed || node.id === map.startId ? 'map-node--completed' : '',
              playable ? 'map-node--playable' : '',
              !unlocked ? 'map-node--locked' : '',
            ].join(' ')}
            style={{ left: `${x}%`, top: y + 12 }}
            disabled={!playable}
            onClick={() => onEnter(node)}
            aria-label={`${node.kind} node${playable ? ', playable' : completed ? ', completed' : ', locked'}`}
          >
            <span>{icon}</span>
            {node.kind === 'boss' && <span className="map-node__label">BOSS</span>}
          </button>
        );
      })}
    </div>
  );
}

function CompassRose() {
  return (
    <svg className="map-compass" viewBox="0 0 100 100" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="50" cy="50" r="34" strokeWidth="2" />
      <circle cx="50" cy="50" r="4" fill="currentColor" />
      <path d="M50 8 L56 44 L50 50 L44 44 Z" fill="currentColor" stroke="none" />
      <path d="M50 92 L56 56 L50 50 L44 56 Z" strokeWidth="1.5" />
      <path d="M8 50 L44 44 L50 50 L44 56 Z" strokeWidth="1.5" />
      <path d="M92 50 L56 44 L50 50 L56 56 Z" strokeWidth="1.5" />
      <text x="50" y="6" textAnchor="middle" fontSize="10" fill="currentColor" stroke="none" fontFamily="serif">N</text>
    </svg>
  );
}

function levelName(level: number): string {
  if (level === 1) return 'The Astral Realm';
  if (level === 2) return 'The Nebula Depths';
  return 'The Void Sanctum';
}
