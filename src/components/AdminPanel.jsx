import React, { useState, useEffect } from 'react';
import { useFleet } from '../context/FleetContext';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';

export function AdminPanel({ isOpen, onClose }) {
  const { vehicles, fetchVehicles } = useFleet();
  const { user } = useAuth();
  
  const [drivers, setDrivers] = useState([]);
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [viewVehicle, setViewVehicle] = useState(null);

  const [vehId, setVehId] = useState(`veh_${Date.now()}`);
  const [plateNumber, setPlateNumber] = useState('');
  const [vendorId, setVendorId] = useState(user?.vendorId || 'v1');
  const [currentCity, setCurrentCity] = useState('Bengaluru');
  const [displaySize, setDisplaySize] = useState('14x7 ft HD Dual LED');
  const [assignedDriverId, setAssignedDriverId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadDrivers();
    }
  }, [isOpen]);

  async function loadDrivers() {
    try {
      const res = await apiFetch('/api/auth/drivers');
      if (res.drivers) setDrivers(res.drivers);
    } catch (err) {
      console.error('Failed to load drivers list:', err);
    }
  }

  function handleDriverSelect(driverId, currentDrivers = drivers) {
    setAssignedDriverId(driverId);
    const selectedDriver = currentDrivers.find(d => d.id === driverId);
    if (selectedDriver) {
      if (selectedDriver.vendor_id) setVendorId(selectedDriver.vendor_id);
      if (selectedDriver.target_city) setCurrentCity(selectedDriver.target_city);
    }
  }

  if (!isOpen) return null;

  function resetForm() {
    setEditingVehicleId(null);
    setVehId(`veh_${Date.now()}`);
    setPlateNumber('');
    setAssignedDriverId('');
    setErrorMsg('');
  }

  function handleEditClick(v) {
    setEditingVehicleId(v.id);
    setVehId(v.id);
    setPlateNumber(v.plate_number);
    setVendorId(v.vendor_id);
    setCurrentCity(v.current_city || 'Bengaluru');
    setDisplaySize(v.display_size || '14x7 ft HD Dual LED');
    setAssignedDriverId(v.assigned_driver_id || '');
  }

  async function handleDeleteClick(vId) {
    if (!window.confirm(`Are you sure you want to delete vehicle ${vId}?`)) return;
    try {
      await apiFetch(`/api/vehicles/${vId}`, { method: 'DELETE' });
      fetchVehicles();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');

    if (!plateNumber.trim()) {
      setErrorMsg('License Plate Number is required.');
      return;
    }

    try {
      if (editingVehicleId) {
        await apiFetch(`/api/vehicles/${editingVehicleId}`, {
          method: 'PUT',
          body: JSON.stringify({
            plate_number: plateNumber.trim(),
            assigned_driver_id: assignedDriverId || null,
            display_size: displaySize,
            current_city: currentCity
          })
        });
      } else {
        await apiFetch('/api/vehicles', {
          method: 'POST',
          body: JSON.stringify({
            id: vehId,
            plate_number: plateNumber.trim(),
            vendor_id: user?.role === 'vendor_manager' ? user.vendorId : vendorId,
            assigned_driver_id: assignedDriverId || null,
            display_size: displaySize,
            current_city: currentCity
          })
        });
      }
      fetchVehicles();
      loadDrivers();
      resetForm();
    } catch (err) {
      setErrorMsg(err.message);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '850px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', color: '#38bdf8', fontSize: '18px' }}>
            🛠️ Admin Fleet & Driver CRUD ({user?.role === 'ops_manager' ? 'Ops Manager' : 'Vendor Manager'})
          </h2>
          <button className="map-btn" onClick={onClose}>✕</button>
        </div>

        {errorMsg && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#f87171', padding: '10px', borderRadius: '8px', fontSize: '12px', marginBottom: '14px' }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {viewVehicle && (
          <div style={{ background: '#0f172a', border: '1px solid #38bdf8', borderRadius: '12px', padding: '14px', marginBottom: '16px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#38bdf8', marginBottom: '8px' }}>
              <span>🚚 Vehicle Details: {viewVehicle.plate_number}</span>
              <button className="map-btn" style={{ padding: '2px 6px' }} onClick={() => setViewVehicle(null)}>✕ Close</button>
            </div>
            <div>Driver Name: <strong>{viewVehicle.driver_name || 'Unassigned'}</strong></div>
            <div>Primary Mobile: <strong>{viewVehicle.driver_phone || 'N/A'}</strong></div>
            <div>Vendor Partner: <strong>{viewVehicle.vendor_name || 'Envision Advertising'}</strong></div>
            <div>Target City: <strong>{viewVehicle.current_city}</strong></div>
            <div>Status: <strong style={{ color: '#4ade80' }}>{viewVehicle.status}</strong> | Speed: <strong>{viewVehicle.current_speed} km/h</strong></div>
          </div>
        )}

        {/* Add / Edit Vehicle Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Vehicle ID</label>
              <input type="text" className="input-search" value={vehId} onChange={e => setVehId(e.target.value)} disabled={Boolean(editingVehicleId)} required />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Vehicle Plate Number (Req)</label>
              <input type="text" className="input-search" placeholder="e.g. MH-02-CL-8821" value={plateNumber} onChange={e => setPlateNumber(e.target.value)} required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Assigned Registered Driver</label>
              <select className="select-filter" value={assignedDriverId} onChange={e => handleDriverSelect(e.target.value)}>
                <option value="">-- Select Driver (Optional) --</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.full_name} ({d.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Vendor Partner</label>
              <select className="select-filter" value={vendorId} onChange={e => setVendorId(e.target.value)} disabled={user?.role === 'vendor_manager'}>
                <option value="v1">Envision Advertising (v1)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Target City</label>
              <select className="select-filter" value={currentCity} onChange={e => setCurrentCity(e.target.value)}>
                <option value="Bengaluru">Bengaluru</option>
                <option value="Hyderabad">Hyderabad</option>
                <option value="Mumbai">Mumbai</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button type="submit" className="duty-btn start" style={{ flex: 1, padding: '10px', fontSize: '14px' }}>
              {editingVehicleId ? '💾 Save Vehicle Changes' : '➕ Onboard New Vehicle'}
            </button>
            {editingVehicleId && (
              <button type="button" className="map-btn" onClick={resetForm}>Cancel Edit</button>
            )}
          </div>
        </form>

        {/* Registered Drivers Roster */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <span>👤 Registered Drivers Database Roster ({drivers.length} Drivers Saved)</span>
            <span style={{ fontSize: '11px', color: '#4ade80' }}>⚡ Saved in Turso Cloud SQLite</span>
          </div>
          <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#38bdf8' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Driver Name</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Email / User ID</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Primary Phone</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Target City</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Assigned Vehicle</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map(d => {
                  const assignedVeh = vehicles.find(v => v.assigned_driver_id === d.id);
                  return (
                    <tr key={d.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '8px', fontWeight: 'bold', color: 'white' }}>{d.full_name}</td>
                      <td style={{ padding: '8px', color: '#94a3b8' }}>{d.email}</td>
                      <td style={{ padding: '8px', color: '#cbd5e1' }}>{d.phone || 'N/A'}</td>
                      <td style={{ padding: '8px', color: '#cbd5e1' }}>{d.target_city || 'Bengaluru'}</td>
                      <td style={{ padding: '8px' }}>
                        {assignedVeh ? (
                          <span style={{ color: '#4ade80', fontWeight: 'bold' }}>🚚 {assignedVeh.plate_number}</span>
                        ) : (
                          <span style={{ color: '#f87171', fontSize: '10px' }}>⚠️ Unassigned</span>
                        )}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button
                          className="map-btn active"
                          style={{ padding: '2px 6px', fontSize: '10px' }}
                          onClick={() => {
                            setAssignedDriverId(d.id);
                            if (assignedVeh) handleEditClick(assignedVeh);
                          }}
                        >
                          {assignedVeh ? '✏️ Edit Assignment' : '➕ Assign to Truck'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active Fleet Table */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'white', marginBottom: '8px' }}>🚚 Active Fleet Roster ({vehicles.length} Trucks Onboarded)</div>
          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#38bdf8' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Driver Name</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Primary Mobile Number</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Vehicle Plate Number</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Vendor</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>City</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map(v => (
                  <tr key={v.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{v.driver_name || 'Unassigned'}</td>
                    <td style={{ padding: '8px', color: '#94a3b8' }}>{v.driver_phone || 'N/A'}</td>
                    <td style={{ padding: '8px', fontWeight: 'bold', color: '#ffffff' }}>{v.plate_number}</td>
                    <td style={{ padding: '8px' }}>{v.vendor_name || 'Envision Advertising'}</td>
                    <td style={{ padding: '8px' }}>{v.current_city}</td>
                    <td style={{ padding: '8px', textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '4px' }}>
                      <button className="map-btn" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => setViewVehicle(v)}>👁️ View</button>
                      <button className="map-btn" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => handleEditClick(v)}>✏️ Edit</button>
                      <button className="map-btn" style={{ padding: '2px 6px', fontSize: '10px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }} onClick={() => handleDeleteClick(v.id)}>🗑️ Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
