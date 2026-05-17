const bcrypt = require('bcryptjs');
const { query } = require('../models/db');
const { publicUser } = require('./authController');

function friendshipStatusFromMaps(userId, maps) {
  if (maps.blocked.has(userId)) {
    return 'blocked';
  }

  if (maps.friends.has(userId)) {
    return 'friends';
  }

  if (maps.outgoingRequests.has(userId)) {
    return 'pending_outgoing';
  }

  if (maps.incomingRequests.has(userId)) {
    return 'pending_incoming';
  }

  return 'none';
}

async function loadRelationshipMaps(currentUserId) {
  const [blockedRows, friendRows, requestRows] = await Promise.all([
    query('SELECT blocker_id, blocked_id FROM blocked_users WHERE blocker_id = ? OR blocked_id = ?', [currentUserId, currentUserId]),
    query('SELECT user1_id, user2_id FROM friends WHERE user1_id = ? OR user2_id = ?', [currentUserId, currentUserId]),
    query('SELECT sender_id, receiver_id, status FROM friend_requests WHERE (sender_id = ? OR receiver_id = ?) AND status = "pending"', [currentUserId, currentUserId])
  ]);

  const blocked = new Set();
  blockedRows.forEach((row) => {
    if (Number(row.blocker_id) === Number(currentUserId)) {
      blocked.add(Number(row.blocked_id));
    } else {
      blocked.add(Number(row.blocker_id));
    }
  });

  const friends = new Set();
  friendRows.forEach((row) => {
    if (Number(row.user1_id) === Number(currentUserId)) {
      friends.add(Number(row.user2_id));
    } else {
      friends.add(Number(row.user1_id));
    }
  });

  const outgoingRequests = new Set();
  const incomingRequests = new Set();
  requestRows.forEach((row) => {
    if (Number(row.sender_id) === Number(currentUserId)) {
      outgoingRequests.add(Number(row.receiver_id));
    } else {
      incomingRequests.add(Number(row.sender_id));
    }
  });

  return { blocked, friends, outgoingRequests, incomingRequests };
}

async function mutualFriendsCount(currentUserId, otherUserId) {
  const rows = await query(
    `SELECT COUNT(*) AS count
     FROM friends f1
     INNER JOIN friends f2
       ON (f1.user1_id = f2.user1_id AND f1.user2_id = f2.user2_id)
       OR (f1.user1_id = f2.user2_id AND f1.user2_id = f2.user1_id)
     WHERE (? IN (f1.user1_id, f1.user2_id))
       AND (? IN (f2.user1_id, f2.user2_id))`,
    [currentUserId, otherUserId]
  );

  return Number(rows[0].count || 0);
}

async function searchUsers(req, res) {
  try {
    const currentUserId = req.user.id;
    const q = (req.query.q || '').trim();

    if (!q) {
      return res.json({ users: [] });
    }

    const maps = await loadRelationshipMaps(currentUserId);
    const rows = await query(
      `SELECT id, username, full_name, email, phone, avatar, bio, status, is_verified, created_at, updated_at
       FROM users
       WHERE id <> ?
         AND (username LIKE ? OR full_name LIKE ? OR phone LIKE ?)
         AND id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = ?)
         AND id NOT IN (SELECT blocker_id FROM blocked_users WHERE blocked_id = ?)
       ORDER BY username ASC
       LIMIT 25`,
      [currentUserId, `%${q}%`, `%${q}%`, `%${q}%`, currentUserId, currentUserId]
    );

    const users = await Promise.all(rows.map(async (user) => ({
      ...publicUser(user),
      mutual_friends_count: await mutualFriendsCount(currentUserId, user.id),
      friend_status: friendshipStatusFromMaps(Number(user.id), maps)
    })));

    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function viewPublicProfile(req, res) {
  try {
    const currentUserId = req.user ? req.user.id : null;
    const { username } = req.params;
    const rows = await query(
      'SELECT id, username, full_name, email, phone, avatar, bio, status, is_verified, created_at, updated_at FROM users WHERE username = ? LIMIT 1',
      [username]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];
    let friend_status = 'none';
    let mutual_friends_count = 0;

    if (currentUserId) {
      const maps = await loadRelationshipMaps(currentUserId);
      friend_status = friendshipStatusFromMaps(user.id, maps);
      mutual_friends_count = await mutualFriendsCount(currentUserId, user.id);
    }

    return res.json({
      user: {
        ...publicUser(user),
        mutual_friends_count,
        friend_status
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function updateProfile(req, res) {
  try {
    const userId = req.user.id;
    const { full_name, bio, avatar } = req.body;

    await query(
      `UPDATE users
       SET full_name = COALESCE(?, full_name),
           bio = COALESCE(?, bio),
           avatar = COALESCE(?, avatar),
           updated_at = NOW()
       WHERE id = ?`,
      [full_name || null, bio || null, avatar || null, userId]
    );

    const rows = await query(
      'SELECT id, username, full_name, email, phone, avatar, bio, status, is_verified, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );

    return res.json({ message: 'Profile updated', user: publicUser(rows[0]) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function updatePassword(req, res) {
  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'current_password and new_password are required' });
    }

    const rows = await query('SELECT password_hash FROM users WHERE id = ?', [userId]);
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);

    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [passwordHash, userId]);

    return res.json({ message: 'Password updated' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function updateStatus(req, res) {
  try {
    const userId = req.user.id;
    const { status } = req.body;
    const allowed = ['online', 'offline', 'away'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await query('UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?', [status, userId]);

    return res.json({ message: 'Status updated', status });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  searchUsers,
  viewPublicProfile,
  updateProfile,
  updatePassword,
  updateStatus
};
