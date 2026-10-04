# How the backend works

A plain-language map of Casebench's backend: what each piece is, where its file is, and what
happens when you click a button. Read this first; the [build log](build-log/README.md) then
explains how and why each piece was added, step by step.

## The one-sentence version

The browser talks to **API routes** (small server functions in the Next.js app), which apply
the **rules** from the domain package and save the result in **Postgres** through the database
package — and the hidden answer to each case study never leaves the server.

## Languages: why everything is TypeScript

The whole app — frontend, backend, and the dataset generator — is TypeScript. Next.js lets one
codebase serve both the pages and the server code (`app/api/...`), and Vercel deploys that as a
single unit. One language means the same type (e.g. `RunEvent`) is checked on both sides, and
there's one toolchain to install, test, and deploy. Python would be a natural fit for the data
generator, but it would add a second toolchain for one script — see build log 02.

## The layers

```
 Browser (React)                       apps/web/components/, apps/web/app/**/page.tsx
     │  fetch("/api/runs", ...)
     ▼
 API routes  ── "the front door"       apps/web/app/api/**/route.ts
     │  checks input, figures out who you are
     ▼
 Domain rules ── "the referee"         packages/domain/src/run.ts
     │  is this step allowed right now?
     ▼
 Repository ── "the filing clerk"      packages/database/src/runs.ts
     │  SQL, transactions, row locks
     ▼
 Postgres ── "the vault"               packages/database/migrations/0001_init.sql
        tables + triggers that refuse to edit a published run
```

Each layer only talks to the one below it. That's what lets each one be tested on its own.

## Which file is which

| File | Layer | What it does |
|---|---|---|
| `apps/web/app/api/runs/route.ts` | API | `GET` lists your runs; `POST` starts a new one |
| `apps/web/app/api/runs/[id]/route.ts` | API | `GET` one run with its full history |
| `apps/web/app/api/runs/[id]/events/route.ts` | API | `POST` logs an action (e.g. "opened the data dictionary") |
| `apps/web/lib/session.ts` | API helper | Who is this? Reads/creates the anonymous `cb_uid` cookie |
| `apps/web/lib/runEvents.ts` | API helper | Validates untrusted input; decides which actions a browser may log |
| `apps/web/lib/api.ts` | API helper | Turns errors into HTTP status codes (404, 409, 500) |
| `apps/web/lib/problems.ts` | API helper | The only way the app reads problem content — always truth-stripped |
| `apps/web/lib/db.ts` | API helper | Server-only doorway to the database package |
| `packages/domain/src/run.ts` | Domain | The state machine: which status changes are legal |
| `packages/domain/src/entities.ts` | Domain | Types for problems, personas, rubrics |
| `packages/database/src/runs.ts` | Repository | `insertRun`, `getRun`, `listRuns`, `appendRunEvent` |
| `packages/database/src/pool.ts` | Repository | One shared connection pool per server process |
| `packages/database/migrations/*.sql` | Database | Table definitions and triggers, applied in order |
| `packages/database/scripts/migrate.mjs` | Database | Applies migrations that haven't run yet |
| `packages/simulation-engine/src/loadRolePack.ts` | Content | Reads `content/role-packs/`, strips the truth model |
| `packages/ai/src/*` | AI | Manager/evaluator prompts + provider (not wired in yet) |
| `apps/web/components/RunPanel.tsx` | Frontend | The "Start this problem" box |

## Key concepts

**Run.** One attempt at one problem by one user. It has a **status**:

```
started ──► in_progress ──► submitted ──► evaluated ──► published
                 ▲   │                                      (frozen forever)
                 └───┘ (any number of in-progress actions)
```

**Event log.** A run isn't one row that gets overwritten — it's a list of things that happened
(`run_started`, `brief_viewed`, `resource_opened`, …), only ever appended to. The status is
just "where the latest event put us". This gives a full, replayable history of every attempt,
which is what the evaluator and the portfolio writeup will read later.

**Truth model.** The hidden answer to a case study (e.g. "the watch-time drop is partly a
duplicate-event bug"). Only the server — and later the AI evaluator — ever sees it.

## Walkthrough: what happens when you click "Start this problem"

1. **Browser** (`RunPanel.tsx`) sends `POST /api/runs` with `{ "problemSlug": "watch-time-decline" }`.
2. **API route** (`app/api/runs/route.ts`):
   - checks the body is valid and the problem exists (`lib/problems.ts`) → else `400`/`404`;
   - gets your user id from the cookie, creating one if this is your first visit (`lib/session.ts`).
3. **Repository** (`insertRun` in `packages/database/src/runs.ts`) asks the **domain**
   (`createRun`) for a new run with its first event, then inside one **transaction** inserts the
   `runs` row and the `run_started` event — both are saved, or neither is.
4. Browser immediately sends `POST /api/runs/<id>/events` with `{ "type": "brief_viewed" }`.
5. **API route** (`events/route.ts`) validates it (`parseClientEvent`) and stamps the time on the
   server — a client can't backdate events.
6. **Repository** (`appendRunEvent`):
   1. `begin` a transaction;
   2. `select ... for update` — **locks** this run's row so a second request for the same run
      has to wait its turn;
   3. asks the **domain** (`appendEvent`) whether `started → in_progress` is legal — it is;
   4. inserts the event, updates the status, `commit`.
7. **Postgres triggers** double-check: if this run were already `published`, the database itself
   would refuse the insert, even if the app code had a bug.
8. Browser shows `status in_progress`. Reload the page and `GET /api/runs?problemSlug=...` finds
   the same run, so you resume where you left off.

## How a bad request is stopped (defence in depth)

| Attempt | Stopped by | Response |
|---|---|---|
| Malformed JSON / missing fields | `parseClientEvent`, route checks | `400` |
| Browser tries to post its own grade (`evaluation_returned`) | allow-list in `lib/runEvents.ts` | `400` |
| Someone else's run id, or a made-up id | `user_id` filter in every query | `404` (same as "doesn't exist", so ids can't be probed) |
| An action that's illegal right now (e.g. editing after submitting) | domain state machine | `409` |
| Two submissions racing at the same instant | row lock (`for update`) | one wins, one gets `409` |
| A bug that skips all of the above on a published run | Postgres triggers | database error |

## Running and testing it

```bash
pnpm install
createdb casebench && createdb casebench_test
DATABASE_URL=postgres://localhost/casebench pnpm db:migrate
DATABASE_URL=postgres://localhost/casebench_test pnpm db:migrate
cp .env.example apps/web/.env.local          # set DATABASE_URL=postgres://localhost/casebench
pnpm dev                                      # http://localhost:3000

TEST_DATABASE_URL=postgres://localhost/casebench_test pnpm test
```

Try the API by hand (the `-c/-b` flags keep your cookie between calls):

```bash
curl -c jar -b jar -X POST localhost:3000/api/runs \
  -H 'content-type: application/json' -d '{"problemSlug":"watch-time-decline"}'
curl -c jar -b jar localhost:3000/api/runs
```
