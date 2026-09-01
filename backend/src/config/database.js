require('dotenv').config();
const knex = require('knex');
const path = require('path');

const db = knex({
  client: 'pg',
  connection: {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 5433,
    database: process.env.DB_NAME     || 'image_validator',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  migrations: {
    directory: path.join(__dirname, '../migrations'),
  },
  pool: { min: 2, max: 10 },
});

module.exports = db;
