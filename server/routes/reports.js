import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { generateDailyAuditReport } from '../pdfBuilder.js';

const router = Router();

router.get('/daily', authMiddleware, (req, res) => {
  const vehId = req.query.vehicle_id;
  const dateStr = req.query.date || new Date().toISOString().split('T')[0];
  if (!vehId) return res.status(400).json({ error: 'vehicle_id query param required' });

  const report = generateDailyAuditReport(vehId, dateStr);
  return res.json(report);
});

export default router;
