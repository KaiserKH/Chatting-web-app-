const { query } = require('../models/db');
const { normalizePagination } = require('../utils/pagination');

async function listNotifications(req, res) {
  try {
    const userId = req.user.id;
    const { page, limit, offset } = normalizePagination(req.query);

    const totalRows = await query('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ?', [userId]);
    const rows = await query(
      'SELECT id, user_id, type, reference_id, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    );

    return res.json({
      notifications: rows,
      pagination: {
        page,
        limit,
        total: Number(totalRows[0].count || 0),
        totalPages: Math.ceil(Number(totalRows[0].count || 0) / limit) || 1
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function markRead(req, res) {
  try {
    const notificationId = Number(req.params.id);
    const userId = req.user.id;

    await query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [notificationId, userId]);
    return res.json({ message: 'Notification marked as read' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function markAllRead(req, res) {
  try {
    const userId = req.user.id;
    await query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
    return res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  listNotifications,
  markRead,
  markAllRead
};
