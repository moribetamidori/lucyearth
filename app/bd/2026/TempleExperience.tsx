'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import MiniSearch from 'minisearch';
import {
  type CSSProperties,
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  OBSERVATORY_TRANSIT_MS,
  TELESCOPE_RETURN_LOOK_AT,
  TELESCOPE_RETURN_POSITION,
  TEMPLE_ARRIVAL_KEY,
} from '@/lib/birthday/portal-transition';
import type {
  MobileMovementInput,
  TempleCluster,
  TempleDataset,
  TempleFocus,
  TempleMaterialMode,
  TempleTweetMemory,
  TempleZone,
} from '@/lib/birthday/temple-types';
import type { TempleTeleport } from './TempleScene';
import { useBirthdayAudio } from '../BirthdayAudio';
import styles from './temple.module.css';

const TempleScene = dynamic(() => import('./TempleScene'), {
  ssr: false,
  loading: () => (
    <div className={styles.loader} role="status">
      <span />
      assembling temple geometry
    </div>
  ),
});

const STORAGE_KEY = 'jmill_white_temple_v1';
const ARCHIVE_PAGE_SIZE = 50;

type SavedProgress = {
  visited: string[];
  mode: TempleMaterialMode;
};

function TelescopeTransit() {
  return (
    <div
      className={styles.telescopeTransit}
      role="status"
      aria-label="Travelling through the telescope to the observatory"
    >
      <div className={styles.transitLens} aria-hidden="true" />
      <span className={styles.transitStatus}>ALIGNING OPTICS // ENTERING SOLAR FIELD</span>
    </div>
  );
}

