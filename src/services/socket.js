export function createSSEConnection(onPing, onAlert, onRefresh) {
  const evtSource = new EventSource('/api/events');

  const handleTelemetry = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (onPing) onPing(data);
      if (onRefresh) onRefresh();
    } catch (err) {}
  };

  evtSource.addEventListener('telemetry_ping', handleTelemetry);
  evtSource.addEventListener('telemetry_update', handleTelemetry);

  evtSource.addEventListener('alert_triggered', (e) => {
    try {
      if (onAlert) onAlert(JSON.parse(e.data));
    } catch (err) {}
  });

  evtSource.addEventListener('break_status_changed', () => {
    if (onRefresh) onRefresh();
  });

  evtSource.addEventListener('photo_proof_uploaded', () => {
    if (onRefresh) onRefresh();
  });

  evtSource.addEventListener('vehicle_updated', () => {
    if (onRefresh) onRefresh();
  });

  return evtSource;
}
