require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { z } = require('zod');
const { pool, initDb } = require('./db');
const requireAuth = require('./middleware/requireAuth');

const app = express();
app.use(express.json());
app.use(cors());

const WidgetInputSchema = z.object({
  type: z.enum(['signup_form', 'cta', 'popover']),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  fields: z.array(z.record(z.any())).default([]),
  button_text: z.string().min(1).default('Submit'),
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