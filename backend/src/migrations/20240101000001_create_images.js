/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('images', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('original_filename', 255).notNullable();
    table.string('stored_filename', 255).notNullable();
    table.string('s3_key', 512).notNullable();
    table.string('s3_url', 1024).notNullable();
    table.string('mime_type', 100).notNullable();
    table.bigInteger('file_size').notNullable(); // bytes
    table.integer('width').nullable();
    table.integer('height').nullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    // status: pending | accepted | rejected | processing
    table.specificType('rejection_reasons', 'text[]').nullable();
    // image hash for similarity detection (perceptual hash as hex string)
    table.string('phash', 64).nullable();
    table.float('blur_score').nullable();
    table.integer('face_count').nullable();
    table.jsonb('metadata').nullable(); // extra EXIF or processing data
    table.timestamps(true, true);
    table.index('status');
    table.index('phash');
    table.index('created_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('images');
};
