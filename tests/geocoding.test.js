import assert from 'node:assert';
import { calculateDistanceMeters, formatStructuredAddress, reverseGeocodeWithCache } from '../server/services/geocodingService.js';

console.log('[TEST] LocationIQ Geocoding & Distance Throttling Service');

// 1. Test Haversine Distance Calculation & 150m Throttling Threshold
const lat1 = 12.9220;
const lng1 = 77.6764;

// Point 50 meters away
const latClose = 12.9224;
const lngClose = 77.6764;
const distClose = calculateDistanceMeters(lat1, lng1, latClose, lngClose);
assert(distClose < 150, `Expected distance < 150m, got ${distClose.toFixed(1)}m`);
console.log(`✓ 50m movement calculated correctly: ${distClose.toFixed(1)}m (Throttled, No API call)`);

// Point 200 meters away
const latFar = 12.9238;
const lngFar = 77.6764;
const distFar = calculateDistanceMeters(lat1, lng1, latFar, lngFar);
assert(distFar >= 150, `Expected distance >= 150m, got ${distFar.toFixed(1)}m`);
console.log(`✓ 200m movement calculated correctly: ${distFar.toFixed(1)}m (Triggers Reverse Geocoding API)`);

// 2. Test LocationIQ Structured Address Parsing & Non-Repetitive Formatting
const locationIqMockResponse = {
  address: {
    road: 'Outer Ring Road',
    suburb: 'Bellandur',
    city_district: 'Bengaluru East',
    city: 'Bengaluru Urban',
    state: 'Karnataka',
    postcode: '560103'
  }
};

const formattedAddr = formatStructuredAddress(locationIqMockResponse, 'Fallback');
assert(formattedAddr.includes('Bellandur'), 'Address should contain Bellandur');
assert(formattedAddr.includes('Bengaluru East'), 'Address should contain Bengaluru East');
assert(formattedAddr.includes('Karnataka - 560103'), 'Address should contain state and zip code');
console.log(`✓ LocationIQ structured address formatted cleanly: "${formattedAddr}"`);

// 3. Test Graceful Fallback Handling & Null Safety
const fallbackFormatted = formatStructuredAddress(null, 'GPS Location (12.9220°, 77.6764°)');
assert.strictEqual(fallbackFormatted, 'GPS Location (12.9220°, 77.6764°)');
console.log('✓ Fallback handling verified when provider fails or response is null');

async function testNullCheck() {
  const nullRes = await reverseGeocodeWithCache(null, null);
  assert.strictEqual(nullRes, 'Unknown Location', 'Null lat/lng should return Unknown Location');
  console.log('✓ Null coordinate safety check verified!');
  console.log('✓ All Geocoding & Throttling unit tests passed!\n');
}

testNullCheck();
