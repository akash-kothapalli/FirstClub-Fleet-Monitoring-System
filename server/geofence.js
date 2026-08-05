// Track out-of-bounds start timestamps per vehicle
const outOfBoundsTracker = new Map(); // vehicleId -> timestamp in ms

/**
 * Standard Ray-Casting Point-in-Polygon algorithm.
 * @param {Array<number>} point [lat, lng]
 * @param {Array<Array<number>>} polygon Array of [lat, lng] coordinates
 * @returns {boolean} true if point is inside polygon
 */
export function isPointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return true; // Default to inside if no geofence

  const [x, y] = point; // x=lat, y=lng
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Evaluates whether an out-of-bounds condition satisfies the 90-second continuous debounce threshold.
 * Prevents false positive alerts caused by GPS edge jitter (+-15m).
 * 
 * @param {string} vehicleId 
 * @param {boolean} isInsideGeofence 
 * @param {number} currentTimestampMs 
 * @returns {{ isBreachAlert: boolean, durationSeconds: number }}
 */
export function checkGeofenceBreachDebounced(vehicleId, isInsideGeofence, currentTimestampMs = Date.now()) {
  const DEBOUNCE_THRESHOLD_MS = 90 * 1000; // 90 seconds continuous

  if (isInsideGeofence) {
    // Reset tracker if vehicle returned inside geofence
    outOfBoundsTracker.delete(vehicleId);
    return { isBreachAlert: false, durationSeconds: 0 };
  }

  // Vehicle is out of bounds
  if (!outOfBoundsTracker.has(vehicleId)) {
    outOfBoundsTracker.set(vehicleId, currentTimestampMs);
    return { isBreachAlert: false, durationSeconds: 0 };
  }

  const firstOutTime = outOfBoundsTracker.get(vehicleId);
  const elapsedMs = currentTimestampMs - firstOutTime;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  if (elapsedMs >= DEBOUNCE_THRESHOLD_MS) {
    return { isBreachAlert: true, durationSeconds: elapsedSeconds };
  }

  return { isBreachAlert: false, durationSeconds: elapsedSeconds };
}

/**
 * Resets tracking state (e.g. for testing)
 */
export function resetGeofenceTracker() {
  outOfBoundsTracker.clear();
}
