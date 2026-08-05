export function createSSEConnection(onPing, onAlert, onRefresh) {
  const evtSource = new EventSource('/api/events');

  evtSource.addEventListener('telemetry_ping', (e) => {
    if (onPing) onPing(JSON.parse(e.data));
  });

  evtSource.addEventListener('alert_triggered', (e) => {
    if (onAlert) onAlert(JSON.parse(e.data));
  });

  evtSource.addEventListener('break_status_changed', () => {
    if (onRefresh) onRefresh();
  });

  evtSource.addEventListener('vehicle_updated', () => {
    if (onRefresh) onRefresh();
  });

  return evtSource;
}