function TempleReturnArrival() {
  return (
    <div
      className={styles.templeReturnArrival}
      role="status"
      aria-label="Returned to the temple telescope"
    >
      <i aria-hidden="true" />
      <span>OPTICAL LINK CLOSED // TEMPLE POSITION RESTORED</span>
    </div>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}

function useMobileControls() {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse), (max-width: 760px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return mobile;
}

function formatDate(date?: string) {
  if (!date) return null;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

function MemoryPanel({
  memory,
  cluster,
  onClose,
}: {
  memory: TempleTweetMemory;
  cluster: TempleCluster;
  onClose: () => void;
}) {
  const date = formatDate(memory.publishedAt);
  const attachmentImages = memory.attachmentUrls;
  const attachmentNotes = memory.attachmentAltText;
  const attachmentCount = attachmentImages.length + attachmentNotes.length;
  return (
    <aside
      className={styles.memoryPanel}
      style={{ '--cluster-color': cluster.color } as CSSProperties}
      role="dialog"
      aria-modal="true"
      aria-label="Selected temple memory"
    >
      <button type="button" className={styles.panelClose} onClick={onClose} aria-label="Close memory">
        ×
      </button>
      <div className={styles.panelEyebrow}>
        {cluster.sigil} {cluster.name} · {memory.tweetType}
      </div>
      <h2>@jmilldotdev</h2>
      {date && <time dateTime={memory.publishedAt}>{date}</time>}
      <div className={styles.panelRule} />
      <p>{memory.text || '[ visual transmission ]'}</p>
      {attachmentImages.length > 0 && (
        <div className={styles.memoryGallery}>
          {attachmentImages.map((source, index) => (
            <a
              className={styles.memoryImage}
              href={source}
              key={`${source}-${index}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open attachment ${index + 1} at full size`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={source}
                alt={attachmentNotes[index] || `Tweet attachment ${index + 1}`}
                loading="lazy"
                decoding="async"
              />
            </a>
          ))}
        </div>
      )}
      {attachmentCount > 0 && (
        <div className={styles.attachmentMeta}>
          <span>
            ◫ {attachmentCount}{' '}
            {attachmentCount === 1 ? 'attachment' : 'attachments'} recorded
          </span>
          {attachmentNotes.map((note, index) => (
            <small key={`${note}-${index}`}>{note}</small>
          ))}
        </div>
      )}
      <a href={memory.sourceUrl} target="_blank" rel="noreferrer">
        open original source <span aria-hidden="true">↗</span>
      </a>
    </aside>
  );
}

function MobileControls({
  input,
  canInteract,
  onInteract,
}: {
  input: MutableRefObject<MobileMovementInput>;
  canInteract: boolean;
  onInteract: () => void;
}) {
  const lookPoint = useRef<{ x: number; y: number } | null>(null);

  const movementButton = (key: 'forward' | 'backward' | 'left' | 'right', label: string) => (
    <button
      type="button"
      aria-label={key}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        input.current[key] = true;
      }}
      onPointerUp={() => {
        input.current[key] = false;
      }}
      onPointerCancel={() => {
        input.current[key] = false;
      }}
    >
      {label}
    </button>
  );

  return (
    <div className={styles.mobileControls}>
      <div className={styles.movePad}>
        {movementButton('forward', '↑')}
        {movementButton('left', '←')}
        {movementButton('backward', '↓')}
        {movementButton('right', '→')}
      </div>
      <div
        className={styles.lookPad}
        aria-label="Drag to look"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          lookPoint.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          if (!lookPoint.current) return;
          input.current.lookX += event.clientX - lookPoint.current.x;
          input.current.lookY += event.clientY - lookPoint.current.y;
          lookPoint.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={() => {
          lookPoint.current = null;
        }}
        onPointerCancel={() => {
          lookPoint.current = null;
        }}
      >
        <span>LOOK</span>
      </div>
      <button
        type="button"
        className={styles.interactButton}
        disabled={!canInteract}
        onClick={onInteract}
      >
        OPEN
      </button>
    </div>
  );
}

function TempleMapFallback({
  dataset,
  visited,
  finalUnlocked,
  onZoneSelect,
  onFinalSelect,
}: {
  dataset: TempleDataset;
  visited: Set<string>;
  finalUnlocked: boolean;
  onZoneSelect: (zone: TempleZone) => void;
  onFinalSelect: () => void;
}) {
  return (
    <div className={styles.fallback}>
      <div className={styles.fallbackHeader}>
        <span>2D PILGRIMAGE MAP // SIGNALS INTACT</span>
        <h1>The temple is rendered as a navigable plan on this device.</h1>
      </div>
      <div className={styles.fallbackMap}>
        <div className={styles.fallbackAxis} />
        {dataset.temple.zones.map((zone) => (
          <button
            key={zone.id}
            type="button"
            className={zone.clusterId ? '' : styles.sanctumZone}
            style={
              {
                '--zone-left': `${50 + zone.position[0] * 2.4}%`,
                '--zone-top': `${50 - zone.position[2] * 1.75}%`,
              } as CSSProperties
            }
            onClick={() => onZoneSelect(zone)}
          >
            <span>{zone.sigil}</span>
            <strong>{zone.shortName}</strong>
            <small>
              {!zone.clusterId ? 'birthday sanctum' : visited.has(zone.id) ? 'visited' : 'enter'}
            </small>
          </button>
        ))}
      </div>
      {finalUnlocked && (
        <button
          type="button"
          className={styles.fallbackSanctum}
          onClick={onFinalSelect}
          aria-label="Open the birthday message from the cake"
        >
          🎂 OPEN BIRTHDAY CAKE
        </button>
      )}
    </div>
  );
}

export default function TempleExperience({ dataset }: { dataset: TempleDataset }) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const mobile = useMobileControls();
  const {
    enabled: soundEnabled,
    selectTrack,
    toggle: toggleSound,
    chime,
  } = useBirthdayAudio();
  const mobileInput = useRef<MobileMovementInput>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    lookX: 0,
    lookY: 0,
  });
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [started, setStarted] = useState(false);
  const [cinematicComplete, setCinematicComplete] = useState(false);
  const [mode, setMode] = useState<TempleMaterialMode>('pearl');
  const [replayKey, setReplayKey] = useState(0);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [activeMemoryId, setActiveMemoryId] = useState<string | null>(null);
  const [focused, setFocused] = useState<TempleFocus>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [archiveScope, setArchiveScope] = useState<'nearby' | 'all' | string>('nearby');
  const [visibleResultCount, setVisibleResultCount] = useState(ARCHIVE_PAGE_SIZE);
  const [finalOpen, setFinalOpen] = useState(false);
  const [teleport, setTeleport] = useState<TempleTeleport | null>(null);
  const [returningFromObservatory, setReturningFromObservatory] = useState<boolean | null>(null);
  const [observatoryTransit, setObservatoryTransit] = useState(false);
  const transitTimer = useRef<number | null>(null);

  const clusters = useMemo(
    () => new Map(dataset.clusters.map((cluster) => [cluster.id, cluster])),
    [dataset.clusters]
  );
  const memories = useMemo(
    () => new Map(dataset.memories.map((memory) => [memory.id, memory])),
    [dataset.memories]
  );
  const zones = useMemo(
    () => new Map(dataset.temple.zones.map((zone) => [zone.id, zone])),
    [dataset.temple.zones]
  );
  const zonesByCluster = useMemo(
    () => new Map(dataset.temple.zones.filter((zone) => zone.clusterId).map((zone) => [zone.clusterId, zone])),
    [dataset.temple.zones]
  );
  const activeZone = activeZoneId ? zones.get(activeZoneId) ?? null : null;
  const activeMemory = activeMemoryId ? memories.get(activeMemoryId) ?? null : null;
  const activeCluster = activeMemory ? clusters.get(activeMemory.clusterId) ?? null : null;
  const finalUnlocked = visited.size >= dataset.temple.revealThreshold;

  const search = useMemo(() => {
    const index = new MiniSearch({
      fields: ['title', 'text', 'clusterName'],
      storeFields: ['id', 'clusterId'],
      searchOptions: { prefix: true, fuzzy: 0.18 },
    });
    index.addAll(
      dataset.memories.map((memory) => ({
        id: memory.id,
        title: memory.title ?? '',
        text: memory.text,
        clusterId: memory.clusterId,
        clusterName: clusters.get(memory.clusterId)?.name ?? '',
      }))
    );
    return index;
  }, [clusters, dataset.memories]);

  const resultMemories = useMemo(() => {
    let results: TempleTweetMemory[];
    if (query.trim()) {
      results = search
        .search(query.trim())
        .map((result) => memories.get(String(result.id)))
        .filter((memory): memory is TempleTweetMemory => Boolean(memory));
    } else if (archiveScope !== 'nearby' && archiveScope !== 'all') {
      const cluster = clusters.get(archiveScope);
      results = (cluster?.memoryIds ?? [])
        .map((id) => memories.get(id))
        .filter((memory): memory is TempleTweetMemory => Boolean(memory));
    } else if (archiveScope === 'nearby' && activeZone?.clusterId) {
      const cluster = clusters.get(activeZone.clusterId);
      results = (cluster?.memoryIds ?? [])
        .map((id) => memories.get(id))
        .filter((memory): memory is TempleTweetMemory => Boolean(memory));
    } else {
      results = dataset.memories;
    }
    if (archiveScope !== 'nearby' && archiveScope !== 'all') {
      return results.filter((memory) => memory.clusterId === archiveScope);
    }
    return results;
  }, [activeZone, archiveScope, clusters, dataset.memories, memories, query, search]);

  const visibleMemories = resultMemories.slice(0, visibleResultCount);

  useEffect(() => {
    setVisibleResultCount(ARCHIVE_PAGE_SIZE);
  }, [archiveScope, query]);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    setWebglSupported(Boolean(context));
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  }, []);

  useEffect(() => {
    void selectTrack('temple');
  }, [selectTrack]);

  useEffect(() => {
    if (soundEnabled) return;
    const unlockAutoplay = () => void selectTrack('temple');
    window.addEventListener('pointerdown', unlockAutoplay, { once: true });
    window.addEventListener('keydown', unlockAutoplay, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAutoplay);
      window.removeEventListener('keydown', unlockAutoplay);
    };
  }, [selectTrack, soundEnabled]);

  useEffect(() => {
    const returning = sessionStorage.getItem(TEMPLE_ARRIVAL_KEY) === 'observatory';
    sessionStorage.removeItem(TEMPLE_ARRIVAL_KEY);
    setReturningFromObservatory(returning);
    if (!returning) return;
    setStarted(true);
    setCinematicComplete(true);
    setTeleport({
      nonce: Date.now(),
      position: TELESCOPE_RETURN_POSITION,
      lookAt: TELESCOPE_RETURN_LOOK_AT,
    });
  }, []);

  useEffect(
    () => () => {
      if (transitTimer.current !== null) window.clearTimeout(transitTimer.current);
    },
    []
  );

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as SavedProgress | null;
      if (saved?.visited && Array.isArray(saved.visited)) {
        const valid = new Set(dataset.temple.zones.filter((zone) => zone.clusterId).map((zone) => zone.id));
        setVisited(new Set(saved.visited.filter((id) => valid.has(id))));
      }
      if (saved?.mode === 'wireframe' || saved?.mode === 'pearl') setMode(saved.mode);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, [dataset.temple.zones]);

  useEffect(() => {
    if (!hydrated) return;
    const value: SavedProgress = { visited: [...visited], mode };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }, [hydrated, mode, visited]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.code === 'Tab') {
        event.preventDefault();
        setDrawerOpen((current) => !current);
      }
      if (event.code === 'Escape' && activeMemoryId) setActiveMemoryId(null);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [activeMemoryId]);

  const enterZone = useCallback(
    (zoneId: string | null) => {
      setActiveZoneId(zoneId);
      if (!zoneId) return;
      const zone = zones.get(zoneId);
      if (!zone?.clusterId) return;
      setVisited((current) => {
        if (current.has(zoneId)) return current;
        const next = new Set(current);
        next.add(zoneId);
        chime(next.size);
        return next;
      });
    },
    [chime, zones]
  );

  const selectMemory = useCallback(
    (memoryId: string) => {
      const memory = memories.get(memoryId);
      if (!memory) return;
      setActiveMemoryId(memoryId);
      setFinalOpen(false);
      setDrawerOpen(false);
      const zone = zonesByCluster.get(memory.clusterId);
      if (zone) enterZone(zone.id);
    },
    [enterZone, memories, zonesByCluster]
  );

  const teleportToZone = useCallback(
    (zone: TempleZone) => {
      setStarted(true);
      setFinalOpen(false);
      setDrawerOpen(false);
      setActiveMemoryId(null);
      setTeleport({ nonce: Date.now(), position: zone.spawn });
      enterZone(zone.id);
    },
    [enterZone]
  );

  const openFinal = useCallback(() => {
    if (!finalUnlocked) return;
    setActiveMemoryId(null);
    setDrawerOpen(false);
    setFinalOpen(true);
    chime(9);
  }, [chime, finalUnlocked]);

  const enterObservatory = useCallback(() => {
    if (observatoryTransit) return;
    void selectTrack('observatory');
    setObservatoryTransit(true);
    setActiveMemoryId(null);
    setDrawerOpen(false);
    setFinalOpen(false);
    setFocused(null);

    const navigate = () => {
      router.push('/bd/observatory');
    };
    transitTimer.current = window.setTimeout(
      navigate,
      reducedMotion ? 80 : OBSERVATORY_TRANSIT_MS
    );
  }, [observatoryTransit, reducedMotion, router, selectTrack]);

  const interact = () => {
    if (focused?.kind === 'memory') selectMemory(focused.id);
    if (focused?.kind === 'cake') openFinal();
    if (focused?.kind === 'telescope') enterObservatory();
  };

  const focusPrompt = focused?.kind === 'cake'
    ? 'E / CLICK · OPEN BIRTHDAY MESSAGE'
    : focused?.kind === 'telescope'
      ? 'E / CLICK · ENTER OBSERVATORY'
      : 'E / CLICK · OPEN SIGNAL';

  return (
    <main className={`${styles.page} ${observatoryTransit ? styles.transporting : ''}`}>
      <div className={styles.skyGlow} aria-hidden="true" />
      <div className={styles.scene}>
        {webglSupported === null || returningFromObservatory === null ? (
          <div className={styles.loader} role="status">
            <span /> testing dimensional field
          </div>
        ) : webglSupported ? (
          <TempleScene
            dataset={dataset}
            activeZoneId={activeZoneId}
            mode={mode}
            replayKey={replayKey}
            started={started}
            transporting={observatoryTransit}
            skipReveal={returningFromObservatory}
            panelOpen={Boolean(activeMemory || finalOpen || drawerOpen)}
            mobile={mobile}
            reducedMotion={reducedMotion}
            finalUnlocked={finalUnlocked}
            focused={focused}
            teleport={teleport}
            mobileInput={mobileInput}
            onFocus={setFocused}
            onMemorySelect={selectMemory}
            onZoneEnter={enterZone}
            onFinalSelect={openFinal}
            onObservatorySelect={enterObservatory}
            onCinematicComplete={() => setCinematicComplete(true)}
          />
        ) : (
          <TempleMapFallback
            dataset={dataset}
            visited={visited}
            finalUnlocked={finalUnlocked}
            onZoneSelect={teleportToZone}
            onFinalSelect={openFinal}
          />
        )}
      </div>

      {observatoryTransit && <TelescopeTransit />}
      {returningFromObservatory && <TempleReturnArrival />}

      <header className={styles.topHud}>
        <div className={styles.materialControls} aria-label="View and sound controls">
          {webglSupported === true && (
            <>
              <button
                type="button"
                className={mode === 'wireframe' ? styles.selectedMode : ''}
                onClick={() => {
                  setCinematicComplete(false);
                  setMode('wireframe');
                }}
              >
                WIREFRAME
              </button>
              <button
                type="button"
                className={mode === 'pearl' ? styles.selectedMode : ''}
                onClick={() => setMode('pearl')}
              >
                PEARL
              </button>
              <button
                type="button"
                onClick={() => {
                  setCinematicComplete(false);
                  setMode('pearl');
                  setReplayKey((current) => current + 1);
                }}
              >
                ↻ REPLAY
              </button>
            </>
          )}
          <button
            type="button"
            className={styles.sound}
            onClick={() => void toggleSound('temple')}
            aria-pressed={soundEnabled}
          >
            <span aria-hidden="true">{soundEnabled ? '◖))' : '◖·'}</span>
            SOUND {soundEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <h1 className={styles.titleMark}>
          THE MEMORY PALACE OF <span>JMILL</span>
        </h1>

        <button
          type="button"
          className={styles.indexButton}
          onClick={() => setDrawerOpen(true)}
          aria-label="Open temple index"
        >
          <span className={styles.indexSigil}>⌘</span>
          <span className={styles.indexLabel}>TEMPLE INDEX</span>
        </button>
      </header>

      {!started && webglSupported !== false && (
        <div
          className={`${styles.entryPrompt} ${cinematicComplete ? styles.entryPromptVisible : ''}`}
          aria-hidden={!cinematicComplete}
        >
          <button
            id="temple-enter"
            type="button"
            tabIndex={cinematicComplete ? 0 : -1}
            onClick={() => setStarted(true)}
          >
            ENTER
          </button>
        </div>
      )}

      {webglSupported === true && started && !activeMemory && !finalOpen && !drawerOpen && (
        <div className={styles.crosshair} aria-hidden="true">
          <i className={focused ? styles.focusedCrosshair : ''} />
          {focused && <span>{focusPrompt}</span>}
        </div>
      )}

      {webglSupported === true && !mobile && started && !activeMemory && !finalOpen && !drawerOpen && (
        <div className={styles.desktopControls} aria-hidden="true">
          <span><b>WASD</b> MOVE</span>
          <span><b>MOUSE / TRACKPAD</b> LOOK</span>
          <span><b>E / CLICK</b> OPEN</span>
          <span><b>ESC</b> RELEASE</span>
        </div>
      )}

      {activeZone && started && !drawerOpen && (
        <section className={styles.zoneHud}>
          <span>{activeZone.sigil} CURRENT LANDMARK</span>
          <strong>{activeZone.architecturalName}</strong>
          <p>{activeZone.description}</p>
          {!activeZone.clusterId && <small>INNER SANCTUM // FIVE TEMPLES REQUIRED</small>}
        </section>
      )}

      {drawerOpen && (
        <aside className={styles.drawer} aria-label="Temple index">
          <button type="button" className={styles.drawerClose} onClick={() => setDrawerOpen(false)} aria-label="Close temple index">
            ×
          </button>
          <div className={styles.drawerKicker}>TEMPLE INDEX // EIGHT INSTALLATIONS + SANCTUM</div>
          <h2>where do you want to remember?</h2>
          <div className={styles.zoneList}>
            {dataset.temple.zones.map((zone, index) => (
              <button
                type="button"
                key={zone.id}
                className={activeZoneId === zone.id ? styles.activeZoneButton : ''}
                onClick={() => teleportToZone(zone)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <i>{zone.sigil}</i>
                <strong>{zone.shortName}</strong>
                <small>
                  {!zone.clusterId ? 'sanctum' : visited.has(zone.id) ? 'visited' : 'walk there'}
                </small>
              </button>
            ))}
          </div>
          <label className={styles.searchLabel}>
            SEARCH THE RECOVERED ARCHIVE
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (event.target.value.trim()) setArchiveScope('all');
              }}
              placeholder="agents, desert, payments…"
            />
          </label>
          <div className={styles.archiveFilters} aria-label="Filter recovered archive">
            <button
              type="button"
              className={archiveScope === 'nearby' ? styles.activeArchiveFilter : ''}
              onClick={() => setArchiveScope('nearby')}
            >
              NEARBY
            </button>
            <button
              type="button"
              className={archiveScope === 'all' ? styles.activeArchiveFilter : ''}
              onClick={() => setArchiveScope('all')}
            >
              ALL {dataset.stats.tweetCount}
            </button>
            {dataset.clusters.map((cluster) => (
              <button
                type="button"
                key={cluster.id}
                className={archiveScope === cluster.id ? styles.activeArchiveFilter : ''}
                style={{ '--filter-color': cluster.color } as CSSProperties}
                onClick={() => setArchiveScope(cluster.id)}
              >
                {cluster.sigil} {cluster.shortName} {cluster.memoryIds.length}
              </button>
            ))}
          </div>
          <div className={styles.resultCount}>
            SHOWING {Math.min(visibleMemories.length, resultMemories.length)} OF {resultMemories.length} SIGNALS
          </div>
          <div className={styles.searchResults}>
            {visibleMemories.map((memory) => (
              <button type="button" key={memory.id} onClick={() => selectMemory(memory.id)}>
                <span>{clusters.get(memory.clusterId)?.sigil}</span>
                <strong>{memory.text.slice(0, 78) || '[ visual transmission ]'}</strong>
                <small>
                  {memory.tweetType} · {clusters.get(memory.clusterId)?.name}
                </small>
              </button>
            ))}
            {resultMemories.length === 0 && <p>No recovered signal matches that query.</p>}
            {visibleResultCount < resultMemories.length && (
              <button
                type="button"
                className={styles.loadMore}
                onClick={() => setVisibleResultCount((count) => count + ARCHIVE_PAGE_SIZE)}
              >
                LOAD {Math.min(ARCHIVE_PAGE_SIZE, resultMemories.length - visibleResultCount)} MORE
              </button>
            )}
          </div>
        </aside>
      )}

      {activeMemory && activeCluster && (
        <MemoryPanel
          memory={activeMemory}
          cluster={activeCluster}
          onClose={() => setActiveMemoryId(null)}
        />
      )}

      {finalOpen && (
        <section className={styles.finalReveal} role="dialog" aria-modal="true" aria-label="Birthday sanctum">
          <div className={styles.finalHalo} aria-hidden="true"><i /><i /><i /></div>
          <div className={styles.finalKicker}>INNER SANCTUM // SIGNAL DELIVERED</div>
          <h1>happy birthday, jmill</h1>
          <p>I love you and let&apos;s live a long long life together.</p>
          <div className={styles.signature}>love, lucy · 2026</div>
          <div className={styles.finalStats}>
            <span>{dataset.stats.tweetCount} recovered tweets</span>
            <span>{dataset.stats.replyCount} conversations</span>
            <span>8 living installations</span>
          </div>
          <button type="button" onClick={() => setFinalOpen(false)}>return to the grounds</button>
        </section>
      )}

      {webglSupported === true && mobile && started && !activeMemory && !finalOpen && !drawerOpen && (
        <MobileControls
          input={mobileInput}
          canInteract={Boolean(focused)}
          onInteract={interact}
        />
      )}

      <div className={styles.srOnly} aria-live="polite">
        {activeZone ? `${activeZone.architecturalName}. ${activeZone.description}` : 'Temple entrance.'}
        {finalUnlocked ? ' Birthday cake waiting inside the sanctum.' : ''}
      </div>
    </main>
  );
}
