import React, { useState } from 'react';
import { StatsOverview } from './StatsOverview';
import { FleetMap } from './FleetMap';
import { AlertsCenter } from './AlertsCenter';
import { RouteReplay } from './RouteReplay';
import { useFleet } from '../context/FleetContext';

export function Dashboard() {
  const { vehicles, selectedVehicleId, setSelectedVehicleId } = useFleet();
  const [mapMode, setMapMode] = useState('live');
  const [cityFilter, setCityFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const filteredVehicles = vehicles.filter(v => {
    const matchCity = cityFilter === 'ALL' || v.current_city === cityFilter;
    const matchSearch = (v.plate_number || '').toLowerCase().includes(search.toLowerCase()) ||
                        (v.driver_name || '').toLowerCase().includes(search.toLowerCase()) ||
                        (v.current_area || '').toLowerCase().includes(search.toLowerCase());
    return matchCity && matchSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <StatsOverview />

      <div className="workspace-grid">
        <aside className="panel">
          <div className="panel-header">
            <div className="panel-title">🚚 Campaign Vehicles</div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{filteredVehicles.length} Trucks</span>
          </div>

          <div className="filter-bar">
            <input
              type="text"
              className="input-search"
              placeholder="Search driver, plate, area..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="select-filter" value={cityFilter} onChange={e => setCityFilter(e.target.value)}>
              <option value="ALL">All Cities</option>
              <option value="Mumbai">Mumbai</option>
              <option value="Delhi">Delhi</option>
              <option value="Bengaluru">Bengaluru</option>
            </select>
          </div>

          <div className="vehicle-list">
            {filteredVehicles.map(v => (
              <div
                key={v.id}
                className={`vehicle-card ${selectedVehicleId === v.id ? 'selected' : ''}`}
                onClick={() => setSelectedVehicleId(v.id)}
              >
                <div className="vehicle-head">
                  <span className="plate-number">{v.plate_number}</span>
                  <span className={`status-tag ${v.status === 'Moving' ? 'moving' : (v.status === 'Idle' ? 'idle' : 'break')}`}>
                    {v.status}{v.active_break_type ? ` (${v.active_break_type})` : ''}
                  </span>
                </div>
                <div className="vehicle-meta">
                  <div>Driver: <strong>{v.driver_name || 'Sunil Kumar'}</strong></div>
                  <div>Area: <strong style={{ color: 'white' }}>{v.current_area || 'Corridor Route'}</strong></div>
                  <div>Speed: <strong>{v.current_speed} km/h</strong> | City: <strong>{v.current_city}</strong></div>
                  <div>Logged Distance: <strong style={{ color: 'var(--accent-cyan)' }}>{(v.today_distance_km || 0).toFixed(1)} km</strong></div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <FleetMap mapMode={mapMode} setMapMode={setMapMode} />
          {mapMode === 'replay' && <RouteReplay vehicleId={selectedVehicleId || 'veh_1'} />}
        </div>

        <AlertsCenter />
      </div>
    </div>
  );
}
