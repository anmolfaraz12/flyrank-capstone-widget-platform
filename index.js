require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');
const { pool, initDb } = require('./db');
const requireAuth = require('./middleware/requireAuth');
const { lookupGeo } = require('./lib/geo');

const app = express();
app.use(express.json({ limit: '10kb' })); // reject oversized payloads at the parser level
app.use(cors()); // reflects the request origin — correct for a public, embeddable widget

const WidgetInputSchema = z.object({
  type: z.enum(['signup_form', 'cta', 'popover']),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  fields: z.array(z.record(z.any())).default([]),
  button_text: z.string().min(1).default('Submit'),
});

// Per-IP limiter: protects the whole submission surface from one flooding client
const perIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});

// Per-widget limiter: protects one popular widget from being flooded from many IPs
const perWidgetLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.params.id,
  message: { error: 'This widget is receiving too many submissions right now' },
});

// --- Create a widget ---
app.post('/widgets', requireAuth, async (req, res) => {
  const parseResult = WidgetInputSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid widget data',
      details: parseResult.error.issues,
    });
  }

  const { type, title, description, fields, button_text } = parseResult.data;

  const result = await pool.query(
    `INSERT INTO widgets (tenant_id, type, title, description, fields, button_text)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [req.tenant.id, type, title, description ?? null, JSON.stringify(fields), button_text]
  );

  res.status(201).json(result.rows[0]);
});

// --- List the caller's own widgets only ---
app.get('/widgets', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM widgets WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [req.tenant.id]
  );
  res.status(200).json(result.rows);
});

// --- Get one widget, only if it belongs to the caller ---
app.get('/widgets/:id', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM widgets WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenant.id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Widget not found' });
  }

  res.status(200).json(result.rows[0]);
});

// --- Update a widget, only if it belongs to the caller ---
app.put('/widgets/:id', requireAuth, async (req, res) => {
  const parseResult = WidgetInputSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid widget data',
      details: parseResult.error.issues,
    });
  }

  const { type, title, description, fields, button_text } = parseResult.data;

  const result = await pool.query(
    `UPDATE widgets
     SET type = $1, title = $2, description = $3, fields = $4, button_text = $5, updated_at = now()
     WHERE id = $6 AND tenant_id = $7
     RETURNING *`,
    [type, title, description ?? null, JSON.stringify(fields), button_text, req.params.id, req.tenant.id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Widget not found' });
  }

  res.status(200).json(result.rows[0]);
});

// --- Delete a widget, only if it belongs to the caller ---
app.delete('/widgets/:id', requireAuth, async (req, res) => {
  const result = await pool.query(
    `DELETE FROM widgets WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [req.params.id, req.tenant.id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Widget not found' });
  }

  res.status(204).send();
});

// ============================================================
// PUBLIC SURFACE — no auth. Called by visitor browsers on any origin.
// ============================================================

// --- Versioned widget bundle — cache forever, since the URL itself changes on release ---
app.get('/widget.v1.js', (req, res) => {
  const bundlePath = path.join(__dirname, 'widget.v1.js');
  res.set('Content-Type', 'application/javascript');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(bundlePath);
});

// --- Public widget config, for the embed script to render the form ---
app.get('/widgets/:id/config', async (req, res) => {
  const result = await pool.query(
    `SELECT id, type, title, description, fields, button_text
     FROM widgets WHERE id = $1 AND is_active = true`,
    [req.params.id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Widget not found' });
  }

  // Short-lived cache: config can change, but doesn't need to be re-fetched every second
  res.set('Cache-Control', 'public, max-age=60');
  res.status(200).json(result.rows[0]);
});

const SubmissionInputSchema = z
  .object({
    _hp: z.string().optional(), // honeypot — real visitors never fill this
  })
  .catchall(z.union([z.string(), z.number(), z.boolean()])); // any other visitor field

// --- Public submission endpoint ---
app.post(
  '/widgets/:id/submissions',
  perIpLimiter,
  perWidgetLimiter,
  async (req, res) => {
    const parseResult = SubmissionInputSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid submission data',
        details: parseResult.error.issues,
      });
    }

    const widgetResult = await pool.query(
      `SELECT id FROM widgets WHERE id = $1 AND is_active = true`,
      [req.params.id]
    );

    if (widgetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Widget not found' });
    }

    const { _hp, ...fieldValues } = parseResult.data;
    const isSpam = Boolean(_hp && _hp.length > 0); // a real visitor never fills the honeypot

    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    let geo = { country: null, city: null };
    if (!isSpam) {
      // Don't bother enriching submissions we already know are spam
      geo = await lookupGeo(ip);
    }

    await pool.query(
      `INSERT INTO submissions (widget_id, data, ip_address, geo_country, geo_city, is_spam)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.params.id, JSON.stringify(fieldValues), ip, geo.country, geo.city, isSpam]
    );

    // Safe side effect: log a "confirmation email" — failure here must never block success
    try {
      console.log(`(email) New submission received for widget ${req.params.id}`);
    } catch (err) {
      console.log('  side-effect (email) failed, submission still succeeds:', err.message);
    }

    // Respond success either way — a bot that filled the honeypot sees nothing different
    res.status(201).json({ received: true });
  }
);

// --- Error handling: oversized/malformed JSON must return a clean 4xx, never crash ---
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log('Server running and connected to Supabase');
    });
  })
  .catch((err) => {
    console.error('Failed to connect to database:', err);
    process.exit(1);
  });