const sanitizeHtml = require('sanitize-html');
const { query, transaction } = require('../models/db');
const { createNotification } = require('../utils/notifications');

function sanitizeText(value) {
  return sanitizeHtml(value || '', { allowedTags: [], allowedAttributes: {} }).trim();
}

async function listMessages(req, res) {
  try {
    const userId = req.user.id;
    const conversationId = Number(req.params.id);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const totalRows = await query('SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?', [conversationId]);
    const rows = await query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.type, m.content, m.file_url, m.reply_to_id, m.is_edited, m.is_deleted, m.created_at, m.updated_at,
              u.username, u.full_name, u.avatar, u.status
       FROM messages m
       INNER JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ?
       ORDER BY m.id DESC
       LIMIT ? OFFSET ?`,
      [conversationId, limit, offset]
    );

    const messages = rows.reverse();
    return res.json({
      messages,
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

async function sendMessage(req, res) {
  try {
    const userId = req.user.id;
    const conversationId = Number(req.params.id);
    const { content = '', type = 'text', file_url = '', reply_to_id = null } = req.body;

    const membershipRows = await query('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1', [conversationId, userId]);
    if (!membershipRows.length) {
      return res.status(403).json({ error: 'You are not a member of this conversation' });
    }

    const conversationRows = await query('SELECT type FROM conversations WHERE id = ? LIMIT 1', [conversationId]);
    if (!conversationRows.length) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messageContent = sanitizeText(content);
    if (type === 'text' && !messageContent) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (type !== 'text' && !file_url) {
      return res.status(400).json({ error: 'file_url is required for non-text messages' });
    }

    const result = await query(
      `INSERT INTO messages (conversation_id, sender_id, type, content, file_url, reply_to_id, is_edited, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, NOW(), NOW())`,
      [conversationId, userId, type, messageContent, file_url || null, reply_to_id || null]
    );

    const messageRows = await query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.type, m.content, m.file_url, m.reply_to_id, m.is_edited, m.is_deleted, m.created_at, m.updated_at,
              u.username, u.full_name, u.avatar, u.status
       FROM messages m
       INNER JOIN users u ON u.id = m.sender_id
       WHERE m.id = ?`,
      [result.insertId]
    );

    const io = req.app.get('io');
    io.to(`conversation:${conversationId}`).emit('new_message', { message: messageRows[0], conversationId });

    const memberRows = await query('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ?', [conversationId, userId]);
    for (const member of memberRows) {
      await createNotification({
        socket: io,
        userId: member.user_id,
        type: 'message',
        referenceId: result.insertId
      });
    }

    return res.status(201).json({ message: messageRows[0] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function editMessage(req, res) {
  try {
    const userId = req.user.id;
    const messageId = Number(req.params.id);
    const content = sanitizeText(req.body.content || '');

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const rows = await query('SELECT conversation_id, sender_id, is_deleted FROM messages WHERE id = ? LIMIT 1', [messageId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (Number(rows[0].sender_id) !== Number(userId)) {
      return res.status(403).json({ error: 'You can only edit your own messages' });
    }

    if (rows[0].is_deleted) {
      return res.status(400).json({ error: 'Deleted messages cannot be edited' });
    }

    await query('UPDATE messages SET content = ?, is_edited = 1, updated_at = NOW() WHERE id = ?', [content, messageId]);
    const io = req.app.get('io');
    io.to(`conversation:${rows[0].conversation_id}`).emit('message_edited', {
      messageId,
      content,
      conversationId: rows[0].conversation_id
    });

    return res.json({ message: 'Message updated' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function deleteMessage(req, res) {
  try {
    const userId = req.user.id;
    const messageId = Number(req.params.id);

    const rows = await query('SELECT conversation_id, sender_id FROM messages WHERE id = ? LIMIT 1', [messageId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (Number(rows[0].sender_id) !== Number(userId)) {
      return res.status(403).json({ error: 'You can only delete your own messages' });
    }

    await query('UPDATE messages SET content = "This message was deleted", file_url = NULL, is_deleted = 1, updated_at = NOW() WHERE id = ?', [messageId]);
    const io = req.app.get('io');
    io.to(`conversation:${rows[0].conversation_id}`).emit('message_deleted', {
      messageId,
      conversationId: rows[0].conversation_id
    });

    return res.json({ message: 'Message deleted' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function reactMessage(req, res) {
  try {
    const userId = req.user.id;
    const messageId = Number(req.params.id);
    const emoji = sanitizeText(req.body.emoji || '');

    if (!emoji) {
      return res.status(400).json({ error: 'emoji is required' });
    }

    const messageRows = await query('SELECT conversation_id FROM messages WHERE id = ? LIMIT 1', [messageId]);
    if (!messageRows.length) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const existing = await query('SELECT id, emoji FROM message_reactions WHERE message_id = ? AND user_id = ? LIMIT 1', [messageId, userId]);

    if (existing.length && existing[0].emoji === emoji) {
      await query('DELETE FROM message_reactions WHERE id = ?', [existing[0].id]);
    } else if (existing.length) {
      await query('UPDATE message_reactions SET emoji = ?, created_at = NOW() WHERE id = ?', [emoji, existing[0].id]);
    } else {
      await query('INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, NOW())', [messageId, userId, emoji]);
    }

    const io = req.app.get('io');
    io.to(`conversation:${messageRows[0].conversation_id}`).emit('message_reaction', {
      messageId,
      emoji,
      userId,
      conversationId: messageRows[0].conversation_id
    });

    return res.json({ message: 'Reaction updated' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getReactions(req, res) {
  try {
    const messageId = Number(req.params.id);
    const rows = await query(
      `SELECT mr.emoji, mr.user_id, mr.created_at, u.username, u.full_name, u.avatar
       FROM message_reactions mr
       INNER JOIN users u ON u.id = mr.user_id
       WHERE mr.message_id = ?
       ORDER BY mr.emoji ASC, mr.created_at ASC`,
      [messageId]
    );

    const grouped = rows.reduce((accumulator, row) => {
      if (!accumulator[row.emoji]) {
        accumulator[row.emoji] = [];
      }
      accumulator[row.emoji].push({
        userId: row.user_id,
        username: row.username,
        full_name: row.full_name,
        avatar: row.avatar,
        created_at: row.created_at
      });
      return accumulator;
    }, {});

    return res.json({ reactions: grouped });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function markMessageRead(req, res) {
  try {
    const userId = req.user.id;
    const messageId = Number(req.params.id);
    const conversationId = Number(req.body.conversationId || req.params.conversationId);

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    await transaction(async (connection) => {
      await connection.execute(
        'INSERT INTO message_read_receipts (message_id, user_id, read_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE read_at = NOW()',
        [messageId, userId]
      );
      await connection.execute(
        'UPDATE conversation_members SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?',
        [conversationId, userId]
      );
    });

    const io = req.app.get('io');
    io.to(`conversation:${conversationId}`).emit('message_read', {
      messageId,
      conversationId,
      userId
    });

    return res.json({ message: 'Message marked as read' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  reactMessage,
  getReactions,
  markMessageRead
};
