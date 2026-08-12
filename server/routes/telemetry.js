import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { livePingLimiter, batchPingLimiter } from '../middleware/rateLimiter.js';
import { evaluatePingAlerts } from '../alerts.js';
import { reverseGeocodeWithCache, calculateDistanceMeters } from '../utils/geofenceCheck.js';
import { broadcastSSE } from '../sse.js';

const router = Router();
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'proofs');

// 2D Geographic City Bounding Boxes
const CITY_ZONES = [
  { name: 'Bengaluru', minLat: 12.75, maxLat: 13.15, minLng: 77.40, maxLng: 77.80 },
  { name: 'Hyderabad', minLat: 17.20, maxLat: 17.60, minLng: 78.20, maxLng: 78.60 },
  { name: 'Mumbai', minLat: 18.85, maxLat: 19.35, minLng: 72.75, maxLng: 73.15 }
];

function resolveCityFromCoords(lat, lng) {
  if (lat === undefined || lng === undefined) return 'Bengaluru';
  for (const zone of CITY_ZONES) {
    if (lat >= zone.minLat && lat <= zone.maxLat && lng >= zone.minLng && lng <= zone.maxLng) {
      return zone.name;
    }
  }
  return 'Bengaluru';
}

// 1. Live Telemetry Single Ping Endpoint
router.post('/ping', authMiddleware, livePingLimiter, async (req, res) => {
  const { vehicle_id, campaign_id, lat, lng, speed, heading, accuracy, is_break, break_type } = req.body;

  if (!vehicle_id || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'vehicle_id, lat, and lng are required' });
  }

  const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) {
    return res.status(444).json({ error: 'Vehicle not found' });
  }

  const user = req.user;
  if (user.role === 'driver' && vehicle.assigned_driver_id && vehicle.assigned_driver_id !== user.userId) {
    return res.status(403).json({ error: 'Not authorized for this vehicle' });
  }

  const campaign = await db.prepare(`
    SELECT c.* FROM campaigns c
    JOIN vehicle_campaigns vc ON c.id = vc.campaign_id
    WHERE vc.vehicle_id = ?
    LIMIT 1
  `).get(vehicle_id) || await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaign_id || 'c1');

  const currentSpeed = speed || 0;
  const currentBreakType = is_break ? (break_type || vehicle.active_break_type) : vehicle.active_break_type;
  const isBreakActive = (is_break || vehicle.active_break_type) ? 1 : 0;

  let newStatus = 'Moving';
  if (isBreakActive) newStatus = 'On Approved Break';
  else if (currentSpeed === 0) newStatus = 'Idle';

  // 150-Meter Distance Throttling Rule for Reverse Geocoding API Calls
  const distFromLastGeocoded = calculateDistanceMeters(vehicle.last_geocoded_lat, vehicle.last_geocoded_lng, lat, lng);
  const statusChanged = (vehicle.status !== newStatus) || (vehicle.active_break_type !== currentBreakType);
  const needsGeocode = !vehicle.last_geocoded_address || statusChanged || (distFromLastGeocoded >= 150);

  let currentArea = vehicle.current_area || 'Fetching location...';
  let lastGeoLat = vehicle.last_geocoded_lat;
  let lastGeoLng = vehicle.last_geocoded_lng;
  let lastGeoAddr = vehicle.last_geocoded_address;

  if (needsGeocode || currentArea === 'Fetching location...') {
    currentArea = await reverseGeocodeWithCache(lat, lng);
    lastGeoLat = lat;
    lastGeoLng = lng;
    lastGeoAddr = currentArea;
  }

  const currentCity = resolveCityFromCoords(lat, lng);

  let distIncrement = 0;
  if (vehicle.current_lat && vehicle.current_lng && currentSpeed > 0) {
    const R = 6371;
    const dLat = (lat - vehicle.current_lat) * Math.PI / 180;
    const dLng = (lng - vehicle.current_lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(vehicle.current_lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    distIncrement = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    // Filter out stationary GPS noise under 15 meters (< 0.015 km) or unrealistic jumps (> 2 km)
    if (distIncrement < 0.015 || distIncrement > 2) distIncrement = 0;
  }

  const newTotalDist = (vehicle.today_distance_km || 0) + distIncrement;
  const newRunningTime = vehicle.running_time_mins + (currentSpeed > 0 ? 0.5 : 0);
  const newIdleTime = vehicle.idle_time_mins + (currentSpeed === 0 && !is_break ? 0.5 : 0);
  const newBreakTime = vehicle.break_time_mins + (is_break ? 0.5 : 0);

  await db.prepare(`
    UPDATE vehicles 
    SET current_lat = ?, current_lng = ?, current_speed = ?, heading = ?, status = ?,
        current_area = ?, current_city = ?, last_ping_time = datetime('now'), today_distance_km = ?,
        running_time_mins = ?, idle_time_mins = ?, break_time_mins = ?,
        last_geocoded_lat = ?, last_geocoded_lng = ?, last_geocoded_address = ?
    WHERE id = ?
  `).run(lat, lng, currentSpeed, heading || 0, newStatus, currentArea, currentCity, newTotalDist, newRunningTime, newIdleTime, newBreakTime, lastGeoLat, lastGeoLng, lastGeoAddr, vehicle_id);

  await db.prepare(`
    INSERT INTO telemetry_pings (vehicle_id, campaign_id, lat, lng, speed, heading, accuracy, address, is_break, break_type, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(vehicle_id, campaign ? campaign.id : 'c1', lat, lng, currentSpeed, heading || 0, accuracy || 8.0, currentArea, is_break ? 1 : 0, currentBreakType || null);

  const evaluationPings = await db.prepare(`
    SELECT * FROM telemetry_pings WHERE vehicle_id = ? ORDER BY timestamp DESC LIMIT 30
  `).all(vehicle_id);

  const updatedVehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  const generatedAlerts = await evaluatePingAlerts(updatedVehicle, evaluationPings, campaign ? JSON.parse(campaign.geofence_json || '[]') : []);

  broadcastSSE('telemetry_update', { vehicle: updatedVehicle, alerts: generatedAlerts });

  return res.json({
    success: true,
    vehicle_id,
    current_area: currentArea,
    current_city: currentCity,
    status: newStatus,
    today_distance_km: newTotalDist,
    alerts_triggered: generatedAlerts.length
  });
});

// 2. Offline Telemetry Batch Ingestion
router.post('/batch', authMiddleware, batchPingLimiter, async (req, res) => {
  const { vehicle_id, pings } = req.body;

  if (!vehicle_id || !Array.isArray(pings) || pings.length === 0) {
    return res.status(400).json({ error: 'vehicle_id and non-empty pings array required' });
  }

  const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) {
    return res.status(404).json({ error: 'Vehicle not found' });
  }

  let insertedCount = 0;
  let lastLat = vehicle.current_lat;
  let lastLng = vehicle.current_lng;
  let lastAddr = vehicle.current_area;
  let lastGeoLat = vehicle.last_geocoded_lat;
  let lastGeoLng = vehicle.last_geocoded_lng;
  let lastGeoAddr = vehicle.last_geocoded_address;

  pings.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

  for (const p of pings) {
    if (p.lat === undefined || p.lng === undefined) continue;

    const pSpeed = p.speed || 0;
    const pBreakType = p.is_break ? (p.break_type || vehicle.active_break_type) : null;
    
    // 150-Meter Distance Throttled Reverse Geocoding
    const distFromLastGeocoded = calculateDistanceMeters(lastGeoLat, lastGeoLng, p.lat, p.lng);
    const needsGeocode = !lastGeoAddr || (distFromLastGeocoded >= 150);

    let pAddress = lastAddr || 'Corridor Route';
    if (needsGeocode || pAddress === 'Corridor Route') {
      pAddress = await reverseGeocodeWithCache(p.lat, p.lng);
      lastGeoLat = p.lat;
      lastGeoLng = p.lng;
      lastGeoAddr = pAddress;
    }

    await db.prepare(`
      INSERT INTO telemetry_pings (vehicle_id, campaign_id, lat, lng, speed, heading, address, is_break, break_type, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(vehicle_id, p.campaign_id || 'c1', p.lat, p.lng, pSpeed, p.heading || 0, pAddress, p.is_break ? 1 : 0, pBreakType, p.timestamp || new Date().toISOString());

    insertedCount++;
    lastLat = p.lat;
    lastLng = p.lng;
    lastAddr = pAddress;
  }

  if (insertedCount > 0) {
    const pCity = resolveCityFromCoords(lastLat, lastLng);
    await db.prepare(`
      UPDATE vehicles 
      SET current_lat = ?, current_lng = ?, current_area = ?, current_city = ?, last_ping_time = datetime('now'),
          last_geocoded_lat = ?, last_geocoded_lng = ?, last_geocoded_address = ?
      WHERE id = ?
    `).run(lastLat, lastLng, lastAddr, pCity, lastGeoLat, lastGeoLng, lastGeoAddr, vehicle_id);
  }

  return res.json({ success: true, inserted: insertedCount, processedCount: insertedCount });
});

// 3. Campaign Photo Proof Upload Endpoint
router.post('/photo-proof', authMiddleware, async (req, res) => {
  const photoUrl = req.body.photo_url || req.body.photo_base64;
  const { vehicle_id, lat, lng, address } = req.body;
  const user = req.user;

  if (!vehicle_id || !photoUrl) {
    return res.status(400).json({ error: 'vehicle_id and photo_url (or photo_base64) are required' });
  }

  const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) {
    return res.status(404).json({ error: 'Vehicle not found' });
  }

  const proofLat = (lat !== undefined && lat !== null && !isNaN(Number(lat))) ? Number(lat) : (vehicle.current_lat || 12.9220);
  const proofLng = (lng !== undefined && lng !== null && !isNaN(Number(lng))) ? Number(lng) : (vehicle.current_lng || 77.6764);

  let proofAddr = address;
  if (!proofAddr || proofAddr === 'Fetching location...') {
    try {
      proofAddr = await reverseGeocodeWithCache(proofLat, proofLng);
    } catch (e) {
      proofAddr = `GPS Location (${proofLat.toFixed(4)}°, ${proofLng.toFixed(4)}°)`;
    }
  }

  const proofId = `proof_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${Math.floor(Math.random() * 10000)}`;

  await db.prepare(`
    INSERT INTO campaign_photo_proofs (id, vehicle_id, driver_id, photo_url, lat, lng, address, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(proofId, vehicle_id, user.userId, photoUrl, proofLat, proofLng, proofAddr);

  // Auto-record a telemetry ping for photo proof submissions so corridor logs retain full record
  try {
    const isBreakActive = vehicle.active_break_type ? 1 : 0;
    await db.prepare(`
      INSERT INTO telemetry_pings (vehicle_id, campaign_id, lat, lng, speed, heading, accuracy, address, is_break, break_type, timestamp)
      VALUES (?, 'c1', ?, ?, 0, 0, 5.0, ?, ?, ?, datetime('now'))
    `).run(vehicle_id, proofLat, proofLng, proofAddr, isBreakActive, vehicle.active_break_type || null);
  } catch (e) {}

  broadcastSSE('photo_proof_uploaded', { vehicle_id, proofId, photo_url: photoUrl, address: proofAddr });

  return res.json({ success: true, proof_id: proofId, address: proofAddr });
});

// 4. Toggle Approved Driver Break Endpoint
router.post('/breaks/toggle', authMiddleware, async (req, res) => {
  const { vehicle_id, break_type } = req.body;
  const isActive = (req.body.is_starting !== undefined) ? Boolean(req.body.is_starting) : Boolean(req.body.is_active);
  const user = req.user;

  if (!vehicle_id || !break_type) {
    return res.status(400).json({ error: 'vehicle_id and break_type required' });
  }

  const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) {
    return res.status(404).json({ error: 'Vehicle not found' });
  }

  const currentLat = vehicle.current_lat || 12.9220;
  const currentLng = vehicle.current_lng || 77.6764;
  const address = await reverseGeocodeWithCache(currentLat, currentLng);

  if (isActive) {
    const breakId = `brk_${Date.now()}`;
    await db.prepare(`
      INSERT INTO approved_breaks (id, vehicle_id, driver_id, break_type, start_time, status, lat, lng, address)
      VALUES (?, ?, ?, ?, datetime('now'), 'ACTIVE', ?, ?, ?)
    `).run(breakId, vehicle_id, user.userId, break_type, currentLat, currentLng, address);

    await db.prepare(`
      UPDATE vehicles SET status = 'On Approved Break', active_break_type = ? WHERE id = ?
    `).run(break_type, vehicle_id);
  } else {
    await db.prepare(`
      UPDATE approved_breaks SET status = 'COMPLETED', end_time = datetime('now')
      WHERE vehicle_id = ? AND status = 'ACTIVE'
    `).run(vehicle_id);

    await db.prepare(`
      UPDATE vehicles SET status = 'Idle', active_break_type = NULL WHERE id = ?
    `).run(vehicle_id);
  }

  const updatedVehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  broadcastSSE('telemetry_update', { vehicle: updatedVehicle });

  return res.json({ success: true, vehicle: updatedVehicle });
});

export default router;
