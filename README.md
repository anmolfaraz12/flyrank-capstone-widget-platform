markdown
# FlyRank Capstone — Embeddable Widget & Lead-Capture Platform

Let a customer define a widget, hand them one line of `<script>`, and safely
catch everything the public internet throws back — validated, spam-filtered,
enriched, and dashboarded.

## What this is

This is a self-hosted lead-capture platform. A customer (tenant) creates a
widget (a signup form / CTA / popover) through an authenticated dashboard
API, gets back a single `<script>` embed snippet, and pastes it into any
website. When a visitor on that external site fills out the form, the
submission travels back to this backend, where it is:

- validated (rejecting malformed or oversized payloads)
- protected against abuse (per-IP and per-widget rate limiting + a honeypot
  spam check)
- enriched with geo data from the visitor's IP (with a provider fallback
  chain)
- stored safely (linked to the correct tenant and widget)
- exposed back to the widget owner through a dashboard API with basic
  analytics

The three request paths (owner management, public widget delivery, public
submission) are kept fully separate, as shown below.

## Architecture
Widget Owner (authenticated, Supabase JWT)
|
v
Widget Management API ---> Postgres (tenants / widgets / submissions)
(POST/GET/PUT/DELETE /widgets) tenant-isolated on every query
|
v
Embed snippet returned to owner

<script src=".../widget.v1.js?id=WIDGET_ID"></script>
Customer Website (any origin, e.g. localhost:5500)
|
v
GET /widget.v1.js (public, long-cache, versioned bundle)
|
v
GET /widgets/:id/config (public, short-cache, CORS enabled)
|
v
Widget renders on the page

Website Visitor
|
v
POST /widgets/:id/submissions (public, CORS + preflight handled)
|
|-- Zod validation -------- bad payload? --> 4xx, JSON error, never 500
|-- Rate limit (per-IP 20/min, per-widget 60/min) -- burst? --> 429
|-- Honeypot check (_hp field filled) -- bot? --> is_spam = true, still 201
|-- Geo enrichment: ip-api.com --(fails)--> ipapi.co --(fails)--> nulls
|-- Store submission (never blocks on the steps above)
|-- Safe side effect: confirmation email (try/catch, failure never
blocks the 201 response)

Widget Owner (authenticated)
|
v
Dashboard API
GET /dashboard/widgets/:id/submissions (excludes spam by default)
GET /dashboard/widgets/:id/stats (valid/spam counts, by_day,
by_country)


## Data model

- **tenants** — one row per customer/account
- **widgets** — belongs to a tenant; type (signup form / CTA / popover),
  title, description, form field config, button text, display options
- **submissions** — belongs to a widget (and therefore a tenant); raw form
  data, `is_spam` flag, geo fields (country/city/etc, nullable), timestamps

Every query that touches `widgets` or `submissions` filters by the
authenticated tenant's ID — this is what makes tenant isolation real instead
of just a UI convention.

## Tech stack

- Node.js + Express
- PostgreSQL (via Docker, port `5433`)
- Supabase Auth (JWT-based authentication for the owner/dashboard routes)
- Zod for request validation
- `express-rate-limit` for abuse protection
- Vanilla JS for the embeddable widget bundle (no framework, keeps it small
  and dependency-free for the customer's site)

## Setup & run (clean machine)

### Prerequisites

- Node.js installed
- Docker Desktop installed and running
- A free Supabase project (for Auth only)

### 1. Clone the repo

```powershell
git clone https://github.com/<your-username>/flyrank-capstone-widget-platform.git
cd flyrank-capstone-widget-platform
```

### 2. Install dependencies

```powershell
npm install
```

### 3. Configure environment variables

Copy the example file and fill in real values:

```powershell
Copy-Item .env.example .env
```

Open `.env` and fill in:

- `DATABASE_URL` — Postgres connection string (port `5433`)
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — from your Supabase project settings
- any other keys listed in `.env.example`

**Note:** `.env` never hot-reloads. Restart `node index.js` after any change
to this file.

### 4. Start Postgres via Docker

```powershell
docker compose up -d
```

This starts Postgres on port `5433` (chosen deliberately to avoid clashing
with any other local Postgres instance).

### 5. Seed the database

```powershell
node seed.js
```

(This creates a demo tenant and a demo widget so the system is usable
immediately — see `capstone.yaml` for the exact seed command the evaluator
will run.)

### 6. Start the API server

```powershell
node index.js
```

The API runs at `http://localhost:4000` by default.

### 7. Get an auth token (for testing authenticated routes)

```powershell
node getToken.js
$token = Get-Content token.txt -Raw
```

Supabase tokens expire after roughly 1 hour. If you see "Invalid or expired
token", just re-run the two commands above.

### 8. Serve the customer test page (second origin)

In a **separate** terminal:

```powershell
npx serve -p 5500
```

Then open `http://localhost:5500/customer-site.html` in a browser. This page
is served from a different origin (port `5500`) than the API (port `4000`),
which is what proves the cross-origin embed genuinely works.

## API overview

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/widgets` | required | create a widget |
| GET | `/widgets` | required | list own widgets |
| GET | `/widgets/:id` | required | get one widget |
| PUT | `/widgets/:id` | required | update a widget |
| DELETE | `/widgets/:id` | required | delete a widget |
| GET | `/widgets/:id/config` | public | widget config for rendering (cached) |
| POST | `/widgets/:id/submissions` | public | visitor form submission (CORS, rate-limited) |
| GET | `/widget.v1.js` | public | the embeddable JS bundle (long-cache) |
| GET | `/dashboard/widgets/:id/submissions` | required | list submissions (spam excluded by default) |
| GET | `/dashboard/widgets/:id/stats` | required | aggregate stats (valid/spam counts, by day, by country) |

## Testing / proof

Every requirement from the capstone brief's Definition of Done is proven
with a real command/output in `EVIDENCE.md`, including:

- honeypot rejection (proven via direct DB check)
- oversized payload → `413`
- rate-limit burst → `429` after the threshold, normal traffic still served
- safe side-effect failure → submission still returns `201` even when the
  email step throws
- deterministic geo fallback chain (`testGeoFallback.js`, mocked `fetch`,
  all 3 scenarios covered)
- real cross-origin embed test in a browser (`customer-site.html`)

## Limitations

- The widget UI is functional and lightly styled (custom CSS, no
  framework) — the grading surface for this capstone is the backend
  logic, not the visual design.
- Email is a safe side effect only — no real SMTP provider is wired up;
  failure/success of the "send" step is what's tested, not real delivery.
- Only local/Docker Postgres is used; no managed hosting is required for
  this project to be considered complete.
- Geo enrichment uses two free, keyless IP-geolocation APIs
  (`ip-api.com`, `ipapi.co`) — both have modest free-tier rate limits, which
  is exactly why the fallback chain and deterministic mock-based proof
  exist.
- Not deployed to a public URL by default (this is optional per the brief);
  everything is designed to run correctly on `localhost`.

## AI usage

See `BUILDLOG.md` for an honest log of where AI tools were used during
development, what they got wrong, and what was changed as a result.