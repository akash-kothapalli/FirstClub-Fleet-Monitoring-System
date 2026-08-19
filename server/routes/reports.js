import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { generateDailyAuditReport } from '../pdfBuilder.js';

const router = Router();

// Helper to calculate driver-wise and fleet-wide route distance for any date
export async function getDriverDistancesForDate(targetDate) {
  const dateStr = targetDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  // Query all vehicles with assigned drivers
  const vehicles = await db.prepare(`
    SELECT v.*, u.id as driver_user_id, u.full_name as driver_name, u.phone as driver_phone, u.secondary_phone as driver_sec_phone
    FROM vehicles v
    LEFT JOIN users u ON v.assigned_driver_id = u.id
  `).all();

  let fleetTotalDistance = 0;
  const driversResult = [];

  for (const veh of vehicles) {
    const pings = await db.prepare(`
      SELECT lat, lng, timestamp, speed
      FROM telemetry_pings
      WHERE vehicle_id = ?
        AND (date(timestamp) = date(?) OR date(timestamp, '+5 hours', '+30 minutes') = date(?))
      ORDER BY timestamp ASC
    `).all(veh.id, dateStr, dateStr);

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

    const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    let finalDist = Math.round(routeDistanceKm * 10) / 10;
    if (dateStr === todayIST && finalDist === 0 && (veh.today_distance_km || 0) > 0) {
      finalDist = Math.round(veh.today_distance_km * 10) / 10;
    }

    fleetTotalDistance += finalDist;

    const shiftStartPing = pings[0];
    const shiftEndPing = pings[pings.length - 1];

    const proofCountObj = await db.prepare(`
      SELECT COUNT(*) as cnt FROM campaign_photo_proofs
      WHERE vehicle_id = ? AND (date(timestamp) = date(?) OR date(timestamp, '+5 hours', '+30 minutes') = date(?))
    `).get(veh.id, dateStr, dateStr);

    const breakCountObj = await db.prepare(`
      SELECT COUNT(*) as cnt FROM approved_breaks
      WHERE vehicle_id = ? AND (date(start_time) = date(?) OR date(start_time, '+5 hours', '+30 minutes') = date(?))
    `).get(veh.id, dateStr, dateStr);

    driversResult.push({
      driver_id: veh.driver_user_id || veh.assigned_driver_id || veh.id,
      driver_name: veh.driver_name || 'Assigned Driver',
      phone: veh.driver_phone || '-',
      secondary_phone: veh.driver_sec_phone || '-',
      vehicle_id: veh.id,
      plate_number: veh.plate_number,
      shift_start: shiftStartPing ? shiftStartPing.timestamp : null,
      shift_end: shiftEndPing ? shiftEndPing.timestamp : null,
      status: veh.status || 'Offline',
      distance_covered_km: finalDist,
      target_km: 90,
      photo_proofs_count: proofCountObj ? proofCountObj.cnt : 0,
      approved_breaks_count: breakCountObj ? breakCountObj.cnt : 0,
      total_pings_count: pings.length
    });
  }

  const fleetTargetKm = Math.max(270, vehicles.length * 90);

  return {
    date: dateStr,
    fleet_total_distance_km: Math.round(fleetTotalDistance * 10) / 10,
    fleet_target_km: fleetTargetKm,
    drivers: driversResult
  };
}

// 1. GET /api/reports/daily?vehicle_id=...&date=...
router.get('/daily', authMiddleware, async (req, res) => {
  const vehId = req.query.vehicle_id;
  const dateStr = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (!vehId) return res.status(400).json({ error: 'vehicle_id query param required' });

  const report = await generateDailyAuditReport(vehId, dateStr);
  return res.json(report);
});

// 2. GET /api/reports/driver-distances?date=YYYY-MM-DD
router.get('/driver-distances', authMiddleware, async (req, res) => {
  const targetDate = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const result = await getDriverDistancesForDate(targetDate);
  return res.json(result);
});

export default router;
