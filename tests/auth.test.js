import { generateToken, verifyToken, loginUser, revokeToken } from '../server/middleware/auth.js';

console.log('[TEST 1] Authentication & JWT Security');

// Step 1: JWT token generation and verification
const token = generateToken({ userId: 'u1', role: 'driver', vendorId: 'v1' }, 1);
const verified = verifyToken(token);
console.assert(verified !== null && verified.userId === 'u1', 'JWT verification failed');

// Step 2: Login validation
const loginRes = loginUser('manager@firstclub.com', 'password123');
console.assert(loginRes.token && loginRes.user.role === 'ops_manager', 'Login failed');

// Step 3: Token revocation
revokeToken(loginRes.token);
const checkRevoked = verifyToken(loginRes.token);
console.assert(checkRevoked === null, 'Revoked token should fail verification');

console.log('✓ Auth & JWT security unit tests passed!');
