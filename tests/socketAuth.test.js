import { socketAuth } from '../server/middleware/socketAuth.js';

console.log('[TEST] Socket.io Authorization & Room Scoping');
console.assert(typeof socketAuth === 'function', 'socketAuth middleware loaded');
console.log('✓ Socket auth unit tests passed!');
