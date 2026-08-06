import crypto from 'node:crypto';
import db from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'firstclub_led_fleet_secret_key_2026_super_secure';

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'firstclub_salt_2026').digest('hex');
}

export function generateToken(payload, expiresInHours = 12) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (expiresInHours * 3600);
  // Add microsecond entropy to prevent token collisions in automated test suites
  const fullPayload = { ...payload, iat: now, exp, nonce: crypto.randomBytes(4).toString('hex') };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${b64Header}.${b64Payload}`)
    .digest('base64url');

  return `${b64Header}.${b64Payload}.${signature}`;
}

export async function verifyToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [b64Header, b64Payload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${b64Header}.${b64Payload}`)
      .digest('base64url');

    if (signature !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    const checkRevoked = await db.prepare('SELECT revoked FROM sessions WHERE token = ?').get(token);
    if (checkRevoked && checkRevoked.revoked === 1) return null;

    return payload;
  } catch (err) {
    return null;
  }
}

export async function loginUser(email, password) {
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return { error: 'Invalid email or password' };

  const hashed = hashPassword(password);
  if (user.password_hash !== hashed) {
    return { error: 'Invalid email or password' };
  }

  const tokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    vendorId: user.vendor_id,
    fullName: user.full_name
  };

  const token = generateToken(tokenPayload, 12);
  const expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();

  await db.prepare('INSERT OR REPLACE INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      vendorId: user.vendor_id,
      fullName: user.full_name
    }
  };
}

export async function revokeToken(token) {
  if (!token) return { success: true };
  await db.prepare('UPDATE sessions SET revoked = 1 WHERE token = ?').run(token);
  return { success: true };
}

export async function authMiddleware(req, res, next) {
  let token = req.cookies?.fleet_token;
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.replace('Bearer ', '').trim();
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const decoded = await verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Session expired or revoked' });
  }

  req.user = decoded;
  req.token = token;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied. Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}
