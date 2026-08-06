process.env.TURSO_DATABASE_URL = '';
process.env.TURSO_AUTH_TOKEN = '';

import './geofence.test.js';
import './alertRules.test.js';
import './telemetry.test.js';
import './auth.test.js';
import './vendorScoping.test.js';
import './offlineSync.test.js';

console.log('\n=======================================================');
console.log('✅ ALL UNIT & SECURITY TEST SUITES PASSED SUCCESSFULLY!');
console.log('=======================================================\n');
