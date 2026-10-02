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
   domain entities + event-log state machine, Postgres schema with immutability triggers, an AI
   provider abstraction (server-side this time), a content loader that strips the hidden truth
   model before anything reaches the client, and a dashboard + stub problem page. Not yet ported:
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
    database/            — Postgres schema (schema.sql) with immutability triggers
    ai/                  — AI provider abstraction + manager/evaluator prompt builders
    simulation-engine/    — loads content/role-packs/*, strips truth model before client exposure
  content/role-packs/    — content-as-data: manager personas, case studies, rubrics, coding problems
```

## Running things

**Prototype** (no build step): open `prototype/casebench-demo.html` in a browser.

**Modular app** (in progress, needs `pnpm` and Node 20+):

```bash
pnpm install
pnpm --filter @casebench/web dev
```

Postgres isn't wired into the app yet (see roadmap) — `packages/database/schema.sql` can be
applied manually per that package's README if you want to experiment with it ahead of time.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). This is an early-stage open-source project — issues,
design feedback, and PRs rebuilding the modular architecture are all welcome.

## License

MIT — see [`LICENSE`](LICENSE).
