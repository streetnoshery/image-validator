const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { storageClient, STORAGE_BUCKET } = require('../config/storage');
const logger = require('../config/logger');

const ENDPOINT = process.env.STORAGE_ENDPOINT || 'http://localhost:9000';

/**
 * Public URL for a stored object.
 * MinIO path-style: http://localhost:9000/<bucket>/<key>
 */
function buildPublicUrl(key) {
  return `${ENDPOINT}/${STORAGE_BUCKET}/${key}`;
}

/**
 * Upload a buffer to MinIO.
 * @param {Buffer} buffer
 * @param {string} key
 * @param {string} mimeType
 * @param {object} [metadata]
 * @returns {Promise<string>} public URL
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
  const url = buildPublicUrl(key);
  logger.debug(`Stored: ${key}`);
  return url;
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

module.exports = { uploadFile, deleteFile, buildPublicUrl };
