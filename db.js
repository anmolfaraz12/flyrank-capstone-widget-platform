require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDb() {
  // Must run first — gen_random_uuid() below depends on this extension
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS widgets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      fields JSONB NOT NULL DEFAULT '[]',
      button_text TEXT NOT NULL DEFAULT 'Submit',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_widgets_tenant_id ON widgets(tenant_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      widget_id UUID NOT NULL REFERENCES widgets(id),
      data JSONB NOT NULL,
      ip_address TEXT,
      geo_country TEXT,
      geo_city TEXT,
      is_spam BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_submissions_widget_id ON submissions(widget_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);
  `);
}

module.exports = { pool, initDb };