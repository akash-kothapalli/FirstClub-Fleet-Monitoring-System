import { Router } from 'express';
import crypto from 'node:crypto';
import db from '../db.js';
import { loginUser, revokeToken, authMiddleware, requireRole, generateToken } from '../middleware/auth.js';

const router = Router();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'firstclub_salt_2026').digest('hex');
}

// 1. Log In Endpoint
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const result = await loginUser(email, password);
  if (result.error) {
    return res.status(401).json({ error: result.error });
  }

  res.cookie('fleet_token', result.token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 12 * 3600 * 1000
  });

  return res.json(result);
});

// 2. Driver Self-Registration Endpoint with Safe Vendor Handling
router.post('/register', async (req, res) => {
  const { fullName, email, password, phone, secondaryPhone, targetCity, targetCampaignAreas } = req.body;

  if (!email || !password || !fullName || !phone) {
    return res.status(400).json({ error: 'Full Name, Email, Password, and Primary Phone are required' });
  }

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(400).json({ error: 'An account with this email already exists' });
  }

  // Ensure default vendor 'v1' exists in database to prevent Foreign Key constraint errors
  await db.prepare(`
    INSERT OR IGNORE INTO vendors (id, name, contact_email, phone)
    VALUES ('v1', 'Akash Outdoor Media', 'akash.kothapalli@firstclub.co.in', '+91 98000 11111')
  `).run();

  const userId = `u_drv_${Date.now()}`;
  const passHash = hashPassword(password);
  const vendorId = 'v1';

  try {
    await db.prepare(`
      INSERT INTO users (id, email, password_hash, role, vendor_id, full_name, phone, secondary_phone, target_city, target_campaign_areas)
      VALUES (?, ?, ?, 'driver', ?, ?, ?, ?, ?, ?)
    `).run(userId, email, passHash, vendorId, fullName, phone, secondaryPhone || '', targetCity || 'Bengaluru', targetCampaignAreas || '');

    const tokenPayload = {
      userId,
      email,
      role: 'driver',
      vendorId,
      fullName,
      full_name: fullName
    };

    const token = generateToken(tokenPayload, 12);
    await db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime(\'now\', \'+12 hours\'))').run(token, userId);

    res.cookie('fleet_token', token, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 12 * 3600 * 1000
    });

    return res.json({ success: true, token, user: tokenPayload });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// 3. Driver Profile Update Endpoint
router.post('/driver-profile', authMiddleware, async (req, res) => {
  const { phone, secondary_phone, target_city, target_campaign_areas } = req.body;
  const userId = req.user.userId;

  try {
    await db.prepare(`
      UPDATE users 
      SET phone = COALESCE(?, phone),
          secondary_phone = COALESCE(?, secondary_phone),
          target_city = COALESCE(?, target_city),
          target_campaign_areas = COALESCE(?, target_campaign_areas)
      WHERE id = ?
    `).run(phone, secondary_phone, target_city, target_campaign_areas, userId);

    const updatedUser = await db.prepare('SELECT id, email, role, vendor_id, full_name, phone, secondary_phone, target_city, target_campaign_areas FROM users WHERE id = ?').get(userId);
    if (updatedUser) {
      updatedUser.fullName = updatedUser.full_name;
    }
    return res.json({ success: true, user: updatedUser });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// 4. Get Registered Drivers List (For Admin CRUD Auto-Population)
router.get('/drivers', authMiddleware, async (req, res) => {
  const drivers = await db.prepare(`
    SELECT id, email, full_name, phone, secondary_phone, target_city, target_campaign_areas, vendor_id 
    FROM users WHERE role = 'driver'
  `).all();

  return res.json({ drivers });
});

// 5. Log Out Endpoint
router.post('/logout', authMiddleware, async (req, res) => {
  if (req.token) await revokeToken(req.token);
  res.clearCookie('fleet_token');
  return res.json({ success: true });
});

// 6. Current User Session Check
router.get('/me', authMiddleware, async (req, res) => {
  const fullUser = await db.prepare('SELECT id, email, role, vendor_id, full_name, phone, secondary_phone, target_city, target_campaign_areas FROM users WHERE id = ?').get(req.user.userId);
  if (fullUser) {
    fullUser.fullName = fullUser.full_name;
  }
  return res.json({ user: fullUser || req.user });
});

// 7. Revoke Session
router.post('/revoke', authMiddleware, requireRole('ops_manager'), async (req, res) => {
  const { tokenToRevoke } = req.body;
  if (tokenToRevoke) await revokeToken(tokenToRevoke);
  return res.json({ success: true });
});

export default router;
