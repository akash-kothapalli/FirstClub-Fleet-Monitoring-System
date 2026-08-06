import db from '../db.js';
export { isPointInPolygon, checkGeofenceBreachDebounced, resetGeofenceTracker } from '../geofence.js';

// Dynamic Reverse Geocoding without hardcoded city/landmark grids
export async function reverseGeocodeWithCache(lat, lng) {
  if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
    return 'Unknown Location';
  }

  const latRounded = Math.round(lat * 1000) / 1000;
  const lngRounded = Math.round(lng * 1000) / 1000;

  try {
    const cached = await db.prepare('SELECT address FROM geocode_cache WHERE lat_rounded = ? AND lng_rounded = ?').get(latRounded, lngRounded);
    if (cached && cached.address) return cached.address;
  } catch (err) {}

  const fallbackAddress = `GPS Location (${lat.toFixed(4)}°, ${lng.toFixed(4)}°)`;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'FirstClub-FFMS/1.0 (campaigns@firstclub.com)'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const fetchedAddress = data.display_name || data.name || fallbackAddress;
      await db.prepare('INSERT OR REPLACE INTO geocode_cache (lat_rounded, lng_rounded, address) VALUES (?, ?, ?)').run(latRounded, lngRounded, fetchedAddress);
      return fetchedAddress;
    }
  } catch (err) {
    console.warn('[GEOCODE] Nominatim fetch error:', err.message);
  }

  return fallbackAddress;
}

export function getLocalLandmarkAddress(lat, lng) {
  if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
    return 'GPS Location';
  }
  return `GPS Location (${lat.toFixed(4)}°, ${lng.toFixed(4)}°)`;
}
