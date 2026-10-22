import * as Location from 'expo-location';
import { useCallback, useState } from 'react';

export interface Place {
  label: string;
  city: string;
  lat: number;
  lng: number;
}

/**
 * Area presets for manual search when location permission is denied. Full address search
 * needs a Google Places key (not configured) — see docs/INTEGRATIONS.md.
 */
export const PLACES: Place[] = [
  { label: 'Indiranagar', city: 'Bengaluru', lat: 12.9719, lng: 77.6412 },
  { label: 'Koramangala', city: 'Bengaluru', lat: 12.9352, lng: 77.6245 },
  { label: 'Whitefield', city: 'Bengaluru', lat: 12.9698, lng: 77.75 },
  { label: 'Jayanagar', city: 'Bengaluru', lat: 12.925, lng: 77.5938 },
  { label: 'HSR Layout', city: 'Bengaluru', lat: 12.9116, lng: 77.6474 },
  { label: 'Bandra West', city: 'Mumbai', lat: 19.0596, lng: 72.8295 },
  { label: 'Powai', city: 'Mumbai', lat: 19.1176, lng: 72.906 },
  { label: 'Connaught Place', city: 'New Delhi', lat: 28.6315, lng: 77.2167 },
  { label: 'Gurugram Sector 29', city: 'Gurugram', lat: 28.4682, lng: 77.0628 },
  { label: 'Koregaon Park', city: 'Pune', lat: 18.5362, lng: 73.8939 },
  { label: 'HITEC City', city: 'Hyderabad', lat: 17.4435, lng: 78.3772 },
  { label: 'T. Nagar', city: 'Chennai', lat: 13.0418, lng: 80.2341 },
];

export type LocState =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'denied' }
  | { kind: 'ready'; lat: number; lng: number; label: string; source: 'gps' | 'manual' };

export function useUserLocation(initial: Place = PLACES[0]!) {
  const [loc, setLoc] = useState<LocState>({
    kind: 'ready',
    lat: initial.lat,
    lng: initial.lng,
    label: `${initial.label}, ${initial.city}`,
    source: 'manual',
  });
  const locate = useCallback(async () => {
    setLoc({ kind: 'locating' });
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setLoc({ kind: 'denied' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLoc({
        kind: 'ready',
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        label: 'Near you',
        source: 'gps',
      });
    } catch {
      setLoc({ kind: 'denied' });
    }
  }, []);
  const choose = useCallback(
    (p: Place) =>
      setLoc({
        kind: 'ready',
        lat: p.lat,
        lng: p.lng,
        label: `${p.label}, ${p.city}`,
        source: 'manual',
      }),
    [],
  );
  return { loc, locate, choose };
}
