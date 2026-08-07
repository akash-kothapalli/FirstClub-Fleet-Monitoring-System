export { isPointInPolygon, checkGeofenceBreachDebounced, resetGeofenceTracker } from '../geofence.js';
export { reverseGeocodeWithCache, calculateDistanceMeters, formatStructuredAddress } from '../services/geocodingService.js';

export function getLocalLandmarkAddress(lat, lng) {
  if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
    return 'GPS Location';
  }
  return `GPS Location (${lat.toFixed(4)}°, ${lng.toFixed(4)}°)`;
}
