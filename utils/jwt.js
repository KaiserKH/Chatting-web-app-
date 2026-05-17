const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');

const revokedRefreshTokens = new Set();

function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m'
  });
}

function signRefreshToken(payload) {
  const jti = randomUUID();
  const token = jwt.sign({ ...payload, jti }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });

  return { token, jti };
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

  if (revokedRefreshTokens.has(decoded.jti)) {
    const error = new Error('Refresh token has been revoked');
    error.statusCode = 401;
    throw error;
  }

  return decoded;
}

function revokeRefreshToken(token) {
  if (!token) {
    return;
  }

  try {
    const decoded = jwt.decode(token);
    if (decoded && decoded.jti) {
      revokedRefreshTokens.add(decoded.jti);
    }
  } catch (error) {
    return;
  }
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  revokeRefreshToken
};
