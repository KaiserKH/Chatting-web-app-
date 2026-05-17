const sanitizeHtml = require('sanitize-html');
const { verifyAccessToken } = require('../utils/jwt');
const { query } = require('../models/db');

async function authenticateToken(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = verifyAccessToken(token);
    const rows = await query(
      'SELECT id, username, full_name, email, phone, avatar, bio, status, is_verified, created_at, updated_at FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

function sanitizeInput(req, res, next) {
  const source = req.body || {};

  for (const key of Object.keys(source)) {
    if (typeof source[key] === 'string') {
      source[key] = sanitizeHtml(source[key], { allowedTags: [], allowedAttributes: {} }).trim();
    }
  }

  next();
}

async function checkFriendship(req, res, next) {
  const currentUserId = req.user && req.user.id;
  const targetUserId = Number(req.params.userId || req.body.userId || req.body.receiverId);

  if (!currentUserId || !targetUserId) {
    return next();
  }

  const blocked = await query(
    'SELECT id FROM blocked_users WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
    [currentUserId, targetUserId, targetUserId, currentUserId]
  );

  if (blocked.length) {
    return res.status(403).json({ error: 'You cannot interact with this user' });
  }

  const friends = await query(
    'SELECT id FROM friends WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)',
    [currentUserId, targetUserId, targetUserId, currentUserId]
  );

  if (!friends.length) {
    return res.status(403).json({ error: 'Users are not friends' });
  }

  next();
}

async function checkConversationMember(req, res, next) {
  const currentUserId = req.user && req.user.id;
  const conversationId = Number(req.params.id || req.params.conversationId || req.body.conversationId);

  if (!currentUserId || !conversationId) {
    return next();
  }

  const members = await query(
    'SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
    [conversationId, currentUserId]
  );

  if (!members.length) {
    return res.status(403).json({ error: 'You are not a member of this conversation' });
  }

  next();
}

module.exports = {
  authenticateToken,
  sanitizeInput,
  checkFriendship,
  checkConversationMember
};
