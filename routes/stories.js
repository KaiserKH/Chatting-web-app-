const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  createStory,
  getStoriesFeed,
  getUserStories,
  viewStory,
  getStoryViews,
  deleteStory
} = require('../controllers/storiesController');

const router = express.Router();

router.use(authenticateToken);
router.post('/', createStory);
router.get('/feed', getStoriesFeed);
router.get('/:userId', getUserStories);
router.post('/:id/view', viewStory);
router.get('/:id/views', getStoryViews);
router.delete('/:id', deleteStory);

module.exports = router;
