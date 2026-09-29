const db = require('../config/database');

const TABLE = 'images';

/**
 * Image model — thin data-access layer over Knex.
 *
 * Every read/write that isn't a plain insert takes `userId` and scopes
 * the query to `where user_id = userId` — this is the actual enforcement
 * point for per-user data isolation. There is no "admin" bypass; a
 * missing/wrong userId simply matches nothing (findById/update/delete)
 * or returns an empty page (findAll/findByIds), which the controllers
 * surface as 404s rather than leaking whether another user's row exists.
 */
const Image = {
  /**
   * Insert a new image record and return it. `data.user_id` must already
   * be set by the caller (from req.user.id) — not implicit here, so it's
   * always visible at the call site which user a row is created for.
   * @param {object} data
   * @returns {Promise<object>}
   */
  async create(data) {
    const [row] = await db(TABLE).insert(data).returning('*');
    return row;
  },

  /**
   * Fetch a user's images ordered by creation date (newest first).
   * Optionally filter by status.
   * @param {string} userId
   * @param {{ status?: string, limit?: number, offset?: number }} opts
   * @returns {Promise<object[]>}
   */
  async findAll(userId, { status, limit = 50, offset = 0 } = {}) {
    const query = db(TABLE)
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
    if (status) query.andWhere({ status });
    return query;
  },

  /**
   * Find a single image by id, scoped to its owner.
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<object|undefined>}
   */
  async findById(id, userId) {
    return db(TABLE).where({ id, user_id: userId }).first();
  },

  /**
   * Find multiple images by id, scoped to their owner — used by the
   * upload-status polling endpoint so the frontend can check on a whole
   * batch in one request without leaking other users' rows for ids they
   * don't actually own.
   * @param {string[]} ids
   * @param {string} userId
   * @returns {Promise<object[]>}
   */
  async findByIds(ids, userId) {
    if (!ids || ids.length === 0) return [];
    return db(TABLE).whereIn('id', ids).andWhere({ user_id: userId });
  },

  /**
   * Update fields on a single image (scoped to its owner), return the
   * updated record — or undefined if no row matched (wrong id OR not
   * owned by userId).
   * @param {string} id
   * @param {string} userId
   * @param {object} data
   * @returns {Promise<object|undefined>}
   */
  async update(id, userId, data) {
    const [row] = await db(TABLE).where({ id, user_id: userId }).update(data).returning('*');
    return row;
  },

  /**
   * Delete an image record, scoped to its owner.
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<number>} rows deleted
   */
  async delete(id, userId) {
    return db(TABLE).where({ id, user_id: userId }).delete();
  },

  /**
   * Retrieve a user's own stored perceptual hashes (for similarity
   * comparison) — duplicate detection is per-user, not global, so one
   * user's upload can never be rejected (or have its existence implied)
   * because it resembles a different user's private photo.
   * Only returns accepted images to avoid polluting with previously rejected ones.
   * @param {string} userId
   * @returns {Promise<Array<{id: string, phash: string}>>}
   */
  async getAllPhashes(userId) {
    return db(TABLE)
      .where({ user_id: userId })
      .whereNotNull('phash')
      .whereNot({ status: 'rejected' })
      .select('id', 'phash');
  },

  /**
   * Count a user's images grouped by status — useful for dashboard stats.
   * @param {string} userId
   * @returns {Promise<Array<{status: string, count: string}>>}
   */
  async countByStatus(userId) {
    return db(TABLE).where({ user_id: userId }).select('status').count('* as count').groupBy('status');
  },

  /**
   * Assign every currently-unowned row (from before auth existed) to
   * this user. One-time, idempotent (a row can only be claimed once,
   * by whoever calls this first) — see POST /api/images/claim.
   * @param {string} userId
   * @returns {Promise<number>} rows claimed
   */
  async claimOrphaned(userId) {
    return db(TABLE).whereNull('user_id').update({ user_id: userId });
  },
};

module.exports = Image;
