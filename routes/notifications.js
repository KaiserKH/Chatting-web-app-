const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { listNotifications, markRead, markAllRead } = require('../controllers/notificationsController');

const router = express.Router();

router.use(authenticateToken);
router.get('/', listNotifications);
router.patch('/:id/read', markRead);
router.patch('/read-all', markAllRead);

module.exports = router;
