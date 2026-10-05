# Casebench

> Create, share, and solve realistic simulations of real work.

Anyone can build an interactive work situation (a broken dashboard, a confusing sign-up flow, a
production incident, a failed campaign) and anyone else can step into it and try to solve it.
You don't answer questions about the job. You're dropped into the situation: AI coworkers message
you on Slack and **notice what you're doing**, each knows a different slice of the truth, there's
data to query and documents to read, and you hand in a deliverable. A grader agent scores it against
what was actually true and against what you actually did. Then you rate it, discuss it, and pick
the next one, sorted by trending, new, top-rated, or a computed **complexity score**.

Think LeetCode's repeatable practice, plus help when you're stuck, plus a community that creates and
rates the problems, with the static question replaced by a small working environment.
See **[the vision](docs/vision.md)** for the full product definition and what's built.

## What's in it

| Piece | What it is |
|---|---|
| **The case** | "Why is watch time declining?" — 19k-row seeded dataset with three overlapping causes (a duplicate-event bug, a campaign mix shift, an experiment), proven by tests |
| **SQL sandbox** | DuckDB-WASM in a Web Worker: window functions, CTEs, `date_trunc`, no page freezes |
| **AI coworkers** | Manager + data engineer with private knowledge, proactive triggers, hint levels unlocked in code, and a leak guard |
| **Grader agent** | Structured-output scoring against the hidden truth + measured facts + your query log |
| **Run event log** | Every action appended to Postgres; published runs frozen by database triggers |
| **Portfolio page** | Public record: write-up, grade, every query, the Slack conversation |
| **Simulation Studio** | Anyone can create a simulation for any field in the app, play it, share it, and see how solvers do |
| **Community** | Discovery (trending / new / top rated / hardest), likes, ratings (finishers only), comments with "solved it" badges |
| **Profiles** | Pick a name (no email): "created by", "solved by N people", and a profile page per person listing what they solved and created |
| **Complexity score** | Five-dimension difficulty profile from the simulation's structure, recalibrated by real solver results |
| **"I'm stuck"** | A hint ladder: each press makes a coworker give one stronger hint, and the grader sees how many you used |

## Start here

- **[Vision](docs/vision.md)** — what Casebench is becoming, and an honest status per stage
- **[How it works](docs/how-the-backend-works.md)** — layers, which file is which, request walkthroughs
- **[Build log](docs/build-log/README.md)** — every step: what, why, problems hit, how verified, interview notes
- **[Market research](docs/market-research.md)** — who else does this, and an honest assessment
- **[Writing a scenario](docs/authoring-scenarios.md)** — for designers, PMs, teachers: create your own case
- **[Review pack](docs/review-pack-lite.md)** — the whole project in one file for an outside reviewer or AI chat ([full version with code](docs/review-pack.md); regenerate with `pnpm review-pack`)
- **[Deploy](docs/deploy.md)** — Vercel + Neon + a free AI key, all from the browser

## Running it

Needs Node 20+, pnpm, Postgres.

```bash
pnpm install
createdb casebench
DATABASE_URL=postgres://localhost/casebench pnpm db:migrate
cp .env.example apps/web/.env.local   # set DATABASE_URL; add an AI key (e.g. free GEMINI_API_KEY)
pnpm dev                               # http://localhost:3000
```

AI works with Claude or free providers (Gemini, Groq, OpenRouter, local Ollama). See
[`docs/deploy.md`](docs/deploy.md). Without any key everything still runs in **offline mode**: coworkers send their scripted
messages and a canned reply, and grading uses a clearly-labelled keyword heuristic.

**Tests:** `TEST_DATABASE_URL=postgres://localhost/casebench_test pnpm test` (create and migrate
that database first; without it the Postgres tests are skipped). **Agent eval:**
`pnpm --filter @casebench/agents eval` (needs an AI key).

## Repo layout

```
apps/web/                 Next.js app: pages, API routes, workspace UI
packages/
  domain/                 run state machine + shared types
  database/               Postgres migrations, migration runner, run repository
  agents/                 agent engine: triggers, hints, prompts, leak guard, grader (+ eval script)
  ai/                     Claude (Anthropic SDK), OpenAI-compatible adapter (Gemini, Groq, …), offline mock
  simulation-engine/      loads content, strips secrets before anything reaches the browser
  content-tools/          seeded dataset generator + independent analyzer
content/role-packs/       cases as data: personas, briefs, CSVs, agent configs, rubrics
prototype/                the original single-file HTML prototype (behavioural reference)
docs/                     how it works, build log, research, deploy guide, ADRs
```

## Status

Two official cases (Data Analyst, UX Designer) plus anyone's Studio scenarios. Not yet ported from
the prototype: the data scientist (experiment readout) and software engineer (coding) tracks. See
[`docs/roadmap.md`](docs/roadmap.md).

## License

MIT — see [`LICENSE`](LICENSE).
