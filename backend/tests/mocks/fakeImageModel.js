/**
 * In-memory stand-in for the Knex-backed Image model, used by
 * controller integration tests so they don't need a real Postgres
 * instance. Mirrors the user-scoped signatures of Image.js.
 */
const store = new Map();

const fakeImageModel = {
  async create(data) {
    const row = { ...data, created_at: new Date(), updated_at: new Date() };
    store.set(data.id, row);
    return row;
  },

  async findAll(userId, { status, limit = 50, offset = 0 } = {}) {
    let rows = [...store.values()].filter((r) => r.user_id === userId);
    if (status) rows = rows.filter((r) => r.status === status);
    rows.sort((a, b) => b.created_at - a.created_at);
    return rows.slice(offset, offset + limit);
  },

  async findById(id, userId) {
    const row = store.get(id);
    return row && row.user_id === userId ? row : undefined;
  },

  async findByIds(ids, userId) {
    return ids.map((id) => store.get(id)).filter((row) => row && row.user_id === userId);
  },

  async update(id, userId, data) {
    const existing = store.get(id);
    if (!existing || existing.user_id !== userId) return undefined;
    const updated = { ...existing, ...data, updated_at: new Date() };
    store.set(id, updated);
    return updated;
  },

  async delete(id, userId) {
    const existing = store.get(id);
    if (!existing || existing.user_id !== userId) return 0;
    return store.delete(id) ? 1 : 0;
  },

  async getAllPhashes(userId) {
    return [...store.values()]
      .filter((r) => r.user_id === userId && r.phash && r.status !== 'rejected')
      .map((r) => ({ id: r.id, phash: r.phash }));
  },

  async countByStatus(userId) {
    const counts = {};
    for (const r of store.values()) {
      if (r.user_id !== userId) continue;
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
    return Object.entries(counts).map(([status, count]) => ({ status, count: String(count) }));
  },

  async claimOrphaned(userId) {
    let claimed = 0;
    for (const row of store.values()) {
      if (row.user_id == null) {
        row.user_id = userId;
        claimed++;
      }
    }
    return claimed;
  },

  /** Test-only helpers */
  __reset() {
    store.clear();
  },
  __store: store,
};

module.exports = fakeImageModel;
