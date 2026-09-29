const AsyncQueue = require('../utils/AsyncQueue');

const CONCURRENCY = parseInt(process.env.UPLOAD_CONCURRENCY, 10) || 3;

/**
 * Shared queue for background image processing jobs.
 * Bounds how many sharp/face-api pipelines run at once, independent
 * of how many files were in a single upload request.
 */
module.exports = new AsyncQueue(CONCURRENCY);
