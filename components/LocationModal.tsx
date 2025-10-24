'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';

// Dynamically import react-leaflet components with no SSR
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
const useMapHook = dynamic(
  () => import('react-leaflet').then((mod) => mod.useMap),
  { ssr: false }
);

// Function to get icon - will only run on client
const getIcon = () => {
  if (typeof window === 'undefined') return null;
  const L = require('leaflet');
  return L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
};

interface LocationPin {
  id: number;
  location: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
  note: string | null;
  image_url: string | null;
}

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  anonId: string;
  isEditMode: boolean;
  onLogActivity: (action: string, details?: string) => void;
}

// Component to update map bounds when pins change
function MapBoundsUpdater({ pins, focusedPinId }: { pins: LocationPin[]; focusedPinId: number | null }) {
  const { useMap } = require('react-leaflet');
  const map = useMap();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const L = require('leaflet');
    const validPins = pins.filter(pin => pin.latitude !== null && pin.longitude !== null);
    if (validPins.length > 0 && !focusedPinId) {
      const bounds = L.latLngBounds(
        validPins.map(pin => [pin.latitude!, pin.longitude!])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [pins, map, focusedPinId]);

  // Handle focused pin
  useEffect(() => {
    if (focusedPinId !== null) {
      const pin = pins.find(p => p.id === focusedPinId);
      if (pin && pin.latitude !== null && pin.longitude !== null) {
        map.setView([pin.latitude, pin.longitude], 13, {
          animate: true,
          duration: 0.5
        });
      }
    }
  }, [focusedPinId, pins, map]);

  return null;
}

interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

export default function LocationModal({ isOpen, onClose, anonId, isEditMode, onLogActivity }: LocationModalProps) {
  const [pins, setPins] = useState<LocationPin[]>([]);
  const [newLocation, setNewLocation] = useState('');
  const [newTimestamp, setNewTimestamp] = useState('');
  const [newNote, setNewNote] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAddingPin, setIsAddingPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [focusedPinId, setFocusedPinId] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Load leaflet CSS on mount
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
      require('leaflet/dist/leaflet.css');
    }
  }, []);

  // Fetch pins when modal opens
  useEffect(() => {
    if (isOpen && anonId) {
      fetchPins();
    }
  }, [isOpen, anonId]);

  // Set default timestamp to now
  useEffect(() => {
    if (isAddingPin) {
      const now = new Date();
      const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setNewTimestamp(localDateTime);
    }
  }, [isAddingPin]);

  const fetchPins = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('location_pins')
      .select('*')
      .eq('anon_id', anonId)
      .order('timestamp', { ascending: false });

    if (!error && data) {
      setPins(data);
    }
    setLoading(false);
  };

  // Search for location suggestions
  const searchLocation = async (query: string) => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`,
        {
          headers: {
            'User-Agent': 'LucyEarth-LocationTracker/1.0'
          }
        }
      );
      const data = await response.json();
      setSuggestions(data);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Location search error:', error);
      setSuggestions([]);
    }
  };

  // Handle location input change with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (newLocation) {
        searchLocation(newLocation);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [newLocation]);

  const geocodeLocation = async (location: string): Promise<{ lat: number; lon: number } | null> => {
    try {
      // Check if input is coordinates (lat,lon format)
      const coordMatch = location.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
      if (coordMatch) {
        return {
          lat: parseFloat(coordMatch[1]),
          lon: parseFloat(coordMatch[2])
        };
      }

      // Using Nominatim (OpenStreetMap) geocoding service
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
        {
          headers: {
            'User-Agent': 'LucyEarth-LocationTracker/1.0'
          }
        }
      );
      const data = await response.json();

      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon)
        };
      }
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddPin = async () => {
    if (!newLocation.trim() || !newTimestamp) return;

    setLoading(true);

    // Use selected coordinates if available, otherwise geocode
    let coords = selectedCoords;
    if (!coords) {
      coords = await geocodeLocation(newLocation);
    }

    // Upload image if selected
    let imageUrl = null;
    if (selectedImage) {
      const fileExt = selectedImage.name.split('.').pop();
      const fileName = `${anonId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('location-images')
        .upload(fileName, selectedImage);

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('location-images')
          .getPublicUrl(fileName);
        imageUrl = urlData.publicUrl;
      }
    }

    const { data, error } = await supabase
      .from('location_pins')
      .insert({
        anon_id: anonId,
        location: newLocation.trim(),
        latitude: coords?.lat || null,
        longitude: coords?.lon || null,
        timestamp: new Date(newTimestamp).toISOString(),
        note: newNote.trim() || null,
        image_url: imageUrl,
      })
      .select()
      .single();

    if (!error && data) {
      setPins([data, ...pins]);
      setNewLocation('');
      setNewTimestamp('');
      setNewNote('');
      setSelectedImage(null);
      setImagePreview(null);
      setIsAddingPin(false);
      setSelectedCoords(null);
      setSuggestions([]);
      setShowSuggestions(false);
      onLogActivity('Added location pin', `Added pin at ${newLocation}`);
    }

    setLoading(false);
  };

  const handleSelectSuggestion = (suggestion: LocationSuggestion) => {
    setNewLocation(suggestion.display_name);
    setSelectedCoords({
      lat: parseFloat(suggestion.lat),
      lon: parseFloat(suggestion.lon)
    });
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleDeletePin = async (id: number) => {
    const { error } = await supabase
      .from('location_pins')
      .delete()
      .eq('id', id)
      .eq('anon_id', anonId);

    if (!error) {
      setPins(pins.filter(pin => pin.id !== id));
      onLogActivity('Deleted location pin', 'Removed a location pin');
    }
  };

  const handleCancelAdd = () => {
    setIsAddingPin(false);
    setNewLocation('');
    setNewTimestamp('');
    setNewNote('');
    setSelectedImage(null);
    setImagePreview(null);
    setSelectedCoords(null);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // Extract main location name (before first comma)
  const getMainLocationName = (fullLocation: string): string => {
    const firstComma = fullLocation.indexOf(',');
    if (firstComma !== -1) {
      return fullLocation.substring(0, firstComma).trim();
    }
    return fullLocation;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 border-4 border-gray-900 w-full max-w-[95vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b-4 border-gray-900 p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">LOCATION MAP</h2>
          <button
            onClick={onClose}
            className="text-2xl hover:text-red-500 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content - Horizontal Layout */}
        <div className="flex-1 flex overflow-hidden max-sm:flex-col">
          {/* Map Section */}
          <div className="flex-1 p-4 overflow-hidden max-sm:h-64">
            {/* World Map */}
            <div className="relative w-full h-full border-4 border-gray-900 overflow-hidden">
              {isMounted && <MapContainer
                center={[20, 0]}
                zoom={2}
                className="h-full w-full"
                scrollWheelZoom={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {pins.map((pin) => {
                  if (pin.latitude !== null && pin.longitude !== null) {
                    // Create a highlighted icon for focused pin
                    if (typeof window === 'undefined') return null;
                    const L = require('leaflet');
                    const defaultIcon = getIcon();
                    const pinIcon = focusedPinId === pin.id
                      ? L.icon({
                          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                          iconSize: [35, 57],
                          iconAnchor: [17, 57],
                          popupAnchor: [1, -48],
                          shadowSize: [57, 57],
                          className: 'focused-marker'
                        })
                      : defaultIcon;

                    return (
                      <Marker
                        key={pin.id}
                        position={[pin.latitude, pin.longitude]}
                        icon={pinIcon}
                        eventHandlers={{
                          click: () => {
                            setFocusedPinId(pin.id);
                            onLogActivity('Viewed pin on map', `Clicked on ${getMainLocationName(pin.location)}`);
                          }
                        }}
                      >
                        <Popup>
                          <div className="text-sm">
                            <div className="font-bold">{getMainLocationName(pin.location)}</div>
                            <div className="text-xs text-gray-600 mt-1">
                              {new Date(pin.timestamp).toLocaleString()}
                            </div>
                            {pin.image_url && (
                              <img
                                src={pin.image_url}
                                alt={pin.location}
                                className="w-full h-24 object-cover mt-2 border border-gray-300"
                              />
                            )}
                            {pin.note && (
                              <div className="text-xs text-gray-700 mt-2 italic border-t border-gray-300 pt-1">
                                {pin.note}
                              </div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    );
                  }
                  return null;
                })}
                <MapBoundsUpdater pins={pins} focusedPinId={focusedPinId} />
              </MapContainer>}
            </div>
          </div>

          {/* Right Sidebar - Pins List */}
          <div className="w-[400px] border-l-4 border-gray-900 flex flex-col max-sm:w-full max-sm:border-l-0 max-sm:border-t-4 min-h-0">
            {/* Add Pin Section */}
            {isEditMode && !isAddingPin && (
              <div className="p-4 border-b-4 border-gray-900">
                <button
                  onClick={() => setIsAddingPin(true)}
                  className="w-full px-4 py-3 border-2 border-gray-900 hover:bg-pink-500 hover:text-white transition-all"
                >
                  + ADD NEW PIN
                </button>
              </div>
            )}

            {isEditMode && isAddingPin && (
              <div className="p-4 border-b-4 border-gray-900 bg-pink-50">
                <h3 className="text-lg font-bold mb-3">ADD NEW PIN</h3>
                <div className="space-y-3">
                  <div className="relative">
                    <label className="block text-sm mb-1">Location</label>
                    <input
                      type="text"
                      value={newLocation}
                      onChange={(e) => {
                        setNewLocation(e.target.value);
                        setSelectedCoords(null);
                      }}
                      onFocus={() => {
                        if (suggestions.length > 0) {
                          setShowSuggestions(true);
                        }
                      }}
                      placeholder="Search for a location..."
                      className="w-full px-3 py-2 border-2 border-gray-900 text-sm"
                      autoFocus
                    />

                    {/* Suggestions Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border-4 border-gray-900 max-h-60 overflow-y-auto">
                        {suggestions.map((suggestion, index) => (
                          <div
                            key={index}
                            onClick={() => handleSelectSuggestion(suggestion)}
                            className="px-3 py-2 cursor-pointer hover:bg-pink-100 border-b-2 border-gray-900 last:border-b-0 text-sm"
                          >
                            <div className="font-medium">{suggestion.display_name}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              {parseFloat(suggestion.lat).toFixed(4)}, {parseFloat(suggestion.lon).toFixed(4)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-gray-600 mt-1">
                      Start typing to search for a location
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Time</label>
                    <input
                      type="datetime-local"
                      value={newTimestamp}
                      onChange={(e) => setNewTimestamp(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-900 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Note (optional)</label>
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add a note about this location..."
                      className="w-full px-3 py-2 border-2 border-gray-900 text-sm resize-none"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Image (optional)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="w-full px-3 py-2 border-2 border-gray-900 text-sm"
                    />
                    {imagePreview && (
                      <div className="mt-2 relative">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full h-32 object-cover border-2 border-gray-900"
                        />
                        <button
                          onClick={() => {
                            setSelectedImage(null);
                            setImagePreview(null);
                          }}
                          className="absolute top-1 right-1 bg-red-500 text-white px-2 py-1 text-xs hover:bg-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddPin}
                      disabled={loading || !newLocation.trim() || !newTimestamp}
                      className="flex-1 px-4 py-2 border-2 border-gray-900 hover:bg-green-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {loading ? 'ADDING...' : 'ADD PIN'}
                    </button>
                    <button
                      onClick={handleCancelAdd}
                      className="flex-1 px-4 py-2 border-2 border-gray-900 hover:bg-red-500 hover:text-white transition-all"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Pins List */}
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="text-lg font-bold mb-2">PINS ({pins.length})</h3>
              {loading && pins.length === 0 && (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              )}
              {!loading && pins.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No pins yet. {isEditMode ? 'Add your first location!' : ''}
                </div>
              )}
              <div className="space-y-2">
                {pins.map((pin) => (
                  <div
                    key={pin.id}
                    className={`border-2 border-gray-900 p-3 flex justify-between items-start transition-colors ${
                      focusedPinId === pin.id
                        ? 'bg-pink-100 border-pink-500'
                        : 'hover:bg-gray-50 cursor-pointer'
                    }`}
                    onClick={() => {
                      if (pin.latitude !== null && pin.longitude !== null) {
                        setFocusedPinId(pin.id);
                        onLogActivity('Viewed pin from list', `Selected ${getMainLocationName(pin.location)}`);
                      }
                    }}
                  >
                    <div className="flex gap-3 flex-1">
                      {pin.image_url && (
                        <img
                          src={pin.image_url}
                          alt={pin.location}
                          className="w-16 h-16 object-cover border-2 border-gray-900 flex-shrink-0"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📍</span>
                          <span className="font-bold text-sm">{getMainLocationName(pin.location)}</span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {new Date(pin.timestamp).toLocaleString()}
                        </div>
                        {pin.note && (
                          <div className="text-xs text-gray-700 mt-1 italic">
                            "{pin.note}"
                          </div>
                        )}
                        {pin.latitude !== null && pin.longitude !== null && (
                          <div className="text-xs text-gray-500 mt-1">
                            {pin.latitude.toFixed(4)}, {pin.longitude.toFixed(4)}
                          </div>
                        )}
                      </div>
                    </div>
                    {isEditMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePin(pin.id);
                        }}
                        className="text-red-500 hover:text-red-700 text-xl ml-2"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
