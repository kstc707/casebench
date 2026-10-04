# 01 — Run backbone: Postgres + API routes

## Goal

Give the app a real backend: save every attempt at a problem ("run") in a database, with an API
the browser can call, so a user can start a problem, leave, and come back to it. Everything later
(manager chat, submissions, grading, portfolio) attaches to a run, so this comes first.

## Where we started

- A working single-file prototype (`prototype/casebench-demo.html`) — no server, no database.
- A scaffolded monorepo with good *designs* but nothing connected:
  - `packages/domain` had the run state machine, in memory only;
  - `packages/database` had a `schema.sql` that nothing ran or used;
  - the Next.js app showed a dashboard and a placeholder problem page.
- **`next build` failed** (see "Problems found"), so the app couldn't have been deployed at all.

## What we built

### 1. Migrations and a migration runner — `packages/database/`

- `schema.sql` → `migrations/0001_init.sql`. A **migration** is a numbered SQL file describing
  one change to the database structure. Future changes become `0002_...sql`, `0003_...sql`.
- `scripts/migrate.mjs` keeps a `schema_migrations` table recording which files have run, and
  applies only the new ones, each inside a transaction (all-or-nothing).
- Run it with `pnpm db:migrate`. It's safe to run twice — the second time does nothing.

### 2. The repository — `packages/database/src/runs.ts`

Four functions; the rest of the app never writes SQL itself:

| Function | Does |
|---|---|
| `insertRun` | Creates a run + its `run_started` event in one transaction |
| `getRun` | Loads a run and its full event history, only if you own it |
| `listRuns` | Your runs, newest first, optionally for one problem |
| `appendRunEvent` | Locks the run, checks the state machine, saves the event, updates status |

`pool.ts` creates one shared **connection pool** (reusable database connections) per server
process, capped at 5 because serverless hosts run many copies of the app at once.

### 3. API routes — `apps/web/app/api/runs/`

In Next.js, a file named `route.ts` inside `app/api/...` becomes an HTTP endpoint at that path.

| Method + path | File |
|---|---|
| `GET /api/runs`, `POST /api/runs` | `app/api/runs/route.ts` |
| `GET /api/runs/:id` | `app/api/runs/[id]/route.ts` |
| `POST /api/runs/:id/events` | `app/api/runs/[id]/events/route.ts` |

Helpers in `apps/web/lib/`: `session.ts` (who is the user), `runEvents.ts` (input validation +
allow-list), `api.ts` (error → status code), `db.ts` (server-only import of the database package).

### 4. Anonymous identity — `apps/web/lib/session.ts`

No login system yet, so each browser gets a random id in an **httpOnly cookie** (`cb_uid`) —
JavaScript in the page can't read it, which protects it from being stolen by injected scripts.
Every database query filters by this id.

### 5. Start/resume on the problem page — `apps/web/components/RunPanel.tsx`

On load it asks for your latest unfinished run of this problem. If there is none, it shows
**Start this problem**, which creates a run and logs `brief_viewed`.

### 6. Tests — `*.test.ts`, run with `pnpm test` (Vitest)

| File | Proves |
|---|---|
| `packages/domain/src/run.test.ts` | The state machine allows the happy path and rejects illegal steps |
| `packages/database/src/runs.test.ts` | Saving/loading against real Postgres; ownership; the race; the triggers |
| `packages/simulation-engine/src/loadRolePack.test.ts` | The truth model never appears in what the client gets |

### 7. CI — `.github/workflows/ci.yml`

On every pull request, GitHub starts a fresh Postgres, runs migrations, typecheck, tests, and a
full production build. A change that breaks any of those can't sneak in.

### 8. Deploy readiness — `apps/web/next.config.js`, `.env.example`

Config so the `content/` folder ships with the deployed server, and a template listing the
environment variables (`DATABASE_URL`, later `ANTHROPIC_API_KEY`).

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| **Event log**, not one editable row per run | Full history for grading/portfolio; nothing is ever overwritten; new event types need no migration | A single `runs` row with columns updated in place — loses history |
| **Raw SQL + migrations**, no ORM | The immutability rule lives in Postgres triggers; an ORM could hide or bypass it. Fewer moving parts | Prisma/Drizzle — fine tools, but extra abstraction we don't need yet |
| **Rules in two places**: TypeScript state machine *and* Postgres triggers | App gives friendly errors (409); database is the last line of defence if app code has a bug | Only one of them |
| **Row lock** (`select ... for update`) on every append | Two requests for the same run run one-after-the-other, so both can't pass validation | No lock — two simultaneous submissions could both succeed |
| **Server sets timestamps** | Clients can't backdate or fake activity | Trusting `at` from the browser |
| **Allow-list** of client event types | A browser must never be able to post `evaluation_returned` with its own score | Accept any event type |
| **404 for other people's runs** (not 403) | Doesn't reveal that a run id exists | 403 "forbidden" — leaks existence |
| **Anonymous cookie** before real auth | Unblocks everything now; swapping in real login changes one function | Building auth first — delays the core product |
| TypeScript for the backend | One language and type system front-to-back; Vercel deploys it as one unit | Separate Python (FastAPI) service — a second deploy, and types duplicated across the boundary |

