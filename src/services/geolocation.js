let watchId = null;
let wakeLock = null;
let dbOffline = null;
let isHighAccuracyEnabled = true;

// Initialize IndexedDB Offline Queue
function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fleet_offline_db', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('queued_pings')) {
        db.createObjectStore('queued_pings', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (e) => {
      dbOffline = e.target.result;
      resolve(dbOffline);
    };
    request.onerror = (e) => reject(e);
  });
}

// Request Screen Wake Lock with background re-engagement
export async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('[GPS SERVICE] Screen Wake Lock active.');
    } catch (err) {
      console.warn('[GPS SERVICE] Screen Wake Lock failed:', err.message);
    }
  }
}

// Re-engage WakeLock when tab becomes visible again
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && watchId !== null) {
      requestWakeLock();
    }
  });
}

export function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}

// Store Ping in IndexedDB during offline dead zones
export async function queueOfflinePing(pingPayload) {
  if (!dbOffline) await initIndexedDB();
  const tx = dbOffline.transaction('queued_pings', 'readwrite');
  const store = tx.objectStore('queued_pings');
  store.add({ ...pingPayload, timestamp: new Date().toISOString() });
  console.log('[GPS SERVICE] Ping buffered in IndexedDB (cellular dead zone).');
}

// Flush Queued Offline Pings to Server upon reconnection
export async function flushOfflineQueue(vehicleId) {
  if (!dbOffline) await initIndexedDB();
  const tx = dbOffline.transaction('queued_pings', 'readonly');
  const store = tx.objectStore('queued_pings');
  const request = store.getAll();

  request.onsuccess = async () => {
    const pings = request.result;
    if (pings && pings.length > 0) {
      try {
        const res = await fetch('/api/telemetry/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ vehicle_id: vehicleId, pings })
        });
        if (res.ok) {
          const clearTx = dbOffline.transaction('queued_pings', 'readwrite');
          clearTx.objectStore('queued_pings').clear();
          console.log(`[GPS SERVICE] Successfully batch-synced ${pings.length} offline dead-zone pings.`);
        }
      } catch (err) {
        console.error('[GPS SERVICE] Batch sync failed:', err.message);
      }
    }
  };
}

// Auto-sync offline pings when browser comes online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[GPS SERVICE] Cellular network restored. Flushing offline ping queue...');
    flushOfflineQueue('veh_1');
  });
}

// Real Device HTML5 GPS Watcher with Automatic Timeout Fallback
export function startHTML5Tracking(vehicleId, onLocationReceived, onError) {
  if (!navigator.geolocation) {
    if (onError) onError('HTML5 Geolocation is not supported by your browser');
    return;
  }

  requestWakeLock();
  if (watchId !== null) stopHTML5Tracking();

  const options = {
    enableHighAccuracy: isHighAccuracyEnabled,
    maximumAge: 5000,
    timeout: 30000 // 30-second timeout to prevent false positive GPS timeout errors
  };

  watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const speed = Math.round((position.coords.speed || 0) * 3.6); // Convert m/s to km/h
      const heading = position.coords.heading || 0;

      const pingPayload = {
        vehicle_id: vehicleId,
        lat,
        lng,
        speed,
        heading,
        address: `Live Device GPS (${lat.toFixed(4)}°, ${lng.toFixed(4)}°)`,
        is_break: 0,
        visibility_state: document.visibilityState
      };

      if (!navigator.onLine) {
        await queueOfflinePing(pingPayload);
      } else {
        try {
          const res = await fetch('/api/telemetry/ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(pingPayload)
          });
          if (res.ok) {
            const data = await res.json();
            pingPayload.current_area = data.current_area;
            pingPayload.current_city = data.current_city;
            pingPayload.address = data.current_area ? `${data.current_area}, ${data.current_city}` : pingPayload.address;
          }
        } catch (err) {
          await queueOfflinePing(pingPayload);
        }
      }

      if (onLocationReceived) onLocationReceived(pingPayload);
    },
    (err) => {
      console.warn('[GPS SERVICE] Position error:', err.message, 'Code:', err.code);

      // Handle GPS Timeout (Code 3): Fallback from High Accuracy to Standard Network/Cellular GPS
      if (err.code === 3 && isHighAccuracyEnabled) {
        console.warn('[GPS SERVICE] High accuracy GPS timed out. Falling back to standard positioning mode...');
        isHighAccuracyEnabled = false;
        stopHTML5Tracking();
        startHTML5Tracking(vehicleId, onLocationReceived, onError);
        return;
      }

      if (onError && err.code !== 3) onError(err.message);
    },
    options
  );
}

export function stopHTML5Tracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  releaseWakeLock();
}
