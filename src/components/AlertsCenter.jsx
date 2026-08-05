import React from 'react';
import { useFleet } from '../context/FleetContext';

export function AlertsCenter() {
  const { alerts, fetchAlerts } = useFleet();

  return (
    <aside className="panel panel-right">
      <div className="panel-header">
        <div className="panel-title">🚨 Exception Feed</div>
        <button className="map-btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={fetchAlerts}>Refresh</button>
      </div>

      <div className="alerts-list">
        {alerts.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px', fontSize: '13px' }}>
            No active alerts. Fleet running smoothly.
          </div>
        ) : (
          alerts.map(a => (
            <div key={a.id} className={`alert-card ${a.severity.toLowerCase()}`}>
              <div className="alert-head">
                <span style={{ color: a.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b' }}>{a.alert_type}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(a.timestamp).toLocaleTimeString()}</span>
              </div>
              <div>{a.message}</div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
