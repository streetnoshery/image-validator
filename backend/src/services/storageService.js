const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { storageClient, STORAGE_BUCKET } = require('../config/storage');
const logger = require('../config/logger');

const DEFAULT_PRESIGN_TTL_SECONDS = 15 * 60; // 15 minutes

/**
 * Upload a buffer to MinIO.
 * @param {Buffer} buffer
 * @param {string} key
 * @param {string} mimeType
 * @param {object} [metadata]
 * @returns {Promise<string>} the key (callers already have it — returned
 *   for convenience/logging, not as a usable URL: the bucket is private)
 */
async function uploadFile(buffer, key, mimeType, metadata = {}) {
  await storageClient.send(
    new PutObjectCommand({
      Bucket: STORAGE_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      Metadata: metadata,
    })
  );
  logger.debug(`Stored: ${key}`);
  return key;
}

/**
 * Delete a file from MinIO.
 * @param {string} key
 */
async function deleteFile(key) {
  await storageClient.send(
    new DeleteObjectCommand({ Bucket: STORAGE_BUCKET, Key: key })
  );
  logger.debug(`Deleted: ${key}`);
}

/**
 * Generate a short-lived, signed GET URL for a private object. The
 * bucket has no public/anonymous read policy — this is the only way to
 * view a stored image, and it's minted fresh on every read endpoint
 * response rather than persisted, so access can't outlive the request
 * that legitimately asked for it (scoped by requireAuth + Image model's
 * per-user queries upstream of this call).
 * @param {string} key
 * @param {number} [expiresInSeconds]
 * @returns {Promise<string>}
 */
async function getPresignedUrl(key, expiresInSeconds = DEFAULT_PRESIGN_TTL_SECONDS) {
  const command = new GetObjectCommand({ Bucket: STORAGE_BUCKET, Key: key });
  return getSignedUrl(storageClient, command, { expiresIn: expiresInSeconds });
}

module.exports = { uploadFile, deleteFile, getPresignedUrl };
