/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.alterTable('images', (table) => {
    // Nullable: pre-existing rows from before auth existed have no owner.
    // They're excluded from every user-scoped query until claimed — see
    // POST /api/images/claim, which lets a logged-in user adopt them.
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('CASCADE');
    table.index('user_id');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('images', (table) => {
    table.dropColumn('user_id');
  });
  await knex.schema.dropTableIfExists('users');
};
