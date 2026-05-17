const { query } = require('../models/db');

async function createNotification({ socket, userId, type, referenceId = null }) {
  const result = await query(
    'INSERT INTO notifications (user_id, type, reference_id, is_read, created_at) VALUES (?, ?, ?, 0, NOW())',
    [userId, type, referenceId]
  );

  const notification = {
    id: result.insertId,
    user_id: userId,
    type,
    reference_id: referenceId,
    is_read: 0,
    created_at: new Date().toISOString()
  };

  if (socket) {
    socket.to(`user:${userId}`).emit('new_notification', { notification });
  }

  return notification;
}

async function markNotificationRead(notificationId, userId) {
  await query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [notificationId, userId]);
}

async function markAllNotificationsRead(userId) {
  await query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
}

module.exports = {
  createNotification,
  markNotificationRead,
  markAllNotificationsRead
};
