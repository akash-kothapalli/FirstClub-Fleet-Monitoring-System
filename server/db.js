import { createClient } from '@libsql/client';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

const dataDir = process.env.DATA_DIR || (fs.existsSync('/var/data') ? '/var/data' : path.join(process.cwd(), 'data'));
const uploadsDir = process.env.UPLOADS_DIR || (fs.existsSync('/var/data/uploads') ? '/var/data/uploads' : path.join(process.cwd(), 'uploads', 'proofs'));

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

function flattenArgs(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

let db;

if (tursoUrl && tursoToken) {
  console.log(`[DATABASE] ☁️ Connected to Turso Cloud SQLite via environment variables: ${tursoUrl}`);
  const client = createClient({ url: tursoUrl, authToken: tursoToken });

  db = {
    isTurso: true,
    prepare(sql) {
      return {
        async get(...args) {
          const res = await client.execute({ sql, args: flattenArgs(args) });
          return res.rows[0] ? { ...res.rows[0] } : null;
        },
        async all(...args) {
          const res = await client.execute({ sql, args: flattenArgs(args) });
          return res.rows.map(r => ({ ...r }));
        },
        async run(...args) {
          const res = await client.execute({ sql, args: flattenArgs(args) });
          return { changes: res.rowsAffected, lastInsertRowid: res.lastInsertRowid };
        }
      };
    },
    async exec(sql) {
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      if (statements.length === 1) {
        await client.execute(statements[0]);
      } else if (statements.length > 1) {
        await client.batch(statements.map(s => ({ sql: s, args: [] })), 'write');
      }
    }
  };
} else {
  const dbPath = path.join(dataDir, 'fleet.db');
  console.log(`[DATABASE] 📁 Connected to Local SQLite Database: ${dbPath}`);
  const localDb = new DatabaseSync(dbPath);

  localDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `);

  db = localDb;
}

export async function initDatabase() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_email TEXT,
      phone TEXT,
      sla_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ops_manager', 'vendor_manager', 'driver')),
      vendor_id TEXT,
      full_name TEXT NOT NULL,
      phone TEXT,
      secondary_phone TEXT,
      target_city TEXT,
      target_campaign_areas TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
    );
  `);

  // Safe migrations for users
  const userColumns = ['phone', 'secondary_phone', 'target_city', 'target_campaign_areas'];
  for (const col of userColumns) {
    try {
      await db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT;`);
    } catch (e) {}
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      revoked INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      plate_number TEXT UNIQUE NOT NULL,
      vendor_id TEXT NOT NULL,
      assigned_driver_id TEXT,
      display_size TEXT DEFAULT '12x6 ft Dual LED',
      status TEXT DEFAULT 'Offline' CHECK(status IN ('Moving', 'Idle', 'On Approved Break', 'Offline')),
      current_city TEXT DEFAULT 'Fetching location...',
      current_area TEXT DEFAULT 'Fetching location...',
      current_lat REAL,
      current_lng REAL,
      current_speed REAL DEFAULT 0,
      heading REAL DEFAULT 0,
      last_ping_time DATETIME,
      today_distance_km REAL DEFAULT 0,
      running_time_mins INTEGER DEFAULT 0,
      idle_time_mins INTEGER DEFAULT 0,
      break_time_mins INTEGER DEFAULT 0,
      active_break_type TEXT,
      is_real_gps_active INTEGER DEFAULT 0,
      is_duty_active INTEGER DEFAULT 1,
      last_geocoded_lat REAL,
      last_geocoded_lng REAL,
      last_geocoded_address TEXT,
      FOREIGN KEY(vendor_id) REFERENCES vendors(id),
      FOREIGN KEY(assigned_driver_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Safe migrations for vehicles
  const vehicleColumns = [
    { name: 'current_area', type: 'TEXT' },
    { name: 'active_break_type', type: 'TEXT' },
    { name: 'is_real_gps_active', type: 'INTEGER DEFAULT 0' },
    { name: 'is_duty_active', type: 'INTEGER DEFAULT 1' },
    { name: 'last_geocoded_lat', type: 'REAL' },
    { name: 'last_geocoded_lng', type: 'REAL' },
    { name: 'last_geocoded_address', type: 'TEXT' }
  ];

  for (const col of vehicleColumns) {
    try {
      await db.exec(`ALTER TABLE vehicles ADD COLUMN ${col.name} ${col.type};`);
    } catch (e) {}
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      client TEXT NOT NULL,
      city TEXT NOT NULL,
      target_km_per_day REAL DEFAULT 80,
      geofence_json TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vehicle_campaigns (
      vehicle_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      PRIMARY KEY (vehicle_id, campaign_id),
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS telemetry_pings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id TEXT NOT NULL,
      campaign_id TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      speed REAL DEFAULT 0,
      heading REAL DEFAULT 0,
      address TEXT,
      is_break INTEGER DEFAULT 0,
      break_type TEXT,
      visibility_state TEXT DEFAULT 'foreground',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pings_vehicle_time ON telemetry_pings(vehicle_id, timestamp);
  `);

  try {
    await db.exec(`ALTER TABLE telemetry_pings ADD COLUMN break_type TEXT;`);
  } catch (e) {}

  try {
    await db.exec(`ALTER TABLE telemetry_pings ADD COLUMN accuracy REAL DEFAULT 8.0;`);
  } catch (e) {}

  try {
    await db.exec(`ALTER TABLE telemetry_pings ADD COLUMN driver_id TEXT;`);
  } catch (e) {}

  await db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_photo_proofs (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL,
      driver_id TEXT NOT NULL,
      photo_url TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      address TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY(driver_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS geocode_cache (
      lat_rounded REAL NOT NULL,
      lng_rounded REAL NOT NULL,
      actual_lat REAL,
      actual_lng REAL,
      address TEXT NOT NULL,
      is_precise INTEGER DEFAULT 1,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (lat_rounded, lng_rounded)
    );
  `);

  try {
    await db.exec(`ALTER TABLE geocode_cache ADD COLUMN actual_lat REAL;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE geocode_cache ADD COLUMN actual_lng REAL;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE geocode_cache ADD COLUMN is_precise INTEGER DEFAULT 1;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE geocode_cache ADD COLUMN cached_at DATETIME DEFAULT CURRENT_TIMESTAMP;`);
  } catch (e) {}

  // Systemic purge of legacy unvalidated cache entries
  try {
    await db.exec(`DELETE FROM geocode_cache WHERE actual_lat IS NULL OR is_precise = 0 OR address LIKE '%Badamanavarthekaval%';`);
  } catch (e) {}

  await db.exec(`
    CREATE TABLE IF NOT EXISTS approved_breaks (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL,
      driver_id TEXT NOT NULL,
      break_type TEXT NOT NULL,
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED')),
      lat REAL,
      lng REAL,
      address TEXT,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id),
      FOREIGN KEY(driver_id) REFERENCES users(id)
    );
  `);

  const breakColumns = [
    { name: 'lat', type: 'REAL' },
    { name: 'lng', type: 'REAL' },
    { name: 'address', type: 'TEXT' }
  ];

  for (const col of breakColumns) {
    try {
      await db.exec(`ALTER TABLE approved_breaks ADD COLUMN ${col.name} ${col.type};`);
    } catch (e) {}
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL,
      alert_type TEXT CHECK(alert_type IN ('GEOFENCE_BREACH', 'EXCESSIVE_IDLE', 'GPS_LOSS', 'LATE_START')),
      severity TEXT CHECK(severity IN ('CRITICAL', 'WARNING', 'INFO')),
      message TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      acknowledged INTEGER DEFAULT 0,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_vehicle_time ON alerts(vehicle_id, timestamp);
  `);

  await seedEssentialManagerAccountsOnly();
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'firstclub_salt_2026').digest('hex');
}

