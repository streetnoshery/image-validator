const db = require('../config/database');

const TABLE = 'images';

/**
 * Image model — thin data-access layer over Knex.
 */
const Image = {
  /**
   * Insert a new image record and return it.
   * @param {object} data
   * @returns {Promise<object>}
   */
  async create(data) {
    const [row] = await db(TABLE).insert(data).returning('*');
    return row;
  },

  /**
   * Fetch all images ordered by creation date (newest first).
   * Optionally filter by status.
   * @param {{ status?: string, limit?: number, offset?: number }} opts
   * @returns {Promise<object[]>}
   */
  async findAll({ status, limit = 50, offset = 0 } = {}) {
    const query = db(TABLE).orderBy('created_at', 'desc').limit(limit).offset(offset);
    if (status) query.where({ status });
    return query;
  },

  /**
   * Find a single image by id.
   * @param {string} id
   * @returns {Promise<object|undefined>}
   */
  async findById(id) {
    return db(TABLE).where({ id }).first();
  },

  /**
   * Find multiple images by id — used by the upload-status polling
   * endpoint so the frontend can check on a whole batch in one request.
   * @param {string[]} ids
   * @returns {Promise<object[]>}
   */
  async findByIds(ids) {
    if (!ids || ids.length === 0) return [];
    return db(TABLE).whereIn('id', ids);
  },

  /**
   * Update fields on a single image, return the updated record.
   * @param {string} id
   * @param {object} data
   * @returns {Promise<object>}
   */
  async update(id, data) {
    const [row] = await db(TABLE).where({ id }).update(data).returning('*');
    return row;
  },

  /**
   * Delete an image record.
   * @param {string} id
   * @returns {Promise<number>} rows deleted
   */
  async delete(id) {
    return db(TABLE).where({ id }).delete();
  },

  /**
   * Retrieve all stored perceptual hashes (for similarity comparison).
   * Only returns accepted images to avoid polluting with previously rejected ones.
   * @returns {Promise<Array<{id: string, phash: string}>>}
   */
  async getAllPhashes() {
    return db(TABLE).whereNotNull('phash').whereNot({ status: 'rejected' }).select('id', 'phash');
  },

  /**
   * Count images grouped by status — useful for dashboard stats.
   * @returns {Promise<Array<{status: string, count: string}>>}
   */
  async countByStatus() {
    return db(TABLE).select('status').count('* as count').groupBy('status');
  },
};

module.exports = Image;
