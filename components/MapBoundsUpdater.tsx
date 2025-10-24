'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LocationPin {
  id: number;
  location: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
  note: string | null;
  image_url: string | null;
}

interface MapBoundsUpdaterProps {
  pins: LocationPin[];
  focusedPinId: number | null;
}

export default function MapBoundsUpdater({ pins, focusedPinId }: MapBoundsUpdaterProps) {
  const map = useMap();

  useEffect(() => {
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
