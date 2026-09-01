const multer = require('multer');
const path = require('path');

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB) || 20;
const ALLOWED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif'];

/**
 * Multer storage: in-memory so we can process the buffer before uploading to S3.
 * multer v2 uses multer.memoryStorage() as a standalone call.
 */
const storage = multer.memoryStorage();

/**
 * Multer file filter — reject unsupported types before they even hit the controller.
 * multer v2: fileFilter receives (req, file, cb) same as v1.
 */
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  const mimeOk = ALLOWED_MIMES.includes(mime);
  const extOk = ALLOWED_EXTENSIONS.includes(ext);

  if (mimeOk || extOk) {
    cb(null, true);
  } else {
    const err = new Error(
      `Unsupported file type. Allowed formats: JPG, JPEG, PNG, HEIC. Got: ${file.mimetype}`
    );
    err.code = 'UNSUPPORTED_FILE_TYPE';
    cb(err, false);
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 10, // max 10 files per request
  },
});

module.exports = upload;