async function seedEssentialManagerAccountsOnly() {
  const defaultPass = hashPassword('password123');

  // Ensure default partner vendor v1 exists as Envision Advertising
  await db.prepare(`
    INSERT OR IGNORE INTO vendors (id, name, contact_email, phone) VALUES (?, ?, ?, ?)
  `).run('v1', 'Envision Advertising', 'akash.kothapalli@firstclub.co.in', '+91 98000 11111');

  // Update vendor name if v1 already exists in database
  await db.prepare(`
    UPDATE vendors SET name = 'Envision Advertising' WHERE id = 'v1'
  `).run();

  // Ensure default campaign c1 exists
  await db.prepare(`
    INSERT OR IGNORE INTO campaigns (id, name, client, city, target_km_per_day, geofence_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('c1', 'FirstClub Outdoor LED Campaign', 'FirstClub Brand', 'Bengaluru', 90, '[]');

  // 1. Ops Manager: Akash (akash.kothapalli@firstclub.co.in / password123)
  await db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, role, vendor_id, full_name, phone, secondary_phone, target_city, target_campaign_areas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('u_ops1', 'akash.kothapalli@firstclub.co.in', defaultPass, 'ops_manager', null, 'Akash', '+91 98000 11111', '', 'Bengaluru', 'Bellandur, Sarjapur, Indiranagar');

  // 2. Ops Manager: Bapu (bapu.kale@firstclub.co.in / password123)
  await db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, role, vendor_id, full_name, phone, secondary_phone, target_city, target_campaign_areas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('u_ops2', 'bapu.kale@firstclub.co.in', defaultPass, 'ops_manager', null, 'Bapu', '+91 98000 22222', '', 'Mumbai', 'Marine Drive, BKC, Worli');

  // 3. Vendor Manager: Akash (vendor.akash@firstclub.co.in / password123)
  await db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, role, vendor_id, full_name, phone, secondary_phone, target_city, target_campaign_areas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('u_vm1', 'vendor.akash@firstclub.co.in', defaultPass, 'vendor_manager', 'v1', 'Akash (Vendor Manager)', '+91 98000 11111', '', 'Bengaluru', 'Bengaluru Corridors');
}

export default db;
