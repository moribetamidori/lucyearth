import 'server-only';
import { decodePolyline, MAX_ROUTE_STOPS, stopLetter, type DayRoute, type RouteLeg } from './route';

/**
 * Driving route between a day's event locations, via the Google Routes API (and the Geocoding API when there's
 * only one stop). Results are cached in memory by the exact list of addresses so page views don't re-bill.
 */

type Input = { eventId: string; title: string; location: string }[];
type Resolved = Pick<DayRoute, 'legs' | 'totalSeconds' | 'totalMeters'> & { coords: ([number, number] | null)[]; error?: 'routeFailed' };

const OK_TTL = 6 * 3600_000;
const FAIL_TTL = 10 * 60_000;
const MAX_CACHE = 300;
const cache = new Map<string, { at: number; ttl: number; value: Promise<Resolved> }>();

export function mapsServerKey() {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || null;
}

const seconds = (d: unknown) => typeof d === 'string' ? Number.parseFloat(d) || 0 : 0;
type LatLng = { latLng?: { latitude?: number; longitude?: number } };
const point = (l?: LatLng): [number, number] | null =>
  typeof l?.latLng?.latitude === 'number' && typeof l.latLng.longitude === 'number' ? [l.latLng.latitude, l.latLng.longitude] : null;

async function computeRoute(key: string, addresses: string[]): Promise<Resolved> {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation',
    },
    body: JSON.stringify({
      origin: { address: addresses[0] },
      destination: { address: addresses[addresses.length - 1] },
      intermediates: addresses.slice(1, -1).map(address => ({ address })),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => null) as {
    routes?: { duration?: string; distanceMeters?: number; legs?: { duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string }; startLocation?: LatLng; endLocation?: LatLng }[] }[];
    error?: { message?: string };
  } | null;
  const route = data?.routes?.[0];
  if (!res.ok || !route?.legs || route.legs.length !== addresses.length - 1) {
    console.error('[pcea] routes api', res.status, data?.error?.message ?? 'no route');
    return { legs: [], totalSeconds: 0, totalMeters: 0, coords: addresses.map(() => null), error: 'routeFailed' };
  }
  const legs: RouteLeg[] = route.legs.map((leg, i) => ({
    from: stopLetter(i), to: stopLetter(i + 1),
    durationSeconds: seconds(leg.duration), distanceMeters: leg.distanceMeters ?? 0,
    path: leg.polyline?.encodedPolyline ? decodePolyline(leg.polyline.encodedPolyline) : [],
  }));
  const coords = addresses.map((_, i) => i < route.legs!.length ? point(route.legs![i].startLocation) : point(route.legs![i - 1].endLocation));
  return {
    legs, coords,
    totalSeconds: seconds(route.duration) || legs.reduce((s, l) => s + l.durationSeconds, 0),
    totalMeters: route.distanceMeters ?? legs.reduce((s, l) => s + l.distanceMeters, 0),
  };
}

async function geocode(key: string, address: string): Promise<Resolved> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}`;
  const data = await fetch(url, { signal: AbortSignal.timeout(10_000) }).then(r => r.json()).catch(() => null) as
    { status?: string; results?: { geometry?: { location?: { lat: number; lng: number } } }[] } | null;
  const loc = data?.results?.[0]?.geometry?.location;
  if (!loc) console.error('[pcea] geocode', data?.status ?? 'failed');
  return { legs: [], totalSeconds: 0, totalMeters: 0, coords: [loc ? [loc.lat, loc.lng] : null] };
}

function resolve(key: string, addresses: string[]): Promise<Resolved> {
  const id = JSON.stringify(addresses);
  const now = Date.now();
  const hit = cache.get(id);
  if (hit && now - hit.at < hit.ttl) return hit.value;
  const value = (addresses.length === 1 ? geocode(key, addresses[0]) : computeRoute(key, addresses))
    .catch((error): Resolved => {
      console.error('[pcea] maps request failed', error);
      return { legs: [], totalSeconds: 0, totalMeters: 0, coords: addresses.map(() => null), error: 'routeFailed' };
    });
  const entry = { at: now, ttl: OK_TTL, value };
  void value.then(r => { if (r.error || r.coords.some(c => !c)) entry.ttl = FAIL_TTL; });
  cache.delete(id);
  cache.set(id, entry);
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  return value;
}

/** `events` must already be in visiting order and filtered to those with a location. */
export async function dayRoute(events: Input): Promise<DayRoute> {
  const stops = events.slice(0, MAX_ROUTE_STOPS).map((e, i) => ({ ...e, letter: stopLetter(i), lat: null as number | null, lng: null as number | null }));
  const empty: DayRoute = { configured: true, stops, legs: [], totalSeconds: 0, totalMeters: 0 };
  const key = mapsServerKey();
  if (!key) return { ...empty, configured: false };
  if (stops.length === 0) return empty;
  const r = await resolve(key, stops.map(s => s.location));
  r.coords.forEach((c, i) => { if (c) [stops[i].lat, stops[i].lng] = c; });
  return { ...empty, stops, legs: r.legs, totalSeconds: r.totalSeconds, totalMeters: r.totalMeters, ...(r.error ? { error: r.error } : {}) };
}
