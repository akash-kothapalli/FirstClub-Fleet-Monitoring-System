import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';

export function DriverDistanceModal({ isOpen, onClose }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [driverHistory, setDriverHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDriverDistances(selectedDate);
    }
  }, [isOpen, selectedDate]);

  async function loadDriverDistances(dateStr) {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/reports/driver-distances?date=${dateStr}`);
      setData(res);
    } catch (err) {
      console.error('Failed to fetch driver distances:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectDriver(driver) {
    setSelectedDriver(driver);
    setHistoryLoading(true);
    try {
      const history = [];
      const today = new Date(selectedDate);
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateString = d.toISOString().split('T')[0];
        const res = await apiFetch(`/api/reports/driver-distances?date=${dateString}`);
        const foundDrv = (res.drivers || []).find(drv => drv.driver_id === driver.driver_id);
        history.push({
          date: dateString,
          distance_covered_km: foundDrv ? foundDrv.distance_covered_km : 0,
          status: foundDrv ? foundDrv.status : 'Offline',
          photo_proofs_count: foundDrv ? foundDrv.photo_proofs_count : 0
        });
      }
      setDriverHistory(history);
    } catch (e) {
      console.error('Failed to load driver history:', e);
    } finally {
      setHistoryLoading(false);
    }
  }

  if (!isOpen) return null;

  function formatTime(isoStr) {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '-';
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
      return '-';
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '900px', width: '95%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', color: '#38bdf8', fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              👨‍✈️ Driver-Wise Distance Calculation & Fleet History
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Tracks point-by-point actual GPS route distance for each driver with date-wise historical logging.
            </div>
          </div>
          <button className="map-btn" onClick={onClose}>✕</button>
        </div>

        {/* Date Filter & Fleet Combined Summary Card */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '16px' }}>
          <div style={{ background: '#1e293b', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Select Date (Historical Logging)
            </label>
            <input
              type="date"
              className="input-search"
              style={{ width: '100%', color: 'white' }}
              value={selectedDate}
              onChange={e => {
                setSelectedDate(e.target.value);
                setSelectedDriver(null);
              }}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '12px', borderRadius: '10px', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Total Distance Today (All Drivers)</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#10b981' }}>{data ? data.fleet_total_distance_km.toFixed(1) : '0.0'} km</div>
            </div>
            <div style={{ height: '30px', width: '1px', background: 'rgba(16, 185, 129, 0.3)' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Fleet Target (All Drivers Combined)</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#38bdf8' }}>{data ? data.fleet_target_km : 270} km</div>
            </div>
          </div>
        </div>

        {/* Main Content Grid: Driver List Table + Specific Driver History Drawer */}
        <div style={{ display: 'grid', gridTemplateColumns: selectedDriver ? '1.4fr 1fr' : '1fr', gap: '16px' }}>
          {/* Driver Roster Table */}
          <div style={{ overflowX: 'auto', background: '#090d16', borderRadius: '10px', border: '1px solid var(--border-color)', padding: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', marginBottom: '8px' }}>
              🚘 Driver Shift & Route Distance List ({data?.drivers?.length || 0} Drivers)
            </div>

            {loading ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>Calculating GPS route distances...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#1e293b', color: '#38bdf8', textAlign: 'left' }}>
                    <th style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>Driver</th>
                    <th style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>Vehicle</th>
                    <th style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>Duty Window</th>
                    <th style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>Distance (km)</th>
                    <th style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.drivers?.map(drv => (
                    <tr key={drv.driver_id} style={{ borderBottom: '1px solid #1e293b', background: selectedDriver?.driver_id === drv.driver_id ? 'rgba(56, 189, 248, 0.1)' : 'transparent' }}>
                      <td style={{ padding: '8px' }}>
                        <strong style={{ color: 'white' }}>{drv.driver_name}</strong>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{drv.phone}</div>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ color: '#4ade80', fontWeight: 600 }}>{drv.plate_number}</span>
                      </td>
                      <td style={{ padding: '8px', fontSize: '11px', color: '#cbd5e1' }}>
                        {formatTime(drv.shift_start)} - {formatTime(drv.shift_end)}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <strong style={{ fontSize: '14px', color: '#10b981' }}>{drv.distance_covered_km.toFixed(1)} km</strong>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Target: {drv.target_km} km</div>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <button
                          className="map-btn active"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => handleSelectDriver(drv)}
                        >
                          📜 7-Day History
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Individual Driver 7-Day History Drawer */}
          {selectedDriver && (
            <div style={{ background: '#1e293b', borderRadius: '10px', border: '1px solid #38bdf8', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#4ade80' }}>📜 {selectedDriver.driver_name}'s 7-Day Distance Log</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Vehicle: {selectedDriver.plate_number}</div>
                </div>
                <button className="map-btn" style={{ padding: '2px 6px', fontSize: '11px' }} onClick={() => setSelectedDriver(null)}>✕</button>
              </div>

              {historyLoading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>Fetching history...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {driverHistory.map(h => (
                    <div key={h.date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#090d16', padding: '8px 10px', borderRadius: '6px', fontSize: '12px' }}>
                      <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{h.date}</span>
                      <div style={{ textAlign: 'right' }}>
                        <strong style={{ color: '#10b981', fontSize: '13px' }}>{h.distance_covered_km.toFixed(1)} km</strong>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{h.photo_proofs_count} photos</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
