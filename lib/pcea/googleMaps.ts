'use client';

/* eslint-disable @typescript-eslint/no-explicit-any -- the Maps JS API is loaded at runtime without bundled types */
export type Google = any;

export const MAPS_BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

let loader: Promise<Google> | null = null;

/** Loads the Google Maps JS API once per page (shared by the route map and the location autocomplete). */
export function loadGoogleMaps(key: string): Promise<Google> {
  loader ??= new Promise((resolve, reject) => {
    const w = window as unknown as Record<string, unknown> & { google?: Google };
    if (w.google?.maps?.importLibrary) return resolve(w.google);
    const callback = '__pceaMapsReady';
    w[callback] = () => resolve(w.google);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${callback}`;
    script.async = true;
    script.onerror = () => { loader = null; reject(new Error('Google Maps failed to load')); };
    document.head.appendChild(script);
  });
  return loader;
}
