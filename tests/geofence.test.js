import { isPointInPolygon, checkGeofenceBreachDebounced, resetGeofenceTracker } from '../server/utils/geofenceCheck.js';

console.log('[TEST] Geofence Math & Debouncing');

const poly = [
  [18.90, 72.80], [19.00, 72.80], [19.00, 72.90], [18.90, 72.90]
];

console.assert(isPointInPolygon([18.95, 72.85], poly) === true, 'Inside point failed');
console.assert(isPointInPolygon([19.10, 72.95], poly) === false, 'Outside point failed');

resetGeofenceTracker();
const t0 = 1000000000000;
console.assert(checkGeofenceBreachDebounced('v1', false, t0).isBreachAlert === false, '0s alert check failed');
console.assert(checkGeofenceBreachDebounced('v1', false, t0 + 95000).isBreachAlert === true, '95s alert check failed');
console.log('✓ Geofence unit tests passed!');
