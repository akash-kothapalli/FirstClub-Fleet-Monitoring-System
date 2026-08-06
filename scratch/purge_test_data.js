import { createClient } from '@libsql/client';

const tursoUrl = 'libsql://firstclub-fleet-akash-kothapalli.aws-ap-south-1.turso.io';
const tursoToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwMTI4NDUsImlkIjoiMDE5ZmQ2YTgtYjgwMS03OGY2LWI1NmItN2M3NTIyYjJkZGQyIiwia2lkIjoiQVhFTHFSZHBkaDJKUFpVYlNkWE1CWnhOeTllYlBhUUY0ZU1UWFlqc1VUdyIsInJpZCI6ImZkMzYwNzhiLTk5NWItNDQ3YS1iOTAyLTBkYWI3MTg5MWU1NiJ9.uusqU1ZEJOm1bgypBkuWOq3kkyw0Q3A7E71sAtOvwcH4xhCAbOY8Z-toUl9hG6yp9oiFmKI2ELv30VtZ6W_2BA';

const client = createClient({ url: tursoUrl, authToken: tursoToken });

async function purge() {
  try {
    console.log('--- PURGING TEST DATA FROM TURSO CLOUD ---');
    const testVehicles = ['veh_1', 'veh_3'];

    for (const vId of testVehicles) {
      await client.execute({ sql: "DELETE FROM approved_breaks WHERE vehicle_id = ?", args: [vId] });
      await client.execute({ sql: "DELETE FROM alerts WHERE vehicle_id = ?", args: [vId] });
      await client.execute({ sql: "DELETE FROM vehicle_campaigns WHERE vehicle_id = ?", args: [vId] });
      await client.execute({ sql: "DELETE FROM telemetry_pings WHERE vehicle_id = ?", args: [vId] });
      await client.execute({ sql: "DELETE FROM campaign_photo_proofs WHERE vehicle_id = ?", args: [vId] });
      await client.execute({ sql: "DELETE FROM vehicles WHERE id = ?", args: [vId] });
    }

    const remainingVeh = await client.execute("SELECT * FROM vehicles");
    console.log('Remaining vehicles in Turso Cloud:', remainingVeh.rows);

  } catch (err) {
    console.error('Purge Error:', err);
  }
}

purge();
