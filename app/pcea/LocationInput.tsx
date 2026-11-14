'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { loadGoogleMaps, MAPS_BROWSER_KEY, type Google } from '@/lib/pcea/googleMaps';
import type { Lang } from '@/lib/pcea/i18n';

type Suggestion = { main: string; secondary: string; full: string; prediction: Google };

const MIN_CHARS = 2;
const DEBOUNCE_MS = 220;
const MAX_LENGTH = 300;

/**
 * Free-text location field with Google Places (New) autocomplete. Typing anything is always allowed;
 * picking a suggestion fills in "Place name, full address". Without a browser key it is a plain input.
 */
export default function LocationInput({ value, onChange, lang, placeholder, className, label }: {
  value: string; onChange: (value: string) => void; lang: Lang; placeholder: string; className: string; label: string;
}) {
  const listId = useId();
  const places = useRef<{ AutocompleteSuggestion: Google; AutocompleteSessionToken: Google } | null>(null);
  const session = useRef<Google>(null);
  const requestSeq = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(!!MAPS_BROWSER_KEY);

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  const ensurePlaces = async () => {
    if (places.current) return places.current;
    if (!MAPS_BROWSER_KEY) return null;
    try {
      const google = await loadGoogleMaps(MAPS_BROWSER_KEY);
      places.current = await google.maps.importLibrary('places');
      return places.current;
    } catch {
      setEnabled(false); // keep working as a plain text field
      return null;
    }
  };

  const fetchSuggestions = async (text: string) => {
    const seq = ++requestSeq.current;
    const lib = await ensurePlaces();
    if (!lib || seq !== requestSeq.current) return;
    // One session token per "type → pick" cycle so Google bills it as a single autocomplete session.
    session.current ??= new lib.AutocompleteSessionToken();
    try {
      const { suggestions: raw } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: text, sessionToken: session.current, language: lang === 'zh' ? 'zh-CN' : 'en',
      });
      if (seq !== requestSeq.current) return;
      const next: Suggestion[] = (raw ?? []).flatMap((s: Google) => {
        const p = s.placePrediction;
        if (!p) return [];
        return [{ main: p.mainText?.text ?? p.text?.text ?? '', secondary: p.secondaryText?.text ?? '', full: p.text?.text ?? '', prediction: p }];
      }).slice(0, 5);
      setSuggestions(next);
      setActive(-1);
      setOpen(next.length > 0);
    } catch {
      if (seq === requestSeq.current) { setSuggestions([]); setOpen(false); }
    }
  };

  const onType = (text: string) => {
    onChange(text);
    if (!enabled) return;
    if (debounce.current) clearTimeout(debounce.current);
    if (text.trim().length < MIN_CHARS) { requestSeq.current++; setSuggestions([]); setOpen(false); return; }
    debounce.current = setTimeout(() => void fetchSuggestions(text.trim()), DEBOUNCE_MS);
  };

  const choose = async (s: Suggestion) => {
    requestSeq.current++;
    setOpen(false);
    setSuggestions([]);
    onChange(s.full.slice(0, MAX_LENGTH));
    try {
      const place = s.prediction.toPlace();
      await place.fetchFields({ fields: ['displayName', 'formattedAddress'] });
      const name: string = place.displayName ?? s.main;
      const address: string = place.formattedAddress ?? '';
      const filled = address ? (address.startsWith(name) ? address : `${name}, ${address}`) : s.full;
      onChange(filled.slice(0, MAX_LENGTH));
    } catch { /* keep the suggestion text */ }
    session.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(i => (i + step + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault(); // pick the suggestion instead of submitting the form
      void choose(suggestions[active]);
    } else if (e.key === 'Escape') {
      e.stopPropagation(); // close the dropdown, not the whole editor
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input className={className} maxLength={MAX_LENGTH} value={value} placeholder={placeholder} aria-label={label}
        autoComplete="off" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        onFocus={() => { if (enabled) void ensurePlaces(); if (suggestions.length) setOpen(true); }}
        onBlur={() => setOpen(false)}
        onChange={e => onType(e.target.value)} onKeyDown={onKeyDown} />
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-[#ddd8cc] bg-white shadow-lg">
          <ul id={listId} role="listbox" aria-label={label}>
            {suggestions.map((s, i) => (
              <li key={`${s.full}-${i}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-[#f1eee6]' : 'hover:bg-[#f6f3ec]'}`}
                onMouseDown={e => e.preventDefault() /* keep focus so blur doesn't close before click */}
                onMouseEnter={() => setActive(i)}
                onClick={() => void choose(s)}>
                <span className="mr-1.5" aria-hidden>📍</span>
                <span className="font-medium text-[#25302a]">{s.main}</span>
                {s.secondary && <span className="ml-1.5 text-xs text-[#8a918a]">{s.secondary}</span>}
              </li>
            ))}
          </ul>
          <p className="border-t border-[#eee9df] px-3 py-1 text-right text-[10px] text-[#9aa29a]">powered by Google</p>
        </div>
      )}
    </div>
  );
}
