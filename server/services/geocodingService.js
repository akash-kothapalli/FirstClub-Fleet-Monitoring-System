import db from '../db.js';

// Haversine formula to calculate distance in meters between two lat/lng points
export function calculateDistanceMeters(lat1, lng1, lat2, lng2) {
  if (lat1 === undefined || lng1 === undefined || lat2 === undefined || lng2 === undefined) return Infinity;
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return Infinity;

  const R = 6371000; // Radius of Earth in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Clean address formatter for LocationIQ & Nominatim responses
export function formatStructuredAddress(data, fallback) {
  if (!data) return fallback;

  if (data.address) {
    const addr = data.address;
    const parts = [];

    // Primary landmark / building / road
    const mainLandmark = addr.building || addr.amenity || addr.road;
    // Sub-locality / Suburb / Neighbourhood
    const subLocality = addr.suburb || addr.neighbourhood || addr.residential;
    // Locality / District
    const locality = addr.city_district || addr.subdistrict || addr.county;
    // City / Town / Village
    const city = addr.city || addr.town || addr.village;
    // State & Zip
    const state = addr.state;
    const zip = addr.postcode;

    if (mainLandmark) parts.push(mainLandmark);
    if (subLocality && !parts.includes(subLocality)) parts.push(subLocality);
    if (locality && !parts.includes(locality) && locality !== city) parts.push(locality);
    if (city && !parts.includes(city)) parts.push(city);

    let baseAddress = parts.join(', ');

    if (state && !baseAddress.toLowerCase().includes(state.toLowerCase())) {
      baseAddress += `, ${state}`;
    }
    if (zip && !baseAddress.includes(zip)) {
      baseAddress += ` - ${zip}`;
    }

    if (baseAddress.trim()) return baseAddress;
  }

  // Fallback string deduplication if structured address object is unavailable
  if (data.display_name) {
    const tokens = data.display_name.split(',').map(s => s.trim());
    const uniqueTokens = Array.from(new Set(tokens));
    return uniqueTokens.join(', ');
  }

  return fallback;
}

// Reverse Geocode with LocationIQ as primary provider, Nominatim as secondary, and DB cache
export async function reverseGeocodeWithCache(lat, lng) {
  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    return 'Unknown Location';
  }

  const numLat = Number(lat);
  const numLng = Number(lng);

  if (isNaN(numLat) || isNaN(numLng)) {
    return 'Unknown Location';
  }

  const latRounded = Math.round(numLat * 1000) / 1000;
  const lngRounded = Math.round(numLng * 1000) / 1000;
  const fallbackAddress = `GPS Location (${numLat.toFixed(4)}°, ${numLng.toFixed(4)}°)`;

  // 1. Check SQLite Database Cache (~100m grid resolution)
  try {
    const cached = await db.prepare('SELECT address FROM geocode_cache WHERE lat_rounded = ? AND lng_rounded = ?').get(latRounded, lngRounded);
    if (cached && cached.address) return cached.address;
  } catch (err) {}

  const locationIqKey = process.env.LOCATIONIQ_API_KEY;

  // 2. Primary Provider: LocationIQ (5,000 requests/day free tier)
  if (locationIqKey && locationIqKey.trim()) {
    const url = `https://us1.locationiq.com/v1/reverse?key=${locationIqKey.trim()}&lat=${lat}&lon=${lng}&format=json`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'FirstClub-FFMS/1.0 (campaigns@firstclub.com)' }
        });

        if (res.ok) {
          const data = await res.json();
          const formattedAddress = formatStructuredAddress(data, fallbackAddress);
          await db.prepare('INSERT OR REPLACE INTO geocode_cache (lat_rounded, lng_rounded, address) VALUES (?, ?, ?)').run(latRounded, lngRounded, formattedAddress);
          return formattedAddress;
        } else {
          console.warn(`[GEOCODE] LocationIQ API error (status ${res.status}), attempt ${attempt}/2`);
        }
      } catch (err) {
        console.warn(`[GEOCODE] LocationIQ fetch error on attempt ${attempt}/2:`, err.message);
      }
      // Brief pause before retry
      if (attempt === 1) await new Promise(r => setTimeout(r, 400));
    }
  }

  // 3. Secondary Provider: OpenStreetMap Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FirstClub-FFMS/1.0 (campaigns@firstclub.com)' }
    });

    if (res.ok) {
      const data = await res.json();
      const formattedAddress = formatStructuredAddress(data, fallbackAddress);
      await db.prepare('INSERT OR REPLACE INTO geocode_cache (lat_rounded, lng_rounded, address) VALUES (?, ?, ?)').run(latRounded, lngRounded, formattedAddress);
      return formattedAddress;
    }
  } catch (err) {
    console.warn('[GEOCODE] Nominatim fetch error:', err.message);
  }

  return fallbackAddress;
}
