const supabase = require('../supabaseClient');
const { pool } = require('../db');

/**
 * Verifies the Bearer token with Supabase and attaches req.tenant.
 * Also makes sure a matching row exists in our own `tenants` table
 * (creates one on first authenticated request, if missing).
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] === '') {
    return res.status(401).json({ error: 'Access token required' });
  }

  const token = authHeader.split(' ')[1];

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const user = data.user;

  // Make sure a tenants row exists for this Supabase user (first-login upsert)
  await pool.query(
    `INSERT INTO tenants (id, email) VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [user.id, user.email]
  );

  req.tenant = { id: user.id, email: user.email };
  next();
}

module.exports = requireAuth;