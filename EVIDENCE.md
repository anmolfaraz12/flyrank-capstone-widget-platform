# EVIDENCE.md — Definition of Done proofs

One real command/output per requirement from Section 6 of the capstone brief.
All commands run against `http://localhost:4000`, using `$widgetId = "f496f890-3252-4af5-811c-c530f16a40ac"` unless noted.

---

## Widget management

### Authenticated CRUD; requests without valid auth are rejected

Created a widget with a valid bearer token:

```
Invoke-RestMethod -Uri "http://localhost:4000/widgets" -Method POST -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body '{"type":"signup_form","title":"Evidence Test Widget","description":"Created for EVIDENCE.md","fields":[{"name":"email","label":"Email","type":"email","required":true}],"button_text":"Join"}'
```

id : f496f890-3252-4af5-811c-c530f16a40ac
tenant_id : 9c885fd0-3264-49db-9a7d-374ec41d2294
type : signup_form
title : Evidence Test Widget
description : Created for EVIDENCE.md
fields : {@{name=email; type=email; label=Email; required=True}}
button_text : Join
is_active : True
created_at : 2026-09-09T20:18:13.040Z
updated_at : 2026-09-09T20:18:13.040Z


Invalid `type` value correctly rejected before hitting the database:

Invoke-RestMethod -Uri "http://localhost:4000/widgets" -Method POST -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body '{"type":"signup form", ...}'

{"error":"Invalid widget data","details":[{"code":"invalid_value","values":["signup_form","cta","popover"],"path":["type"],"message":"Invalid option: expected one of "signup_form"|"cta"|"popover""}]}


### Multi-tenant isolation proven

Created a second tenant (`tenant-b@example.com`, id `56ba6a41-fe8b-4825-8bed-82904870abb1`). Tenant B tried to read Tenant A's widget:

Invoke-WebRequest -Uri "http://localhost:4000/widgets/$widgetId" -Method GET -Headers @{ Authorization = "Bearer $tokenB" }

STATUS: 404
BODY: {"error":"Widget not found"}


Tenant A then listed their own widgets — Tenant B's widget (`6fb4648f-1eb5-4780-9761-8eebcdc5d328`) does not appear, confirming isolation in both directions:

Invoke-RestMethod -Uri "http://localhost:4000/widgets" -Method GET -Headers @{ Authorization = "Bearer $token" }

