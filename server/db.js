import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const dataDir = path.join(process.cwd(), 'data');
const uploadsDir = path.join(process.cwd(), 'uploads', 'proofs');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const dbPath = path.join(dataDir, 'fleet.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
`);

export function initDatabase() {
  db.exec(`
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
  userColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT;`);
    } catch (e) {}
  });

  db.exec(`
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
      current_city TEXT DEFAULT 'Mumbai',
      current_area TEXT DEFAULT 'Marine Drive Promenade',
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
      FOREIGN KEY(vendor_id) REFERENCES vendors(id),
      FOREIGN KEY(assigned_driver_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Safe migrations for vehicles
  const vehicleColumns = [
    { name: 'current_area', type: 'TEXT' },
    { name: 'active_break_type', type: 'TEXT' },
    { name: 'is_real_gps_active', type: 'INTEGER DEFAULT 0' },
    { name: 'is_duty_active', type: 'INTEGER DEFAULT 1' }
  ];

  vehicleColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE vehicles ADD COLUMN ${col.name} ${col.type};`);
    } catch (e) {}
  });

  db.exec(`
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
      visibility_state TEXT DEFAULT 'foreground',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pings_vehicle_time ON telemetry_pings(vehicle_id, timestamp);

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
      address TEXT NOT NULL,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (lat_rounded, lng_rounded)
    );

    CREATE TABLE IF NOT EXISTS approved_breaks (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL,
      driver_id TEXT NOT NULL,
      break_type TEXT CHECK(break_type IN ('Lunch', 'Tea', 'Emergency', 'Custom')),
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED')),
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id),
      FOREIGN KEY(driver_id) REFERENCES users(id)
    );

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

  seedDataIfEmpty();
  runGuardedMigrations();
}

function runGuardedMigrations() {
  const MIGRATION_ID = 'v1_driver_id_alignment';
  try {
    const check = db.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(MIGRATION_ID);
    if (check) {
      console.log(`[DB MIGRATION] ${MIGRATION_ID} already executed. Skipping.`);
      return;
    }

    const CITY_ZONES = [
      { name: 'Bengaluru', latMin: 12.7, latMax: 13.2, lngMin: 77.3, lngMax: 77.9 },
      { name: 'Delhi',     latMin: 28.3, latMax: 28.9, lngMin: 76.8, lngMax: 77.5 },
      { name: 'Mumbai',    latMin: 18.8, latMax: 19.3, lngMin: 72.7, lngMax: 73.1 },
      { name: 'Hyderabad', latMin: 17.2, latMax: 17.6, lngMin: 78.2, lngMax: 78.7 },
    ];

    // Systemically align assigned_driver_id for existing assigned drivers using user email match
    db.exec(`
      UPDATE vehicles
      SET assigned_driver_id = (
        SELECT id FROM users 
        WHERE (users.email = 'sunil@apexmedia.in' AND vehicles.id = 'veh_1')
           OR (users.email = 'driver.raju@apexmedia.in' AND vehicles.id = 'veh_2')
           OR (users.email = 'driver.anil@cityvibe.in' AND vehicles.id = 'veh_3')
        LIMIT 1
      )
      WHERE id IN ('veh_1', 'veh_2', 'veh_3');
    `);

    // Synchronize vehicle cities and area landmarks
    const vehicles = db.prepare('SELECT id, current_lat, current_lng, current_city, current_area FROM vehicles').all();
    vehicles.forEach(v => {
      if (v.current_lat && v.current_lng) {
        const match = CITY_ZONES.find(
          z => v.current_lat >= z.latMin && v.current_lat <= z.latMax && v.current_lng >= z.lngMin && v.current_lng <= z.lngMax
        );
        const resolvedCity = match ? match.name : (v.current_city || 'Unknown City');

        let resolvedArea = v.current_area;
        if (!resolvedArea || resolvedArea.startsWith('GPS Corridor') || resolvedArea === 'Corridor Route') {
          if (v.current_lat >= 12.90 && v.current_lat <= 12.95 && v.current_lng >= 77.64 && v.current_lng <= 77.71) {
            resolvedArea = 'Bellandur & Sarjapur Tech Corridor';
          }
        }

        db.prepare('UPDATE vehicles SET current_city = ?, current_area = ? WHERE id = ?').run(resolvedCity, resolvedArea, v.id);
      }
    });

    db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(MIGRATION_ID);
    console.log(`[DB MIGRATION] Executed ${MIGRATION_ID} successfully.`);
  } catch (err) {
    console.warn('[DB MIGRATION] Execution error:', err.message);
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'firstclub_salt_2026').digest('hex');
}

