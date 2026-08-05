import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';

export function ReportModal({ isOpen, onClose }) {
  const [vehicleId, setVehicleId] = useState('veh_1');
  const [blobUrl, setBlobUrl] = useState('');

  useEffect(() => {
    if (isOpen) loadReport();

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [isOpen, vehicleId]);

  async function loadReport() {
    try {
      const data = await apiFetch(`/api/reports/daily?vehicle_id=${vehicleId}`);
      if (data.html) {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        const blob = new Blob([data.html], { type: 'text/html' });
        const newUrl = URL.createObjectURL(blob);
        setBlobUrl(newUrl);
      }
    } catch (e) {}
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '850px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', color: '#38bdf8' }}>📄 End-of-Day Campaign Audit Report</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="map-btn active" onClick={() => {
              const iframe = document.getElementById('audit-report-iframe');
              if (iframe) iframe.contentWindow.print();
            }}>🖨️ Print / Download PDF</button>
            <button className="map-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <select className="select-filter" value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
            <option value="veh_1">MH-02-CL-8821 (Mumbai)</option>
            <option value="veh_2">MH-04-EV-9904 (Mumbai)</option>
            <option value="veh_3">DL-01-AB-1234 (Delhi)</option>
          </select>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '8px', overflow: 'hidden', minHeight: '480px' }}>
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
