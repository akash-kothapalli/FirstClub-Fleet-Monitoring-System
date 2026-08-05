import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { createSSEConnection } from '../services/socket';
import { useAuth } from './AuthContext';

const FleetContext = createContext(null);

export function FleetProvider({ children }) {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);

  useEffect(() => {
    fetchVehicles();
    fetchCampaigns();
    fetchAlerts();

    const sse = createSSEConnection(
      (ping) => updateVehicleFromPing(ping),
      (alert) => setAlerts(prev => [alert, ...prev]),
      () => fetchVehicles()
    );

    return () => sse.close();
  }, [user]);

  async function fetchVehicles() {
    try {
      const data = await apiFetch('/api/vehicles');
      if (data.vehicles) {
        setVehicles(data.vehicles);
        if (data.vehicles.length > 0 && !selectedVehicleId) {
          setSelectedVehicleId(data.vehicles[0].id);
        }
      }
    } catch (err) {}
  }

  async function fetchCampaigns() {
    try {
      const data = await apiFetch('/api/campaigns');
      if (data.campaigns) setCampaigns(data.campaigns);
    } catch (err) {}
  }

  async function fetchAlerts() {
    try {
      const data = await apiFetch('/api/alerts');
      if (data.alerts) setAlerts(data.alerts);
    } catch (err) {}
  }

  function updateVehicleFromPing(ping) {
    setVehicles(prev => prev.map(v => {
      if (v.id === ping.vehicle_id) {
        return {
          ...v,
          current_lat: ping.lat,
          current_lng: ping.lng,
          current_speed: ping.speed,
          heading: ping.heading,
          status: ping.status,
          today_distance_km: ping.today_distance_km
        };
      }
      return v;
    }));
  }

  const value = {
    vehicles,
    campaigns,
    alerts,
    selectedVehicleId,
    setSelectedVehicleId,
    fetchVehicles,
    fetchAlerts
  };

  return (
    <FleetContext.Provider value={value}>
      {children}
    </FleetContext.Provider>
  );
}

export function useFleet() {
  return useContext(FleetContext);
}
