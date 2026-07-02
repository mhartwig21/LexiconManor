import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useGameStore } from '../app/store';
import { isNodeCompleted, isNodeUnlocked, type LevelMap, type MapNode } from '../engine/map';
import { glyphById, perkById } from '../engine/effects';
import { GLYPH_SLOTS, PERK_SLOTS } from '../engine/types';
import { OutcomeModal } from '../components/OutcomeModal';

const MODE_ICON: Record<string, string> = {
  'word-web': '✳',
  hive: '⬡',
  twistle: '▦',
  'forgotten-word': '❖',
};

const MODE_CAPTION: Record<string, string> = {
  'word-web': 'WEB',
  hive: 'HIVE',
  twistle: 'TWIST',
  'forgotten-word': 'SEEK',
};

const REALMS: Record<number, { name: string; flavor: string }> = {
  1: { name: 'Astral Realm', flavor: 'Journey through the stellar nurseries where words are born' },
  2: { name: 'Nebula Depths', flavor: 'Descend where meanings blur in violet mist' },
  3: { name: 'Void Sanctum', flavor: 'Face the silence where the lost words sleep' },
};

const MAP_HEIGHT = 400;

function nodePos(node: MapNode, maxLayer: number): { x: number; y: number } {
  const x = 12 + (node.layer / maxLayer) * 76; // percent, keeps gates on the band
  const y = 14 + ((node.slot + 1) / (node.slotCount + 1)) * (MAP_HEIGHT - 28);
  return { x, y };
}

export default function MapPage() {
  const [, navigate] = useLocation();
  const run = useGameStore((s) => s.save.activeRun);
  const activePerkLoadout = useGameStore((s) => s.save.activePerkLoadout);
  const currentMap = useGameStore((s) => s.currentMap);
  const enterNode = useGameStore((s) => s.enterNode);

  useEffect(() => {
    if (!run || run.status !== 'active') navigate('/');
  }, [run, navigate]);
  if (!run || run.status !== 'active') return null;

  const map = currentMap();
  if (!map) return null;
  const maxLayer = Math.max(...map.nodes.map((n) => n.layer));
  const realm = REALMS[Math.min(run.level, 3)]!;

  return (
    <div className={`bg-level bg-level--${Math.min(run.level, 3)}`}>
      <div className="page" style={{ position: 'relative' }}>
        <button className="map-corner-btn" style={{ left: '1rem' }} onClick={() => navigate('/')} aria-label="Home">
          ⌂
        </button>
        <button className="map-corner-btn" style={{ right: '1rem' }} onClick={() => navigate('/chronicles')} aria-label="Chronicles">
          ✦
        </button>

        <header className="map-header">
          <h1 className="map-header__title">Lexicon Loop</h1>
          <p className="map-header__realm">
            Level {run.level}: {realm.name}
          </p>
          <p className="map-header__flavor">{realm.flavor}</p>
          <div className="map-status-pill">
            <span>
              Mind: <span style={{ color: 'var(--golden-bright)' }}>{'★'.repeat(run.mindPoints)}</span>
              <span style={{ opacity: 0.35 }}>{'★'.repeat(Math.max(0, run.maxMindPoints - run.mindPoints))}</span>
            </span>
            <span>Score: {run.totalScore.toLocaleString()}</span>
          </div>
        </header>

        <MapCanvas
          map={map}
          maxLayer={maxLayer}
          run={run}
          onEnter={(node) => {
            enterNode(node.id);
            navigate('/play');
          }}
        />

        <div className="tray-row">
          <div className="tray">
            <span className="tray__label">GLYPHS</span>
            {Array.from({ length: GLYPH_SLOTS }, (_, i) => {
              const id = run.glyphInventory[i];
              return id ? (
                <div key={i} className="tray__slot tray__slot--filled" title={`${glyphById(id).name} — ${glyphById(id).description}`}>
                  ◆
                </div>
              ) : (
                <div key={i} className="tray__slot">+</div>
              );
            })}
          </div>
          <div className="tray" onClick={() => navigate('/sanctum')} style={{ cursor: 'pointer' }} title="Open the Sanctum">
            <span className="tray__label">PERKS</span>
            {Array.from({ length: PERK_SLOTS }, (_, i) => {
              const id = activePerkLoadout[i];
              return id ? (
                <div key={i} className="tray__slot tray__slot--filled" title={perkById(id).name}>
                  ❖
                </div>
              ) : (
                <div key={i} className="tray__slot">+</div>
              );
            })}
          </div>
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
  onEnter,
}: {
  map: LevelMap;
  maxLayer: number;
  run: { completedNodeIds: string[] };
  onEnter: (node: MapNode) => void;
}) {
  const posOf = (id: string) => {
    const n = map.nodes.find((n) => n.id === id)!;
    return nodePos(n, maxLayer);
  };

  return (
    <div className="map-canvas" style={{ height: MAP_HEIGHT + 24 }}>
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
          // Walked routes blaze once both ends are within reach.
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
        const isGate = node.id === map.startId || node.kind === 'boss';
        const completed = isNodeCompleted(map, run, node.id);
        const unlocked = isNodeUnlocked(map, run, node.id);
        const playable = unlocked && !completed && node.id !== map.startId;
        // Fog of war: locked stones bear no markings at all.
        const revealed = unlocked || completed;
        const icon = !revealed ? '' : completed ? '✓' : node.kind === 'mystery' ? '?' : MODE_ICON[node.mode] ?? '✳';

        return (
          <button
            key={node.id}
            className={[
              'map-node',
              isGate ? 'map-node--gate' : '',
              completed || node.id === map.startId ? 'map-node--completed' : '',
              playable ? 'map-node--playable' : '',
              !unlocked ? 'map-node--locked' : '',
            ].join(' ')}
            style={{ left: `${x}%`, top: y + 12 }}
            disabled={!playable}
            onClick={() => onEnter(node)}
            aria-label={`${node.kind} node${playable ? ', playable' : completed ? ', completed' : ', uncharted'}`}
          >
            {isGate ? (
              <span>{node.id === map.startId ? 'START' : 'BOSS'}</span>
            ) : (
              <span>{icon}</span>
            )}
            {!isGate && revealed && !completed && node.kind !== 'mystery' && (
              <span className="map-node__caption">{MODE_CAPTION[node.mode]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
