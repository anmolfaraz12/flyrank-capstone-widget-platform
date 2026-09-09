const { pool, initDb } = require('./db');
require('dotenv').config();
const supabase = require('./supabaseClient');

const DEMO_EMAIL = 'test@example.com';
const DEMO_PASSWORD = 'password123';

async function main() {
  // 1. Make sure tables exist
  await initDb();

  // 2. Create (or sign in as) the same demo user getToken.js uses
  await supabase.auth.signUp({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });

  if (error || !data?.user) {
    console.error('Could not sign in demo user:', error?.message);
    process.exit(1);
  }

  const tenantId = data.user.id;
  const tenantEmail = data.user.email;

  // 3. Make sure the tenants row exists (same upsert requireAuth.js does)
  await pool.query(
    `INSERT INTO tenants (id, email) VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [tenantId, tenantEmail]
  );

  // 4. Insert a demo widget for this tenant (skip if one already exists)
  const existing = await pool.query(
    `SELECT id FROM widgets WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  );

  let widgetId;

  if (existing.rows.length > 0) {
    widgetId = existing.rows[0].id;
    console.log('Demo widget already exists, reusing it.');
  } else {
    const fields = JSON.stringify([
      { name: 'name', label: 'Your name', type: 'text', required: true },
      { name: 'email', label: 'Your email', type: 'email', required: true },
    ]);

    const result = await pool.query(
      `INSERT INTO widgets (tenant_id, type, title, description, fields, button_text)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        tenantId,
        'signup form',
        'Join our newsletter',
        'Demo widget created by seed.js',
        fields,
        'Sign up',
      ]
    );
    widgetId = result.rows[0].id;
    console.log('Created demo widget.');
  }

  console.log('--- Seed complete ---');
  console.log('Demo tenant email:', tenantEmail);
  console.log('Demo tenant id:   ', tenantId);
  console.log('Demo widget id:   ', widgetId);
  console.log('Get a token for this tenant with: node getToken.js');

  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});