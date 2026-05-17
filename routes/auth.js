const express = require('express');
const { authRateLimiter } = require('../middleware/rateLimiter');
const { authenticateToken } = require('../middleware/auth');
const { register, login, logout, refresh, me } = require('../controllers/authController');

const router = express.Router();

router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.post('/logout', authRateLimiter, logout);
router.post('/refresh', authRateLimiter, refresh);
router.get('/me', authenticateToken, me);

module.exports = router;
