'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Map as LeafletMap } from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import { ActionButton } from './ActionButtons';
import { supabase } from '@/lib/supabase';
import 'leaflet/dist/leaflet.css';

const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);
const Circle = dynamic(
  () => import('react-leaflet').then((mod) => mod.Circle),
  { ssr: false }
);
const GeoJSONLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.GeoJSON),
  { ssr: false }
);

interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

interface GeocodeDetail {
  display_name: string;
  lat: string;
  lon: string;
  geojson?: GeoJsonObject;
}

interface FindMeEntry {
  id: string;
  place: string;
  latitude: number;
  longitude: number;
  ownerAnonId: string;
  startTime: string;
  endTime: string;
  rating: number;
  foodRating: number;
  cultureRating: number;
  livabilityRating: number;
  radius: number;
  createdAt: string;
  highlightColor: string;
  boundary?: GeoJsonObject | null;
}

type FindMeEntryRow = {
  id: string;
  place: string;
  latitude: number;
  longitude: number;
  anon_id: string;
  start_time: string;
  end_time: string;
  rating: number;
  food_rating: number | null;
  culture_rating: number | null;
  livability_rating: number | null;
  radius_m: number;
  created_at: string;
  highlight_color: string | null;
  boundary_geojson: GeoJsonObject | null;
};

interface FindMeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogActivity: (action: string, details?: string) => void;
  anonId: string;
  isEditMode: boolean;
}

