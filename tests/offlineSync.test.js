import assert from 'node:assert';
import http from 'node:http';
import { initDatabase } from '../server/db.js';
import { loginUser } from '../server/middleware/auth.js';

initDatabase();

console.log('[TEST] Offline Telemetry Batch Ingestion & Auto-Sync');

async function testBatchSync() {
  const loginRes = loginUser('sunil@apexmedia.in', 'password123');
  assert.ok(loginRes.token, 'Driver login token should be generated');

  const pings = [
    { campaign_id: 'c3', lat: 12.9210, lng: 77.6750, speed: 25, heading: 45, address: 'Offline Ping 1', is_break: 0, timestamp: new Date(Date.now() - 60000).toISOString() },
    { campaign_id: 'c3', lat: 12.9220, lng: 77.6764, speed: 28, heading: 45, address: 'Offline Ping 2', is_break: 0, timestamp: new Date().toISOString() }
  ];

  const payload = JSON.stringify({ vehicle_id: 'veh_1', pings });

  const req = http.request('http://localhost:3000/api/telemetry/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${loginRes.token}`,
      'Content-Length': Buffer.byteLength(payload)
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      const data = JSON.parse(body);
      assert.strictEqual(res.statusCode, 200, 'Batch sync status code should be 200');
      assert.strictEqual(data.success, true, 'Batch sync should return success: true');
      assert.strictEqual(data.processedCount, 2, 'Batch sync should process exactly 2 pings');
      console.log('✓ Offline batch telemetry sync unit test passed successfully!');
    });
  });

  req.write(payload);
  req.end();
}

testBatchSync();
