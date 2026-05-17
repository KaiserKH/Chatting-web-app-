const express = require('express');
const { authenticateToken, sanitizeInput, checkConversationMember } = require('../middleware/auth');
const {
  createOrFetchPrivateConversation,
  createGroupConversation,
  listConversations,
  getConversation,
  updateGroupConversation,
  addMembers,
  removeMember,
  leaveConversation
} = require('../controllers/conversationsController');

const router = express.Router();

router.use(authenticateToken);
router.post('/private/:userId', createOrFetchPrivateConversation);
router.post('/group', sanitizeInput, createGroupConversation);
router.get('/', listConversations);
router.get('/:id', checkConversationMember, getConversation);
router.patch('/:id', sanitizeInput, checkConversationMember, updateGroupConversation);
router.post('/:id/members', sanitizeInput, checkConversationMember, addMembers);
router.delete('/:id/members/:userId', checkConversationMember, removeMember);
router.delete('/:id/leave', checkConversationMember, leaveConversation);

module.exports = router;
