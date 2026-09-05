# Design Document — Embeddable Widget & Lead-Capture Platform

## 1. The problem

Let a customer (tenant) create a widget (signup form, CTA, or popover), embed it on
any website with one `<script>` tag, and safely collect submissions from visitors —
even though those submissions come from browsers and origins the platform doesn't
control.

## 2. Data model

### `tenants`
Authentication is handled by **Supabase Auth** (reused from A4). Supabase's own
`auth.users` table is the source of truth for identity; our database keeps a thin
`tenants` row per Supabase user so we can attach app-specific data.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Same as the Supabase `auth.users.id` |
| `email` | text | Mirrored from Supabase for convenience |
| `created_at` | timestamptz | |

### `widgets`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `tenant_id` | uuid (FK → tenants.id) | **Indexed** — every "list my widgets" query filters on this |
| `type` | text | `signup_form` \| `cta` \| `popover` |
| `title` | text | |
| `description` | text \| null | |
| `fields` | jsonb | Form field definitions, e.g. `[{"name":"email","type":"email","required":true}]` |
| `button_text` | text | |
| `is_active` | boolean | Default `true` — lets an owner disable a widget without deleting it |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `submissions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `widget_id` | uuid (FK → widgets.id) | **Indexed** — every dashboard query filters on this |
| `data` | jsonb | Whatever the visitor submitted, keyed by field name. Never includes the honeypot value itself — that's checked and discarded, not stored. |
| `ip_address` | text | |
| `geo_country` | text \| null | Null if all geo providers failed |
| `geo_city` | text \| null | |
| `is_spam` | boolean | Default `false` — set by the honeypot/spam check |
| `created_at` | timestamptz | **Indexed** — dashboard "counts over time" queries filter/sort on this |

**Tenant isolation rule:** every query on `widgets` or `submissions` (via the join
through `widget_id → widgets.tenant_id`) is scoped by the authenticated tenant's id.
No endpoint ever accepts a `tenant_id` from the client — it always comes from the
verified JWT.

## 3. The embed flow

```
1. Owner creates a widget (authenticated)
   → POST /widgets → { id: "abc123", ... }

2. Owner copies the embed snippet:
   <script src="https://api.example.com/widget.v1.js?id=abc123"></script>

3. Visitor's browser loads that script (public, cached, cross-origin)
   → script fetches GET /widgets/abc123/config (public, cached, CORS)
   → renders the form based on the config

4. Visitor fills the form and submits
   → POST /widgets/abc123/submissions (public, CORS, validated, rate-limited)
   → enrichment (geo) → stored → safe side effect (email log)

5. Owner views results (authenticated)
   → GET /dashboard/widgets/abc123/submissions
```

## 4. API contracts (all three request paths)

### A. Widget management API (authenticated — owner)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/widgets` | Bearer JWT | Create a widget. `400` on invalid body. |
| GET | `/widgets` | Bearer JWT | List the caller's own widgets only. |
| GET | `/widgets/:id` | Bearer JWT | `404` if not found or not owned by caller. |
| PUT | `/widgets/:id` | Bearer JWT | `404` if not owned by caller. |
| DELETE | `/widgets/:id` | Bearer JWT | `204` on success. |

### B. Widget delivery (public — customer website)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/widget.v1.js` | none | Versioned JS bundle — the version number is in the URL path. `Cache-Control: public, max-age=31536000, immutable`. A future breaking change ships as `/widget.v2.js`; old embed snippets pointing at `v1` keep working unchanged. |
| GET | `/widgets/:id/config` | none | Widget's public config (title, fields, button text). Short-lived cache (`max-age=60`). CORS allowed from any origin. |

### C. Public submission + dashboard

| Method | Path | Auth | Notes |
|---|---|---|---|
| OPTIONS | `/widgets/:id/submissions` | none | CORS preflight handled explicitly. |
| POST | `/widgets/:id/submissions` | none | Public. `:id` identifies the widget. Body carries the visitor's field values plus a hidden `_hp` honeypot field. Validated, rate-limited (per IP and per widget), spam-checked. `4xx` on bad/oversized payload, `404` if the widget doesn't exist or is inactive, `429` on rate limit. |
| GET | `/dashboard/widgets/:id/submissions` | Bearer JWT | Owner-only view of stored submissions (spam excluded by default). `404` if widget not owned by caller. |
| GET | `/dashboard/widgets/:id/stats` | Bearer JWT | Counts over time, geo breakdown. |

**Note on the two `/widgets/:id/...` families:** `/widgets/:id/config` and `POST
/widgets/:id/submissions` are the *public* surface (no auth, called by visitor
browsers). `/dashboard/widgets/:id/...` is the *owner* surface (auth required). Same
widget, two audiences — kept under different path prefixes so the auth boundary is
obvious from the URL alone.

## 5. Non-goal

**This project will not build a visual, drag-and-drop widget designer.** Widget
configuration (fields, type, button text) is created via the JSON API only. A
customer configures their widget by calling `POST /widgets` with a JSON body — not
through a WYSIWYG builder UI. The rendered widget itself is a minimal styled form;
visual polish is explicitly out of scope.