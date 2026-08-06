import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  const campaigns = await db.prepare('SELECT * FROM campaigns').all();
  return res.json({ campaigns });
});

router.post('/', authMiddleware, requireRole('ops_manager'), async (req, res) => {
  const { id, name, client, city, target_km_per_day, geofence_json, start_date, end_date } = req.body;
  try {
    await db.prepare(`
      INSERT INTO campaigns (id, name, client, city, target_km_per_day, geofence_json, start_date, end_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, client, city, target_km_per_day || 80, JSON.stringify(geofence_json), start_date, end_date);
    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

export default router;
