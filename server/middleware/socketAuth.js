import { verifyToken } from './auth.js';

export function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  const user = verifyToken(token);

  if (!user) {
    return next(new Error('Unauthorized WebSocket handshake'));
  }

  socket.user = user;

  // Vendor Room Scoping:
  if (user.role === 'ops_manager') {
    socket.join('room:ops_admin');
  } else if (user.vendorId) {
    socket.join(`room:vendor_${user.vendorId}`);
  }

  next();
}
