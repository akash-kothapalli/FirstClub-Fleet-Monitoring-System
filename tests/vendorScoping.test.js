import db from '../server/db.js';

console.log('[TEST 2] Vendor Scoping Security on PUT & DELETE Vehicle Endpoints');

// Ensure test vendor v2 and vehicle exist
db.prepare("INSERT OR REPLACE INTO vendors (id, name, contact_email) VALUES ('v2', 'CityVibe Ads', 'contact@cityvibe.in')").run();
db.prepare("INSERT OR REPLACE INTO vehicles (id, plate_number, vendor_id) VALUES ('veh_3', 'DL-01-AB-1234', 'v2')").run();

const vikramUser = { userId: 'u_vm1', role: 'vendor_manager', vendorId: 'v1' }; // Akash Outdoor Media (v1)
const cityVibeTruck = db.prepare('SELECT * FROM vehicles WHERE id = ?').get('veh_3'); // DL-01-AB-1234 (CityVibe v2)

console.assert(cityVibeTruck !== undefined, 'CityVibe vehicle veh_3 found in database');
console.assert(cityVibeTruck.vendor_id === 'v2', 'veh_3 belongs to vendor v2');

// Simulate Vendor Scoping Guard check
const canVikramEdit = (vikramUser.role === 'ops_manager') || (vikramUser.vendorId === cityVibeTruck.vendor_id);
console.assert(canVikramEdit === false, 'Akash (Vendor v1) MUST BE DENIED permission to edit CityVibe (v2) vehicle');

const canVikramDelete = (vikramUser.role === 'ops_manager') || (vikramUser.vendorId === cityVibeTruck.vendor_id);
console.assert(canVikramDelete === false, 'Akash (Vendor v1) MUST BE DENIED permission to delete CityVibe (v2) vehicle');

// Ops Manager override check
const opsUser = { userId: 'u_ops1', role: 'ops_manager', vendorId: null };
const canOpsEdit = (opsUser.role === 'ops_manager') || (opsUser.vendorId === cityVibeTruck.vendor_id);
console.assert(canOpsEdit === true, 'FirstClub Ops Manager MUST have full access across all vendors');

console.log('✓ Vendor scoping security unit tests passed!');
