'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { ActionButton } from './ActionButtons';

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
const MapBoundsUpdater = dynamic(
  () => import('./MapBoundsUpdater'),
  { ssr: false }
);

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
  const [editingPinId, setEditingPinId] = useState<number | null>(null);
  const [editLocation, setEditLocation] = useState('');
  const [editTimestamp, setEditTimestamp] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editSelectedImage, setEditSelectedImage] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [editSelectedCoords, setEditSelectedCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [editSuggestions, setEditSuggestions] = useState<LocationSuggestion[]>([]);
  const [showEditSuggestions, setShowEditSuggestions] = useState(false);

  // Set mounted state and initialize Leaflet
  useEffect(() => {
    setIsMounted(true);

    // Initialize Leaflet icons only on client side
    if (typeof window !== 'undefined') {
      // Load Leaflet CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      // Load Leaflet and configure icons
      import('leaflet').then((L) => {
        // Fix for default marker icons in Next.js
        import('leaflet/dist/images/marker-icon.png').then((icon) => {
          import('leaflet/dist/images/marker-shadow.png').then((iconShadow) => {
            const DefaultIcon = L.default.icon({
              iconUrl: icon.default.src,
              shadowUrl: iconShadow.default.src,
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [1, -34],
              shadowSize: [41, 41]
            });

            L.default.Marker.prototype.options.icon = DefaultIcon;
          });
        });
      });
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
        `/api/geocode?q=${encodeURIComponent(query)}&limit=5`
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

  // Handle edit location search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (editLocation && editingPinId) {
        searchEditLocation(editLocation);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [editLocation, editingPinId]);

  const searchEditLocation = async (query: string) => {
    if (query.trim().length < 3) {
      setEditSuggestions([]);
      setShowEditSuggestions(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(query)}&limit=5`
      );
      const data = await response.json();
      setEditSuggestions(data);
      setShowEditSuggestions(true);
    } catch (error) {
      console.error('Location search error:', error);
      setEditSuggestions([]);
    }
  };

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

      // Using Nominatim (OpenStreetMap) geocoding service via API route
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(location)}&limit=1`
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

  const handleEditPin = (pin: LocationPin) => {
    setEditingPinId(pin.id);
    setEditLocation(pin.location);
    const localDateTime = new Date(new Date(pin.timestamp).getTime() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setEditTimestamp(localDateTime);
    setEditNote(pin.note || '');
    setEditImagePreview(pin.image_url);
    setEditSelectedImage(null);
    setEditSelectedCoords(pin.latitude && pin.longitude ? { lat: pin.latitude, lon: pin.longitude } : null);
    setEditSuggestions([]);
    setShowEditSuggestions(false);
  };

  const handleEditImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEditSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectEditSuggestion = (suggestion: LocationSuggestion) => {
    setEditLocation(suggestion.display_name);
    setEditSelectedCoords({
      lat: parseFloat(suggestion.lat),
      lon: parseFloat(suggestion.lon)
    });
    setShowEditSuggestions(false);
    setEditSuggestions([]);
  };

  const handleUpdatePin = async () => {
    if (!editLocation.trim() || !editTimestamp || !editingPinId) return;

    setLoading(true);

    // Use selected coordinates if available, otherwise geocode
    let coords = editSelectedCoords;
    if (!coords) {
      coords = await geocodeLocation(editLocation);
    }

    // Find the existing pin to get its image URL
    const existingPin = pins.find(p => p.id === editingPinId);
    let imageUrl = existingPin?.image_url || null;

    // Upload new image if selected
    if (editSelectedImage) {
      const fileExt = editSelectedImage.name.split('.').pop();
      const fileName = `${anonId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('location-images')
        .upload(fileName, editSelectedImage);

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('location-images')
          .getPublicUrl(fileName);
        imageUrl = urlData.publicUrl;

        // Delete old image if it exists
        if (existingPin?.image_url) {
          const oldFileName = existingPin.image_url.split('/').pop();
          if (oldFileName) {
            await supabase.storage
              .from('location-images')
              .remove([`${anonId}/${oldFileName}`]);
          }
        }
      }
    }

    const { data, error } = await supabase
      .from('location_pins')
      .update({
        location: editLocation.trim(),
        latitude: coords?.lat || null,
        longitude: coords?.lon || null,
        timestamp: new Date(editTimestamp).toISOString(),
        note: editNote.trim() || null,
        image_url: imageUrl,
      })
      .eq('id', editingPinId)
      .eq('anon_id', anonId)
      .select()
      .single();

    if (!error && data) {
      setPins(pins.map(pin => pin.id === editingPinId ? data : pin));
      handleCancelEdit();
      onLogActivity('Updated location pin', `Updated pin at ${editLocation}`);
    }

    setLoading(false);
  };

  const handleCancelEdit = () => {
    setEditingPinId(null);
    setEditLocation('');
    setEditTimestamp('');
    setEditNote('');
    setEditSelectedImage(null);
    setEditImagePreview(null);
    setEditSelectedCoords(null);
    setEditSuggestions([]);
    setShowEditSuggestions(false);
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
          <div className="flex-1 p-4 overflow-hidden max-sm:h-[50vh] max-sm:min-h-[50vh]">
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
                    return (
                      <Marker
                        key={pin.id}
                        position={[pin.latitude, pin.longitude]}
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
          <div className="w-[400px] border-l-4 border-gray-900 flex flex-col max-sm:w-full max-sm:border-l-0 max-sm:border-t-4 min-h-0 max-sm:flex-1 max-sm:overflow-y-auto">
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
                  editingPinId === pin.id ? (
                    // Edit Form
                    <div key={pin.id} className="border-2 border-blue-500 p-3 bg-blue-50">
                      <h4 className="text-sm font-bold mb-3">EDIT PIN</h4>
                      <div className="space-y-3">
                        <div className="relative">
                          <label className="block text-sm mb-1">Location</label>
                          <input
                            type="text"
                            value={editLocation}
                            onChange={(e) => {
                              setEditLocation(e.target.value);
                              setEditSelectedCoords(null);
                            }}
                            onFocus={() => {
                              if (editSuggestions.length > 0) {
                                setShowEditSuggestions(true);
                              }
                            }}
                            placeholder="Search for a location..."
                            className="w-full px-3 py-2 border-2 border-gray-900 text-sm"
                          />

                          {/* Suggestions Dropdown */}
                          {showEditSuggestions && editSuggestions.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border-4 border-gray-900 max-h-60 overflow-y-auto">
                              {editSuggestions.map((suggestion, index) => (
                                <div
                                  key={index}
                                  onClick={() => handleSelectEditSuggestion(suggestion)}
                                  className="px-3 py-2 cursor-pointer hover:bg-blue-100 border-b-2 border-gray-900 last:border-b-0 text-sm"
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
                            value={editTimestamp}
                            onChange={(e) => setEditTimestamp(e.target.value)}
                            className="w-full px-3 py-2 border-2 border-gray-900 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm mb-1">Note (optional)</label>
                          <textarea
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
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
                            onChange={handleEditImageSelect}
                            className="w-full px-3 py-2 border-2 border-gray-900 text-sm"
                          />
                          {editImagePreview && (
                            <div className="mt-2 relative">
                              <img
                                src={editImagePreview}
                                alt="Preview"
                                className="w-full h-32 object-cover border-2 border-gray-900"
                              />
                              <button
                                onClick={() => {
                                  setEditSelectedImage(null);
                                  setEditImagePreview(null);
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
                            onClick={handleUpdatePin}
                            disabled={loading || !editLocation.trim() || !editTimestamp}
                            className="flex-1 px-4 py-2 border-2 border-gray-900 hover:bg-green-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          >
                            {loading ? 'UPDATING...' : 'UPDATE'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="flex-1 px-4 py-2 border-2 border-gray-900 hover:bg-red-500 hover:text-white transition-all"
                          >
                            CANCEL
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Display Mode
                    <div
                      key={pin.id}
                      className={`border-2 border-gray-900 flex transition-colors overflow-hidden ${
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
                      {pin.image_url && (
                        <img
                          src={pin.image_url}
                          alt={pin.location}
                          className="w-32 h-32 object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 p-3 flex flex-col">
                        <div className="flex items-center gap-2 justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">📍</span>
                            <span className="font-bold text-sm">{getMainLocationName(pin.location)}</span>
                          </div>
                          {isEditMode && (
                            <div className="flex gap-1">
                              <ActionButton
                                variant="edit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditPin(pin);
                                }}
                              />
                              <ActionButton
                                variant="delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePin(pin.id);
                                }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {new Date(pin.timestamp).toLocaleString()}
                        </div>
                        {pin.note && (
                          <div className="text-xs text-gray-700 mt-1 italic">
                            &ldquo;{pin.note}&rdquo;
                          </div>
                        )}
                        {pin.latitude !== null && pin.longitude !== null && (
                          <div className="text-xs text-gray-500 mt-1">
                            {pin.latitude.toFixed(4)}, {pin.longitude.toFixed(4)}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
