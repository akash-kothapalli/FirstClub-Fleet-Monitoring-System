import db from '../db.js';
export { isPointInPolygon, checkGeofenceBreachDebounced, resetGeofenceTracker } from '../geofence.js';

function formatCleanAddress(data, fallback) {
  if (!data) return fallback;

  if (data.address) {
    const addr = data.address;
    const parts = [];
    const mainLoc = addr.amenity || addr.building || addr.road || addr.suburb || addr.neighbourhood;
    const area = addr.suburb || addr.neighbourhood || addr.residential || addr.city_district;
    const city = addr.city || addr.town || addr.village || addr.county;
    const postcode = addr.postcode;
    const state = addr.state;

    if (mainLoc) parts.push(mainLoc);
    if (area && area !== mainLoc) parts.push(area);
    if (city && city !== area && city !== mainLoc) parts.push(city);
    if (state && state !== city) parts.push(state);
    if (postcode) parts.push(postcode);

    if (parts.length > 0) return parts.join(', ');
  }

  if (data.display_name) {
    const tokens = data.display_name.split(',').map(s => s.trim());
    const uniqueTokens = Array.from(new Set(tokens));
    return uniqueTokens.join(', ');
  }

  return fallback;
}

// Dynamic Reverse Geocoding with clean address formatting
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
      const fetchedAddress = formatCleanAddress(data, fallbackAddress);
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
