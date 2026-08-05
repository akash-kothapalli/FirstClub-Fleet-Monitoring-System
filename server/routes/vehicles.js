import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/vehicles (Scoped by Role)
router.get('/', authMiddleware, (req, res) => {
  let vehicles;
  const user = req.user;

  if (user.role === 'ops_manager') {
    vehicles = db.prepare(`
      SELECT v.*, u.full_name as driver_name, u.email as driver_email, u.phone as driver_phone, ven.name as vendor_name 
      FROM vehicles v
      LEFT JOIN users u ON v.assigned_driver_id = u.id
      LEFT JOIN vendors ven ON v.vendor_id = ven.id
    `).all();
  } else if (user.role === 'vendor_manager') {
    vehicles = db.prepare(`
      SELECT v.*, u.full_name as driver_name, u.email as driver_email, u.phone as driver_phone, ven.name as vendor_name 
      FROM vehicles v
      LEFT JOIN users u ON v.assigned_driver_id = u.id
      LEFT JOIN vendors ven ON v.vendor_id = ven.id
      WHERE v.vendor_id = ?
    `).all(user.vendorId || '');
  } else if (user.role === 'driver') {
    vehicles = db.prepare(`
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
router.post('/', authMiddleware, requireRole('ops_manager', 'vendor_manager'), (req, res) => {
  const { id, plate_number, assigned_driver_id, display_size, current_city } = req.body;
  let vendor_id = req.body.vendor_id;

  if (req.user.role === 'vendor_manager') {
    vendor_id = req.user.vendorId;
  }

  if (!id || !plate_number || !vendor_id) {
    return res.status(400).json({ error: 'Vehicle ID, License Plate, and Vendor ID are required' });
  }

  try {
    db.prepare(`
      INSERT INTO vehicles (id, plate_number, vendor_id, assigned_driver_id, display_size, current_city, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Offline')
    `).run(id, plate_number, vendor_id, assigned_driver_id || null, display_size || '12x6 ft Dual LED', current_city || 'Bengaluru');

    const newVehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    return res.json({ success: true, vehicle: newVehicle });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/vehicles/settings (Persist Driver Duty & Real GPS Toggle State)
router.post('/settings', authMiddleware, (req, res) => {
  const { vehicle_id, is_real_gps_active, is_duty_active } = req.body;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id is required' });

  try {
    db.prepare(`
      UPDATE vehicles
      SET is_real_gps_active = COALESCE(?, is_real_gps_active),
          is_duty_active = COALESCE(?, is_duty_active)
      WHERE id = ?
    `).run(is_real_gps_active !== undefined ? (is_real_gps_active ? 1 : 0) : null,
           is_duty_active !== undefined ? (is_duty_active ? 1 : 0) : null,
           vehicle_id);

    const updated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
    return res.json({ success: true, vehicle: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PUT /api/vehicles/:id (Edit Vehicle)
router.put('/:id', authMiddleware, requireRole('ops_manager', 'vendor_manager'), (req, res) => {
  const vehicleId = req.params.id;
  const existing = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);

  if (!existing) {
    return res.status(404).json({ error: 'Vehicle not found' });
  }

  if (req.user.role === 'vendor_manager' && existing.vendor_id !== req.user.vendorId) {
    return res.status(403).json({ error: 'Unauthorized: You can only modify vehicles belonging to your own company' });
  }

  const { plate_number, assigned_driver_id, display_size, current_city, status } = req.body;

  try {
    db.prepare(`
      UPDATE vehicles 
      SET plate_number = COALESCE(?, plate_number),
          assigned_driver_id = COALESCE(?, assigned_driver_id),
          display_size = COALESCE(?, display_size),
          current_city = COALESCE(?, current_city),
          status = COALESCE(?, status)
      WHERE id = ?
    `).run(plate_number, assigned_driver_id || null, display_size, current_city, status, vehicleId);

    const updated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);
    return res.json({ success: true, vehicle: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/vehicles/:id (Delete Vehicle with Safe Foreign Key Child Cleanup)
router.delete('/:id', authMiddleware, requireRole('ops_manager', 'vendor_manager'), (req, res) => {
  const vehicleId = req.params.id;
  const existing = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);

  if (!existing) {
    return res.status(404).json({ error: 'Vehicle not found' });
  }

  if (req.user.role === 'vendor_manager' && existing.vendor_id !== req.user.vendorId) {
    return res.status(403).json({ error: 'Unauthorized: You can only delete vehicles belonging to your own company' });
  }

  try {
    // Explicitly delete child records from all referencing tables to prevent foreign key errors
    db.prepare('DELETE FROM approved_breaks WHERE vehicle_id = ?').run(vehicleId);
    db.prepare('DELETE FROM alerts WHERE vehicle_id = ?').run(vehicleId);
    db.prepare('DELETE FROM vehicle_campaigns WHERE vehicle_id = ?').run(vehicleId);
    db.prepare('DELETE FROM telemetry_pings WHERE vehicle_id = ?').run(vehicleId);
    db.prepare('DELETE FROM campaign_photo_proofs WHERE vehicle_id = ?').run(vehicleId);
    db.prepare('DELETE FROM vehicles WHERE id = ?').run(vehicleId);

    return res.json({ success: true, message: `Vehicle ${vehicleId} deleted successfully` });
  } catch (err) {
    return res.status(500).json({ error: `Failed to delete vehicle: ${err.message}` });
  }
});

export default router;