export default function FindMeModal({ isOpen, onClose, onLogActivity, anonId, isEditMode }: FindMeModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [rating, setRating] = useState(3);
  const [foodRating, setFoodRating] = useState(3);
  const [cultureRating, setCultureRating] = useState(3);
  const [livabilityRating, setLivabilityRating] = useState(3);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedBoundary, setSelectedBoundary] = useState<GeoJsonObject | null>(null);
  const [entries, setEntries] = useState<FindMeEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [isClient, setIsClient] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingColor, setPendingColor] = useState<string>(() => generateRandomColor());
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const resetForm = useCallback(() => {
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    setStartTime(formatDateTimeLocal(now));
    setEndTime(formatDateTimeLocal(twoHoursLater));
    setFormError('');
    setSearchQuery('');
    setSelectedCoords(null);
    setSelectedBoundary(null);
    setRating(3);
    setFoodRating(3);
    setCultureRating(3);
    setLivabilityRating(3);
    setPendingColor(generateRandomColor());
    setEditingEntryId(null);
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoadingEntries(true);
    const { data, error } = await supabase
      .from('findme_entries')
      .select('*')
      .order('start_time', { ascending: false });

    if (error) {
      console.error('Failed to load FindMe entries:', error);
      setEntries([]);
    } else if (data) {
      const normalized = (data as FindMeEntryRow[]).map((entry) => ({
        id: entry.id,
        place: entry.place,
        latitude: entry.latitude,
        longitude: entry.longitude,
        ownerAnonId: entry.anon_id,
        startTime: entry.start_time,
        endTime: entry.end_time,
        rating: entry.rating,
        foodRating: entry.food_rating ?? 3,
        cultureRating: entry.culture_rating ?? 3,
        livabilityRating: entry.livability_rating ?? 3,
        radius: entry.radius_m,
        createdAt: entry.created_at,
        highlightColor: entry.highlight_color || '#6366f1',
        boundary: (entry.boundary_geojson ?? null) as GeoJsonObject | null,
      })) as FindMeEntry[];
      setEntries(normalized);
      if (normalized.length > 0) {
        setSelectedEntryId((prev) => prev && normalized.some((item) => item.id === prev) ? prev : normalized[0].id);
      } else {
        setSelectedEntryId(null);
      }
    }
    setLoadingEntries(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen, resetForm]);

  useEffect(() => {
    if (isOpen) {
      fetchEntries();
    }
  }, [isOpen, anonId, fetchEntries]);

  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      const L = await import('leaflet');
      const icon = await import('leaflet/dist/images/marker-icon.png');
      const iconShadow = await import('leaflet/dist/images/marker-shadow.png');

      const DefaultIcon = L.default.icon({
        iconUrl: icon.default.src,
        shadowUrl: iconShadow.default.src,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      L.default.Marker.prototype.options.icon = DefaultIcon;
    })();
  }, [isOpen]);

  useEffect(() => {
    if (!selectedEntryId || !mapRef.current) return;
    const entry = entries.find((item) => item.id === selectedEntryId);
    if (entry) {
      mapRef.current.flyTo([entry.latitude, entry.longitude], 6, {
        animate: true,
      });
    }
  }, [selectedEntryId, entries]);

  useEffect(() => {
    if (entries.length === 0 || selectedEntryId) return;
    setSelectedEntryId(entries[0]?.id ?? null);
  }, [entries, selectedEntryId]);

  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      searchLocation(searchQuery).catch((error) =>
        console.error('FindMe search failed:', error)
      );
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const pendingRadius = useMemo(() => {
    if (!selectedCoords || !startTime || !endTime || selectedBoundary) return null;
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return null;
    return getRadiusFromDuration(start, end);
  }, [selectedCoords, startTime, endTime, selectedBoundary]);

  const editingEntry = useMemo(
    () => (editingEntryId ? entries.find((entry) => entry.id === editingEntryId) ?? null : null),
    [entries, editingEntryId]
  );

  const handleSuggestionSelect = (suggestion: LocationSuggestion) => {
    setSearchQuery(suggestion.display_name);
    setSuggestions([]);
    const lat = parseFloat(suggestion.lat);
    const lon = parseFloat(suggestion.lon);
    setSelectedCoords({ lat, lon });
    setSelectedBoundary(null);
    fetchBoundaryForQuery(suggestion.display_name).then((info) => {
      if (!info) return;
      setSelectedCoords({ lat: info.lat, lon: info.lon });
      setSelectedBoundary(info.boundary);
    });
  };

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!anonId) {
      setFormError('Need an anonymous ID before saving.');
      return;
    }

    const trimmedPlace = searchQuery.trim();
    if (!trimmedPlace) {
      setFormError('Type a place to highlight.');
      return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setFormError('Please provide a valid time window.');
      return;
    }

    if (end <= start) {
      setFormError('End time has to be after the start time.');
      return;
    }

    setFormError('');
    setIsSaving(true);

    try {
      let coords = selectedCoords;
      let boundary = selectedBoundary;
      if (!coords || !boundary) {
        const lookup = await fetchBoundaryForQuery(trimmedPlace);
        if (!lookup) {
          setFormError('Could not find that location. Try a more specific name.');
          setIsSaving(false);
          return;
        }
        coords = { lat: lookup.lat, lon: lookup.lon };
        boundary = lookup.boundary;
      }

      const radius = Math.round(getRadiusFromDuration(start, end));
      const basePayload = {
        place: trimmedPlace,
        latitude: coords.lat,
        longitude: coords.lon,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        rating,
        food_rating: foodRating,
        culture_rating: cultureRating,
        livability_rating: livabilityRating,
        radius_m: radius,
        boundary_geojson: boundary,
        highlight_color: pendingColor,
      };

      if (editingEntryId) {
        const { data, error } = await supabase
          .from('findme_entries')
          .update(basePayload)
          .eq('id', editingEntryId)
          .eq('anon_id', anonId)
          .select()
          .single();

        if (error || !data) {
          throw error || new Error('No entry returned');
        }

        const updated = data as FindMeEntryRow;
        const normalized: FindMeEntry = {
          id: updated.id,
          place: updated.place,
          latitude: updated.latitude,
          longitude: updated.longitude,
          ownerAnonId: updated.anon_id,
          startTime: updated.start_time,
          endTime: updated.end_time,
          rating: updated.rating,
          foodRating: updated.food_rating ?? foodRating,
          cultureRating: updated.culture_rating ?? cultureRating,
          livabilityRating: updated.livability_rating ?? livabilityRating,
          radius: updated.radius_m,
          createdAt: updated.created_at,
          highlightColor: updated.highlight_color || pendingColor,
          boundary: updated.boundary_geojson ?? null,
        };

        setEntries((prev) => {
          const mapped = prev.map((entry) => (entry.id === normalized.id ? normalized : entry));
          return mapped.sort(
            (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
          );
        });
        setSelectedEntryId(normalized.id);
        onLogActivity('Updated FindMe spot', `${normalized.place} (${normalized.rating} stars)`);
        resetForm();
        setSuggestions([]);
      } else {
        const { data, error } = await supabase
          .from('findme_entries')
          .insert({
            ...basePayload,
            anon_id: anonId,
          })
          .select()
          .single();

        if (error || !data) {
          throw error || new Error('No entry returned');
        }

        const inserted = data as FindMeEntryRow;
        const normalized: FindMeEntry = {
          id: inserted.id,
          place: inserted.place,
          latitude: inserted.latitude,
          longitude: inserted.longitude,
          ownerAnonId: inserted.anon_id,
          startTime: inserted.start_time,
          endTime: inserted.end_time,
          rating: inserted.rating,
          foodRating: inserted.food_rating ?? foodRating,
          cultureRating: inserted.culture_rating ?? cultureRating,
          livabilityRating: inserted.livability_rating ?? livabilityRating,
          radius: inserted.radius_m,
          createdAt: inserted.created_at,
          highlightColor: inserted.highlight_color || pendingColor,
          boundary: inserted.boundary_geojson ?? null,
        };

        setEntries((prev) => [normalized, ...prev]);
        setSelectedEntryId(normalized.id);
        setSelectedCoords(null);
        setSelectedBoundary(null);
        setSuggestions([]);
        setSearchQuery('');
        setRating(3);
        setFoodRating(3);
        setCultureRating(3);
        setLivabilityRating(3);
        setPendingColor(generateRandomColor());
        onLogActivity('Added FindMe spot', `${normalized.place} (${normalized.rating} stars)`);
      }
    } catch (error) {
      console.error('Failed to save FindMe entry:', error);
      setFormError('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = (entry: FindMeEntry) => {
    if (entry.ownerAnonId !== anonId) return;
    setEditingEntryId(entry.id);
    setSelectedEntryId(entry.id);
    setSearchQuery(entry.place);
    setStartTime(formatDateTimeLocal(new Date(entry.startTime)));
    setEndTime(formatDateTimeLocal(new Date(entry.endTime)));
    setRating(entry.rating);
    setFoodRating(entry.foodRating);
    setCultureRating(entry.cultureRating);
    setLivabilityRating(entry.livabilityRating);
    setPendingColor(entry.highlightColor || '#6366f1');
    setSelectedCoords({ lat: entry.latitude, lon: entry.longitude });
    setSelectedBoundary(entry.boundary ?? null);
    setFormError('');
    setSuggestions([]);
  };

  const handleCancelEdit = () => {
    resetForm();
    setSuggestions([]);
  };

  const handleDeleteEntry = async (entryId: string) => {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || entry.ownerAnonId !== anonId) {
      return;
    }
    setEntries((prev) => prev.filter((item) => item.id !== entryId));
    if (selectedEntryId === entryId) {
      setSelectedEntryId(null);
    }

    const { error } = await supabase
      .from('findme_entries')
      .delete()
      .eq('id', entryId)
      .eq('anon_id', anonId);

    if (error) {
      console.error('Failed to delete FindMe entry:', error);
      // Re-fetch to ensure UI matches DB if delete failed
      fetchEntries();
      return;
    }

    if (entry) {
      onLogActivity('Removed FindMe spot', entry.place);
    }
  };

  const handleClose = () => {
    setSuggestions([]);
    resetForm();
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border-4 border-gray-900 shadow-[8px_8px_0_0_#000] max-w-6xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b-2 border-gray-900 px-5 py-3">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">FindMe</h2>
            <p className="text-sm text-gray-500">
              Drop a pin, note how long you stayed, and rate the vibe.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="px-3 py-1 border-2 border-gray-900 hover:bg-red-500 hover:text-white transition-colors text-sm cursor-pointer"
          >
            CLOSE
          </button>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
          <div className="lg:w-1/2 flex-1 border-b-2 lg:border-b-0 lg:border-r-2 border-gray-900 min-h-[260px] relative">
            {isClient && (
              <MapContainer
                center={[20, 0]}
                zoom={2}
                scrollWheelZoom
                className="h-full w-full"
                style={{ minHeight: '260px' }}
                ref={mapRef}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                />

                {entries.map((entry) => {
                  const isSelected = entry.id === selectedEntryId;
                  const entryColor = entry.highlightColor || '#4f46e5';

                  return entry.boundary ? (
                    <GeoJSONLayer
                      key={entry.id}
                      data={entry.boundary}
                      style={() => ({
                        color: entryColor,
                        weight: isSelected ? 3 : 1.5,
                        fillColor: entryColor,
                        fillOpacity: isSelected ? 0.38 : 0.22,
                      })}
                      eventHandlers={{
                        click: () => setSelectedEntryId(entry.id),
                      }}
                    />
                  ) : (
                    <Circle
                      key={entry.id}
                      center={[entry.latitude, entry.longitude]}
                      radius={entry.radius}
                      pathOptions={{
                        color: entryColor,
                        fillColor: entryColor,
                        weight: isSelected ? 3 : 1,
                        fillOpacity: isSelected ? 0.32 : 0.18,
                      }}
                      eventHandlers={{
                        click: () => setSelectedEntryId(entry.id),
                      }}
                    />
                  );
                })}

                {entries.map((entry) => (
                  <Marker
                    key={`${entry.id}-marker`}
                    position={[entry.latitude, entry.longitude]}
                    eventHandlers={{
                      click: () => setSelectedEntryId(entry.id),
                    }}
                  >
                    <Popup>
                      <div className="space-y-1">
                        <p className="font-semibold">{entry.place}</p>
                        <p className="text-xs text-gray-600">
                          {formatDisplayDate(entry.startTime)} → {formatDisplayDate(entry.endTime)}
                        </p>
                        <p className="text-xs">{renderStaticStars(entry.rating)}</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {selectedBoundary && (
                  <GeoJSONLayer
                    data={selectedBoundary}
                    style={() => ({
                      color: pendingColor,
                      weight: 2,
                      fillColor: pendingColor,
                      fillOpacity: 0.25,
                      dashArray: '4 4',
                    })}
                  />
                )}

                {selectedCoords && pendingRadius && (
                  <Circle
                    center={[selectedCoords.lat, selectedCoords.lon]}
                    radius={pendingRadius}
                    pathOptions={{
                      color: pendingColor,
                      fillColor: pendingColor,
                      weight: 2,
                      dashArray: '4 4',
                      fillOpacity: 0.25,
                    }}
                  />
                )}
              </MapContainer>
            )}
          </div>

          <div className="lg:w-1/2 flex-1 overflow-y-auto p-5 space-y-6 bg-gray-50">
            {isEditMode && (
            <form onSubmit={handleSubmitEntry} className="space-y-3">
              {editingEntryId && (
                <div className="flex items-center justify-between border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-blue-500 font-semibold">
                      Editing
                    </p>
                    <p className="text-sm font-semibold text-blue-900">
                      {editingEntry?.place ?? 'Selected place'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="text-blue-700 font-semibold uppercase tracking-wider hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                  Location
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSelectedCoords(null);
                      setSelectedBoundary(null);
                    }}
                    placeholder="Search any place on Earth"
                    className="w-full px-3 py-2 border-2 border-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 bg-white border-2 border-gray-900 border-t-0 shadow-lg max-h-48 overflow-auto">
                      {suggestions.map((suggestion) => (
                        <button
                          type="button"
                          key={`${suggestion.lat}-${suggestion.lon}`}
                          onClick={() => handleSuggestionSelect(suggestion)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                        >
                          {suggestion.display_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                    Start Time
                  </label>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                    End Time
                  </label>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    required
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                    Overall Rating
                  </label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setRating(star)}
                        className={`text-2xl transition-transform ${rating >= star ? 'text-yellow-500' : 'text-gray-300'
                          } hover:scale-110`}
                        aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Food', value: foodRating, setter: setFoodRating },
                    { label: 'Culture', value: cultureRating, setter: setCultureRating },
                    { label: 'Livability', value: livabilityRating, setter: setLivabilityRating },
                  ].map((category) => (
                    <div key={category.label}>
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                        {category.label}
                      </label>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            type="button"
                            key={`${category.label}-${star}`}
                            onClick={() => category.setter(star)}
                            className={`text-xl transition-transform ${category.value >= star ? 'text-amber-500' : 'text-gray-300'
                              } hover:scale-110`}
                            aria-label={`${category.label} rating ${star} star${star > 1 ? 's' : ''}`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                  Highlight Color
                </label>
                <div className="flex items-center gap-3">
                  <div
                    className="w-14 h-6 border-2 border-gray-900"
                    style={{ backgroundColor: pendingColor }}
                  />
                  <button
                    type="button"
                    onClick={() => setPendingColor(generateRandomColor())}
                    className="px-3 py-1 border-2 border-gray-900 text-xs hover:bg-gray-900 hover:text-white transition-colors"
                  >
                    Shuffle
                  </button>
                </div>
              </div>

              {formError && <div className="text-xs text-red-500">{formError}</div>}

              <button
                type="submit"
                className="w-full px-4 py-2 border-2 border-gray-900 bg-white hover:bg-sky-200 transition-colors text-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isSaving}
              >
                {isSaving
                  ? editingEntryId
                    ? 'Updating...'
                    : 'Saving...'
                  : editingEntryId
                  ? 'Update this place'
                  : 'Highlight this place'}
              </button>
            </form>
            )}

            <div>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center justify-between">
                Places I&apos;ve been
                <span className="text-sm text-gray-500 font-normal">{entries.length}</span>
              </h3>

              {loadingEntries && (
                <p className="text-sm text-gray-500 mt-2">Loading your highlights…</p>
              )}

              {!loadingEntries && entries.length === 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  Nothing logged yet. Add a spot to see it glow on the map.
                </p>
              )}

              <div className="mt-3 space-y-3">
                {entries.map((entry) => {
                  const isOwnEntry = entry.ownerAnonId === anonId;
                  return (
                    <div
                      key={entry.id}
                      className={`relative border-2 border-gray-900 bg-white p-3 transition cursor-pointer ${entry.id === selectedEntryId ? 'shadow-[4px_4px_0_0_#000]' : ''
                        }`}
                      onClick={() => setSelectedEntryId(entry.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-gray-900">{entry.place}</p>
                              {editingEntryId === entry.id && (
                                <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-600">
                                  Editing
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-gray-500">
                              <span>Color</span>
                              <span
                                className="inline-block w-3 h-3 rounded-full border border-gray-900"
                                style={{ backgroundColor: entry.highlightColor }}
                              />
                            </div>
                          </div>
                          <p className="text-xs text-gray-500">
                            {formatDisplayDate(entry.startTime)} → {formatDisplayDate(entry.endTime)}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            Duration: {formatDuration(entry.startTime, entry.endTime)}
                          </p>
                          <div className="flex items-center gap-1 text-lg">
                            {renderStaticStars(entry.rating)}
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-gray-600">
                            {[
                              { label: 'Food', value: entry.foodRating },
                              { label: 'Culture', value: entry.cultureRating },
                              { label: 'Livability', value: entry.livabilityRating },
                            ].map((metric) => (
                              <div key={`${entry.id}-${metric.label}`} className="flex items-center gap-2">
                                <span className="w-16 uppercase tracking-wide text-[10px] text-gray-500">
                                  {metric.label}
                                </span>
                                <span className="flex text-sm">
                                  {renderStaticStars(metric.value, 'text-amber-500')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {isOwnEntry && (
                          <div className="flex flex-col gap-1">
                            <ActionButton
                              variant="edit"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleStartEdit(entry);
                              }}
                            />
                            <ActionButton
                              variant="delete"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteEntry(entry.id);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function searchLocation(query: string) {
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}&limit=5`);
  if (!response.ok) {
    throw new Error('Failed to fetch suggestions');
  }
  return (await response.json()) as LocationSuggestion[];
}

async function fetchBoundaryForQuery(query: string) {
  if (!query.trim()) return null;
  try {
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}&limit=1&polygon=1`);
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as GeocodeDetail[];
    if (Array.isArray(data) && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        boundary: data[0].geojson ?? null,
      };
    }
  } catch (error) {
    console.error('fetchBoundaryForQuery error:', error);
  }
  return null;
}

function formatDateTimeLocal(date: Date) {
  const offsetMilliseconds = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() - offsetMilliseconds);
  return localDate.toISOString().slice(0, 16);
}

function formatDuration(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diff = endDate.getTime() - startDate.getTime();
  if (diff <= 0) return '0 min';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.round((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) {
    return `${minutes} min`;
  }
  if (minutes === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${minutes} min`;
}

function formatDisplayDate(date: string) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
  return formatter.format(new Date(date));
}

function getRadiusFromDuration(start: Date, end: Date) {
  const diffHours = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
  const radiusMeters = diffHours * 3000;
  return Math.min(1200000, Math.max(2500, radiusMeters));
}

function renderStaticStars(rating: number, activeClass = 'text-yellow-500') {
  return (
    <>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={rating >= star ? activeClass : 'text-gray-300'}>
          ★
        </span>
      ))}
    </>
  );
}

function generateRandomColor() {
  const palette = ['#f97316', '#ec4899', '#14b8a6', '#8b5cf6', '#facc15', '#06b6d4', '#ef4444', '#0ea5e9', '#22c55e'];
  return palette[Math.floor(Math.random() * palette.length)];
}
