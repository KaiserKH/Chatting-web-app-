CREATE DATABASE IF NOT EXISTS chatapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE chatapp;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS story_views;
DROP TABLE IF EXISTS stories;
DROP TABLE IF EXISTS blocked_users;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS message_read_receipts;
DROP TABLE IF EXISTS message_reactions;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversation_members;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS friends;
DROP TABLE IF EXISTS friend_requests;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  full_name VARCHAR(120) NOT NULL DEFAULT '',
  email VARCHAR(191) NOT NULL,
  phone VARCHAR(25) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar VARCHAR(255) NOT NULL DEFAULT '/uploads/default-avatar.svg',
  bio TEXT,
  status ENUM('online', 'offline', 'away') NOT NULL DEFAULT 'offline',
  last_seen_at DATETIME DEFAULT NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_users_username (username),
  UNIQUE KEY uniq_users_email (email),
  UNIQUE KEY uniq_users_phone (phone),
  KEY idx_users_full_name (full_name),
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE friend_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sender_id BIGINT UNSIGNED NOT NULL,
  receiver_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending', 'accepted', 'rejected', 'blocked') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_friend_requests_pair (sender_id, receiver_id),
  KEY idx_friend_requests_receiver (receiver_id),
  KEY idx_friend_requests_sender (sender_id),
  CONSTRAINT fk_friend_requests_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_friend_requests_receiver FOREIGN KEY (receiver_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE friends (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user1_id BIGINT UNSIGNED NOT NULL,
  user2_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_friends_pair (user1_id, user2_id),
  KEY idx_friends_user1 (user1_id),
  KEY idx_friends_user2 (user2_id),
  CONSTRAINT fk_friends_user1 FOREIGN KEY (user1_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_friends_user2 FOREIGN KEY (user2_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type ENUM('private', 'group') NOT NULL,
  name VARCHAR(120) DEFAULT NULL,
  avatar VARCHAR(255) DEFAULT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_conversations_type (type),
  KEY idx_conversations_created_by (created_by),
  CONSTRAINT fk_conversations_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE conversation_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('admin', 'member') NOT NULL DEFAULT 'member',
  joined_at DATETIME NOT NULL,
  last_read_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_conversation_member (conversation_id, user_id),
  KEY idx_conversation_members_conversation (conversation_id),
  KEY idx_conversation_members_user (user_id),
  CONSTRAINT fk_conversation_members_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  type ENUM('text', 'image', 'video', 'audio', 'file', 'sticker') NOT NULL DEFAULT 'text',
  content TEXT,
  file_url VARCHAR(500) DEFAULT NULL,
  reply_to_id BIGINT UNSIGNED DEFAULT NULL,
  is_edited TINYINT(1) NOT NULL DEFAULT 0,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_messages_conversation_created (conversation_id, created_at),
  KEY idx_messages_sender (sender_id),
  KEY idx_messages_reply_to (reply_to_id),
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_reply_to FOREIGN KEY (reply_to_id) REFERENCES messages (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE message_reactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  emoji VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_message_reaction (message_id, user_id),
  KEY idx_message_reactions_message (message_id),
  KEY idx_message_reactions_user (user_id),
  CONSTRAINT fk_message_reactions_message FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
  CONSTRAINT fk_message_reactions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE message_read_receipts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  read_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_message_read_receipt (message_id, user_id),
  KEY idx_message_read_receipts_user (user_id),
  CONSTRAINT fk_message_read_receipts_message FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
  CONSTRAINT fk_message_read_receipts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL,
  reference_id BIGINT UNSIGNED DEFAULT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_notifications_user_read_created (user_id, is_read, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blocked_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  blocker_id BIGINT UNSIGNED NOT NULL,
  blocked_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_blocked_pair (blocker_id, blocked_id),
  KEY idx_blocked_users_blocked (blocked_id),
  CONSTRAINT fk_blocked_users_blocker FOREIGN KEY (blocker_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_blocked_users_blocked FOREIGN KEY (blocked_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  media_url VARCHAR(500) NOT NULL,
  type ENUM('image', 'video') NOT NULL,
  caption VARCHAR(500) DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_stories_user_expires (user_id, expires_at),
  CONSTRAINT fk_stories_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE story_views (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  story_id BIGINT UNSIGNED NOT NULL,
  viewer_id BIGINT UNSIGNED NOT NULL,
  viewed_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_story_view (story_id, viewer_id),
  KEY idx_story_views_viewer (viewer_id),
  CONSTRAINT fk_story_views_story FOREIGN KEY (story_id) REFERENCES stories (id) ON DELETE CASCADE,
  CONSTRAINT fk_story_views_viewer FOREIGN KEY (viewer_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
