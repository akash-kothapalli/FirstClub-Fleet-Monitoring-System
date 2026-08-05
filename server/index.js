import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import db, { initDatabase } from './db.js';
import authRoutes from './routes/auth.js';
import vehicleRoutes from './routes/vehicles.js';
import telemetryRoutes from './routes/telemetry.js';
import campaignRoutes from './routes/campaigns.js';
import reportRoutes from './routes/reports.js';
import { verifyToken } from './middleware/auth.js';

initDatabase();

const app = express();
const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(process.cwd(), 'dist');
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' })); // Support base64 photo uploads
app.use(cookieParser());

// Serve static assets & uploaded photo proofs
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

// Register Modular API Routes
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/reports', reportRoutes);

// Real-Time Server-Sent Events (SSE) Stream
const sseClients = new Set();

app.get('/api/events', (req, res) => {
  let token = req.cookies?.fleet_token || req.query.token;
  const user = verifyToken(token);

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized SSE connection' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = { res, userId: user.userId, role: user.role, vendorId: user.vendorId };
  sseClients.add(client);

  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to FirstClub FFMS Real-Time SSE Stream', role: user.role })}\n\n`);

  req.on('close', () => sseClients.delete(client));
});

// Health check
app.get('/api/health', (req, res) => {
  const dbCheck = db.prepare('SELECT COUNT(*) as count FROM vehicles').get();
  res.json({
    status: 'HEALTHY',
    timestamp: new Date().toISOString(),
    activeSSEClients: sseClients.size,
    vehiclesTracked: dbCheck.count,
    nodeVersion: process.version
  });
});

// SPA Fallback to React index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  const distIndexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(distIndexPath)) {
    return res.sendFile(distIndexPath);
  }
  
  return res.sendFile(path.join(process.cwd(), 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`⚡ FirstClub FFMS Express Server Running!`);
  console.log(`🌐 Application URL: http://localhost:${PORT}`);
  console.log(`🔒 SQLite WAL Mode: Enabled | Real-Time SSE: Active`);
  console.log(`=======================================================`);
});
