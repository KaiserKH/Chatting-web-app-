const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { searchUsers, viewPublicProfile, updateProfile, updatePassword, updateStatus } = require('../controllers/usersController');

const router = express.Router();

router.get('/search', authenticateToken, searchUsers);
router.get('/:username', authenticateToken, viewPublicProfile);
router.patch('/profile', authenticateToken, updateProfile);
router.patch('/password', authenticateToken, updatePassword);
router.patch('/status', authenticateToken, updateStatus);

module.exports = router;
