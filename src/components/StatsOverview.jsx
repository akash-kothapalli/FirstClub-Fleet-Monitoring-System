import React, { useState, useEffect } from 'react';
import { useFleet } from '../context/FleetContext';
import { apiFetch } from '../services/api';

export function StatsOverview() {
  const { vehicles, alerts } = useFleet();
  const [fleetDistData, setFleetDistData] = useState(null);

  useEffect(() => {
    async function loadFleetDistance() {
      try {
        const data = await apiFetch('/api/reports/driver-distances');
        if (data && data.fleet_total_distance_km !== undefined) {
          setFleetDistData(data);
        }
      } catch (e) {}
    }
    loadFleetDistance();
  }, [vehicles]);

  const activeCount = vehicles.filter(v => v.status !== 'Offline').length;
  const liveSumKm = vehicles.reduce((sum, v) => sum + (v.today_distance_km || 0), 0);
  const totalKm = (fleetDistData && fleetDistData.fleet_total_distance_km > 0) ? fleetDistData.fleet_total_distance_km : liveSumKm;

  const movingCount = vehicles.filter(v => v.status === 'Moving').length;
  const idleCount = vehicles.filter(v => v.status === 'Idle').length;
  const breakCount = vehicles.filter(v => v.status === 'On Approved Break').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL' && !a.acknowledged).length;

  const targetKmTotal = fleetDistData ? fleetDistData.fleet_target_km : Math.max(270, vehicles.length * 90);
  const breachCount = alerts.filter(a => a.alert_type === 'GEOFENCE_BREACH').length;
  const geofenceCompliancePct = vehicles.length > 0
    ? Math.max(70, Math.min(100, (100 - (breachCount * 3.2)))).toFixed(1)
    : '100.0';

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
        <span className="stat-sub">Fleet Target: {targetKmTotal} km</span>
      </div>

      <div className="stat-card">
        <span className="stat-label">Fleet Status</span>
        <span className="stat-value" style={{ color: 'var(--status-moving)' }}>{movingCount} Moving, {breakCount} Break</span>
        <span className="stat-sub">{idleCount} Idle Halts</span>
      </div>

      <div className="stat-card">
        <span className="stat-label">Geofence Compliance</span>
        <span className="stat-value" style={{ color: '#4ade80' }}>{geofenceCompliancePct}%</span>
        <span className="stat-sub">{breachCount} Geofence Breach(es) Today</span>
      </div>

      <div className="stat-card">
        <span className="stat-label">Active Alerts</span>
        <span className="stat-value" style={{ color: '#ef4444' }}>{criticalAlerts} Critical</span>
        <span className="stat-sub">Real-Time Exception Stream</span>
      </div>
    </section>
  );
}
