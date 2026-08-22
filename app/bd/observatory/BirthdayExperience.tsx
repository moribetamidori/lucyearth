'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type {
  BirthdayCluster,
  BirthdayDataset,
  BirthdayMemory,
} from '@/lib/birthday/types';
import {
  TEMPLE_ARRIVAL_KEY,
  TEMPLE_TRANSIT_MS,
} from '@/lib/birthday/portal-transition';
import {
  CLUSTER_LOCATIONS,
  getObservatoryDestination,
  OBSERVATORY_PLANETS,
} from '@/lib/birthday/observatory';
import { useBirthdayAudio } from '../BirthdayAudio';
import styles from './birthday.module.css';

const MemoryPalaceScene = dynamic(() => import('./MemoryPalaceScene'), {
  ssr: false,
  loading: () => (
    <div className={styles.sceneLoader} role="status">
      <span />
      calibrating memory field
    </div>
  ),
});

const VISITED_KEY = 'jmill_memory_palace_visited_rooms';

function PortalTransit({ direction }: { direction: 'arriving' | 'returning' }) {
  return (
    <div
      className={`${styles.portalTransit} ${
        direction === 'arriving' ? styles.portalArriving : styles.portalReturning
      }`}
      role="status"
      aria-label={
        direction === 'arriving'
          ? 'Arriving in the solar observatory'
          : 'Returning through the telescope to the temple'
      }
    >
      <div className={styles.portalAperture} aria-hidden="true" />
      <span>
        {direction === 'arriving'
          ? 'SOLAR FIELD ACQUIRED // RESOLVING SCALE'
          : 'REVERSING OPTICS // RETURNING TO TEMPLE'}
      </span>
    </div>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}

function formatDate(value?: string) {
  if (!value) return null;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function MemoryPanel({
  memory,
  cluster,
  onClose,
}: {
  memory: BirthdayMemory;
  cluster: BirthdayCluster;
  onClose: () => void;
}) {
  const date = formatDate(memory.publishedAt);
  const destination = getObservatoryDestination(cluster.id);
  const cssVariables = { '--cluster-color': cluster.color } as CSSProperties;

  return (
    <aside className={styles.memoryPanel} style={cssVariables} aria-label="Selected memory">
      <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Close memory">
        ×
      </button>
      <div className={styles.panelEyebrow}>
        <span>{destination?.symbol ?? cluster.sigil}</span>
        {destination && `${destination.name} // `}
        {memory.kind === 'tweet' ? 'TRANSMISSION' : 'ANCHOR PROJECT'}
      </div>
      <h2>{memory.title ?? `@${'jmilldotdev'}`}</h2>
      {date && <time dateTime={memory.publishedAt}>{date}</time>}
      <div className={styles.panelRule} />
      <p className={memory.text ? styles.memoryText : styles.visualTransmission}>
        {memory.text || '[ visual transmission ]'}
      </p>
      {memory.media?.map((media) => (
        <div className={styles.memoryImage} key={media.src}>
          <Image
            src={media.src}
            alt={media.alt}
            width={720}
            height={440}
            sizes="(max-width: 760px) calc(100vw - 32px), 390px"
            unoptimized
          />
        </div>
      ))}
      {memory.sourceUrl && (
        <a className={styles.sourceLink} href={memory.sourceUrl} target="_blank" rel="noreferrer">
          open original source <span aria-hidden="true">↗</span>
        </a>
      )}
    </aside>
  );
}

function ConstellationFallback({
  dataset,
  visited,
  onClusterSelect,
  onMemorySelect,
}: {
  dataset: BirthdayDataset;
  visited: Set<string>;
  onClusterSelect: (clusterId: string) => void;
  onMemorySelect: (memoryId: string) => void;
}) {
  const memories = new Map(dataset.memories.map((memory) => [memory.id, memory]));

  return (
    <div className={styles.fallback}>
      <div className={styles.fallbackIntro}>
        <span>2D FALLBACK // SIGNALS INTACT</span>
        <h1>The observatory is rendered as a planetary archive on this device.</h1>
      </div>
      <div className={styles.fallbackGrid}>
        {dataset.clusters.map((cluster) => (
          <FallbackDestination
            key={cluster.id}
            cluster={cluster}
            visited={visited.has(cluster.id)}
            memories={memories}
            onClusterSelect={onClusterSelect}
            onMemorySelect={onMemorySelect}
          />
        ))}
      </div>
    </div>
  );
}

function FallbackDestination({
  cluster,
  visited,
  memories,
  onClusterSelect,
  onMemorySelect,
}: {
  cluster: BirthdayCluster;
  visited: boolean;
  memories: Map<string, BirthdayMemory>;
  onClusterSelect: (clusterId: string) => void;
  onMemorySelect: (memoryId: string) => void;
}) {
  const destination = getObservatoryDestination(cluster.id);

  return (
    <section
      className={styles.fallbackRoom}
      style={{ '--cluster-color': cluster.color } as CSSProperties}
    >
      <button type="button" onClick={() => onClusterSelect(cluster.id)}>
        <span>{destination?.symbol ?? cluster.sigil}</span>
        <strong>{destination?.name ?? 'UNMAPPED ARCHIVE'}</strong>
        <small>{visited ? 'visited' : 'open archive'}</small>
      </button>
      <p>{cluster.description}</p>
      <div>
        {cluster.memoryIds.map((id) => {
          const memory = memories.get(id);
          if (!memory) return null;
          return (
            <button key={id} type="button" onClick={() => onMemorySelect(id)}>
              {memory.title ?? (memory.text.slice(0, 52) || 'visual transmission')}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SolarSystemNavigation({
  clusters,
  activeClusterId,
  visited,
  onClusterSelect,
}: {
  clusters: BirthdayCluster[];
  activeClusterId: string | null;
  visited: Set<string>;
  onClusterSelect: (clusterId: string) => void;
}) {
  const activeLocation = activeClusterId ? CLUSTER_LOCATIONS[activeClusterId] : undefined;
  const [expandedPlanetId, setExpandedPlanetId] = useState<string | null>(
    activeLocation?.moonName ? activeLocation.planetId : null
  );
  const clustersByLocation = useMemo(() => {
    const index = new Map<string, BirthdayCluster>();
    clusters.forEach((cluster) => {
      const location = CLUSTER_LOCATIONS[cluster.id];
      if (!location) return;
      index.set(`${location.planetId}:${location.moonName ?? ''}`, cluster);
    });
    return index;
  }, [clusters]);

  useEffect(() => {
    if (!activeLocation) return;
    const activePlanet = OBSERVATORY_PLANETS.find(
      (planet) => planet.id === activeLocation.planetId
    );
    if (activePlanet?.moons.length) setExpandedPlanetId(activeLocation.planetId);
  }, [activeLocation]);

  return (
    <nav className={styles.roomNav} aria-label="Solar system destinations">
      <div className={styles.navLabel}>PLANET INDEX</div>
      {OBSERVATORY_PLANETS.map((planet, index) => {
        const planetCluster = clustersByLocation.get(`${planet.id}:`);
        const expanded = expandedPlanetId === planet.id;
        const hasMoons = planet.moons.length > 0;
        const active = activeLocation?.planetId === planet.id && !activeLocation.moonName;
        const systemActive = activeLocation?.planetId === planet.id;
        const canOpen = Boolean(planetCluster) || hasMoons;
        const color = planetCluster?.color ?? (systemActive && activeClusterId
          ? clusters.find((cluster) => cluster.id === activeClusterId)?.color
          : undefined) ?? '#7ff7ff';
        const menuId = `planet-${planet.id}-moons`;

        return (
          <div className={styles.planetItem} key={planet.id}>
            <button
              type="button"
              className={`${styles.planetButton} ${active ? styles.activeRoom : ''} ${
                systemActive ? styles.activeSystem : ''
              } ${!planetCluster ? styles.dormantPlanet : ''}`}
              style={{ '--cluster-color': color } as CSSProperties}
              disabled={!canOpen}
              aria-current={active ? 'location' : undefined}
              aria-expanded={hasMoons ? expanded : undefined}
              aria-controls={hasMoons ? menuId : undefined}
              onClick={() => {
                if (hasMoons) {
                  setExpandedPlanetId((current) => current === planet.id ? null : planet.id);
                }
                if (planetCluster) onClusterSelect(planetCluster.id);
              }}
            >
              <span className={styles.roomNumber}>{String(index + 1).padStart(2, '0')}</span>
              <span className={styles.roomSigil} aria-hidden="true">{planet.symbol}</span>
              <span className={styles.roomName}>{planet.name}</span>
              <span className={styles.planetStatus} aria-hidden="true">
                {hasMoons ? (expanded ? '⌄' : '›') : planetCluster ? (visited.has(planetCluster.id) ? '●' : '○') : '—'}
              </span>
            </button>

            {hasMoons && expanded && (
              <div className={styles.moonMenu} id={menuId} role="group" aria-label={`${planet.name} moons`}>
                {planet.moons.map((moonName) => {
                  const moonCluster = clustersByLocation.get(`${planet.id}:${moonName}`);
                  const moonActive = Boolean(moonCluster && moonCluster.id === activeClusterId);
                  return (
                    <button
                      key={moonName}
                      type="button"
                      className={`${styles.moonButton} ${moonActive ? styles.activeMoon : ''}`}
                      style={{
                        '--cluster-color': moonCluster?.color ?? '#607579',
                      } as CSSProperties}
                      disabled={!moonCluster}
                      aria-current={moonActive ? 'location' : undefined}
                      onClick={() => moonCluster && onClusterSelect(moonCluster.id)}
                    >
                      <span aria-hidden="true">◦</span>
                      <span>{moonName}</span>
                      <span aria-hidden="true">
                        {moonCluster ? (visited.has(moonCluster.id) ? '●' : '○') : '—'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function BirthdayExperience({ dataset }: { dataset: BirthdayDataset }) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const {
    enabled: soundEnabled,
    selectTrack,
    toggle: toggleSound,
    chime,
  } = useBirthdayAudio();
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [activeClusterId, setActiveClusterId] = useState<string | null>(null);
  const [activeMemoryId, setActiveMemoryId] = useState<string | null>(null);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [visitedHydrated, setVisitedHydrated] = useState(false);
  const [arrivalAnimating, setArrivalAnimating] = useState(true);
  const [returningToTemple, setReturningToTemple] = useState(false);
  const transitTimer = useRef<number | null>(null);

  const memoriesById = useMemo(
    () => new Map(dataset.memories.map((memory) => [memory.id, memory])),
    [dataset.memories]
  );
  const clustersById = useMemo(
    () => new Map(dataset.clusters.map((cluster) => [cluster.id, cluster])),
    [dataset.clusters]
  );
  const activeMemory = activeMemoryId ? memoriesById.get(activeMemoryId) ?? null : null;
  const activeCluster = activeMemory
    ? clustersById.get(activeMemory.clusterId) ?? null
    : activeClusterId
      ? clustersById.get(activeClusterId) ?? null
      : null;
  const activeDestination = activeCluster
    ? getObservatoryDestination(activeCluster.id)
    : null;
  const showingArrival = webglSupported === true && arrivalAnimating;

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    setWebglSupported(Boolean(context));
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  }, []);

  useEffect(() => {
    void selectTrack('observatory');
  }, [selectTrack]);

  useEffect(() => {
    if (soundEnabled) return;
    const unlockAutoplay = () => void selectTrack('observatory');
    window.addEventListener('pointerdown', unlockAutoplay, { once: true });
    window.addEventListener('keydown', unlockAutoplay, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAutoplay);
      window.removeEventListener('keydown', unlockAutoplay);
    };
  }, [selectTrack, soundEnabled]);

  useEffect(
    () => () => {
      if (transitTimer.current !== null) window.clearTimeout(transitTimer.current);
    },
    []
  );

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(VISITED_KEY) ?? '[]');
      if (Array.isArray(stored)) {
        const validIds = new Set(dataset.clusters.map((cluster) => cluster.id));
        setVisited(
          new Set(
            stored.filter(
              (id): id is string => typeof id === 'string' && validIds.has(id)
            )
          )
        );
      }
    } catch {
      localStorage.removeItem(VISITED_KEY);
    } finally {
      setVisitedHydrated(true);
    }
  }, [dataset.clusters]);

  useEffect(() => {
    if (!visitedHydrated) return;
    localStorage.setItem(VISITED_KEY, JSON.stringify([...visited]));
  }, [visited, visitedHydrated]);

  const markVisited = useCallback((clusterId: string) => {
    setVisited((current) => {
      if (current.has(clusterId)) return current;
      const next = new Set(current);
      next.add(clusterId);
      return next;
    });
  }, []);

  const selectCluster = useCallback(
    (clusterId: string) => {
      const cluster = clustersById.get(clusterId);
      if (!cluster) return;
      setActiveClusterId(clusterId);
      setActiveMemoryId(cluster.anchorProjectId);
      markVisited(clusterId);
      chime(dataset.clusters.findIndex((item) => item.id === clusterId), 196);
    },
    [chime, clustersById, dataset.clusters, markVisited]
  );

  const selectMemory = useCallback(
    (memoryId: string) => {
      const memory = memoriesById.get(memoryId);
      if (!memory) return;
      setActiveClusterId(memory.clusterId);
      setActiveMemoryId(memoryId);
      markVisited(memory.clusterId);
    },
    [markVisited, memoriesById]
  );

  const returnToCore = () => {
    setActiveClusterId(null);
    setActiveMemoryId(null);
  };

  const returnToTemple = useCallback(() => {
    if (returningToTemple) return;
    void selectTrack('temple');
    setActiveClusterId(null);
    setActiveMemoryId(null);
    setReturningToTemple(true);

    const navigate = () => {
      sessionStorage.setItem(TEMPLE_ARRIVAL_KEY, 'observatory');
      router.push('/bd/2026');
    };
    transitTimer.current = window.setTimeout(
      navigate,
      reducedMotion ? 80 : TEMPLE_TRANSIT_MS
    );
  }, [reducedMotion, returningToTemple, router, selectTrack]);

  return (
    <main
      className={`${styles.page} ${showingArrival ? styles.arriving : ''} ${
        returningToTemple ? styles.returning : ''
      }`}
    >
      <div className={styles.scanlines} aria-hidden="true" />
      <div className={styles.scene}>
        {webglSupported === null ? (
          <div className={styles.sceneLoader} role="status">
            <span />
            testing dimensional field
          </div>
        ) : webglSupported ? (
          <MemoryPalaceScene
            dataset={dataset}
            activeClusterId={activeClusterId}
            activeMemoryId={activeMemoryId}
            reducedMotion={reducedMotion}
            arriving={arrivalAnimating}
            departing={returningToTemple}
            onClusterSelect={selectCluster}
            onMemorySelect={selectMemory}
            onTempleReturn={returnToTemple}
            onArrivalComplete={() => setArrivalAnimating(false)}
            onInteract={() => undefined}
          />
        ) : (
          <ConstellationFallback
            dataset={dataset}
            visited={visited}
            onClusterSelect={selectCluster}
            onMemorySelect={selectMemory}
          />
        )}
      </div>

      {showingArrival && <PortalTransit direction="arriving" />}
      {returningToTemple && <PortalTransit direction="returning" />}

      <header className={styles.solarHud}>
        <button
          type="button"
          className={styles.soundButton}
          onClick={() => void toggleSound('observatory')}
          aria-pressed={soundEnabled}
        >
          <span aria-hidden="true">{soundEnabled ? '◖))' : '◖·'}</span>
          SOUND {soundEnabled ? 'ON' : 'OFF'}
        </button>
        <h1 className={styles.solarTitle}>
          SOLAR <span>SYSTEM</span>
        </h1>
      </header>

      <SolarSystemNavigation
        clusters={dataset.clusters}
        activeClusterId={activeClusterId}
        visited={visited}
        onClusterSelect={selectCluster}
      />

      {webglSupported !== false &&
        !activeClusterId &&
        visited.size === 0 &&
        !arrivalAnimating &&
        !returningToTemple && (
        <section className={styles.intro}>
          <div className={styles.introKicker}>UNAUTHORIZED AUTOBIOGRAPHICAL INSTRUMENT</div>
          <h1>
            enter the
            <br />
            <span>solar archive</span>
          </h1>
          <p>Nine worlds. 438 moons. Eighteen recovered archives. One solar core waiting for alignment.</p>
          <div className={styles.introRule} />
          <small>DRAG TO ORBIT · SCROLL TO TRAVEL · SELECT A PLANET</small>
        </section>
      )}

      {activeCluster && (
        <section
          className={styles.roomBrief}
          style={{ '--cluster-color': activeCluster.color } as CSSProperties}
        >
          <span>
            {activeDestination?.symbol ?? activeCluster.sigil}{' '}
            {activeDestination?.moonName ? `${activeDestination.planet.name} MOON` : 'PLANETARY ARCHIVE'}
          </span>
          <h1>{activeDestination?.name ?? 'UNMAPPED ARCHIVE'}</h1>
          <p>{activeCluster.description}</p>
          <div
            className={styles.roomMemoryList}
            aria-label={`${activeDestination?.name ?? 'Archive'} signals`}
          >
            {activeCluster.memoryIds.map((memoryId, index) => {
              const memory = memoriesById.get(memoryId);
              if (!memory) return null;
              return (
                <button
                  key={memoryId}
                  type="button"
                  className={activeMemoryId === memoryId ? styles.activeMemoryLink : ''}
                  onClick={() => selectMemory(memoryId)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {memory.title ?? (memory.text.slice(0, 36) || 'visual transmission')}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={returnToCore}>
            ← return to core
          </button>
        </section>
      )}

      {activeMemory && activeCluster && (
        <MemoryPanel
          memory={activeMemory}
          cluster={activeCluster}
          onClose={() => setActiveMemoryId(null)}
        />
      )}

      <div className={styles.controlsGuide} aria-hidden="true">
        <span>ORBIT</span> drag
        <span>ZOOM</span> wheel / pinch
        <span>OPEN</span> click / tap
        <span>SCAN</span> wire / surface
      </div>

      <div className={styles.sourceNote}>{dataset.stats.note}</div>

      <div className={styles.srOnly} aria-live="polite">
        {activeCluster
          ? `${activeDestination?.name ?? 'Archive'} selected.`
          : 'Memory system core selected.'}
      </div>
    </main>
  );
}
