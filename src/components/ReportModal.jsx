import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { useFleet } from '../context/FleetContext';

export function ReportModal({ isOpen, onClose }) {
  const { vehicles } = useFleet();
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [blobUrl, setBlobUrl] = useState('');
  const [rawHtml, setRawHtml] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (vehicles.length > 0 && (!vehicleId || !vehicles.find(v => v.id === vehicleId))) {
      setVehicleId(vehicles[0].id);
    }
  }, [vehicles]);

  useEffect(() => {
    if (isOpen && vehicleId) loadReport();

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [isOpen, vehicleId, selectedDate]);

  async function loadReport() {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/reports/daily?vehicle_id=${vehicleId}&date=${selectedDate}`);
      if (data.html) {
        setRawHtml(data.html);
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        const blob = new Blob([data.html], { type: 'text/html' });
        const newUrl = URL.createObjectURL(blob);
        setBlobUrl(newUrl);
      }
    } catch (e) {
      console.error('Failed to load audit report:', e);
    } finally {
      setLoading(false);
    }
  }

  function downloadReportFile() {
    if (!rawHtml) return;
    const selectedVeh = vehicles.find(v => v.id === vehicleId);
    const driverName = selectedVeh?.driver_name || 'Driver';
    const cleanDriverName = driverName.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `FirstClub_Audit_Report_${cleanDriverName}_${selectedDate}.html`;

    const blob = new Blob([rawHtml], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '850px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', color: '#38bdf8', fontSize: '18px', margin: 0 }}>
            📄 FirstClub Outdoor LED Campaign Report
          </h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="map-btn active" onClick={downloadReportFile}>📥 Auto-Download Report</button>
            <button className="map-btn" onClick={() => {
              const iframe = document.getElementById('audit-report-iframe');
              if (iframe) iframe.contentWindow.print();
            }}>🖨️ Print / Save PDF</button>
            <button className="map-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Select Vehicle Plate / Driver
            </label>
            <select className="select-filter" style={{ width: '100%' }} value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.plate_number} ({v.current_city || 'Bengaluru'}) - Driver: {v.driver_name || 'Unassigned'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Select Audit Date (Historical)
            </label>
            <input
              type="date"
              className="input-search"
              style={{ width: '100%', color: 'white' }}
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '8px', overflow: 'hidden', minHeight: '480px', position: 'relative' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#38bdf8', fontWeight: 700, fontSize: '14px', zIndex: 10 }}>
              Generating Audit Report for {selectedDate}...
            </div>
          )}
          {blobUrl ? (
            <iframe
              id="audit-report-iframe"
              src={blobUrl}
              style={{ width: '100%', height: '480px', border: 'none' }}
              title="Audit Report Preview"
            />
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              Loading Audit Report...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
