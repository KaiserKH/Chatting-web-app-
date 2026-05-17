const path = require('path');

function fileUrlFromRequest(req) {
  if (!req.file) {
    return null;
  }

  const relativePath = path.relative(path.join(__dirname, '..', 'public'), req.file.path).split(path.sep).join('/');
  return `/${relativePath}`;
}

function uploadHandler(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'File upload required' });
  }

  return res.json({
    file_url: fileUrlFromRequest(req),
    filename: req.file.filename,
    mimetype: req.file.mimetype,
    size: req.file.size
  });
}

module.exports = {
  uploadHandler,
  fileUrlFromRequest
};