## Problems found along the way

1. **Production build was broken.** Next.js 15 changed page `params` to a Promise;
   `problems/[slug]/page.tsx` still used the old shape. Fixed with `const { slug } = await params`.
2. **Content wouldn't have shipped to production.** The server reads `content/` from disk at
   runtime, which Next's file tracer can't detect, so a deployed dashboard would be empty.
   Fixed with `outputFileTracingIncludes` in `next.config.js` (verified in the build's trace file).
3. **State machine loophole.** `appendEvent` allowed any "same status → same status" step, so a
   second `run_started` or a duplicate `submission_finalized` was accepted. Now only transitions
   listed in `ALLOWED_TRANSITIONS` pass, and tests cover both cases.
4. **Content path only worked from one folder.** The loader assumed it was run from `apps/web`.
   It now checks the repo root too, or uses `CASEBENCH_CONTENT_ROOT` if set.
5. No `start` script in `apps/web/package.json`, so `pnpm start` failed — added.

## How it was verified

- `pnpm typecheck` — no type errors in any package.
- `pnpm test` — 18 tests pass, including Postgres integration tests.
- `pnpm --filter @casebench/web build` — production build succeeds.
- Manual API test with `curl` against the production server: bad slug → 404, valid run created,
  events logged, `evaluation_returned` from client → 400, bad JSON → 400, another user → 404,
  non-UUID id → 404, the problem page's HTML contains no truth-model text.
- Headless browser: clicked **Start this problem**, saw `in_progress`, reloaded, same run resumed.

## Explain it in an interview

**30-second version:**
> "Every attempt at a simulation is stored as an append-only event log in Postgres. The API is
> Next.js route handlers; the business rules are a pure TypeScript state machine that's unit
> tested on its own; and the most important rule — a published, graded result can never be
> edited — is enforced twice, in the app and by database triggers. Concurrent requests to the
> same run are serialized with a row lock, and I have a test that fires two submissions at once
> and asserts exactly one wins."

**Likely questions:**

- *Why an event log instead of a normal table?* — I need the whole history: the evaluator and the
  portfolio writeup look at *how* someone worked, not just their final answer. Appending also
  means nothing is overwritten, and adding a new kind of event doesn't require a schema change.
- *What happens if two requests hit the same run at once?* — `appendRunEvent` takes a row lock
  with `select ... for update` inside a transaction. The second request waits, then validates
  against the status the first one left. Without it, both could read "in_progress" and both
  submit.
- *Why enforce immutability in the database and not just the code?* — Code has bugs and there
  may be other writers later (scripts, admin tools). A trigger can't be skipped by any of them.
- *How do you stop users from seeing the answer?* — The truth model is stripped by
  `toClientSafe` before anything leaves the server, there's a TypeScript type that makes
  forgetting it a compile error, and a test serializes what the client receives and searches it.
- *How do you stop someone posting their own grade?* — The events endpoint has an allow-list;
  grading events will only be created server-side by the submit route.
- *How is the user identified without login?* — Random UUID in an httpOnly cookie; all queries
  filter by it; someone else's run returns 404 so ids can't be probed. Real auth replaces one
  function.
- *What would you do differently at scale?* — Add rate limiting; for very long runs, store a
  snapshot instead of replaying every event; use a hosted connection pooler (Neon/Supabase
  provide one) for many serverless instances.

## Try it yourself

1. **Read one request end to end.** Open `apps/web/app/api/runs/[id]/events/route.ts` and follow
   each call into `lib/runEvents.ts`, `packages/database/src/runs.ts`, and
   `packages/domain/src/run.ts`. Say out loud what each line does.
2. **Break a rule and watch a test catch it.** In `packages/domain/src/run.ts`, add `"in_progress"`
   to the `submitted` entry in `ALLOWED_TRANSITIONS`. Run `pnpm test`. Which test fails, and why?
   Undo it.
3. **See the trigger work.** In `psql`, find a published run (or publish one via the test helper)
   and try `update runs set status = 'started' where id = '...'`. Read the error message, then
   find where it's raised in `migrations/0001_init.sql`.
4. **Add an event type.** Add `{ type: "hint_requested"; at: string }` to `RunEvent`, map it to
   `in_progress` in `statusForEvent`, allow it in `parseClientEvent`, and write a test. This is
   exactly how new features will attach to runs.
