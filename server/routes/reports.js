import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { generateDailyAuditReport } from '../pdfBuilder.js';

const router = Router();

router.get('/daily', authMiddleware, async (req, res) => {
  const vehId = req.query.vehicle_id;
  const dateStr = req.query.date || new Date().toISOString().split('T')[0];
  if (!vehId) return res.status(400).json({ error: 'vehicle_id query param required' });

  const report = await generateDailyAuditReport(vehId, dateStr);
  return res.json(report);
});

// GET /api/reports/driver-distances?date=YYYY-MM-DD
router.get('/driver-distances', authMiddleware, async (req, res) => {
  const targetDate = req.query.date || new Date().toISOString().split('T')[0];

  const driversList = await db.prepare(`
    SELECT u.id as driver_id, u.full_name as driver_name, u.phone, u.secondary_phone,
           v.id as vehicle_id, v.plate_number, v.is_duty_active, v.status, v.today_distance_km
    FROM users u
    LEFT JOIN vehicles v ON v.assigned_driver_id = u.id
    WHERE u.role = 'driver'
  `).all();

  let fleetTotalDistance = 0;
  const driversResult = [];

  for (const drv of driversList) {
    const vehId = drv.vehicle_id || drv.driver_id;
    const pings = await db.prepare(`
      SELECT lat, lng, timestamp, speed
      FROM telemetry_pings
      WHERE (vehicle_id = ? OR (driver_id IS NOT NULL AND driver_id = ?))
        AND date(timestamp) = date(?)
      ORDER BY timestamp ASC
    `).all(vehId, drv.driver_id, targetDate);

    let routeDistanceKm = 0;
    for (let i = 1; i < pings.length; i++) {
      const p1 = pings[i - 1];
      const p2 = pings[i];
      const R = 6371;
      const dLat = (p2.lat - p1.lat) * Math.PI / 180;
      const dLng = (p2.lng - p1.lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      // Filter out stationary noise < 15m (0.015km) and unrealistic jumps > 2.0km
      if (dist >= 0.015 && dist <= 2.0) {
        routeDistanceKm += dist;
      }
    }

    const distCovered = pings.length > 1 ? Math.round(routeDistanceKm * 10) / 10 : (drv.today_distance_km || 0);
    fleetTotalDistance += distCovered;

    const shiftStartPing = pings[0];
    const shiftEndPing = pings[pings.length - 1];

    const proofCountObj = await db.prepare(`
      SELECT COUNT(*) as cnt FROM campaign_photo_proofs
      WHERE (driver_id = ? OR vehicle_id = ?) AND date(timestamp) = date(?)
    `).get(drv.driver_id, vehId, targetDate);

    const breakCountObj = await db.prepare(`
      SELECT COUNT(*) as cnt FROM approved_breaks
      WHERE (driver_id = ? OR vehicle_id = ?) AND date(start_time) = date(?)
    `).get(drv.driver_id, vehId, targetDate);

    driversResult.push({
      driver_id: drv.driver_id,
      driver_name: drv.driver_name,
      phone: drv.phone,
      secondary_phone: drv.secondary_phone,
      vehicle_id: drv.vehicle_id,
      plate_number: drv.plate_number || 'Unassigned',
      shift_start: shiftStartPing ? shiftStartPing.timestamp : null,
      shift_end: shiftEndPing ? shiftEndPing.timestamp : null,
      status: drv.status || 'Offline',
      distance_covered_km: distCovered,
      target_km: 90,
      photo_proofs_count: proofCountObj ? proofCountObj.cnt : 0,
      approved_breaks_count: breakCountObj ? breakCountObj.cnt : 0
    });
  }

  const fleetTargetKm = driversResult.length > 0 ? driversResult.length * 90 : 270;

  return res.json({
    date: targetDate,
    fleet_total_distance_km: Math.round(fleetTotalDistance * 10) / 10,
    fleet_target_km: fleetTargetKm,
    drivers: driversResult
  });
});

export default router;