function seedDataIfEmpty() {
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM users');
  const result = countStmt.get();
  if (result.count > 0) return;

  console.log('[DB] Seeding initial vendors, users, campaigns, and vehicles...');

  const insertVendor = db.prepare('INSERT INTO vendors (id, name, contact_email, phone) VALUES (?, ?, ?, ?)');
  insertVendor.run('v1', 'Apex Outdoor Media', 'ops@apexmedia.in', '+91 98200 11223');
  insertVendor.run('v2', 'CityVibe Motion Ads', 'contact@cityvibe.co.in', '+91 98111 44556');

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, role, vendor_id, full_name, phone, secondary_phone, target_city, target_campaign_areas) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const defaultPass = hashPassword('password123');
  
  insertUser.run('u_ops1', 'manager@firstclub.com', defaultPass, 'ops_manager', null, 'Rajesh Sharma (FirstClub Ops)', '+91 98000 00001', '', 'Mumbai', 'Nationwide');
  insertUser.run('u_vm1', 'vendor1@apexmedia.in', defaultPass, 'vendor_manager', 'v1', 'Vikram Patel (Apex Media)', '+91 98200 11223', '', 'Mumbai', 'Mumbai Corridors');
  insertUser.run('u_vm2', 'vendor2@cityvibe.in', defaultPass, 'vendor_manager', 'v2', 'Amit Verma (CityVibe Ads)', '+91 98111 44556', '', 'Delhi', 'NCR Ring Road');
  
  insertUser.run('u_d1', 'sunil@apexmedia.in', defaultPass, 'driver', 'v1', 'Sunil Kumar', '+91 98765 43210', '+91 98765 43211', 'Bengaluru', 'Bellandur, Sarjapur, Indiranagar');
  insertUser.run('u_d2', 'driver.raju@apexmedia.in', defaultPass, 'driver', 'v1', 'Raju Yadav', '+91 98765 88990', '', 'Mumbai', 'Western Express Highway');
  insertUser.run('u_d3', 'driver.anil@cityvibe.in', defaultPass, 'driver', 'v2', 'Anil Deshmukh', '+91 98111 22334', '', 'Delhi', 'Connaught Place, Cyber Hub');

  const insertCampaign = db.prepare('INSERT INTO campaigns (id, name, client, city, target_km_per_day, geofence_json, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  
  const mumbaiGeofence = JSON.stringify([
    [18.9200, 72.8150], [18.9600, 72.8400], [19.0600, 72.8500], [19.1200, 72.8300],
    [19.1800, 72.8500], [19.1500, 72.8800], [19.0000, 72.8600], [18.9200, 72.8300]
  ]);

  const delhiGeofence = JSON.stringify([
    [28.6000, 77.1800], [28.6500, 77.2000], [28.6600, 77.2400],
    [28.5800, 77.2500], [28.5000, 77.1000], [28.5300, 77.0800]
  ]);

  const blrGeofence = JSON.stringify([
    [12.9500, 77.6000], [12.9800, 77.6200], [12.9900, 77.6600],
    [12.9200, 77.6800], [12.9000, 77.6300]
  ]);

  insertCampaign.run('c1', 'FirstClub Summer Flash Sale', 'FirstClub Retail', 'Mumbai', 90, mumbaiGeofence, '2026-08-01', '2026-08-31');
  insertCampaign.run('c2', 'ElectroFest LED Blitz', 'TechGig Events', 'Delhi', 100, delhiGeofence, '2026-08-01', '2026-08-15');
  insertCampaign.run('c3', 'App Launch Roadshow', 'SuperApp Inc', 'Bengaluru', 85, blrGeofence, '2026-08-01', '2026-08-20');

  const insertVehicle = db.prepare(`
    INSERT INTO vehicles 
    (id, plate_number, vendor_id, assigned_driver_id, display_size, status, current_city, current_area, current_lat, current_lng, current_speed, heading, last_ping_time, today_distance_km, running_time_mins, idle_time_mins, break_time_mins, is_duty_active) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, 1)
  `);

  insertVehicle.run('veh_1', 'MH-02-CL-8821', 'v1', 'u_d1', '14x7 ft HD Dual LED', 'Moving', 'Bengaluru', 'Bellandur & Sarjapur Tech Corridor', 12.9220, 77.6764, 28.5, 45.0, 42.8, 185, 22, 45);
  insertVehicle.run('veh_2', 'MH-04-EV-9904', 'v1', 'u_d2', '12x6 ft 4K Curved LED', 'On Approved Break', 'Mumbai', 'Bandra Kurla Complex (BKC)', 19.0621, 72.8340, 0.0, 180.0, 31.4, 140, 15, 45);
  insertVehicle.run('veh_3', 'DL-01-AB-1234', 'v2', 'u_d3', '16x8 ft Triple Screen Truck', 'Moving', 'Delhi', 'Connaught Place Outer Ring', 28.6289, 77.2197, 34.0, 90.0, 58.2, 210, 35, 30);
  insertVehicle.run('veh_4', 'KA-89-8688', 'v1', 'u_d2', '14x7 ft HD Dual LED', 'Offline', 'Bengaluru', 'Indiranagar 100ft Road', 12.9716, 77.5946, 0.0, 0.0, 0.0, 0, 0, 0);

  const insertVC = db.prepare('INSERT INTO vehicle_campaigns (vehicle_id, campaign_id) VALUES (?, ?)');
  insertVC.run('veh_1', 'c1');
  insertVC.run('veh_2', 'c1');
  insertVC.run('veh_3', 'c2');

  const insertPing = db.prepare(`
    INSERT INTO telemetry_pings (vehicle_id, campaign_id, lat, lng, speed, heading, address, is_break, visibility_state, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
  `);

  const blrWaypoints = [
    [12.9120, 77.6546, 22, 10, "Sarjapur Road, Bengaluru", "-180 minutes"],
    [12.9220, 77.6764, 28, 45, "Bellandur & Sarjapur Tech Corridor, Bengaluru", "-5 minutes"]
  ];

  blrWaypoints.forEach(wp => {
    insertPing.run('veh_1', 'c3', wp[0], wp[1], wp[2], wp[3], wp[4], 0, 'foreground', wp[5]);
  });

  const insertAlert = db.prepare('INSERT INTO alerts (id, vehicle_id, alert_type, severity, message, timestamp) VALUES (?, ?, ?, ?, ?, datetime(\'now\', \'-45 minutes\'))');
  insertAlert.run('alt_1', 'veh_1', 'GEOFENCE_BREACH', 'CRITICAL', 'Vehicle MH-02-CL-8821 detected outside assigned Mumbai zone near Dadar T.T.');

  console.log('[DB] Seeding completed successfully!');
}

initDatabase();

export default db;
