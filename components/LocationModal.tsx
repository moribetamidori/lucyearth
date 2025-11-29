'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { ActionButton } from './ActionButtons';
import ImageLightbox from './ImageLightbox';
import { convertToWebP } from '@/lib/imageUpload';
import 'leaflet/dist/leaflet.css';

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

const PINS_PER_PAGE = 10;
const PIN_LOAD_STEP = 5;

interface LocationPinImage {
  id: string;
  pin_id: number;
  image_url: string;
  display_order: number;
}

interface LocationPin {
  id: number;
  name: string | null;
  location: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
  note: string | null;
  anon_id: string; // Track who created this pin
  images?: LocationPinImage[];
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
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newTimestamp, setNewTimestamp] = useState('');
  const [newNote, setNewNote] = useState('');
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isAddingPin, setIsAddingPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [focusedPinId, setFocusedPinId] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [editingPinId, setEditingPinId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editTimestamp, setEditTimestamp] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editSelectedImages, setEditSelectedImages] = useState<File[]>([]);
  const [editImagePreviews, setEditImagePreviews] = useState<string[]>([]);
  const [editExistingImages, setEditExistingImages] = useState<LocationPinImage[]>([]);
  const [editSelectedCoords, setEditSelectedCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [editSuggestions, setEditSuggestions] = useState<LocationSuggestion[]>([]);
  const [showEditSuggestions, setShowEditSuggestions] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);
  const [totalPins, setTotalPins] = useState(0);

  // Set mounted state and initialize Leaflet
  useEffect(() => {
    setIsMounted(true);

    if (typeof window === 'undefined') {
      return;
    }

    // Configure default marker icons once the component mounts
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
        shadowSize: [41, 41]
      });

      L.default.Marker.prototype.options.icon = DefaultIcon;
    })();
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

  const fetchPins = async ({ start = 0, limit = PINS_PER_PAGE, append = false }: { start?: number; limit?: number; append?: boolean } = {}) => {
    setLoading(true);
    const normalizedStart = Math.max(0, start);
    const normalizedLimit = Math.max(1, limit);
    const rangeEnd = normalizedStart + normalizedLimit - 1;
    const { data, error, count } = await supabase
      .from('location_pins')
      .select(`
        *,
        images:location_pin_images(*)
      `, { count: 'exact' })
      .order('timestamp', { ascending: false })
      .range(normalizedStart, rangeEnd);

    if (!error && data) {
      const pinsWithSortedImages = data.map(pin => ({
        ...pin,
        images: pin.images?.sort((a: LocationPinImage, b: LocationPinImage) => a.display_order - b.display_order) || []
      }));

      setPins((prev) => (append ? [...prev, ...pinsWithSortedImages] : pinsWithSortedImages));

      if (typeof count === 'number') {
        setTotalPins(count);
      } else if (!append) {
        setTotalPins(pinsWithSortedImages.length);
      }
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
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      setSelectedImages(fileArray);

      // Generate previews for all files
      const previews: string[] = [];
      let loadedCount = 0;

      fileArray.forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          previews.push(reader.result as string);
          loadedCount++;
          if (loadedCount === fileArray.length) {
            setImagePreviews(previews);
          }
        };
        reader.readAsDataURL(file);
      });
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

    // First create the pin
    const { data, error } = await supabase
      .from('location_pins')
      .insert({
        anon_id: anonId,
        name: newName.trim() || null,
        location: newLocation.trim(),
        latitude: coords?.lat || null,
        longitude: coords?.lon || null,
        timestamp: new Date(newTimestamp).toISOString(),
        note: newNote.trim() || null,
      })
      .select()
      .single();

    if (!error && data) {
      // Upload images if selected
      if (selectedImages.length > 0) {
        for (let i = 0; i < selectedImages.length; i++) {
          const file = selectedImages[i];

          // Convert to WebP
          const webpBlob = await convertToWebP(file, 0.8);
          const fileName = `${anonId}/${Date.now()}_${i}.webp`;

          const { error: uploadError } = await supabase.storage
            .from('location-images')
            .upload(fileName, webpBlob, {
              contentType: 'image/webp',
            });

          if (!uploadError) {
            const { data: urlData } = supabase.storage
              .from('location-images')
              .getPublicUrl(fileName);

            // Insert image record
            await supabase
              .from('location_pin_images')
              .insert({
                pin_id: data.id,
                image_url: urlData.publicUrl,
                display_order: i,
              });
          }
        }
      }

      // Refetch pins to get the updated data with images
      await fetchPins({
        start: 0,
        limit: Math.max(PINS_PER_PAGE, pins.length + 1),
      });

      setNewName('');
      setNewLocation('');
      setNewTimestamp('');
      setNewNote('');
      setSelectedImages([]);
      setImagePreviews([]);
      setIsAddingPin(false);
      setSelectedCoords(null);
      setSuggestions([]);
      setShowSuggestions(false);
      onLogActivity('Added location pin', `Added pin at ${newName || newLocation}`);
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
      .eq('id', id);

    if (!error) {
      const desiredCount = Math.max(PINS_PER_PAGE, pins.length - 1);
      await fetchPins({ start: 0, limit: desiredCount });
      onLogActivity('Deleted location pin', 'Removed a location pin');
    }
  };

  const handleCancelAdd = () => {
    setIsAddingPin(false);
    setNewName('');
    setNewLocation('');
    setNewTimestamp('');
    setNewNote('');
    setSelectedImages([]);
    setImagePreviews([]);
    setSelectedCoords(null);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleEditPin = (pin: LocationPin) => {
    setEditingPinId(pin.id);
    setEditName(pin.name || '');
    setEditLocation(pin.location);
    const localDateTime = new Date(new Date(pin.timestamp).getTime() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setEditTimestamp(localDateTime);
    setEditNote(pin.note || '');
    setEditExistingImages(pin.images || []);
    setEditSelectedImages([]);
    setEditImagePreviews([]);
    setEditSelectedCoords(pin.latitude && pin.longitude ? { lat: pin.latitude, lon: pin.longitude } : null);
    setEditSuggestions([]);
    setShowEditSuggestions(false);
  };

  const handleEditImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      setEditSelectedImages(fileArray);

      // Generate previews for all files
      const previews: string[] = [];
      let loadedCount = 0;

      fileArray.forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          previews.push(reader.result as string);
          loadedCount++;
          if (loadedCount === fileArray.length) {
            setEditImagePreviews(previews);
          }
        };
        reader.readAsDataURL(file);
      });
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

    // Update the pin
    const { data, error } = await supabase
      .from('location_pins')
      .update({
        name: editName.trim() || null,
        location: editLocation.trim(),
        latitude: coords?.lat || null,
        longitude: coords?.lon || null,
        timestamp: new Date(editTimestamp).toISOString(),
        note: editNote.trim() || null,
      })
      .eq('id', editingPinId)
      .select()
      .single();

    if (!error && data) {
      // Upload new images if selected
      if (editSelectedImages.length > 0) {
        const currentImageCount = editExistingImages.length;
        for (let i = 0; i < editSelectedImages.length; i++) {
          const file = editSelectedImages[i];

          // Convert to WebP
          const webpBlob = await convertToWebP(file, 0.8);
          const fileName = `${anonId}/${Date.now()}_${i}.webp`;

          const { error: uploadError } = await supabase.storage
            .from('location-images')
            .upload(fileName, webpBlob, {
              contentType: 'image/webp',
            });

          if (!uploadError) {
            const { data: urlData } = supabase.storage
              .from('location-images')
              .getPublicUrl(fileName);

            // Insert image record
            await supabase
              .from('location_pin_images')
              .insert({
                pin_id: editingPinId,
                image_url: urlData.publicUrl,
                display_order: currentImageCount + i,
              });
          }
        }
      }

      // Refetch pins to get the updated data with images
      await fetchPins({
        start: 0,
        limit: Math.max(PINS_PER_PAGE, pins.length),
      });
      handleCancelEdit();
      onLogActivity('Updated location pin', `Updated pin at ${editName || editLocation}`);
    }

    setLoading(false);
  };

  const handleRemoveExistingImage = async (imageId: string, imageUrl: string) => {
    // Delete from database
    const { error } = await supabase
      .from('location_pin_images')
      .delete()
      .eq('id', imageId);

    if (!error) {
      // Delete from storage
      const fileName = imageUrl.split('/').pop();
      if (fileName) {
        await supabase.storage
          .from('location-images')
          .remove([`${anonId}/${fileName}`]);
      }

      // Update local state
      setEditExistingImages(editExistingImages.filter(img => img.id !== imageId));
    }
  };

  const handleCancelEdit = () => {
    setEditingPinId(null);
    setEditName('');
    setEditLocation('');
    setEditTimestamp('');
    setEditNote('');
    setEditSelectedImages([]);
    setEditImagePreviews([]);
    setEditExistingImages([]);
    setEditSelectedCoords(null);
    setEditSuggestions([]);
    setShowEditSuggestions(false);
  };

  const handleLoadMorePins = () => {
    if (loading || pins.length >= totalPins) return;
    fetchPins({
      start: pins.length,
      limit: PIN_LOAD_STEP,
      append: true,
    });
  };

  // Get display name - use name if available, otherwise extract from location
  const getDisplayName = (pin: LocationPin): string => {
    if (pin.name) {
      return pin.name;
    }
    const firstComma = pin.location.indexOf(',');
    if (firstComma !== -1) {
      return pin.location.substring(0, firstComma).trim();
    }
    return pin.location;
  };

  const displayedPins = pins;
  const displayRangeStart = totalPins === 0 ? 0 : 1;
  const displayRangeEnd = pins.length;
  const canLoadMorePins = pins.length < totalPins;

  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 border-4 border-gray-900 w-full max-w-[95vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b-4 border-gray-900 p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">LOCATION MAP</h2>
          <div className="flex items-center gap-3">
            {isEditMode && !isAddingPin && (
              <button
                onClick={() => setIsAddingPin(true)}
                className="px-4 py-2 border-2 border-gray-900 hover:bg-pink-500 hover:text-white transition-all text-sm font-bold"
              >
                + ADD NEW PIN
              </button>
            )}
            <button
              onClick={onClose}
              className="text-2xl hover:text-red-500 transition-colors"
            >
              ✕
            </button>
          </div>
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
                  url="/api/tiles/{z}/{x}/{y}.png"
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
                            onLogActivity('Viewed pin on map', `Clicked on ${getDisplayName(pin)}`);
                          }
                        }}
                      >
                        <Popup>
                          <div className="text-sm">
                            <div className="font-bold">{getDisplayName(pin)}</div>
                            <div className="text-xs text-gray-600 mt-1">
                              {new Date(pin.timestamp).toLocaleString()}
                            </div>
                            {pin.images && pin.images.length > 0 && (
                              <div className="relative mt-2">
                                <img
                                  src={pin.images[0].image_url}
                                  alt={pin.location}
                                  className="w-full h-24 object-cover border border-gray-300 cursor-pointer hover:opacity-90"
                                  onClick={() => {
                                    setLightboxImages(pin.images!.map(img => img.image_url));
                                    setLightboxIndex(0);
                                    setShowLightbox(true);
                                  }}
                                />
                                {pin.images.length > 1 && (
                                  <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5">
                                    +{pin.images.length - 1}
                                  </div>
                                )}
                              </div>
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
            {isEditMode && isAddingPin && (
              <div className="p-4 border-b-4 border-gray-900 bg-pink-50">
                <h3 className="text-lg font-bold mb-3">ADD NEW PIN</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm mb-1">Name (optional)</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g., Orlando"
                      className="w-full px-3 py-2 border-2 border-gray-900 text-sm"
                      autoFocus
                    />
                  </div>
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
                    <label className="block text-sm mb-1">Images (optional)</label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageSelect}
                      className="w-full px-3 py-2 border-2 border-gray-900 text-sm"
                    />
                    {imagePreviews.length > 0 && (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {imagePreviews.map((preview, index) => (
                          <div key={index} className="relative">
                            <img
                              src={preview}
                              alt={`Preview ${index + 1}`}
                              className="w-full h-20 object-cover border-2 border-gray-900"
                            />
                            <button
                              onClick={() => {
                                setSelectedImages(selectedImages.filter((_, i) => i !== index));
                                setImagePreviews(imagePreviews.filter((_, i) => i !== index));
                              }}
                              className="absolute top-0.5 right-0.5 bg-red-500 text-white px-1.5 py-0.5 text-xs hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        ))}
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
              <h3 className="text-lg font-bold mb-2">PINS ({totalPins || pins.length})</h3>
              {loading && pins.length === 0 && (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              )}
              {!loading && pins.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No pins yet. {isEditMode ? 'Add your first location!' : ''}
                </div>
              )}
              <div className="space-y-2">
                {displayedPins.map((pin) => {
                  const canModifyPin = isEditMode;
                  const isEditingCurrentPin = canModifyPin && editingPinId === pin.id;

                  return isEditingCurrentPin ? (
                    // Edit Form
                    <div key={pin.id} className="border-2 border-blue-500 p-3 bg-blue-50">
                      <h4 className="text-sm font-bold mb-3">EDIT PIN</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm mb-1">Name (optional)</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="e.g., Orlando"
                            className="w-full px-3 py-2 border-2 border-gray-900 text-sm"
                          />
                        </div>
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
                          <label className="block text-sm mb-1">Images (optional)</label>
                          {/* Existing images */}
                          {editExistingImages.length > 0 && (
                            <div className="mb-2 grid grid-cols-3 gap-2">
                              {editExistingImages.map((image) => (
                                <div key={image.id} className="relative">
                                  <img
                                    src={image.image_url}
                                    alt="Existing"
                                    className="w-full h-20 object-cover border-2 border-gray-900"
                                  />
                                  <button
                                    onClick={() => handleRemoveExistingImage(image.id, image.image_url)}
                                    className="absolute top-0.5 right-0.5 bg-red-500 text-white px-1.5 py-0.5 text-xs hover:bg-red-600"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Add new images */}
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleEditImageSelect}
                            className="w-full px-3 py-2 border-2 border-gray-900 text-sm"
                          />
                          {editImagePreviews.length > 0 && (
                            <div className="mt-2 grid grid-cols-3 gap-2">
                              {editImagePreviews.map((preview, index) => (
                                <div key={index} className="relative">
                                  <img
                                    src={preview}
                                    alt={`Preview ${index + 1}`}
                                    className="w-full h-20 object-cover border-2 border-gray-900"
                                  />
                                  <button
                                    onClick={() => {
                                      setEditSelectedImages(editSelectedImages.filter((_, i) => i !== index));
                                      setEditImagePreviews(editImagePreviews.filter((_, i) => i !== index));
                                    }}
                                    className="absolute top-0.5 right-0.5 bg-red-500 text-white px-1.5 py-0.5 text-xs hover:bg-red-600"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
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
                      } ${pin.images && pin.images.length > 0 ? 'h-32' : ''}`}
                      onClick={() => {
                        if (pin.latitude !== null && pin.longitude !== null) {
                          setFocusedPinId(pin.id);
                          onLogActivity('Viewed pin from list', `Selected ${getDisplayName(pin)}`);
                        }
                      }}
                    >
                      {pin.images && pin.images.length > 0 && (
                        <div
                          className="relative w-32 h-32 flex-shrink-0 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightboxImages(pin.images!.map(img => img.image_url));
                            setLightboxIndex(0);
                            setShowLightbox(true);
                          }}
                        >
                          <img
                            src={pin.images[0].image_url}
                            alt={pin.location}
                            className="w-full h-full object-cover"
                          />
                          {pin.images.length > 1 && (
                            <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5">
                              +{pin.images.length - 1}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex-1 p-3 flex flex-col min-h-0 overflow-y-auto">
                        <div className="flex items-center gap-2 justify-between flex-shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">📍</span>
                            <span className="font-bold text-sm">{getDisplayName(pin)}</span>
                          </div>
                          {canModifyPin && (
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
                        <div className="text-xs text-gray-600 mt-1 flex-shrink-0">
                          {new Date(pin.timestamp).toLocaleString()}
                        </div>
                        {pin.note && (
                          <div className="text-xs text-gray-700 mt-1 italic">
                            &ldquo;{pin.note}&rdquo;
                          </div>
                        )}
                        {pin.latitude !== null && pin.longitude !== null && (
                          <div className="text-xs text-gray-500 mt-1 flex-shrink-0">
                            {pin.latitude.toFixed(4)}, {pin.longitude.toFixed(4)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalPins > 0 && (
                <div className="flex items-center justify-between mt-4 text-xs text-gray-600">
                  <span>
                    Showing {displayRangeStart}-{displayRangeEnd} of {totalPins}
                  </span>
                  <button
                    onClick={handleLoadMorePins}
                    disabled={!canLoadMorePins}
                    className="px-4 py-1 border border-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    LOAD MORE
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* Image Lightbox - Rendered outside modal to avoid z-index issues */}
    <ImageLightbox
      images={lightboxImages}
      initialIndex={lightboxIndex}
      isOpen={showLightbox}
      onClose={() => setShowLightbox(false)}
    />
    </>
  );
}
