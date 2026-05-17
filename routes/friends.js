const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  unfriend,
  blockUser,
  listFriends,
  listIncomingRequests,
  listSentRequests,
  listSuggestions
} = require('../controllers/friendsController');

const router = express.Router();

router.use(authenticateToken);
router.post('/request/:userId', sendFriendRequest);
router.post('/accept/:requestId', acceptFriendRequest);
router.post('/reject/:requestId', rejectFriendRequest);
router.delete('/:userId', unfriend);
router.post('/block/:userId', blockUser);
router.get('/', listFriends);
router.get('/requests', listIncomingRequests);
router.get('/sent', listSentRequests);
router.get('/suggestions', listSuggestions);

module.exports = router;
