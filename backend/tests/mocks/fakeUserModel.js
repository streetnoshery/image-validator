/**
 * In-memory stand-in for the Knex-backed User model.
 */
const { randomUUID } = require('crypto');

const store = new Map(); // id -> row
const byEmail = new Map(); // lowercased email -> id

const fakeUserModel = {
  async create({ email, password_hash }) {
    const id = randomUUID();
    const row = { id, email: email.toLowerCase(), password_hash, created_at: new Date() };
    store.set(id, row);
    byEmail.set(row.email, id);
    return { id: row.id, email: row.email, created_at: row.created_at };
  },

  async findByEmailWithPassword(email) {
    const id = byEmail.get(email.toLowerCase());
    return id ? store.get(id) : undefined;
  },

  async findById(id) {
    const row = store.get(id);
    return row ? { id: row.id, email: row.email, created_at: row.created_at } : undefined;
  },

  __reset() {
    store.clear();
    byEmail.clear();
  },
  __store: store,
};

module.exports = fakeUserModel;
