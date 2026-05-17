const { query, transaction } = require('../models/db');
const { publicUser } = require('./authController');

function parseMemberIds(memberIds) {
  if (!memberIds) {
    return [];
  }

  if (Array.isArray(memberIds)) {
    return memberIds.map(Number).filter(Boolean);
  }

  if (typeof memberIds === 'string') {
    try {
      const parsed = JSON.parse(memberIds);
      if (Array.isArray(parsed)) {
        return parsed.map(Number).filter(Boolean);
      }
    } catch (error) {
      return memberIds.split(',').map((value) => Number(value.trim())).filter(Boolean);
    }
  }

  return [];
}

async function getPrivateConversationBetween(userId, otherUserId) {
  const rows = await query(
    `SELECT c.id, c.type, c.name, c.avatar, c.created_by, c.created_at
     FROM conversations c
     INNER JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
     INNER JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
     WHERE c.type = 'private'
     LIMIT 1`,
    [userId, otherUserId]
  );

  return rows[0] || null;
}

async function createOrFetchPrivateConversation(req, res) {
  try {
    const currentUserId = req.user.id;
    const otherUserId = Number(req.params.userId);

    if (currentUserId === otherUserId) {
      return res.status(400).json({ error: 'You cannot create a conversation with yourself' });
    }

    const targetRows = await query('SELECT id FROM users WHERE id = ?', [otherUserId]);
    if (!targetRows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const blocked = await query(
      'SELECT id FROM blocked_users WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
      [currentUserId, otherUserId, otherUserId, currentUserId]
    );
    if (blocked.length) {
      return res.status(403).json({ error: 'Conversation blocked between these users' });
    }

    const friends = await query(
      'SELECT id FROM friends WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)',
      [currentUserId, otherUserId, otherUserId, currentUserId]
    );
    if (!friends.length) {
      return res.status(403).json({ error: 'Users are not friends' });
    }

    const existing = await getPrivateConversationBetween(currentUserId, otherUserId);
    if (existing) {
      return res.json({ conversation: existing });
    }

    const conversation = await transaction(async (connection) => {
      const [result] = await connection.execute(
        'INSERT INTO conversations (type, name, avatar, created_by, created_at) VALUES ("private", NULL, NULL, ?, NOW())',
        [currentUserId]
      );

      const conversationId = result.insertId;
      await connection.execute(
        'INSERT INTO conversation_members (conversation_id, user_id, role, joined_at, last_read_at) VALUES (?, ?, "admin", NOW(), NOW()), (?, ?, "member", NOW(), NULL)',
        [conversationId, currentUserId, conversationId, otherUserId]
      );

      const rows = await connection.execute(
        'SELECT id, type, name, avatar, created_by, created_at FROM conversations WHERE id = ?',
        [conversationId]
      );

      return rows[0][0];
    });

    return res.status(201).json({ conversation });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function createGroupConversation(req, res) {
  try {
    const currentUserId = req.user.id;
    const { name, avatar = null, memberIds = [] } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const uniqueMemberIds = [...new Set(parseMemberIds(memberIds))].filter((id) => id !== currentUserId);

    const conversation = await transaction(async (connection) => {
      const [result] = await connection.execute(
        'INSERT INTO conversations (type, name, avatar, created_by, created_at) VALUES ("group", ?, ?, ?, NOW())',
        [name, avatar, currentUserId]
      );

      const conversationId = result.insertId;
      await connection.execute(
        'INSERT INTO conversation_members (conversation_id, user_id, role, joined_at, last_read_at) VALUES (?, ?, "admin", NOW(), NOW())',
        [conversationId, currentUserId]
      );

      for (const memberId of uniqueMemberIds) {
        await connection.execute(
          'INSERT IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at, last_read_at) VALUES (?, ?, "member", NOW(), NULL)',
          [conversationId, memberId]
        );
      }

      const rows = await connection.execute('SELECT id, type, name, avatar, created_by, created_at FROM conversations WHERE id = ?', [conversationId]);
      return rows[0][0];
    });

    return res.status(201).json({ conversation });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function listConversations(req, res) {
  try {
    const userId = req.user.id;
    const rows = await query(
      `SELECT c.id, c.type, c.name, c.avatar, c.created_by, c.created_at, cm.role, cm.last_read_at
       FROM conversations c
       INNER JOIN conversation_members cm ON cm.conversation_id = c.id
       WHERE cm.user_id = ?
       ORDER BY c.created_at DESC`,
      [userId]
    );

    const conversations = await Promise.all(rows.map(async (conversation) => {
      const lastMessageRows = await query(
        `SELECT m.id, m.conversation_id, m.sender_id, m.type, m.content, m.file_url, m.reply_to_id, m.is_edited, m.is_deleted, m.created_at, u.username, u.full_name, u.avatar
         FROM messages m
         INNER JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = ?
         ORDER BY m.id DESC
         LIMIT 1`,
        [conversation.id]
      );

      const unreadRows = await query(
        `SELECT COUNT(*) AS count
         FROM messages m
         WHERE m.conversation_id = ?
           AND (m.created_at > COALESCE(?, '1970-01-01 00:00:00'))
           AND m.sender_id <> ?`,
        [conversation.id, conversation.last_read_at, userId]
      );

      const memberRows = await query(
        `SELECT u.id, u.username, u.full_name, u.avatar, u.status
         FROM conversation_members cm
         INNER JOIN users u ON u.id = cm.user_id
         WHERE cm.conversation_id = ?
         ORDER BY cm.role = 'admin' DESC, u.username ASC`,
        [conversation.id]
      );

      const lastMessage = lastMessageRows[0] || null;
      const lastMessagePreview = lastMessage
        ? (lastMessage.is_deleted ? 'This message was deleted' : lastMessage.content || lastMessage.file_url || '')
        : '';

      const participant = conversation.type === 'private'
        ? memberRows.find((member) => Number(member.id) !== Number(userId)) || null
        : null;

      return {
        ...conversation,
        unread_count: Number(unreadRows[0].count || 0),
        last_message: lastMessage,
        last_message_preview: lastMessagePreview,
        members: memberRows,
        participant: participant ? publicUser(participant) : null
      };
    }));

    return res.json({ conversations });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getConversation(req, res) {
  try {
    const conversationId = Number(req.params.id);
    const conversationRows = await query('SELECT id, type, name, avatar, created_by, created_at FROM conversations WHERE id = ? LIMIT 1', [conversationId]);

    if (!conversationRows.length) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const memberRows = await query(
      `SELECT cm.id, cm.conversation_id, cm.user_id, cm.role, cm.joined_at, cm.last_read_at,
              u.username, u.full_name, u.avatar, u.bio, u.status, u.is_verified
       FROM conversation_members cm
       INNER JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id = ?
       ORDER BY cm.role = 'admin' DESC, u.username ASC`,
      [conversationId]
    );

    return res.json({ conversation: conversationRows[0], members: memberRows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function updateGroupConversation(req, res) {
  try {
    const userId = req.user.id;
    const conversationId = Number(req.params.id);
    const { name, avatar } = req.body;

    const roleRows = await query(
      'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1',
      [conversationId, userId]
    );
    if (!roleRows.length || roleRows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin privileges required' });
    }

    await query(
      `UPDATE conversations
       SET name = COALESCE(?, name),
           avatar = COALESCE(?, avatar)
       WHERE id = ? AND type = 'group'`,
      [name || null, avatar || null, conversationId]
    );

    return res.json({ message: 'Conversation updated' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function addMembers(req, res) {
  try {
    const userId = req.user.id;
    const conversationId = Number(req.params.id);
    const memberIds = [...new Set(parseMemberIds(req.body.memberIds))].filter((id) => id !== userId);

    const roleRows = await query(
      'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1',
      [conversationId, userId]
    );
    if (!roleRows.length || roleRows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin privileges required' });
    }

    for (const memberId of memberIds) {
      await query(
        'INSERT IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at, last_read_at) VALUES (?, ?, "member", NOW(), NULL)',
        [conversationId, memberId]
      );
    }

    return res.json({ message: 'Members added' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function removeMember(req, res) {
  try {
    const userId = req.user.id;
    const conversationId = Number(req.params.id);
    const memberId = Number(req.params.userId);

    const roleRows = await query(
      'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1',
      [conversationId, userId]
    );
    if (!roleRows.length || roleRows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin privileges required' });
    }

    await query('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [conversationId, memberId]);
    return res.json({ message: 'Member removed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function leaveConversation(req, res) {
  try {
    const userId = req.user.id;
    const conversationId = Number(req.params.id);

    const conversationRows = await query('SELECT type FROM conversations WHERE id = ? LIMIT 1', [conversationId]);
    if (!conversationRows.length) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversationRows[0].type !== 'group') {
      return res.status(400).json({ error: 'Only group conversations can be left' });
    }

    await query('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [conversationId, userId]);
    return res.json({ message: 'Left conversation' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createOrFetchPrivateConversation,
  createGroupConversation,
  listConversations,
  getConversation,
  updateGroupConversation,
  addMembers,
  removeMember,
  leaveConversation
};
