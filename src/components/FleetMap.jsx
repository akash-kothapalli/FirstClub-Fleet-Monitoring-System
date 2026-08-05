import React, { useEffect, useRef } from 'react';
import { useFleet } from '../context/FleetContext';

export function FleetMap({ mapMode, setMapMode }) {
  const { vehicles, campaigns, selectedVehicleId } = useFleet();
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});
  const polylineRef = useRef(null);
  const heatmapCirclesRef = useRef([]);

  useEffect(() => {
    if (!mapInstance.current && mapRef.current) {
      const L = window.L;
      if (!L) return;

      const map = L.map(mapRef.current, {
        center: [19.0180, 72.8350],
        zoom: 12,
        zoomControl: true
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19
      }).addTo(map);

      mapInstance.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    }
  }, []);

  // Auto-center and Auto-zoom to selected vehicle location (Robust for all vehicles 1, 2, 3, 4)
  useEffect(() => {
    if (!mapInstance.current || !selectedVehicleId) return;
    const selected = vehicles.find(v => String(v.id) === String(selectedVehicleId));
    if (selected && selected.current_lat && selected.current_lng) {
      mapInstance.current.invalidateSize();
      mapInstance.current.setView([selected.current_lat, selected.current_lng], 14, { animate: true });
    }
  }, [selectedVehicleId, vehicles]);

  // Update Markers, Geofences, Heatmap, and Route Polyline
  useEffect(() => {
    const L = window.L;
    if (!mapInstance.current || !L) return;

    // Clear old heatmap circles if switching away from heatmap mode
    heatmapCirclesRef.current.forEach(c => c.remove());
    heatmapCirclesRef.current = [];

    // Render Heatmap Density Circles DYNAMICALLY from real vehicle locations (Fixes Vehicle 1 mismatch)
    if (mapMode === 'heatmap') {
      vehicles.forEach(v => {
        if (!v.current_lat || !v.current_lng) return;
        const circle = L.circle([v.current_lat, v.current_lng], {
          color: '#ef4444',
          fillColor: '#f97316',
          fillOpacity: 0.5,
          radius: 1500,
          stroke: false
        }).addTo(mapInstance.current);
        heatmapCirclesRef.current.push(circle);
      });
    }

    // Update vehicle markers
    vehicles.forEach(v => {
      if (!v.current_lat || !v.current_lng) return;

      let color = '#10b981';
      if (v.status === 'Idle') color = '#f59e0b';
      if (v.status === 'On Approved Break') color = '#3b82f6';
      if (v.status === 'Offline') color = '#ef4444';

      const iconHtml = `
        <div style="transform: rotate(${v.heading || 0}deg); transition: transform 0.4s ease;">
          <svg width="40" height="40" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="16" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2"/>
            <rect x="12" y="8" width="12" height="20" rx="3" fill="${color}"/>
            <rect x="10" y="10" width="16" height="12" rx="2" fill="#0b0f19" stroke="${color}" stroke-width="1.5"/>
            <polygon points="18,4 14,9 22,9" fill="${color}" />
          </svg>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-truck-marker',
        html: iconHtml,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });

      const areaLocality = v.current_area || 'Corridor Route';

      if (markersRef.current[v.id]) {
        markersRef.current[v.id].setLatLng([v.current_lat, v.current_lng]);
        markersRef.current[v.id].setIcon(customIcon);
      } else {
        const marker = L.marker([v.current_lat, v.current_lng], { icon: customIcon }).addTo(mapInstance.current);
        marker.bindPopup(`
          <div style="color: #0f172a; font-family: sans-serif; font-size: 12px; line-height: 1.4;">
            <strong style="font-size: 14px;">${v.plate_number}</strong><br>
            Driver: <strong>${v.driver_name || 'Sunil Kumar'}</strong><br>
            Phone: ${v.driver_phone || '+91 98765 43210'}<br>
            Location: <strong style="color: #0284c7;">${areaLocality}, ${v.current_city}</strong><br>
            Speed: <strong style="color: #0284c7;">${v.current_speed} km/h</strong><br>
            Status: <span style="font-weight: 700; color: ${color};">${v.status}${v.active_break_type ? ` (${v.active_break_type})` : ''}</span>
          </div>
        `);
        markersRef.current[v.id] = marker;
      }
    });

    // Draw Campaign Geofences
    campaigns.forEach(c => {
      if (c.geofence_json) {
        try {
          const coords = JSON.parse(c.geofence_json);
          L.polygon(coords, {
            color: '#10b981',
            weight: 2,
            fillColor: '#10b981',
            fillOpacity: 0.08,
            dashArray: '5, 10'
          }).addTo(mapInstance.current);
        } catch (e) {}
      }
    });

    // Draw Polyline Trail for selected vehicle
    const selected = vehicles.find(v => String(v.id) === String(selectedVehicleId));
    if (selected && selected.current_lat && selected.current_lng) {
      const waypoints = [
        [selected.current_lat - 0.02, selected.current_lng - 0.02],
        [selected.current_lat - 0.01, selected.current_lng - 0.01],
        [selected.current_lat, selected.current_lng]
      ];

      if (polylineRef.current) {
        polylineRef.current.setLatLngs(waypoints);
      } else {
        polylineRef.current = L.polyline(waypoints, {
          color: '#38bdf8', weight: 4, opacity: 0.8, dashArray: '6, 6'
        }).addTo(mapInstance.current);
      }
    }
  }, [vehicles, campaigns, selectedVehicleId, mapMode]);

  return (
    <section className="panel" style={{ position: 'relative', height: '100%', minHeight: '440px' }}>
      <div className="panel-header">
        <div className="panel-title">📍 Live Fleet Map & Campaign Corridors</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className={`map-btn ${mapMode === 'live' ? 'active' : ''}`} onClick={() => setMapMode('live')}>📡 Live</button>
          <button className={`map-btn ${mapMode === 'replay' ? 'active' : ''}`} onClick={() => setMapMode('replay')}>⏯️ Replay</button>
          <button className={`map-btn ${mapMode === 'heatmap' ? 'active' : ''}`} onClick={() => setMapMode('heatmap')}>🔥 Heatmap</button>
        </div>
      </div>

      <div className="map-container" style={{ width: '100%', height: 'calc(100% - 50px)', minHeight: '420px' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '420px' }}></div>
      </div>
    </section>
  );
}
