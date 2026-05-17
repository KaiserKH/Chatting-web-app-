const { query } = require('../models/db');

const onlineUsers = new Set();

function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    avatar: user.avatar,
    status: user.status
  };
}

async function joinConversationRooms(socket) {
  const rows = await query('SELECT conversation_id FROM conversation_members WHERE user_id = ?', [socket.user.id]);

  rows.forEach((row) => {
    socket.join(`conversation:${row.conversation_id}`);
  });

  socket.join(`user:${socket.user.id}`);
}

async function setUserStatus(userId, status) {
  await query('UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?', [status, userId]);
}

async function registerSocketHandlers(io, socket) {
  onlineUsers.add(socket.user.id);
  await setUserStatus(socket.user.id, 'online');
  io.emit('user_online', { userId: socket.user.id });
  await joinConversationRooms(socket);

  socket.on('join_conversations', async () => {
    await joinConversationRooms(socket);
  });

  socket.on('typing_start', ({ conversationId }) => {
    socket.to(`conversation:${conversationId}`).emit('typing_indicator', {
      userId: socket.user.id,
      conversationId,
      isTyping: true
    });
  });

  socket.on('typing_stop', ({ conversationId }) => {
    socket.to(`conversation:${conversationId}`).emit('typing_indicator', {
      userId: socket.user.id,
      conversationId,
      isTyping: false
    });
  });

  socket.on('message_read', async ({ messageId, conversationId }) => {
    await query(
      'INSERT INTO message_read_receipts (message_id, user_id, read_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE read_at = NOW()',
      [messageId, socket.user.id]
    );

    await query(
      'UPDATE conversation_members SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?',
      [conversationId, socket.user.id]
    );
  });

  socket.on('disconnect', async () => {
    onlineUsers.delete(socket.user.id);
    if (!onlineUsers.has(socket.user.id)) {
      await setUserStatus(socket.user.id, 'offline');
      io.emit('user_offline', { userId: socket.user.id });
    }
  });
}

module.exports = {
  registerSocketHandlers,
  serializeUser
};
