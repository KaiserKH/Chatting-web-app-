const { Server } = require('socket.io');
const { verifyAccessToken } = require('../utils/jwt');
const { query } = require('../models/db');
const { registerSocketHandlers } = require('../socket/handlers');

let ioInstance = null;

function initSocket(server) {
  ioInstance = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    }
  });

  ioInstance.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = verifyAccessToken(token);
      const rows = await query(
        'SELECT id, username, full_name, avatar, status FROM users WHERE id = ?',
        [decoded.id]
      );

      if (!rows.length) {
        return next(new Error('User not found'));
      }

      socket.user = rows[0];
      next();
    } catch (error) {
      next(new Error('Invalid socket token'));
    }
  });

  ioInstance.on('connection', (socket) => {
    registerSocketHandlers(ioInstance, socket);
  });

  return ioInstance;
}

function getIO() {
  return ioInstance;
}

module.exports = {
  initSocket,
  getIO
};
