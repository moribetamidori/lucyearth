/** Shared helpers for the day's driving route (no server or browser APIs, so they're unit-testable). */

export type RouteStop = { eventId: string; title: string; location: string; letter: string; lat: number | null; lng: number | null };
export type RouteLeg = { from: string; to: string; durationSeconds: number; distanceMeters: number; path: [number, number][] };
export type DayRoute = {
  configured: boolean;
  stops: RouteStop[];
  legs: RouteLeg[];
  totalSeconds: number;
  totalMeters: number;
  error?: 'routeFailed';
};

export const MAX_ROUTE_STOPS = 25; // Routes API: origin + destination + up to 23 intermediates.

/** A, B, …, Z, AA, AB, … */
export function stopLetter(index: number): string {
  let s = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Decodes a Google encoded polyline into [lat, lng] pairs. */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  const next = () => {
    let result = 0, shift = 0, byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** "1 h 5 min" / "1小时5分钟"; under a minute rounds up to 1 min so a leg never reads as 0. */
export function formatDuration(seconds: number, lang: 'en' | 'zh'): string {
  const minutes = seconds <= 0 ? 0 : Math.max(1, Math.round(seconds / 60));
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (lang === 'zh') return h ? `${h}小时${m ? `${m}分钟` : ''}` : `${m}分钟`;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

export function formatDistance(meters: number, locale: string): string {
  const imperial = locale === 'en-US' || locale === 'en';
  const value = imperial ? meters / 1609.344 : meters / 1000;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${imperial ? 'mi' : 'km'}`;
}
