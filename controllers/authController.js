const bcrypt = require('bcryptjs');
const { query } = require('../models/db');
const { signAccessToken, signRefreshToken, revokeRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const isProduction = process.env.NODE_ENV === 'production';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: isProduction ? 'strict' : 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

function issueTokens(user) {
  const payload = { id: user.id, username: user.username, email: user.email };
  const accessToken = signAccessToken(payload);
  const { token: refreshToken } = signRefreshToken(payload);

  return { accessToken, refreshToken };
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    bio: user.bio,
    status: user.status,
    last_seen_at: user.last_seen_at,
    is_verified: !!user.is_verified,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

async function register(req, res) {
  try {
    const { username, full_name = '', email, phone, password } = req.body;

    if (!username || !email || !phone || !password) {
      return res.status(400).json({ error: 'username, email, phone, and password are required' });
    }

    const existing = await query(
      'SELECT id FROM users WHERE username = ? OR email = ? OR phone = ?',
      [username, email, phone]
    );

    if (existing.length) {
      return res.status(409).json({ error: 'Username, email, or phone already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users (username, full_name, email, phone, password_hash, avatar, bio, status, is_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())',
      [username, full_name, email, phone, passwordHash, '/uploads/default-avatar.svg', '', 'offline']
    );

    const userRows = await query(
      'SELECT id, username, full_name, email, phone, avatar, bio, status, last_seen_at, is_verified, created_at, updated_at FROM users WHERE id = ?',
      [result.insertId]
    );

    const user = userRows[0];
    const tokens = issueTokens(user);

    res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions());

    return res.status(201).json({
      message: 'Registration successful',
      user: publicUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function login(req, res) {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'identifier and password are required' });
    }

    const rows = await query(
      'SELECT id, username, full_name, email, phone, password_hash, avatar, bio, status, last_seen_at, is_verified, created_at, updated_at FROM users WHERE email = ? OR username = ? LIMIT 1',
      [identifier, identifier]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const tokens = issueTokens(user);
    res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions());

    return res.json({
      message: 'Login successful',
      user: publicUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function logout(req, res) {
  try {
    const token = req.body.refreshToken || req.cookies.refreshToken;
    if (token) {
      revokeRefreshToken(token);
    }

    res.clearCookie('refreshToken');
    return res.json({ message: 'Logout successful' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function refresh(req, res) {
  try {
    const token = req.body.refreshToken || req.cookies.refreshToken;
    if (!token) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = verifyRefreshToken(token);
    revokeRefreshToken(token);

    const rows = await query(
      'SELECT id, username, full_name, email, phone, avatar, bio, status, last_seen_at, is_verified, created_at, updated_at FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = rows[0];
    const tokens = issueTokens(user);
    res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions());

    return res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: publicUser(user)
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
}

async function me(req, res) {
  return res.json({ user: publicUser(req.user) });
}

module.exports = {
  register,
  login,
  logout,
  refresh,
  me,
  publicUser
};
