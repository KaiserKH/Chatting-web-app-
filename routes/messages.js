const express = require('express');
const { authenticateToken, sanitizeInput, checkConversationMember } = require('../middleware/auth');
const {
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  reactMessage,
  getReactions,
  markMessageRead
} = require('../controllers/messagesController');

const router = express.Router();

router.use(authenticateToken);
router.get('/:id/reactions', getReactions);
router.get('/conversation/:id', checkConversationMember, listMessages);
router.post('/conversation/:id', sanitizeInput, checkConversationMember, sendMessage);
router.post('/:id/read', markMessageRead);
router.patch('/:id', sanitizeInput, editMessage);
router.delete('/:id', deleteMessage);
router.post('/:id/react', sanitizeInput, reactMessage);

module.exports = router;
