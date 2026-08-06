import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { broadcastSSE } from '../sse.js';

const router = Router();

// GET /api/vehicles (Scoped by Role)
router.get('/', authMiddleware, async (req, res) => {
  let vehicles;
  const user = req.user;

  if (user.role === 'ops_manager') {
    vehicles = await db.prepare(`
      SELECT v.*, u.full_name as driver_name, u.email as driver_email, u.phone as driver_phone, ven.name as vendor_name 
      FROM vehicles v
      LEFT JOIN users u ON v.assigned_driver_id = u.id
      LEFT JOIN vendors ven ON v.vendor_id = ven.id
    `).all();
  } else if (user.role === 'vendor_manager') {
    vehicles = await db.prepare(`
      SELECT v.*, u.full_name as driver_name, u.email as driver_email, u.phone as driver_phone, ven.name as vendor_name 
      FROM vehicles v
      LEFT JOIN users u ON v.assigned_driver_id = u.id
      LEFT JOIN vendors ven ON v.vendor_id = ven.id
      WHERE v.vendor_id = ?
    `).all(user.vendorId || '');
  } else if (user.role === 'driver') {
    vehicles = await db.prepare(`
      SELECT v.*, u.full_name as driver_name, u.email as driver_email, u.phone as driver_phone, ven.name as vendor_name 
      FROM vehicles v
      LEFT JOIN users u ON v.assigned_driver_id = u.id
      LEFT JOIN vendors ven ON v.vendor_id = ven.id
      WHERE v.assigned_driver_id = ? OR u.id = ?
    `).all(user.userId, user.userId);
  } else {
    vehicles = [];
  }

  return res.json({ vehicles, role: user.role });
});

// POST /api/vehicles (Create)
router.post('/', authMiddleware, requireRole('ops_manager', 'vendor_manager'), async (req, res) => {
  const { id, plate_number, assigned_driver_id, display_size, current_city } = req.body;
  let vendor_id = req.body.vendor_id;

  if (req.user.role === 'vendor_manager') {
    vendor_id = req.user.vendorId;
  }

  if (!id || !plate_number || !vendor_id) {
    return res.status(400).json({ error: 'Vehicle ID, License Plate, and Vendor ID are required' });
  }

  try {
    await db.prepare(`
      INSERT INTO vehicles (id, plate_number, vendor_id, assigned_driver_id, display_size, current_city, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Offline')
    `).run(id, plate_number, vendor_id, assigned_driver_id || null, display_size || '12x6 ft Dual LED', current_city || 'Bengaluru');

    const newVehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    broadcastSSE('vehicle_updated', { vehicle_id: id });
    return res.json({ success: true, vehicle: newVehicle });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/vehicles/settings (Persist Driver Duty & Real GPS Toggle State with Real-Time SSE)
router.post('/settings', authMiddleware, async (req, res) => {
  const { vehicle_id, is_real_gps_active, is_duty_active } = req.body;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id is required' });

  try {
    const isEndingShift = is_duty_active === false || is_duty_active === 0;

    if (isEndingShift) {
      await db.prepare(`
        UPDATE vehicles
        SET is_duty_active = 0,
            status = 'Offline',
            active_break_type = NULL,
            current_speed = 0
        WHERE id = ?
      `).run(vehicle_id);

      // Complete any active approved breaks for this vehicle
      await db.prepare(`
        UPDATE approved_breaks
        SET end_time = datetime('now'), status = 'COMPLETED'
        WHERE vehicle_id = ? AND status = 'ACTIVE'
      `).run(vehicle_id);
    } else {
      await db.prepare(`
        UPDATE vehicles
        SET is_real_gps_active = COALESCE(?, is_real_gps_active),
            is_duty_active = COALESCE(?, is_duty_active)
        WHERE id = ?
      `).run(is_real_gps_active !== undefined ? (is_real_gps_active ? 1 : 0) : null,
             is_duty_active !== undefined ? (is_duty_active ? 1 : 0) : null,
             vehicle_id);
    }

    const updated = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
    broadcastSSE('vehicle_updated', { vehicle_id, is_real_gps_active, is_duty_active, status: updated ? updated.status : 'Offline' });
    return res.json({ success: true, vehicle: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PUT /api/vehicles/:id (Edit Vehicle)
router.put('/:id', authMiddleware, requireRole('ops_manager', 'vendor_manager'), async (req, res) => {
  const vehicleId = req.params.id;
  const existing = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);

  if (!existing) {
    return res.status(404).json({ error: 'Vehicle not found' });
  }

  if (req.user.role === 'vendor_manager' && existing.vendor_id !== req.user.vendorId) {
    return res.status(403).json({ error: 'Unauthorized: You can only modify vehicles belonging to your own company' });
  }

  const { plate_number, assigned_driver_id, display_size, current_city, status } = req.body;

  try {
    const newPlate = plate_number !== undefined ? plate_number : existing.plate_number;
    const newDriver = assigned_driver_id !== undefined ? (assigned_driver_id || null) : existing.assigned_driver_id;
    const newDisplay = display_size !== undefined ? display_size : existing.display_size;
    const newCity = current_city !== undefined ? current_city : existing.current_city;
    const newStatus = status !== undefined ? status : existing.status;

    await db.prepare(`
      UPDATE vehicles 
      SET plate_number = ?,
          assigned_driver_id = ?,
          display_size = ?,
          current_city = ?,
          status = ?
      WHERE id = ?
    `).run(newPlate, newDriver, newDisplay, newCity, newStatus, vehicleId);

    const updated = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);
    broadcastSSE('vehicle_updated', { vehicle_id: vehicleId });
    return res.json({ success: true, vehicle: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/vehicles/:id (Delete Vehicle with Safe Foreign Key Child Cleanup)
router.delete('/:id', authMiddleware, requireRole('ops_manager', 'vendor_manager'), async (req, res) => {
  const vehicleId = req.params.id;
  const existing = await db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);

  if (!existing) {
    return res.status(404).json({ error: 'Vehicle not found' });
  }

  if (req.user.role === 'vendor_manager' && existing.vendor_id !== req.user.vendorId) {
    return res.status(403).json({ error: 'Unauthorized: You can only delete vehicles belonging to your own company' });
  }

  try {
    // Explicitly delete child records from all referencing tables to prevent foreign key errors
    await db.prepare('DELETE FROM approved_breaks WHERE vehicle_id = ?').run(vehicleId);
    await db.prepare('DELETE FROM alerts WHERE vehicle_id = ?').run(vehicleId);
    await db.prepare('DELETE FROM vehicle_campaigns WHERE vehicle_id = ?').run(vehicleId);
    await db.prepare('DELETE FROM telemetry_pings WHERE vehicle_id = ?').run(vehicleId);
    await db.prepare('DELETE FROM campaign_photo_proofs WHERE vehicle_id = ?').run(vehicleId);
    await db.prepare('DELETE FROM vehicles WHERE id = ?').run(vehicleId);

    broadcastSSE('vehicle_updated', { vehicle_id: vehicleId });
    return res.json({ success: true, message: `Vehicle ${vehicleId} deleted successfully` });
  } catch (err) {
    return res.status(500).json({ error: `Failed to delete vehicle: ${err.message}` });
  }
});

export default router;
