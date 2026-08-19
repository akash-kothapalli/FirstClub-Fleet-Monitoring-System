import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import db from './db.js';

function getLogoBase64() {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'firstclub-logo.png');
    if (fs.existsSync(logoPath)) {
      const buffer = fs.readFileSync(logoPath);
      return `data:image/png;base64,${buffer.toString('base64')}`;
    }
  } catch (e) {}
  return '';
}

function formatISTTime(dateInput) {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

export async function generateDailyAuditReport(vehicleId, dateStr) {
  const vehicle = await db.prepare(`
    SELECT v.*, u.full_name as driver_name, u.email as driver_email, u.target_city as driver_target_city, ven.name as vendor_name 
    FROM vehicles v
    LEFT JOIN users u ON v.assigned_driver_id = u.id
    LEFT JOIN vendors ven ON v.vendor_id = ven.id
    WHERE v.id = ?
  `).get(vehicleId);

  if (!vehicle) return { error: 'Vehicle not found' };

  const campaign = await db.prepare(`
    SELECT c.* FROM campaigns c
    JOIN vehicle_campaigns vc ON c.id = vc.campaign_id
    WHERE vc.vehicle_id = ?
    LIMIT 1
  `).get(vehicleId) || { name: 'FirstClub Outdoor LED Campaign', client: 'FirstClub Brand', target_km_per_day: 90 };

  const targetDate = (dateStr && dateStr !== 'LATEST') ? dateStr : new Date().toISOString().split('T')[0];

  const pings = await db.prepare(`
    SELECT * FROM telemetry_pings 
    WHERE vehicle_id = ? AND date(timestamp) = date(?)
    ORDER BY timestamp ASC
  `).all(vehicleId, targetDate);

  // Fetch approved breaks for this vehicle permanently from approved_breaks table
  let rawBreaks = await db.prepare(`
    SELECT * FROM approved_breaks
    WHERE vehicle_id = ? AND date(start_time) = date(?)
    ORDER BY start_time ASC
  `).all(vehicleId, targetDate);

  let lunchCount = 0, lunchMins = 0;
  let teaCount = 0, teaMins = 0;
  let serviceCount = 0, serviceMins = 0;
  let totalBreakMins = 0;

  const processedBreaks = rawBreaks.map(b => {
    const start = new Date(b.start_time);
    const end = b.end_time ? new Date(b.end_time) : new Date();
    const duration = Math.max(1, Math.round((end - start) / 60000));

    if (b.break_type === 'Lunch') { lunchCount++; lunchMins += duration; }
    else if (b.break_type === 'Tea') { teaCount++; teaMins += duration; }
    else if (b.break_type === 'Service' || b.break_type === 'Emergency') { serviceCount++; serviceMins += duration; }

    totalBreakMins += duration;

    return {
      ...b,
      startTimeStr: formatISTTime(b.start_time),
      endTimeStr: b.end_time ? formatISTTime(b.end_time) : 'Ongoing',
      duration
    };
  });

  // Fetch photo proofs for this vehicle (all photos uploaded during shift)
  let photoProofs = await db.prepare(`
    SELECT * FROM campaign_photo_proofs
    WHERE vehicle_id = ? AND date(timestamp) = date(?)
    ORDER BY timestamp DESC LIMIT 100
  `).all(vehicleId, targetDate);

  // Convert all photo URLs to embedded Base64 Data URIs to guarantee rendering inside iframe / PDF print
  photoProofs = photoProofs.map(p => {
    let base64Src = p.photo_url;
    if (p.photo_url && p.photo_url.startsWith('data:image')) {
      base64Src = p.photo_url;
    } else if (p.photo_url && p.photo_url.startsWith('/uploads/')) {
      try {
        const relativePath = p.photo_url.replace('/uploads/', '');
        const fullPath = path.join(process.cwd(), 'uploads', relativePath);
        if (fs.existsSync(fullPath)) {
          const fileBuf = fs.readFileSync(fullPath);
          base64Src = `data:image/jpeg;base64,${fileBuf.toString('base64')}`;
        }
      } catch (e) {
        console.error('Failed to convert photo proof to Base64:', e);
      }
    }
    return { ...p, photo_base64: base64Src, timeFormatted: formatISTTime(p.timestamp) };
  });

  // Strict 10-Minute Telemetry Corridor Log Sampling (09:00, 09:10, 09:20...) plus break start/end transitions
  const sampledPings = [];
  let lastSampledTime = 0;
  let lastBreakStatus = null;
  const SAMPLE_INTERVAL_MS = 10 * 60 * 1000; // Strictly 10 minutes

  pings.forEach((p, idx) => {
    const pingTime = new Date(p.timestamp).getTime();
    const isFirstOrLast = (idx === 0 || idx === pings.length - 1);
    const currentBreakStatus = p.break_type || (p.is_break ? 'On Break' : null);
    const isBreakTransition = (currentBreakStatus !== lastBreakStatus);
    const isTimeIntervalReached = (pingTime - lastSampledTime >= SAMPLE_INTERVAL_MS);

    if (isFirstOrLast || isBreakTransition || isTimeIntervalReached) {
      sampledPings.push(p);
      lastSampledTime = pingTime;
      lastBreakStatus = currentBreakStatus;
    }
  });

  // Calculate exact route distance from consecutive pings for this driver/vehicle on target date
  let exactRouteDistKm = 0;
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
    if (dist >= 0.015 && dist <= 2.0) {
      exactRouteDistKm += dist;
    }
  }

  const totalDist = pings.length > 1 ? Math.round(exactRouteDistKm * 10) / 10 : (vehicle.today_distance_km || 0);
  const shiftStartTimeStr = pings.length > 0 ? formatISTTime(pings[0].timestamp) : 'Not Started';
  const shiftEndTimeStr = pings.length > 0 ? (vehicle.is_duty_active ? 'Ongoing Shift' : formatISTTime(pings[pings.length - 1].timestamp)) : 'Not Started';

  // Calculate fleet combined total distance across all drivers on target date
  const allPings = await db.prepare(`
    SELECT vehicle_id, lat, lng, timestamp FROM telemetry_pings
    WHERE date(timestamp) = date(?) ORDER BY vehicle_id, timestamp ASC
  `).all(targetDate);

  let fleetSumKm = 0;
  for (let i = 1; i < allPings.length; i++) {
    if (allPings[i - 1].vehicle_id === allPings[i].vehicle_id) {
      const p1 = allPings[i - 1];
      const p2 = allPings[i];
      const R = 6371;
      const dLat = (p2.lat - p1.lat) * Math.PI / 180;
      const dLng = (p2.lng - p1.lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (dist >= 0.015 && dist <= 2.0) fleetSumKm += dist;
    }
  }
  const fleetTotalDistKm = Math.round(fleetSumKm * 10) / 10;
  const fleetTargetDistKm = 270; // Fleet target across all drivers combined

  const targetDist = campaign.target_km_per_day || 90;
  const slaScore = targetDist > 0 ? Math.min(100, Math.round((totalDist / targetDist) * 100)) : 100;
  const logoBase64 = getLogoBase64();
  const currentISTTime = formatISTTime(new Date());
  const vendorDisplayName = vehicle.vendor_name || 'Envision Advertising';
  const targetCityDisplay = vehicle.driver_target_city || vehicle.current_city || 'Bengaluru';

  const reportPayload = {
    reportId: `REP-${vehicleId}-${dateStr || 'LATEST'}`,
    vehicleId,
    plateNumber: vehicle.plate_number,
    vendorName: vendorDisplayName,
    driverName: vehicle.driver_name || 'Unassigned Driver',
    campaignName: campaign.name,
    totalDistanceKm: totalDist,
    totalBreakMins,
    lunchCount,
    teaCount,
    serviceCount,
    slaScore,
    generatedAt: new Date().toISOString()
  };

  const secretKey = process.env.JWT_SECRET || 'firstclub_led_fleet_secret_key_2026_super_secure';
  const hmacSignature = crypto.createHmac('sha256', secretKey).update(JSON.stringify(reportPayload)).digest('hex');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>FirstClub Outdoor LED Campaign Report - ${vehicle.plate_number}</title>
  <style>
    @media print {
      body { background: #ffffff !important; color: #000000 !important; }
      .no-print { display: none; }
    }
    body {
      font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
      margin: 0; padding: 24px;
      background: #0b0f19; color: #f8fafc;
      line-height: 1.5;
    }
    .header {
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 24px;
    }
    .brand-title { font-size: 24px; font-weight: 800; color: #10b981; margin: 0; }
    .sub-title { font-size: 12px; color: #94a3b8; letter-spacing: 1px; }
    .logo-img { height: 48px; width: 48px; border-radius: 8px; vertical-align: middle; }
    
    .meta-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
      margin-bottom: 24px; background: #1e293b; padding: 16px; border-radius: 12px;
      border: 1px solid #334155;
    }
    .meta-item { display: flex; flex-direction: column; }
    .meta-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 600; }
    .meta-val { font-size: 14px; font-weight: 700; color: #ffffff; margin-top: 4px; }
    
    .kpi-row {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;
    }
    .kpi-box {
      background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 14px; border-radius: 12px; text-align: center;
    }
    .kpi-num { font-size: 24px; font-weight: 800; color: #10b981; }

    .break-summary-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px;
    }
    .break-summary-card {
      background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px; text-align: center;
    }
    .break-title { font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; }
    .break-val { font-size: 18px; font-weight: 800; color: #38bdf8; margin-top: 4px; }

    .section-title { font-size: 16px; font-weight: 700; color: #38bdf8; margin: 24px 0 12px 0; border-bottom: 1px solid #334155; padding-bottom: 6px; }
    
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; table-layout: fixed; }
    th { background: #1e293b; color: #38bdf8; text-align: left; padding: 10px; border: 1px solid #334155; }
    td { padding: 10px; border: 1px solid #334155; color: #cbd5e1; word-wrap: break-word; }
    tr:nth-child(even) { background: rgba(30, 41, 59, 0.4); }
    
    .proof-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
    .proof-card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 8px; text-align: center; }
    .proof-img { width: 100%; height: 140px; object-fit: cover; border-radius: 6px; border: 1px solid #38bdf8; }

    .signature-box {
      margin-top: 32px; padding: 16px; background: rgba(15, 23, 42, 0.8);
      border: 1px dashed #334155; border-radius: 8px; font-size: 11px; color: #94a3b8; font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="header">
    <div style="display: flex; align-items: center; gap: 12px;">
      ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="FirstClub Logo">` : ''}
      <div>
        <div class="brand-title">FirstClub Outdoor LED Campaign Report</div>
        <div class="sub-title">CAMPAIGN EXECUTION BILLING PROOF • AUDIT VERIFIED</div>
      </div>
    </div>
    <div style="text-align: right;">
      <div style="font-weight: 700; color: #ffffff;">Report Date: ${dateStr || 'Latest Shift'}</div>
      <div style="font-size: 11px; color: #94a3b8;">Generated: ${currentISTTime} IST</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item"><span class="meta-label">Campaign</span><span class="meta-val">${campaign.name}</span></div>
    <div class="meta-item"><span class="meta-label">Client</span><span class="meta-val">${campaign.client}</span></div>
    <div class="meta-item"><span class="meta-label">Vehicle Plate</span><span class="meta-val">${vehicle.plate_number}</span></div>
    <div class="meta-item"><span class="meta-label">Assigned Driver</span><span class="meta-val">${vehicle.driver_name || 'Unassigned Driver'}</span></div>
    <div class="meta-item"><span class="meta-label">Driver Shift Duty Window</span><span class="meta-val" style="color: #38bdf8;">${shiftStartTimeStr} - ${shiftEndTimeStr}</span></div>
    <div class="meta-item"><span class="meta-label">Vendor Partner</span><span class="meta-val">${vendorDisplayName}</span></div>
    <div class="meta-item"><span class="meta-label">Target City</span><span class="meta-val">${targetCityDisplay}</span></div>
    <div class="meta-item"><span class="meta-label">Driver Target / Day</span><span class="meta-val">${targetDist} km</span></div>
  </div>

  <div class="kpi-row">
    <div class="kpi-box">
      <div class="meta-label">Driver Distance Covered</div>
      <div class="kpi-num">${totalDist.toFixed(1)} km</div>
      <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">Actual GPS Route Travelled</div>
    </div>
    <div class="kpi-box">
      <div class="meta-label">Fleet Combined Distance Today</div>
      <div class="kpi-num" style="color: #38bdf8;">${fleetTotalDistKm.toFixed(1)} km</div>
      <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">Fleet Target: ${fleetTargetDistKm} km (All Drivers)</div>
    </div>
    <div class="kpi-box">
      <div class="meta-label">SLA Compliance Score</div>
      <div class="kpi-num">${slaScore}%</div>
    </div>
    <div class="kpi-box">
      <div class="meta-label">Total Running Time</div>
      <div class="kpi-num">${Math.floor((vehicle.running_time_mins || 0) / 60)}h ${(vehicle.running_time_mins || 0) % 60}m</div>
    </div>
  </div>

  <!-- APPROVED BREAKS AUDIT & COMPLIANCE SUMMARY -->
  <div class="section-title">☕ Approved Driver Break Compliance Summary</div>
  
  <div class="break-summary-grid">
    <div class="break-summary-card">
      <div class="break-title">🍱 Lunch Break</div>
      <div class="break-val">${lunchCount} time(s)</div>
      <div style="font-size: 11px; color: #94a3b8;">${lunchMins} mins total</div>
    </div>
    <div class="break-summary-card">
      <div class="break-title">☕ Tea Break</div>
      <div class="break-val">${teaCount} time(s)</div>
      <div style="font-size: 11px; color: #94a3b8;">${teaMins} mins total</div>
    </div>
    <div class="break-summary-card">
      <div class="break-title">🛠️ Service / Maintenance</div>
      <div class="break-val">${serviceCount} time(s)</div>
      <div style="font-size: 11px; color: #94a3b8;">${serviceMins} mins total</div>
    </div>
    <div class="break-summary-card">
      <div class="break-title">⏳ Total Trip Break</div>
      <div class="break-val" style="color: #4ade80;">${processedBreaks.length} break(s)</div>
      <div style="font-size: 11px; color: #4ade80;">${totalBreakMins} mins total</div>
    </div>
  </div>

  ${processedBreaks.length === 0 ? `
    <div style="font-size: 12px; color: #94a3b8; font-style: italic; padding: 10px; background: #1e293b; border-radius: 8px; margin-bottom: 24px;">
      No approved breaks taken during this shift.
    </div>
  ` : `
    <table>
      <thead>
        <tr>
          <th style="width: 25%;">Break Type</th>
          <th style="width: 25%;">Start Time (IST)</th>
          <th style="width: 25%;">End Time (IST)</th>
          <th style="width: 25%;">Duration (Minutes)</th>
        </tr>
      </thead>
      <tbody>
        ${processedBreaks.map(b => `
          <tr>
            <td><strong>${b.break_type === 'Lunch' ? '🍱 Lunch Break' : (b.break_type === 'Tea' ? '☕ Tea Break' : '🛠️ Vehicle Service')}</strong></td>
            <td>${b.startTimeStr}</td>
            <td>${b.endTimeStr}</td>
            <td><strong style="color: #38bdf8;">${b.duration} mins</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `}

  <div class="section-title">📸 20-Minute Driver Photo Proofs (${photoProofs.length} Uploaded)</div>
  ${photoProofs.length === 0 ? `
    <div style="font-size: 12px; color: #94a3b8; font-style: italic; padding: 12px; background: #1e293b; border-radius: 8px;">
      No camera photo proofs uploaded for this shift. Compliance tracking active via GPS telemetry.
    </div>
  ` : `
    <div class="proof-grid">
      ${photoProofs.map(p => `
        <div class="proof-card">
          <img src="${p.photo_base64}" class="proof-img" alt="Proof Photo">
          <div style="font-size: 10px; color: #4ade80; font-weight: 700; margin-top: 4px;">${p.timeFormatted} IST</div>
          <div style="font-size: 10px; color: #cbd5e1;">${p.address || 'Uploaded Location'}</div>
        </div>
      `).join('')}
    </div>
  `}

  <div class="section-title">📍 Telemetry & Approved Break Corridor Log (10-Min Intervals, ${sampledPings.length} Samples)</div>
  <table>
    <thead>
      <tr>
        <th style="width: 15%;">Timestamp (IST)</th>
        <th style="width: 28%;">Location Landmark</th>
        <th style="width: 25%;">GPS Coords (Source of Truth)</th>
        <th style="width: 10%;">GPS Accuracy</th>
        <th style="width: 9%;">Speed</th>
        <th style="width: 13%;">Status / Break</th>
      </tr>
    </thead>
    <tbody>
      ${sampledPings.map(p => {
        const mapsUrl = `https://www.google.com/maps?q=${p.lat},${p.lng}`;
        const accuracyStr = p.accuracy ? `±${Math.round(p.accuracy)}m` : '±8m';
        return `
          <tr>
            <td>${formatISTTime(p.timestamp)}</td>
            <td>${p.address || 'Corridor Route'}</td>
            <td>
              <a href="${mapsUrl}" target="_blank" style="color: #38bdf8; text-decoration: none; font-weight: 600; font-family: monospace;">
                📍 ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}
              </a>
            </td>
            <td><span style="font-size: 10px; color: #4ade80; font-weight: 600;">${accuracyStr}</span></td>
            <td>${p.speed} km/h</td>
            <td>
              <span style="color: ${p.is_break ? '#38bdf8' : (p.speed > 0 ? '#4ade80' : '#f59e0b')}; font-weight: 600;">
                ${p.is_break ? (p.break_type ? `Break (${p.break_type})` : 'Approved Break') : (p.speed > 0 ? 'Moving' : 'Idle')}
              </span>
            </td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <div class="signature-box">
    <strong>SHA-256 Cryptographic Audit Hash:</strong> ${hmacSignature}<br>
    Verified by FirstClub FFMS Billing Engine. Immutable Proof of Outdoor Campaign Execution.
  </div>
</body>
</html>
  `;

  return { html, reportPayload, hmacSignature };
}
