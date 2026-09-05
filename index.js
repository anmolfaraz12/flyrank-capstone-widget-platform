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

// --- Walking skeleton endpoint: create a widget ---
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