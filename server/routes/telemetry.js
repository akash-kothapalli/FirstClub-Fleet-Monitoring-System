import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { livePingLimiter, batchPingLimiter } from '../middleware/rateLimiter.js';
import { evaluatePingAlerts } from '../alerts.js';
import { reverseGeocodeWithCache, getLocalLandmarkAddress } from '../utils/geofenceCheck.js';

const router = Router();
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'proofs');

// Genuine 2D Geographic City Bounding Boxes (Lat AND Lng)
const CITY_ZONES = [
  { name: 'Bengaluru', latMin: 12.7, latMax: 13.2, lngMin: 77.3, lngMax: 77.9 },
  { name: 'Delhi',     latMin: 28.3, latMax: 28.9, lngMin: 76.8, lngMax: 77.5 },
  { name: 'Mumbai',    latMin: 18.8, latMax: 19.3, lngMin: 72.7, lngMax: 73.1 },
  { name: 'Hyderabad', latMin: 17.2, latMax: 17.6, lngMin: 78.2, lngMax: 78.7 },
];

function resolveCityFromCoords(lat, lng) {
  const match = CITY_ZONES.find(
    z => lat >= z.latMin && lat <= z.latMax && lng >= z.lngMin && lng <= z.lngMax
  );
  return match ? match.name : 'Unknown City';
}

// 1. Live Telemetry Ping with Genuine 2D City Detection & Zero Hardcoded City Fallbacks
router.post('/ping', authMiddleware, livePingLimiter, (req, res) => {
  const { vehicle_id, campaign_id, lat, lng, speed, heading, address, is_break, visibility_state } = req.body;
  if (!vehicle_id || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'vehicle_id, lat, lng required' });
  }

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

  if (req.user.role === 'driver' && vehicle.assigned_driver_id !== req.user.userId) {
    return res.status(403).json({ error: 'Not authorized for this vehicle' });
  }

  const campaign = db.prepare(`
    SELECT c.* FROM campaigns c
    JOIN vehicle_campaigns vc ON c.id = vc.campaign_id
    WHERE vc.vehicle_id = ?
    LIMIT 1
  `).get(vehicle_id) || db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaign_id || 'c1');

  const currentSpeed = speed || 0;
  let newStatus = 'Moving';
  if (is_break || vehicle.active_break_type) newStatus = 'On Approved Break';
  else if (currentSpeed === 0) newStatus = 'Idle';

  // Area & Genuine 2D Geographic City Detection (Lat AND Lng matching)
  const currentArea = getLocalLandmarkAddress(lat, lng);
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
    if (distIncrement > 2) distIncrement = 0;
  }

  const newTotalDist = (vehicle.today_distance_km || 0) + distIncrement;
  const newRunningTime = vehicle.running_time_mins + (currentSpeed > 0 ? 0.5 : 0);
  const newIdleTime = vehicle.idle_time_mins + (currentSpeed === 0 && !is_break ? 0.5 : 0);
  const newBreakTime = vehicle.break_time_mins + (is_break ? 0.5 : 0);

  // SQL Update includes current_city = ?
  db.prepare(`
    UPDATE vehicles 
    SET current_lat = ?, current_lng = ?, current_speed = ?, heading = ?, status = ?,
        current_area = ?, current_city = ?, last_ping_time = datetime('now'), today_distance_km = ?,
        running_time_mins = ?, idle_time_mins = ?, break_time_mins = ?
    WHERE id = ?
  `).run(lat, lng, currentSpeed, heading || 0, newStatus, currentArea, currentCity, newTotalDist, newRunningTime, newIdleTime, newBreakTime, vehicle_id);

  db.prepare(`
    INSERT INTO telemetry_pings (vehicle_id, campaign_id, lat, lng, speed, heading, address, is_break, visibility_state)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(vehicle_id, campaign ? campaign.id : null, lat, lng, currentSpeed, heading || 0, currentArea, is_break ? 1 : 0, visibility_state || 'foreground');

  const pingObj = {
    vehicle_id, lat, lng, speed: currentSpeed, heading: heading || 0,
    address: currentArea, current_area: currentArea, current_city: currentCity, is_break: is_break ? 1 : 0, status: newStatus,
    today_distance_km: newTotalDist, timestamp: new Date().toISOString()
  };

  evaluatePingAlerts(pingObj, { ...vehicle, today_distance_km: newTotalDist, idle_time_mins: newIdleTime }, campaign);

  return res.json({ success: true, status: newStatus, current_area: currentArea, current_city: currentCity, today_distance_km: newTotalDist });
});

// 2. Bulk Offline Batch Sync
router.post('/batch', authMiddleware, batchPingLimiter, (req, res) => {
  const { vehicle_id, pings } = req.body;
  if (!vehicle_id || !Array.isArray(pings)) return res.status(400).json({ error: 'vehicle_id and pings array required' });

  const insertStmt = db.prepare(`
    INSERT INTO telemetry_pings (vehicle_id, campaign_id, lat, lng, speed, heading, address, is_break, visibility_state, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  pings.slice(0, 100).forEach(p => {
    insertStmt.run(vehicle_id, p.campaign_id || 'c1', p.lat, p.lng, p.speed || 0, p.heading || 0, p.address || 'Offline Queued Location', p.is_break ? 1 : 0, p.visibility_state || 'foreground', p.timestamp || new Date().toISOString());
    count++;
  });

  return res.json({ success: true, processedCount: count });
});

// 3. Driver 40-Minute Photo Proof Upload Endpoint
router.post('/photo-proof', authMiddleware, async (req, res) => {
  const { vehicle_id, photo_base64, lat, lng } = req.body;
  if (!vehicle_id || !photo_base64) {
    return res.status(400).json({ error: 'vehicle_id and photo_base64 are required' });
  }

  const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > 5 * 1024 * 1024) {
    return res.status(400).json({ error: 'File size exceeds 5MB limit' });
  }

  const filename = `proof_${vehicle_id}_${Date.now()}.jpg`;
  const filePath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filePath, buffer);

  const photoUrl = `/uploads/proofs/${filename}`;
  const address = await reverseGeocodeWithCache(lat || 18.9438, lng || 72.8232);
  const proofId = `prf_${Date.now()}`;

  db.prepare(`
    INSERT INTO campaign_photo_proofs (id, vehicle_id, driver_id, photo_url, lat, lng, address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(proofId, vehicle_id, req.user.userId, photoUrl, lat || 18.9438, lng || 72.8232, address);

  const newProof = db.prepare('SELECT * FROM campaign_photo_proofs WHERE id = ?').get(proofId);
  return res.json({ success: true, proof: newProof, message: 'Photo proof uploaded successfully' });
});

// 4. Approved Breaks Toggle Endpoint
router.post('/breaks/toggle', authMiddleware, (req, res) => {
  const { vehicle_id, break_type, is_starting } = req.body;
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

  const newBreakType = is_starting ? break_type : null;
  const newStatus = is_starting ? 'On Approved Break' : (vehicle.current_speed > 0 ? 'Moving' : 'Idle');

  db.prepare(`
    UPDATE vehicles 
    SET status = ?, active_break_type = ? 
    WHERE id = ?
  `).run(newStatus, newBreakType, vehicle_id);

  return res.json({ success: true, status: newStatus, active_break_type: newBreakType });
});

export default router;
