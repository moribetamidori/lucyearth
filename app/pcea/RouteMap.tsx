'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dict, Lang } from '@/lib/pcea/i18n';
import { formatDistance, formatDuration, type DayRoute } from '@/lib/pcea/route';
import { loadGoogleMaps, MAPS_BROWSER_KEY as BROWSER_KEY, type Google } from '@/lib/pcea/googleMaps';

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';
const STOP_COLOR = '#d0763f';
const LINE_COLOR = '#3f6f8f';

function chip(text: string, className: string, background?: string) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  if (background) el.style.backgroundColor = background;
  return el;
}

/** Google map of the day's stops (A, B, C…) joined by the driving route, with each leg's drive time beside it. */
export default function RouteMap({ route, loading, skipped, t, lang }: { route: DayRoute | null; loading: boolean; skipped: number; t: Dict; lang: Lang }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Google>(null);
  const overlays = useRef<{ setMap?: (m: null) => void; map?: unknown }[]>([]);
  const [mapError, setMapError] = useState(false);
  const located = route?.stops.filter(s => s.lat !== null && s.lng !== null) ?? [];
  const showMap = !!BROWSER_KEY && route?.configured && located.length > 0;

  useEffect(() => {
    if (!showMap || !route || !el.current) return;
    let cancelled = false;
    (async () => {
      try {
        const google = await loadGoogleMaps(BROWSER_KEY!);
        const [{ Map, Polyline, LatLngBounds }, { AdvancedMarkerElement }] = await Promise.all([
          google.maps.importLibrary('maps'), google.maps.importLibrary('marker'),
        ]);
        if (cancelled || !el.current) return;
        if (map.current?.getDiv() !== el.current) map.current = new Map(el.current, {
          mapId: MAP_ID, disableDefaultUI: true, zoomControl: true, fullscreenControl: true, gestureHandling: 'cooperative',
        });
        for (const o of overlays.current) { if (o.setMap) o.setMap(null); else o.map = null; }
        overlays.current = [];

        const bounds = new LatLngBounds();
        for (const leg of route.legs) {
          if (leg.path.length === 0) continue;
          const path = leg.path.map(([lat, lng]) => ({ lat, lng }));
          path.forEach(p => bounds.extend(p));
          overlays.current.push(new Polyline({ map: map.current, path, strokeColor: LINE_COLOR, strokeOpacity: 0.85, strokeWeight: 5 }));
          const mid = path[Math.floor(path.length / 2)];
          overlays.current.push(new AdvancedMarkerElement({
            map: map.current, position: mid, zIndex: 1,
            content: chip(`${leg.from}→${leg.to} · ${formatDuration(leg.durationSeconds, lang)}`,
              'rounded-full border border-[#3f6f8f]/30 bg-white px-2 py-0.5 text-[11px] font-semibold text-[#3f6f8f] shadow-sm whitespace-nowrap'),
          }));
        }
        for (const s of located) {
          const position = { lat: s.lat!, lng: s.lng! };
          bounds.extend(position);
          overlays.current.push(new AdvancedMarkerElement({
            map: map.current, position, title: `${s.letter} · ${s.title}`, zIndex: 2,
            content: chip(s.letter, 'grid size-7 place-items-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md', STOP_COLOR),
          }));
        }
        if (located.length === 1 && route.legs.length === 0) {
          map.current.setCenter({ lat: located[0].lat!, lng: located[0].lng! });
          map.current.setZoom(14);
        } else {
          map.current.fitBounds(bounds, 48);
        }
        setMapError(false);
      } catch (e) {
        console.error('[pcea] map', e);
        if (!cancelled) setMapError(true);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `located` derives from `route`
  }, [showMap, route, lang]);

  if (!route) return loading ? <p className="text-sm text-[#8a918a]">{t.routeLoading}</p> : null;

  const message = !route.configured ? t.routeNotConfigured
    : route.error ? t.routeFailed
    : route.stops.length === 1 ? t.routeOneStop
    : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e7e3da] bg-[#fffdf9] shadow-[0_12px_32px_#3b302008]" aria-label={t.routeTitle} data-testid="route-map">
      <div className="grid md:grid-cols-[1fr_230px]">
        {showMap && !mapError
          ? <div ref={el} className="h-64 w-full bg-[#ece9e1] md:h-80" />
          : null}
        <div className={`p-4 text-sm ${showMap && !mapError ? 'md:border-l md:border-[#eee9df]' : 'md:col-span-2'}`}>
          <h3 className="font-serif text-base">{t.routeTitle}</h3>
          {message && <p className="mt-1 text-xs text-[#8a918a]">{message}</p>}
          <ol className="mt-2 space-y-1.5">
            {route.stops.map((s, i) => {
              const leg = route.legs[i];
              return (
                <li key={s.eventId}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: STOP_COLOR }}>{s.letter}</span>
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="font-medium">{s.title}</span>
                      <span className="block text-xs text-[#8a918a]">{s.location}</span>
                    </span>
                  </div>
                  {leg && (
                    <div className="my-1 ml-2.5 border-l-2 border-dashed border-[#3f6f8f]/40 py-1 pl-4 text-xs text-[#3f6f8f]" data-testid="route-leg">
                      🚗 {leg.from}→{leg.to} <strong>{formatDuration(leg.durationSeconds, lang)}</strong>
                      <span className="text-[#8a918a]"> · {formatDistance(leg.distanceMeters, t.locale)}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {skipped > 0 && <p className="mt-2 text-xs text-[#8a918a]">{t.routeSkipped(skipped)}</p>}
          {route.legs.length > 0 && (
            <p className="mt-3 border-t border-[#eee9df] pt-2 text-sm" data-testid="route-total">
              {t.routeTotal} <strong>{formatDuration(route.totalSeconds, lang)}</strong>
              <span className="text-xs text-[#8a918a]"> · {formatDistance(route.totalMeters, t.locale)}</span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