id : f496f890-3252-4af5-811c-c530f16a40ac (Tenant A's widget)
id : 464c8ce5-33a3-404b-9858-d792b4dc55a9 (Tenant A's widget)


(Tenant B's `6fb4648f-...` widget is absent from the list.)

---

## Widget delivery

### Public config endpoint, correct cache headers

Invoke-WebRequest -Uri "http://localhost:4000/widgets/$widgetId/config" -Method GET | Select-Object -ExpandProperty Headers

Access-Control-Allow-Origin : *
Cache-Control : public, max-age=60
Content-Type : application/json; charset=utf-8


### Versioned bundle served with long-cache headers

`GET /widget.v1.js` is served with `Cache-Control: public, max-age=31536000, immutable` (see `index.js`), and the URL itself (`widget.v1.js`) is the versioning strategy — a new release ships as `widget.v2.js`.

### Widget renders on a different origin than the API

`customer-site.html` served via `npx serve -p 5500` (origin `localhost:5500`), API on `localhost:4000`. Screenshot confirms:
- Widget ("Newsletter Signup") renders correctly, with custom styling
- Form submits successfully ("Thank you!" shown)
- Browser console shows only an unrelated `favicon.ico 404` — no CORS or JS errors

---

## Public submission API

### Cross-origin submissions work (CORS + preflight)

Confirmed live in Chrome via the `customer-site.html` page above — a real cross-origin `POST` succeeded with no CORS errors in the console. `index.js` uses `app.use(cors())`, which reflects the requesting origin and correctly answers the browser's automatic `OPTIONS` preflight.

### Malformed input rejected with clean 4xx

Invoke-WebRequest -Uri "http://localhost:4000/widgets/$widgetId/submissions" -Method POST -ContentType "application/json" -Body '{"comment": {"nested": "object"}}'

STATUS CODE: 400
BODY: {"error":"Invalid submission data","details":[{"code":"invalid_union", ... ,"path":["comment"],"message":"Invalid input"}]}


### Oversized payload rejected with 413

Sent a ~20KB JSON body against the app's 10kb `express.json()` limit:

STATUS CODE: 413
BODY: {"error":"Payload too large"}


### Valid submissions stored safely, linked to the right widget/tenant

Dashboard listing (below) shows submissions correctly scoped to `widget_id = f496f890-...`, which belongs to Tenant A.

---

## Abuse protection

### Rate limiting returns 429 under a burst, legitimate traffic still served

Fired 25 rapid submissions against the per-IP limit of 20/min:

Request 1 -> STATUS: 201
...
Request 20 -> STATUS: 201
Request 21 -> STATUS: 429
...
Request 25 -> STATUS: 429


After the 60s window reset, a normal request immediately succeeded again:

{"received":true}


### Honeypot blocks a spam submission

Submitted with the honeypot field (`_hp`) filled, as a bot would:

Invoke-RestMethod -Uri "http://localhost:4000/widgets/$widgetId/submissions" -Method POST -ContentType "application/json" -Body '{"comment":"bot filled the hidden field","_hp":"bot-filled-this"}'

{"received":true}


(The bot gets a normal-looking success response — no hint it was caught.) Verified in Postgres that it was silently flagged as spam:

```sql
SELECT id, data, is_spam, created_at FROM submissions WHERE data->>'comment' = 'bot filled the hidden field';
```

id | data | is_spam | created_at
--------------------------------------+----------------------------------------------+---------+-------------------------------
742a875f-fc5a-4877-91bd-0f917d83a144 | {"comment": "bot filled the hidden field"} | t | 2026-09-09 20:31:06.865676+00


And confirmed the dashboard excludes it by default (see Dashboard section below — spam count is tracked separately and not included in the default submissions list).

---

## Enrichment & safe side effects

### IP→geo enrichment with provider fallback chain (deterministic, mocked)

node testGeoFallback.js

Provider A answers successfully:
Result: { country: 'United States', city: 'Ashburn' }
Provider A fails → provider B answers successfully:
geo provider A failed (provider A status 500), trying provider B
Result: { country: 'Germany', city: 'Berlin' }
✅ Confirmed: provider B successfully answered after A failed
Both providers fail → degrades gracefully, never throws:
geo provider A failed (provider A status 500), trying provider B
geo provider B failed (provider B status 500) — continuing without geo data
Result: { country: null, city: null }
✅ Confirmed: degrades to nulls, does not throw or crash

### A failing confirmation email does not prevent the submission from being stored

Isolated proof of the same try/catch pattern used in `index.js`'s submission handler (`test-side-effect.js`):

Submission stored in DB: true
Side-effect (email) failed, submission still succeeds: Simulated email provider outage
--- Result ---
submissionStored: true
responseSent: true
responseCode: 201
✅ Confirmed: side-effect failure did not block success response


This mirrors the real handler in `index.js`, where the email side effect is wrapped in `try/catch` and the `201` response is sent unconditionally afterward.

---

## Owner dashboard API

### Submissions list (spam excluded by default)

Invoke-RestMethod -Uri "http://localhost:4000/dashboard/widgets/$widgetId/submissions" -Method GET -Headers @{ Authorization = "Bearer $token" }


Returned 27 valid submissions for the widget. The honeypot submission (`is_spam = true`) is **not** in this list, confirming the default filter works.

### Stats endpoint

Invoke-RestMethod -Uri "http://localhost:4000/dashboard/widgets/$widgetId/stats" -Method GET -Headers @{ Authorization = "Bearer $token" }

valid_submissions spam_submissions by_day by_country

27 1 {@{day=2026-09-08T19:00:00.000Z; count=27}} {@{country=unknown; count=27}}


Correctly counts the 1 spam submission separately from the 27 valid ones, and breaks down by day and by country.

---

## Documentation

- `README.md` — architecture, setup/run steps, limitations: present.
- `capstone.yaml` — `run`, `seed`, `base_url`, and endpoint manifest: present.
- `EVIDENCE.md` — this file.
- `BUILDLOG.md` — AI usage log: see separate file.
- `.env.example` — placeholder values for all required env vars: present.