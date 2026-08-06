import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFleet } from '../context/FleetContext';
import { startHTML5Tracking, stopHTML5Tracking } from '../services/geolocation';
import { apiFetch } from '../services/api';

export function DriverApp() {
  const { user, updateDriverProfile } = useAuth();
  const { vehicles, fetchVehicles } = useFleet();

  // Strictly lookup assigned vehicle by driver ID without hardcoded fallback escape hatches
  const myVehicle = vehicles.find(v => String(v.assigned_driver_id) === String(user?.id)) || null;

  const [isDutyActive, setIsDutyActive] = useState(true);
  const [isRealGPSActive, setIsRealGPSActive] = useState(false);
  const [simSpeed, setSimSpeed] = useState(28.5);
  const [activeBreak, setActiveBreak] = useState(null);
  const [currentAddress, setCurrentAddress] = useState('Fetching location...');
  const [gpsAccuracy, setGpsAccuracy] = useState(8);

  // Driver Profile State dynamically initialized from authenticated user
  const currentDriverName = user?.full_name || user?.fullName || 'Driver';
  const [driverName, setDriverName] = useState(currentDriverName);
  const [primaryPhone, setPrimaryPhone] = useState(user?.phone || '');
  const [secondaryPhone, setSecondaryPhone] = useState(user?.secondary_phone || '');
  const [targetCity, setTargetCity] = useState(user?.target_city || 'Bengaluru');
  const [campaignAreas, setCampaignAreas] = useState(user?.target_campaign_areas || 'Bellandur, Sarjapur, Indiranagar');
  const [profileSavedMsg, setProfileSavedMsg] = useState('');

  // 40-Minute Photo Proof Countdown State
  const [secondsRemaining, setSecondsRemaining] = useState(40 * 60);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState('');

  // Restore Break & GPS Switch State from SQLite Database Vehicle record
  useEffect(() => {
    if (myVehicle) {
      if (myVehicle.active_break_type !== undefined) {
        setActiveBreak(myVehicle.active_break_type || null);
      }
      if (myVehicle.is_real_gps_active !== undefined) {
        setIsRealGPSActive(myVehicle.is_real_gps_active === 1);
      }
      if (myVehicle.is_duty_active !== undefined) {
        setIsDutyActive(myVehicle.is_duty_active !== 0);
      }

      if (myVehicle.current_area && myVehicle.current_area !== 'Bellandur & Sarjapur Tech Corridor') {
        const area = myVehicle.current_area;
        const city = myVehicle.current_city ? `, ${myVehicle.current_city}` : '';
        setCurrentAddress(`${area}${city}`);
      } else if (myVehicle.current_lat && myVehicle.current_lng) {
        setCurrentAddress(`GPS Location (${myVehicle.current_lat.toFixed(4)}°, ${myVehicle.current_lng.toFixed(4)}°)`);
      } else {
        setCurrentAddress('Fetching location...');
      }
    }
  }, [myVehicle?.active_break_type, myVehicle?.is_real_gps_active, myVehicle?.is_duty_active, myVehicle?.current_area, myVehicle?.current_city, myVehicle?.current_lat, myVehicle?.current_lng]);

  useEffect(() => {
    if (user) {
      setDriverName(user.full_name || user.fullName || 'Driver');
      setPrimaryPhone(user.phone || '');
      setSecondaryPhone(user.secondary_phone || '');
      setTargetCity(user.target_city || 'Bengaluru');
      setCampaignAreas(user.target_campaign_areas || 'Bellandur, Sarjapur, Indiranagar');
    }
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining(prev => (prev > 0 ? prev - 1 : 40 * 60));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  function formatCountdown(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setProfileSavedMsg('');
    try {
      await updateDriverProfile({
        phone: primaryPhone,
        secondary_phone: secondaryPhone,
        target_city: targetCity,
        target_campaign_areas: campaignAreas
      });
      setProfileSavedMsg('✅ Driver profile updated & saved to database!');
      setTimeout(() => setProfileSavedMsg(''), 4000);
    } catch (err) {
      alert(`Save profile failed: ${err.message}`);
    }
  }

  async function toggleDuty() {
    if (!myVehicle) return;
    const nextDuty = !isDutyActive;
    setIsDutyActive(nextDuty);

    await apiFetch('/api/vehicles/settings', {
      method: 'POST',
      body: JSON.stringify({ vehicle_id: myVehicle.id, is_duty_active: nextDuty })
    });

    if (isRealGPSActive) {
      if (nextDuty) {
        startHTML5Tracking(myVehicle.id, (ping) => {
          if (ping.address) setCurrentAddress(ping.address);
        });
      } else {
        stopHTML5Tracking();
      }
    }
    fetchVehicles();
  }

  async function handleToggleGPSSwitch(checked) {
    if (!myVehicle) return;
    setIsRealGPSActive(checked);

    await apiFetch('/api/vehicles/settings', {
      method: 'POST',
      body: JSON.stringify({ vehicle_id: myVehicle.id, is_real_gps_active: checked })
    });

    if (checked && isDutyActive) {
      startHTML5Tracking(myVehicle.id, (ping) => {
        if (ping.address) setCurrentAddress(ping.address);
      }, (err) => alert(`GPS Error: ${err}`));
    } else {
      stopHTML5Tracking();
    }
    fetchVehicles();
  }

  async function toggleBreak(type) {
    if (!myVehicle) return;
    const isStarting = activeBreak !== type;
    const nextBreak = isStarting ? type : null;
    setActiveBreak(nextBreak);

    await apiFetch('/api/telemetry/breaks/toggle', {
      method: 'POST',
      body: JSON.stringify({
        vehicle_id: myVehicle.id,
        break_type: type,
        is_starting: isStarting,
        lat: myVehicle.current_lat || 12.9220,
        lng: myVehicle.current_lng || 77.6764
      })
    });

    fetchVehicles();
  }

  // Enhanced Multi-Photo Proof Upload (Gallery + Camera support)
  async function handlePhotoUpload(e) {
    if (!myVehicle) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (files.length > 4) {
      alert('You can upload up to 4 photos per proof submission.');
      return;
    }

    for (let f of files) {
      if (f.size > 5 * 1024 * 1024) {
        alert(`File ${f.name} exceeds 5MB limit.`);
        return;
      }
    }

    setUploading(true);
    setUploadSuccessMsg('');

    let uploadedCount = 0;

    for (let file of files) {
      await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const res = await apiFetch('/api/telemetry/photo-proof', {
              method: 'POST',
              body: JSON.stringify({
                vehicle_id: myVehicle.id,
                photo_base64: reader.result,
                lat: myVehicle.current_lat || 12.9220,
                lng: myVehicle.current_lng || 77.6764
              })
            });

            if (res.success) uploadedCount++;
          } catch (err) {
            console.error('Photo upload error:', err.message);
          } finally {
            resolve();
          }
        };
        reader.readAsDataURL(file);
      });
    }

    setUploading(false);
    if (uploadedCount > 0) {
      setUploadSuccessMsg(`📸 ${uploadedCount} campaign proof photo(s) uploaded successfully!`);
      setSecondsRemaining(40 * 60);
    }
  }

  // Display unassigned vehicle alert banner if driver has no vehicle
  if (!myVehicle) {
    return (
      <div className="driver-app-container" style={{ padding: '24px' }}>
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#f87171',
          padding: '20px', borderRadius: '12px', textAlign: 'center', lineHeight: '1.6'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>⚠️ Unassigned Driver Account</h2>
          <p style={{ fontSize: '13px', margin: 0 }}>
            No vehicle is currently assigned to your driver account (<strong>{user?.full_name || user?.fullName || user?.email}</strong>).<br />
            Please contact your FirstClub Ops Manager to assign a vehicle to your profile in Admin CRUD.
          </p>
        </div>
      </div>
    );
  }

  const tripStatusText = !isDutyActive
    ? 'Shift Completed 🏁'
    : (activeBreak ? `On Approved Break (${activeBreak}) 🔵` : (simSpeed > 0 ? 'In Transit 🚚' : 'Idle Halt 🟡'));

  return (
    <div className="driver-app-container">
      {/* Header Profile Section */}
      <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '20px', fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/firstclub-logo.png" style={{ height: '32px', width: '32px', borderRadius: '6px' }} alt="Logo" />
          📱 Driver Active Shift Mode
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Assigned Vehicle: <strong style={{ color: 'white' }}>{myVehicle.plate_number}</strong> | Driver: <strong style={{ color: 'white' }}>{driverName}</strong>
        </div>
      </div>

      {/* Driver Registration & Profile Persistence Form */}
      <form onSubmit={handleSaveProfile} style={{ background: '#1e293b', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>👤 Driver Registration & Operating Profile</div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Driver Name</label>
            <input type="text" className="input-search" value={driverName} onChange={e => setDriverName(e.target.value)} disabled />
          </div>
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Primary Mobile (Req)</label>
            <input type="text" className="input-search" value={primaryPhone} onChange={e => setPrimaryPhone(e.target.value)} required />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Secondary Mobile</label>
            <input type="text" className="input-search" value={secondaryPhone} onChange={e => setSecondaryPhone(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Target City</label>
            <select className="select-filter" value={targetCity} onChange={e => setTargetCity(e.target.value)}>
              <option value="Bengaluru">Bengaluru</option>
              <option value="Hyderabad">Hyderabad</option>
              <option value="Mumbai">Mumbai</option>
            </select>
          </div>
        </div>

        <div>
          <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Target Campaign Operating Areas</label>
          <input type="text" className="input-search" value={campaignAreas} onChange={e => setCampaignAreas(e.target.value)} placeholder="e.g. Marine Drive, BKC, Worli" />
        </div>

        <button type="submit" className="map-btn active" style={{ justifyContent: 'center', padding: '8px', marginTop: '4px', fontSize: '12px' }}>
          💾 Save / Update Driver Profile
        </button>

        {profileSavedMsg && (
          <div style={{ fontSize: '11px', color: '#4ade80', fontWeight: 600, textAlign: 'center' }}>
            {profileSavedMsg}
          </div>
        )}
      </form>

      {/* Start / Stop Shift Duty Button */}
      <button className={`duty-btn ${isDutyActive ? 'stop' : 'start'}`} onClick={toggleDuty}>
        {isDutyActive ? '🛑 End Shift Duty' : '▶ Start Shift Duty'}
      </button>

      {/* Modern iOS / Material Style Toggle Switch */}
      <div className="toggle-switch-container">
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'white' }}>Real Smartphone GPS Mode</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Captures hardware GPS coordinates & Screen WakeLock</div>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={isRealGPSActive}
            onChange={(e) => handleToggleGPSSwitch(e.target.checked)}
          />
          <span className="slider"></span>
        </label>
      </div>

      {/* Approved Break Buffer Controls */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>
          ☕ APPROVED BREAK BUFFER CONTROLS
        </div>
        <div className="break-grid">
          <button className={`break-btn ${activeBreak === 'Lunch' ? 'active' : ''}`} onClick={() => toggleBreak('Lunch')}>🍱 Lunch</button>
          <button className={`break-btn ${activeBreak === 'Tea' ? 'active' : ''}`} onClick={() => toggleBreak('Tea')}>☕ Tea</button>
          <button className={`break-btn ${activeBreak === 'Service' ? 'active' : ''}`} onClick={() => toggleBreak('Service')}>🛠️ Service</button>
        </div>
      </div>

      {/* 40-Minute Driver Photo Proof Upload Module */}
      <div style={{ background: '#1e293b', border: '1px dashed #38bdf8', borderRadius: '12px', padding: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>📸 40-Min Photo Proof Upload</span>
          <span style={{ fontSize: '12px', fontWeight: 800, color: secondsRemaining < 300 ? '#ef4444' : '#4ade80' }}>
            Due in: {formatCountdown(secondsRemaining)}
          </span>
        </div>

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Upload 1 to 4 geo-stamped campaign execution photos from Camera or Gallery as billing proof.
        </div>

        <label className="map-btn active" style={{ justifyContent: 'center', padding: '10px', width: '100%', cursor: 'pointer' }}>
          {uploading ? '⏳ Uploading Photo Proofs...' : '🖼️ Select / Capture Proof Photos (Multi-Photo Supported)'}
          <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoUpload} />
        </label>

        {uploadSuccessMsg && (
          <div style={{ fontSize: '12px', color: '#4ade80', fontWeight: 600, marginTop: '8px', textAlign: 'center' }}>
            {uploadSuccessMsg}
          </div>
        )}
      </div>

      {/* Live Location Sharing & Trip Status Card */}
      <div style={{ background: '#090d16', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '14px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Location Sharing Status:</span>
          <span style={{ color: isDutyActive ? '#4ade80' : '#ef4444', fontWeight: 700 }}>
            {isDutyActive ? 'Sharing Active 🟢' : 'Paused 🔴'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Trip Operational Status:</span>
          <span style={{ color: '#38bdf8', fontWeight: 700 }}>{tripStatusText}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>GPS Accuracy Radius:</span>
          <span style={{ color: '#4ade80', fontWeight: 600 }}>±{gpsAccuracy}m (High Precision)</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Current Area & City:</span>
          <span style={{ color: 'white', fontWeight: 600 }}>{currentAddress}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>Logged Today:</span>
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 800 }}>{(myVehicle.today_distance_km || 0).toFixed(1)} km</span>
        </div>
      </div>
    </div>
  );
}
