const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadRoot = path.join(__dirname, '..', 'public', 'uploads');
const uploadLimits = {
  image: 10 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  file: 50 * 1024 * 1024
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function createStorage(folder) {
  const destination = path.join(uploadRoot, folder);
  ensureDir(destination);

  return multer.diskStorage({
    destination: (req, file, callback) => callback(null, destination),
    filename: (req, file, callback) => {
      const timestamp = Date.now();
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      callback(null, `${timestamp}-${safeName}`);
    }
  });
}

function validateFileType(allowedMimeTypes) {
  return (req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(new Error('Unsupported file type'));
    }
    callback(null, true);
  };
}

function createUploader({ folder, allowedMimeTypes, limit }) {
  return multer({
    storage: createStorage(folder),
    limits: { fileSize: limit },
    fileFilter: validateFileType(allowedMimeTypes)
  });
}

const imageUpload = createUploader({
  folder: 'images',
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  limit: uploadLimits.image
});

const videoUpload = createUploader({
  folder: 'videos',
  allowedMimeTypes: ['video/mp4', 'video/quicktime'],
  limit: uploadLimits.video
});

const audioUpload = createUploader({
  folder: 'audio',
  allowedMimeTypes: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav'],
  limit: uploadLimits.audio
});

const fileUpload = createUploader({
  folder: 'files',
  allowedMimeTypes: [
    'application/pdf',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ],
  limit: uploadLimits.file
});

module.exports = {
  imageUpload,
  videoUpload,
  audioUpload,
  fileUpload,
  validateFileType,
  uploadLimits
};
