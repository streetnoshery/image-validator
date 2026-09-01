const { S3Client } = require('@aws-sdk/client-s3');

/**
 * MinIO client — S3-compatible local object storage.
 * Runs via Docker (see docker-compose.yml). No AWS account needed.
 *
 * Web console: http://localhost:9001  (minioadmin / minioadmin)
 * S3 API:      http://localhost:9000
 */
const storageClient = new S3Client({
  region: 'us-east-1',           // MinIO ignores this but the SDK requires it
  endpoint: process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
  forcePathStyle: true,          // MinIO requires path-style: host/bucket/key
  credentials: {
    accessKeyId:     process.env.STORAGE_ACCESS_KEY  || 'minioadmin',
    secretAccessKey: process.env.STORAGE_SECRET_KEY  || 'minioadmin',
  },
});

const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'images';

module.exports = { storageClient, STORAGE_BUCKET };
