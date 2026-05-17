const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { imageUpload, videoUpload, audioUpload, fileUpload } = require('../middleware/upload');
const { uploadHandler } = require('../controllers/uploadController');

const router = express.Router();

router.use(authenticateToken);
router.post('/image', imageUpload.single('file'), uploadHandler);
router.post('/video', videoUpload.single('file'), uploadHandler);
router.post('/audio', audioUpload.single('file'), uploadHandler);
router.post('/file', fileUpload.single('file'), uploadHandler);

module.exports = router;
