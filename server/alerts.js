import db from './db.js';
import { checkGeofenceBreachDebounced, isPointInPolygon } from './geofence.js';

// Webhook / Email Out-of-Band Notification Dispatcher
export function dispatchNotification(alert) {
  const timestampStr = new Date(alert.timestamp || Date.now()).toLocaleTimeString();
  const payload = {
    event: 'CRITICAL_FLEET_ALERT',
    alertId: alert.id,
    vehicleId: alert.vehicle_id,
    type: alert.alert_type,
    message: alert.message,
    severity: alert.severity,
    time: timestampStr
  };

  // Log structured JSON alert to console / stdout
  console.log(`[ALERT DISPATCHER] Out-of-Band Notification Sent:`, JSON.stringify(payload));

  // If WEBHOOK_URL is configured in environment, dispatch HTTP POST
  if (process.env.WEBHOOK_URL) {
    fetch(process.env.WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(err => console.error('[ALERT DISPATCHER] Webhook delivery error:', err.message));
  }
}

/**
 * Process an incoming telemetry ping and evaluate automated alert rules.
 */
export function evaluatePingAlerts(ping, vehicle, campaign, broadcastFn) {
  const generatedAlerts = [];

  // 1. Check Geofence Breach
  if (campaign && campaign.geofence_json) {
    try {
      const polygon = JSON.parse(campaign.geofence_json);
      const isInside = isPointInPolygon([ping.lat, ping.lng], polygon);
      const pingMs = new Date(ping.timestamp || Date.now()).getTime();

      const { isBreachAlert, durationSeconds } = checkGeofenceBreachDebounced(vehicle.id, isInside, pingMs);

      if (isBreachAlert) {
        // Check if an unacknowledged geofence alert was raised recently
        const recentAlert = db.prepare(`
          SELECT id FROM alerts 
          WHERE vehicle_id = ? AND alert_type = 'GEOFENCE_BREACH' AND acknowledged = 0 
          AND timestamp > datetime('now', '-10 minutes')
        `).get(vehicle.id);

        if (!recentAlert) {
          const alertId = 'alt_' + Date.now();
          const message = `GEOFENCE BREACH: Vehicle ${vehicle.plate_number} has been continuously out of assigned ${campaign.city} zone for ${Math.floor(durationSeconds / 60)} mins.`;
          
          db.prepare(`
            INSERT INTO alerts (id, vehicle_id, alert_type, severity, message) 
            VALUES (?, ?, 'GEOFENCE_BREACH', 'CRITICAL', ?)
          `).run(alertId, vehicle.id, message);

          const alertObj = {
            id: alertId,
            vehicle_id: vehicle.id,
            alert_type: 'GEOFENCE_BREACH',
            severity: 'CRITICAL',
            message,
            timestamp: new Date().toISOString(),
            acknowledged: 0
          };

          generatedAlerts.push(alertObj);
          dispatchNotification(alertObj);
        }
      }
    } catch (err) {
      console.error('[ALERT ENGINE] Geofence parse error:', err.message);
    }
  }

  // 2. Check Excessive Idle Violation (Idle > 15 mins AND not on approved break)
  if (ping.speed === 0 && !ping.is_break) {
    const idleMins = vehicle.idle_time_mins || 0;
    if (idleMins >= 15) {
      const recentIdleAlert = db.prepare(`
        SELECT id FROM alerts 
        WHERE vehicle_id = ? AND alert_type = 'EXCESSIVE_IDLE' AND acknowledged = 0 
        AND timestamp > datetime('now', '-30 minutes')
      `).get(vehicle.id);

      if (!recentIdleAlert) {
        const alertId = 'alt_idle_' + Date.now();
        const message = `IDLE VIOLATION: Vehicle ${vehicle.plate_number} has been stationary for ${idleMins} mins outside approved break buffer.`;

        db.prepare(`
          INSERT INTO alerts (id, vehicle_id, alert_type, severity, message) 
          VALUES (?, ?, 'EXCESSIVE_IDLE', 'WARNING', ?)
        `).run(alertId, vehicle.id, message);

        const alertObj = {
          id: alertId,
          vehicle_id: vehicle.id,
          alert_type: 'EXCESSIVE_IDLE',
          severity: 'WARNING',
          message,
          timestamp: new Date().toISOString(),
          acknowledged: 0
        };

        generatedAlerts.push(alertObj);
      }
    }
  }

  // Broadcast generated alerts to vendor & ops manager real-time streams
  if (broadcastFn && generatedAlerts.length > 0) {
    generatedAlerts.forEach(alt => broadcastFn(vehicle.vendor_id, 'alert_triggered', alt));
  }

  return generatedAlerts;
}
