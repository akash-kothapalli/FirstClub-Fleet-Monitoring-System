import React from 'react';
import { useFleet } from '../context/FleetContext';

export function StatsOverview() {
  const { vehicles, alerts } = useFleet();

  const activeCount = vehicles.filter(v => v.status !== 'Offline').length;
  const totalKm = vehicles.reduce((sum, v) => sum + (v.today_distance_km || 0), 0);
  const movingCount = vehicles.filter(v => v.status === 'Moving').length;
  const breakCount = vehicles.filter(v => v.status === 'On Approved Break').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL' && !a.acknowledged).length;

  return (
    <section className="stats-grid">
      <div className="stat-card">
        <span className="stat-label">Active Vehicles</span>
        <span className="stat-value">{activeCount} / {vehicles.length}</span>
        <span className="stat-sub">Tracked Corridors</span>
      </div>

      <div className="stat-card">
        <span className="stat-label">Total Distance Today</span>
        <span className="stat-value" style={{ color: 'var(--accent-cyan)' }}>{totalKm.toFixed(1)} km</span>
        <span className="stat-sub">Target: 270 km</span>
      </div>

      <div className="stat-card">
        <span className="stat-label">Fleet Status</span>
        <span className="stat-value" style={{ color: 'var(--status-moving)' }}>{movingCount} Moving, {breakCount} Break</span>
        <span className="stat-sub">0 Unapproved Idling</span>
      </div>

      <div className="stat-card">
        <span className="stat-label">Geofence Compliance</span>
        <span className="stat-value" style={{ color: '#4ade80' }}>96.8%</span>
        <span className="stat-sub">1 Resolved Breach Today</span>
      </div>

      <div className="stat-card">
        <span className="stat-label">Active Alerts</span>
        <span className="stat-value" style={{ color: '#ef4444' }}>{criticalAlerts} Critical</span>
        <span className="stat-sub">Real-Time Exception Stream</span>
      </div>
    </section>
  );
}
