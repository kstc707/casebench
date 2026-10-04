# Casebench

> Practice the job before you have the job: messy data, AI coworkers on Slack, and feedback graded
> against what's actually true.

You're dropped into a realistic analyst assignment at a fictional streaming company. Your manager
(an AI agent) DMs you the ask. You query six real-looking tables with SQL in your browser. Your
coworkers **watch what you're doing** and message you on their own: the data engineer pings you
when you open the sessions table, your manager checks in after a few queries and asks for a status
update when the VP is waiting. Each coworker knows a different slice of the truth, so you have to
ask the right person the right question. When you submit, a grader agent scores your write-up
against facts measured from the very data you saw, and against the queries you actually ran.
Publish it, and you get a shareable portfolio page.

## What's in it

| Piece | What it is |
|---|---|
| **The case** | "Why is watch time declining?" — 19k-row seeded dataset with three overlapping causes (a duplicate-event bug, a campaign mix shift, an experiment), proven by tests |
| **SQL sandbox** | DuckDB-WASM in a Web Worker: window functions, CTEs, `date_trunc`, no page freezes |
| **AI coworkers** | Manager + data engineer with private knowledge, proactive triggers, hint levels unlocked in code, and a leak guard |
| **Grader agent** | Structured-output scoring against the hidden truth + measured facts + your query log |
| **Run event log** | Every action appended to Postgres; published runs frozen by database triggers |
| **Portfolio page** | Public record: write-up, grade, every query, the Slack conversation |

## Start here

- **[How it works](docs/how-the-backend-works.md)** — layers, which file is which, request walkthroughs
- **[Build log](docs/build-log/README.md)** — every step: what, why, problems hit, how verified, interview notes
- **[Market research](docs/market-research.md)** — who else does this, and an honest assessment
- **[Deploy](docs/deploy.md)** — Vercel + Neon + Anthropic in ~20 minutes

## Running it

Needs Node 20+, pnpm, Postgres.

```bash
pnpm install
createdb casebench
DATABASE_URL=postgres://localhost/casebench pnpm db:migrate
cp .env.example apps/web/.env.local   # set DATABASE_URL; add ANTHROPIC_API_KEY for real AI
pnpm dev                               # http://localhost:3000
```

Without `ANTHROPIC_API_KEY` everything still runs in **offline mode**: coworkers send their scripted
messages and a canned reply, and grading uses a clearly-labelled keyword heuristic.

**Tests:** `TEST_DATABASE_URL=postgres://localhost/casebench_test pnpm test` (create and migrate
that database first; without it the Postgres tests are skipped). **Agent eval:**
`pnpm --filter @casebench/agents eval` (needs a key).

## Repo layout

```
apps/web/                 Next.js app: pages, API routes, workspace UI
packages/
  domain/                 run state machine + shared types
  database/               Postgres migrations, migration runner, run repository
  agents/                 agent engine: triggers, hints, prompts, leak guard, grader (+ eval script)
  ai/                     Claude via the Anthropic SDK, offline mock, model config
  simulation-engine/      loads content, strips secrets before anything reaches the browser
  content-tools/          seeded dataset generator + independent analyzer
content/role-packs/       cases as data: personas, briefs, CSVs, agent configs, rubrics
prototype/                the original single-file HTML prototype (behavioural reference)
docs/                     how it works, build log, research, deploy guide, ADRs
```

## Status

The data-analyst case is complete end to end. Not yet ported from the prototype: the data
scientist (experiment readout) and software engineer (coding) tracks. See
[`docs/roadmap.md`](docs/roadmap.md).

## License

MIT — see [`LICENSE`](LICENSE).
