const { query, transaction } = require('../models/db');
const { createNotification } = require('../utils/notifications');
const { publicUser } = require('./authController');

async function sendFriendRequest(req, res) {
  try {
    const currentUserId = req.user.id;
    const targetUserId = Number(req.params.userId);

    if (currentUserId === targetUserId) {
      return res.status(400).json({ error: 'You cannot send a request to yourself' });
    }

    const targetRows = await query('SELECT id, username, full_name, avatar, status, last_seen_at FROM users WHERE id = ?', [targetUserId]);
    if (!targetRows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const blocked = await query(
      'SELECT id FROM blocked_users WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
      [currentUserId, targetUserId, targetUserId, currentUserId]
    );
    if (blocked.length) {
      return res.status(403).json({ error: 'You cannot send a request to this user' });
    }

    const friends = await query(
      'SELECT id FROM friends WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)',
      [currentUserId, targetUserId, targetUserId, currentUserId]
    );
    if (friends.length) {
      return res.status(409).json({ error: 'Users are already friends' });
    }

    const pending = await query(
      'SELECT id FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = "pending"',
      [currentUserId, targetUserId]
    );
    if (pending.length) {
      return res.status(409).json({ error: 'Friend request already sent' });
    }

    const existingIncoming = await query(
      'SELECT id FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = "pending"',
      [targetUserId, currentUserId]
    );
    if (existingIncoming.length) {
      await query('UPDATE friend_requests SET status = "accepted" WHERE id = ?', [existingIncoming[0].id]);
      await query('INSERT INTO friends (user1_id, user2_id, created_at) VALUES (?, ?, NOW())', [Math.min(currentUserId, targetUserId), Math.max(currentUserId, targetUserId)]);
      return res.json({ message: 'Friend request accepted automatically', friendId: targetUserId });
    }

    const result = await query(
      'INSERT INTO friend_requests (sender_id, receiver_id, status, created_at) VALUES (?, ?, "pending", NOW())',
      [currentUserId, targetUserId]
    );

    const io = req.app.get('io');
    await createNotification({
      socket: io,
      userId: targetUserId,
      type: 'friend_request',
      referenceId: result.insertId
    });

    io.to(`user:${targetUserId}`).emit('friend_request_received', { from: req.user });

    return res.status(201).json({
      message: 'Friend request sent',
      request_id: result.insertId,
      receiver: publicUser(targetRows[0])
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function acceptFriendRequest(req, res) {
  try {
    const requestId = Number(req.params.requestId);
    const currentUserId = req.user.id;

    const rows = await query('SELECT id, sender_id, receiver_id, status FROM friend_requests WHERE id = ? LIMIT 1', [requestId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    const request = rows[0];
    if (Number(request.receiver_id) !== Number(currentUserId)) {
      return res.status(403).json({ error: 'Not allowed to accept this request' });
    }

    await transaction(async (connection) => {
      await connection.execute('UPDATE friend_requests SET status = "accepted" WHERE id = ?', [requestId]);
      const user1Id = Math.min(Number(request.sender_id), Number(request.receiver_id));
      const user2Id = Math.max(Number(request.sender_id), Number(request.receiver_id));
      await connection.execute('INSERT IGNORE INTO friends (user1_id, user2_id, created_at) VALUES (?, ?, NOW())', [user1Id, user2Id]);
    });

    const io = req.app.get('io');
    const senderRows = await query('SELECT id, username, full_name, avatar, status, last_seen_at FROM users WHERE id = ?', [request.sender_id]);
    await createNotification({
      socket: io,
      userId: request.sender_id,
      type: 'friend_accepted',
      referenceId: requestId
    });
    io.to(`user:${request.sender_id}`).emit('friend_request_accepted', { by: req.user });

    return res.json({
      message: 'Friend request accepted',
      friend: publicUser(senderRows[0])
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function rejectFriendRequest(req, res) {
  try {
    const requestId = Number(req.params.requestId);
    const currentUserId = req.user.id;

    const rows = await query('SELECT receiver_id FROM friend_requests WHERE id = ? LIMIT 1', [requestId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (Number(rows[0].receiver_id) !== Number(currentUserId)) {
      return res.status(403).json({ error: 'Not allowed to reject this request' });
    }

    await query('UPDATE friend_requests SET status = "rejected" WHERE id = ?', [requestId]);
    return res.json({ message: 'Friend request rejected' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function unfriend(req, res) {
  try {
    const currentUserId = req.user.id;
    const otherUserId = Number(req.params.userId);

    await query(
      'DELETE FROM friends WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)',
      [Math.min(currentUserId, otherUserId), Math.max(currentUserId, otherUserId), Math.max(currentUserId, otherUserId), Math.min(currentUserId, otherUserId)]
    );
    return res.json({ message: 'Friend removed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function blockUser(req, res) {
  try {
    const blockerId = req.user.id;
    const blockedId = Number(req.params.userId);

    if (blockerId === blockedId) {
      return res.status(400).json({ error: 'You cannot block yourself' });
    }

    await transaction(async (connection) => {
      await connection.execute('INSERT IGNORE INTO blocked_users (blocker_id, blocked_id, created_at) VALUES (?, ?, NOW())', [blockerId, blockedId]);
      await connection.execute('DELETE FROM friend_requests WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)', [blockerId, blockedId, blockedId, blockerId]);
      await connection.execute('DELETE FROM friends WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)', [Math.min(blockerId, blockedId), Math.max(blockerId, blockedId), Math.max(blockerId, blockedId), Math.min(blockerId, blockedId)]);
    });

    return res.json({ message: 'User blocked' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function listFriends(req, res) {
  try {
    const userId = req.user.id;
    const rows = await query(
      `SELECT
         CASE WHEN user1_id = ? THEN user2_id ELSE user1_id END AS friend_id,
         u.username,
         u.full_name,
         u.email,
         u.phone,
         u.avatar,
         u.bio,
         u.status,
         u.last_seen_at,
         u.is_verified,
         f.created_at
       FROM friends f
       INNER JOIN users u ON u.id = CASE WHEN f.user1_id = ? THEN f.user2_id ELSE f.user1_id END
       WHERE f.user1_id = ? OR f.user2_id = ?
       ORDER BY u.username ASC`,
      [userId, userId, userId, userId]
    );

    return res.json({
      friends: rows.map((friend) => ({
        id: friend.friend_id,
        username: friend.username,
        full_name: friend.full_name,
        email: friend.email,
        phone: friend.phone,
        avatar: friend.avatar,
        bio: friend.bio,
        status: friend.status,
        last_seen_at: friend.last_seen_at,
        is_verified: !!friend.is_verified,
        created_at: friend.created_at
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function listIncomingRequests(req, res) {
  try {
    const userId = req.user.id;
    const rows = await query(
      `SELECT fr.id, fr.sender_id, fr.receiver_id, fr.status, fr.created_at,
              u.username, u.full_name, u.avatar, u.bio, u.status AS user_status, u.last_seen_at
       FROM friend_requests fr
       INNER JOIN users u ON u.id = fr.sender_id
       WHERE fr.receiver_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [userId]
    );

    return res.json({ requests: rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function listSentRequests(req, res) {
  try {
    const userId = req.user.id;
    const rows = await query(
      `SELECT fr.id, fr.sender_id, fr.receiver_id, fr.status, fr.created_at,
              u.username, u.full_name, u.avatar, u.bio, u.status AS user_status, u.last_seen_at
       FROM friend_requests fr
       INNER JOIN users u ON u.id = fr.receiver_id
       WHERE fr.sender_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [userId]
    );

    return res.json({ requests: rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function listSuggestions(req, res) {
  try {
    const userId = req.user.id;
    const maps = await Promise.all([
      query('SELECT blocker_id, blocked_id FROM blocked_users WHERE blocker_id = ? OR blocked_id = ?', [userId, userId]),
      query('SELECT user1_id, user2_id FROM friends WHERE user1_id = ? OR user2_id = ?', [userId, userId]),
      query('SELECT sender_id, receiver_id FROM friend_requests WHERE (sender_id = ? OR receiver_id = ?) AND status = "pending"', [userId, userId])
    ]);

    const blockedIds = new Set();
    maps[0].forEach((row) => {
      if (Number(row.blocker_id) === Number(userId)) blockedIds.add(Number(row.blocked_id));
      else blockedIds.add(Number(row.blocker_id));
    });

    const friendIds = new Set();
    maps[1].forEach((row) => {
      if (Number(row.user1_id) === Number(userId)) friendIds.add(Number(row.user2_id));
      else friendIds.add(Number(row.user1_id));
    });

    const pendingIds = new Set();
    maps[2].forEach((row) => {
      pendingIds.add(Number(row.sender_id));
      pendingIds.add(Number(row.receiver_id));
    });

    const rows = await query(
      `SELECT id, username, full_name, email, phone, avatar, bio, status, is_verified, created_at, updated_at
       FROM users
       WHERE id <> ?
       ORDER BY created_at DESC`,
      [userId]
    );

    const suggestions = [];
    for (const user of rows) {
      const candidateId = Number(user.id);
      if (blockedIds.has(candidateId) || friendIds.has(candidateId) || pendingIds.has(candidateId)) {
        continue;
      }

      const mutual = await query(
        `SELECT COUNT(*) AS count
         FROM friends f1
         INNER JOIN friends f2
           ON (f1.user1_id = f2.user1_id AND f1.user2_id = f2.user2_id)
           OR (f1.user1_id = f2.user2_id AND f1.user2_id = f2.user1_id)
         WHERE (? IN (f1.user1_id, f1.user2_id))
           AND (? IN (f2.user1_id, f2.user2_id))`,
        [userId, candidateId]
      );

      suggestions.push({
        ...publicUser(user),
        mutual_friends_count: Number(mutual[0].count || 0),
        friend_status: 'none'
      });
    }

    suggestions.sort((a, b) => b.mutual_friends_count - a.mutual_friends_count || a.username.localeCompare(b.username));
    return res.json({ suggestions: suggestions.slice(0, 20) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  unfriend,
  blockUser,
  listFriends,
  listIncomingRequests,
  listSentRequests,
  listSuggestions
};
