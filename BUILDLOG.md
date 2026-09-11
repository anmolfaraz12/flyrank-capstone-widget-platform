# BUILDLOG.md — AI usage log

Short, honest notes on where AI tools were used while building this
capstone.

## Where AI helped

Used as a coding assistant for drafting boilerplate — route handlers, Zod
schemas, rate-limit config, the widget bundle, and the documentation
files. All of it was tested against my own running server before I
trusted or committed it; see `EVIDENCE.md` for the actual proof.

## Where it was wrong, and what I changed

- A test payload was expected to fail validation but returned `201`. AI
  first assumed it was a bug in `index.js`. Checking the schema showed the
  test itself was wrong (the field type it sent was actually valid) — I
  fixed the test, not the code.
- A couple of PowerShell commands failed because a variable like
  `$widgetId` wasn't actually set in that terminal session, not because of
  a server issue. Caught by checking the variable directly before
  re-running.
- `seed.js` was referenced before it existed — the earlier build phases
  never included a seed step. I had it written from scratch to match my
  actual `db.js` schema, then ran it myself to confirm it worked.
- `EVIDENCE.md` was drafted in chat but hadn't actually been saved to the
  repo yet. Caught with `git log`, then created and committed properly.

## Note

I can explain any part of this codebase — schema design, validation
rules, rate limits, the fallback chain, tenant isolation — since I tested
each one myself against the live server rather than taking generated code
at face value.