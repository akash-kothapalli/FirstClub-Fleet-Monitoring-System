import { createClient } from '@libsql/client';

const tursoUrl = 'libsql://firstclub-fleet-akash-kothapalli.aws-ap-south-1.turso.io';
const tursoToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwMTI4NDUsImlkIjoiMDE5ZmQ2YTgtYjgwMS03OGY2LWI1NmItN2M3NTIyYjJkZGQyIiwia2lkIjoiQVhFTHFSZHBkaDJKUFpVYlNkWE1CWnhOeTllYlBhUUY0ZU1UWFlqc1VUdyIsInJpZCI6ImZkMzYwNzhiLTk5NWItNDQ3YS1iOTAyLTBkYWI3MTg5MWU1NiJ9.uusqU1ZEJOm1bgypBkuWOq3kkyw0Q3A7E71sAtOvwcH4xhCAbOY8Z-toUl9hG6yp9oiFmKI2ELv30VtZ6W_2BA';

const client = createClient({ url: tursoUrl, authToken: tursoToken });

async function test() {
  try {
    const resUsers = await client.execute('SELECT * FROM users');
    console.log('--- USERS IN TURSO CLOUD ---');
    console.log(JSON.stringify(resUsers.rows, null, 2));

    const resVehicles = await client.execute('SELECT * FROM vehicles');
    console.log('--- VEHICLES IN TURSO CLOUD ---');
    console.log(JSON.stringify(resVehicles.rows, null, 2));

    const resTables = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('--- TABLES IN TURSO CLOUD ---');
    console.log(JSON.stringify(resTables.rows, null, 2));
  } catch (err) {
    console.error('Turso Query Error:', err);
  }
}

test();
