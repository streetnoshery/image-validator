const db = require('../config/database');

const TABLE = 'users';

const User = {
  /**
   * @param {{ email: string, password_hash: string }} data
   * @returns {Promise<object>}
   */
  async create(data) {
    const [row] = await db(TABLE)
      .insert({ email: data.email.toLowerCase(), password_hash: data.password_hash })
      .returning(['id', 'email', 'created_at']);
    return row;
  },

  /**
   * Includes password_hash — only for use during login's password check.
   * @param {string} email
   */
  async findByEmailWithPassword(email) {
    return db(TABLE).where({ email: email.toLowerCase() }).first();
  },

  /**
   * @param {string} id
   * @returns {Promise<object|undefined>} without password_hash
   */
  async findById(id) {
    return db(TABLE).where({ id }).select('id', 'email', 'created_at').first();
  },
};

module.exports = User;
