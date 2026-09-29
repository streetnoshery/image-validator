/**
 * In-memory stand-in for the Knex-backed Image model, used by the
 * controller integration test so it doesn't need a real Postgres
 * instance. Mirrors the subset of Image.js the controller calls.
 */
const store = new Map();

const fakeImageModel = {
  async create(data) {
    const row = { ...data, created_at: new Date(), updated_at: new Date() };
    store.set(data.id, row);
    return row;
  },

  async findAll({ status, limit = 50, offset = 0 } = {}) {
    let rows = [...store.values()];
    if (status) rows = rows.filter((r) => r.status === status);
    rows.sort((a, b) => b.created_at - a.created_at);
    return rows.slice(offset, offset + limit);
  },

  async findById(id) {
    return store.get(id);
  },

  async findByIds(ids) {
    return ids.map((id) => store.get(id)).filter(Boolean);
  },

  async update(id, data) {
    const existing = store.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, updated_at: new Date() };
    store.set(id, updated);
    return updated;
  },

  async delete(id) {
    return store.delete(id) ? 1 : 0;
  },

  async getAllPhashes() {
    return [...store.values()]
      .filter((r) => r.phash && r.status !== 'rejected')
      .map((r) => ({ id: r.id, phash: r.phash }));
  },

  async countByStatus() {
    const counts = {};
    for (const r of store.values()) counts[r.status] = (counts[r.status] || 0) + 1;
    return Object.entries(counts).map(([status, count]) => ({ status, count: String(count) }));
  },

  /** Test-only helpers */
  __reset() {
    store.clear();
  },
  __store: store,
};

module.exports = fakeImageModel;
