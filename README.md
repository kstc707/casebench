# Casebench

> AI-powered professional work simulations — practice the job before you have the job.

Casebench puts you inside a realistic, messy, ambiguous work assignment: you get a brief from an
AI "manager" persona, dig through real-shaped data, make a judgment call, submit a deliverable,
and get a rubric-based evaluation plus a portfolio-ready writeup of what you did.

It currently covers three role tracks, each with its own problem type:

| Track | Problem type | What you actually do |
|---|---|---|
| Data Analyst | Case study | Investigate a messy dataset (e.g. a streaming company's watch-time decline), find the real cause, write a recommendation |
| Data Scientist | Case study | Read an experiment readout, catch confounds / sample ratio mismatches, decide ship-or-hold |
| Software Engineer | Coding problem | Solve a LeetCode-style problem against hidden test cases, then get an AI code review on top of deterministic correctness |

## Status

Two things exist side by side right now:

1. **A working single-file prototype** (`prototype/casebench-demo.html`) — self-contained HTML/JS
   with a problem dashboard, split workspace (brief/data explorer/resources/journal/discussion),
   an in-browser SQL sandbox (`alasql`), a real code editor + deterministic test runner, and live
   AI integration for manager chat / evaluation / portfolio summary. Its one real limitation: the
   AI calls happen directly from the browser, so they only work inside an authenticated Claude
   session (e.g. as a published Claude Artifact) — everything else works fully offline.

2. **A modular app rebuild in progress** (`apps/`, `packages/`, `content/`), following
   [`docs/architecture.md`](docs/architecture.md) — see
   [`docs/adr/0001-rebuild-modular-app.md`](docs/adr/0001-rebuild-modular-app.md) for why this
   exists as a separate rebuild rather than an edit to the prototype. Currently scaffolded:
   domain entities + event-log state machine, Postgres migrations with immutability triggers,
   a run API backed by Postgres (start/resume a run, append events), an AI provider abstraction
   (server-side this time), a content loader that strips the hidden truth model before anything
   reaches the client, and a dashboard + problem page with start/resume. Not yet ported:
   the data explorer, manager chat, code editor, and the actual submission/evaluation flow — see
   [`docs/roadmap.md`](docs/roadmap.md) for the current checklist.

   **Note:** the example content under `content/role-packs/data-analyst/.../watch-time-decline/`
   currently uses placeholder data and a placeholder truth model (the originals were lost — see
   that folder's `data/NOTE.md`). Don't treat it as real content yet.

## Repo layout

```
casebench/
  README.md / LICENSE / CONTRIBUTING.md
  docs/
    architecture.md      — design notes: event-log state machine, content-as-data role packs,
                            hybrid deterministic+AI evaluation, anti-leakage prompt design
    concept-brief.md     — self-contained conceptual overview (written for AI handoff)
    roadmap.md           — what's built vs. what's next
    adr/                 — architecture decision records
  prototype/
    casebench-demo.html  — the working single-file prototype described above
  apps/web/              — Next.js app (dashboard + problem pages)
  packages/
    domain/              — core types + the event-log run state machine
    database/            — Postgres migrations, migration runner, run repository
    ai/                  — AI provider abstraction + manager/evaluator prompt builders
    simulation-engine/    — loads content/role-packs/*, strips truth model before client exposure
  content/role-packs/    — content-as-data: manager personas, case studies, rubrics, coding problems
```

## Running things

**Prototype** (no build step): open `prototype/casebench-demo.html` in a browser.

**Modular app** (in progress, needs `pnpm` and Node 20+):

```bash
pnpm install
createdb casebench
cp .env.example apps/web/.env.local     # then set DATABASE_URL
DATABASE_URL=postgres://localhost/casebench pnpm db:migrate
pnpm dev
```

**Tests:** `pnpm test`. The database integration tests run only when `TEST_DATABASE_URL`
points at a migrated Postgres database (CI does this); otherwise they're skipped.

### API (run backbone)

Every attempt at a problem is a *run*, stored as an append-only event log. Users are
identified by an anonymous cookie until accounts exist; runs are only visible to their owner.

| Method | Path | Does |
|---|---|---|
| `GET` | `/api/runs[?problemSlug=]` | List your runs, newest first |
| `POST` | `/api/runs` `{ problemSlug }` | Start a run |
| `GET` | `/api/runs/:id` | A run with its full event log |
| `POST` | `/api/runs/:id/events` `{ type, ... }` | Append `brief_viewed`, `resource_opened`, or `submission_drafted` (409 if the state machine rejects it) |

Manager messages, submission, evaluation, and publishing are deliberately not client-postable:
they'll be produced server-side by their own routes, so a browser can't post its own grade.

### Deploying

Vercel (project root `apps/web`) + any hosted Postgres (Neon, Supabase). Set `DATABASE_URL`
in Vercel, run `pnpm db:migrate` against it once per new migration, and deploy. Role-pack
content ships with the app via `outputFileTracingIncludes` in `apps/web/next.config.js`.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). This is an early-stage open-source project — issues,
design feedback, and PRs rebuilding the modular architecture are all welcome.

## License

MIT — see [`LICENSE`](LICENSE).
