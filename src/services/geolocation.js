let watchId = null;
let wakeLock = null;
let dbOffline = null;

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

// Request Screen Wake Lock
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
window.addEventListener('online', () => {
  console.log('[GPS SERVICE] Cellular network restored. Flushing offline ping queue...');
  flushOfflineQueue('veh_1');
});

// Real Device HTML5 GPS Watcher
export function startHTML5Tracking(vehicleId, onLocationReceived, onError) {
  if (!navigator.geolocation) {
    if (onError) onError('HTML5 Geolocation is not supported by your browser');
    return;
  }

  requestWakeLock();

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
        address: `Live Device GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
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
      console.error('[GPS SERVICE] Position error:', err.message);
      if (onError) onError(err.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    }
  );
}

export function stopHTML5Tracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  releaseWakeLock();
}
