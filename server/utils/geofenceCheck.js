import db from '../db.js';
export { isPointInPolygon, checkGeofenceBreachDebounced, resetGeofenceTracker } from '../geofence.js';

// Comprehensive In-Memory Spatial Landmark Grid for high-frequency live pings (3s-30s)
const LANDMARKS = [
  // Bengaluru Tech Corridors
  { latMin: 12.90, latMax: 12.94, lngMin: 77.65, lngMax: 77.70, name: "Bellandur & Sarjapur Tech Corridor" },
  { latMin: 12.95, latMax: 12.99, lngMin: 77.62, lngMax: 77.66, name: "Indiranagar 100ft Road & Domlur" },
  { latMin: 12.91, latMax: 12.95, lngMin: 77.60, lngMax: 77.65, name: "Koramangala 80ft Road & HSR Layout" },
  { latMin: 12.82, latMax: 12.88, lngMin: 77.65, lngMax: 77.70, name: "Electronic City Phase 1 & 2" },
  { latMin: 12.96, latMax: 13.01, lngMin: 77.70, lngMax: 77.76, name: "Whitefield ITPL Corridor" },
  { latMin: 12.95, latMax: 12.99, lngMin: 77.56, lngMax: 77.61, name: "MG Road & Residency Road" },
  { latMin: 12.85, latMax: 13.10, lngMin: 77.50, lngMax: 77.75, name: "Bengaluru Metropolitan Region" },

  // Mumbai Corridors
  { latMin: 18.91, latMax: 18.93, lngMin: 72.82, lngMax: 72.84, name: "Nariman Point & Marine Drive" },
  { latMin: 18.93, latMax: 18.96, lngMin: 72.81, lngMax: 72.83, name: "Marine Drive Promenade & Chowpatty" },
  { latMin: 18.97, latMax: 18.99, lngMin: 72.80, lngMax: 72.82, name: "Hajiali Junction & Mahalaxmi" },
  { latMin: 19.00, latMax: 19.03, lngMin: 72.81, lngMax: 72.83, name: "Worli Sea Face Promenade" },
  { latMin: 19.03, latMax: 19.05, lngMin: 72.83, lngMax: 72.85, name: "Bandra-Worli Sea Link Toll Plaza" },
  { latMin: 19.05, latMax: 19.08, lngMin: 72.83, lngMax: 72.86, name: "Bandra Kurla Complex (BKC)" },
  { latMin: 19.09, latMax: 19.13, lngMin: 72.83, lngMax: 72.86, name: "Andheri Western Express Highway" },
  
  // Delhi NCR Corridors
  { latMin: 28.61, latMax: 28.64, lngMin: 77.20, lngMax: 77.23, name: "Connaught Place Outer Ring" },
  { latMin: 28.53, latMax: 28.56, lngMin: 77.08, lngMax: 77.12, name: "DLF Cyber City & MG Road" }
];

export function getLocalLandmarkAddress(lat, lng) {
  for (const lm of LANDMARKS) {
    if (lat >= lm.latMin && lat <= lm.latMax && lng >= lm.lngMin && lng <= lm.lngMax) {
      return lm.name;
    }
  }
  return `GPS Corridor (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
}

export async function reverseGeocodeWithCache(lat, lng) {
  const latRounded = Math.round(lat * 1000) / 1000;
  const lngRounded = Math.round(lng * 1000) / 1000;

  try {
    const cached = db.prepare('SELECT address FROM geocode_cache WHERE lat_rounded = ? AND lng_rounded = ?').get(latRounded, lngRounded);
    if (cached) return cached.address;
  } catch (err) {}

  const landmark = getLocalLandmarkAddress(lat, lng);
  if (!landmark.startsWith('GPS Corridor')) {
    try {
      db.prepare('INSERT OR REPLACE INTO geocode_cache (lat_rounded, lng_rounded, address) VALUES (?, ?, ?)').run(latRounded, lngRounded, landmark);
    } catch (e) {}
    return landmark;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'FirstClub-FFMS/1.0 (campaigns@firstclub.com)'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const fetchedAddress = data.display_name || landmark;
      db.prepare('INSERT OR REPLACE INTO geocode_cache (lat_rounded, lng_rounded, address) VALUES (?, ?, ?)').run(latRounded, lngRounded, fetchedAddress);
      return fetchedAddress;
    }
  } catch (err) {
    console.warn('[GEOCODE] Nominatim fetch error:', err.message);
  }

  return landmark;
}
