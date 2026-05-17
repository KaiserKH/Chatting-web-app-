const { query } = require('../models/db');
const { fileUrlFromRequest } = require('./uploadController');
const { createNotification } = require('../utils/notifications');

function formatStory(story) {
  return {
    id: story.id,
    user_id: story.user_id,
    media_url: story.media_url,
    type: story.type,
    caption: story.caption,
    expires_at: story.expires_at,
    created_at: story.created_at
  };
}

async function createStory(req, res) {
  try {
    const userId = req.user.id;
    const { media_url, type, caption = '' } = req.body;
    const storyType = type === 'video' ? 'video' : 'image';
    const sourceUrl = media_url || fileUrlFromRequest(req) || '';

    if (!sourceUrl) {
      return res.status(400).json({ error: 'media_url is required' });
    }

    const result = await query(
      'INSERT INTO stories (user_id, media_url, type, caption, expires_at, created_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), NOW())',
      [userId, sourceUrl, storyType, caption]
    );

    const rows = await query('SELECT * FROM stories WHERE id = ?', [result.insertId]);
    const io = req.app.get('io');
    io.emit('new_story', { userId, storyId: result.insertId });

    return res.status(201).json({ story: formatStory(rows[0]) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getStoriesFeed(req, res) {
  try {
    const userId = req.user.id;
    const rows = await query(
      `SELECT s.id, s.user_id, s.media_url, s.type, s.caption, s.expires_at, s.created_at,
              u.username, u.full_name, u.avatar
       FROM stories s
       INNER JOIN users u ON u.id = s.user_id
       INNER JOIN friends f ON (f.user1_id = ? AND f.user2_id = s.user_id) OR (f.user2_id = ? AND f.user1_id = s.user_id)
       WHERE s.expires_at > NOW()
       ORDER BY s.created_at DESC`,
      [userId, userId]
    );

    const grouped = rows.reduce((accumulator, row) => {
      const existing = accumulator.find((item) => item.user_id === row.user_id);
      const story = formatStory(row);
      if (existing) {
        existing.stories.push(story);
      } else {
        accumulator.push({
          user_id: row.user_id,
          username: row.username,
          full_name: row.full_name,
          avatar: row.avatar,
          stories: [story]
        });
      }
      return accumulator;
    }, []);

    return res.json({ stories: grouped });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getUserStories(req, res) {
  try {
    const userId = Number(req.params.userId);
    const rows = await query(
      `SELECT s.id, s.user_id, s.media_url, s.type, s.caption, s.expires_at, s.created_at,
              u.username, u.full_name, u.avatar
       FROM stories s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.user_id = ? AND s.expires_at > NOW()
       ORDER BY s.created_at DESC`,
      [userId]
    );

    return res.json({
      user_id: userId,
      stories: rows.map(formatStory),
      user: rows[0]
        ? {
            username: rows[0].username,
            full_name: rows[0].full_name,
            avatar: rows[0].avatar
          }
        : null
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function viewStory(req, res) {
  try {
    const storyId = Number(req.params.id);
    const viewerId = req.user.id;

    await query(
      'INSERT INTO story_views (story_id, viewer_id, viewed_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE viewed_at = NOW()',
      [storyId, viewerId]
    );

    return res.json({ message: 'Story viewed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getStoryViews(req, res) {
  try {
    const storyId = Number(req.params.id);
    const storyRows = await query('SELECT user_id FROM stories WHERE id = ? LIMIT 1', [storyId]);

    if (!storyRows.length) {
      return res.status(404).json({ error: 'Story not found' });
    }

    if (Number(storyRows[0].user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'You can only view your own story viewers' });
    }

    const rows = await query(
      `SELECT sv.viewer_id, sv.viewed_at, u.username, u.full_name, u.avatar, u.status
       FROM story_views sv
       INNER JOIN users u ON u.id = sv.viewer_id
       WHERE sv.story_id = ?
       ORDER BY sv.viewed_at DESC`,
      [storyId]
    );

    return res.json({ views: rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function deleteStory(req, res) {
  try {
    const storyId = Number(req.params.id);
    const storyRows = await query('SELECT user_id FROM stories WHERE id = ? LIMIT 1', [storyId]);

    if (!storyRows.length) {
      return res.status(404).json({ error: 'Story not found' });
    }

    if (Number(storyRows[0].user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'You can only delete your own stories' });
    }

    await query('DELETE FROM stories WHERE id = ?', [storyId]);
    return res.json({ message: 'Story deleted' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createStory,
  getStoriesFeed,
  getUserStories,
  viewStory,
  getStoryViews,
  deleteStory
};
