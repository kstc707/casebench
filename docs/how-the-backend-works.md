# How Casebench works

A plain-language map of the whole system: what each piece is, where its file is, and what
happens when you click something. Read this first; the [build log](build-log/README.md) then
explains how and why each piece was added, step by step.

## The one-paragraph version

You get a messy work assignment. You query real-looking data with SQL **in your browser**. Every
action you take is appended to an **event log** in Postgres. **AI coworkers** (a manager and a
data engineer) watch that log: code decides *when* one should message you, a model writes *what*
they say, and a leak guard stops them giving the answer away. When you submit, a **grader agent**
scores your write-up against the **hidden truth** — facts measured from the very data you saw —
and against what you actually did. Publishing freezes the run and creates a public portfolio page.

## Languages and tools

Everything is **TypeScript**: the Next.js app (pages + API routes), the shared packages, and the
dataset generator. One language means shared types end to end and one toolchain. Postgres stores
runs. DuckDB-WASM runs SQL in the browser. The agents and grader run on Claude (official SDK) or any
OpenAI-compatible provider, including free tiers like Gemini and Groq; an offline mock stands in
when no key is set.

## The layers

```
 Browser                     apps/web/components/*        Workspace, SQL console (DuckDB), Slack, write-up
   │ fetch /api/...
   ▼
 API routes                  apps/web/app/api/**/route.ts  validate input, identify user, call below
   │
   ├─► Orchestrator          apps/web/lib/agents.ts        when to run agents; store their messages
   │      │
   │      ├─► Agent engine   packages/agents               triggers, hints, prompts, leak guard, grader
   │      └─► AI provider    packages/ai                   Claude (SDK) or offline mock
   │
   ├─► Content loader        packages/simulation-engine    reads content/, strips secrets for the browser
   │
   ├─► Domain rules          packages/domain               run state machine + all shared types
   │
   └─► Repository            packages/database             SQL, transactions, row locks
          ▼
       Postgres              packages/database/migrations  tables + triggers (published = frozen)

 Offline tooling             packages/content-tools        generates + verifies the case's dataset
```

## Which file is which

### Browser (`apps/web/components/`)

| File | What it does |
|---|---|
| `Workspace.tsx` | Slack-like shell: sidebar (channel, DMs, apps), main view, docked chat, toasts, start screen |
| `useChat.ts` + `ChatView.tsx` | All chat state (polls every 4 s, unread, toasts) and the DM view |
| `BriefChannel.tsx` | `#watch-time-drop` with the pinned brief and resources |
| `SqlConsole.tsx` + `duckdb.ts` | SQL workbench: DuckDB in a Web Worker, schema browser; logs each query |
| `WriteUp.tsx` | The deliverable; autosaves drafts; submits for grading |
| `Feedback.tsx` | Score, per-criterion reasons, publish button |
| `api.ts` | Every call the browser makes to the server |

### Server (`apps/web/app/api/` and `apps/web/lib/`)

| Route / file | What it does |
|---|---|
| `GET/POST /api/runs` | List your runs / start one (Priya's kickoff fires immediately) |
| `GET /api/runs/:id` | A run with its full event log (owner only) |
| `POST /api/runs/:id/events` | Log brief viewed / resource opened / **query run** / draft saved; then agents may react |
| `GET/POST /api/runs/:id/messages` | Slack history (+ time-based triggers) / message a coworker and get a reply |
| `POST /api/runs/:id/submit` | Freeze the write-up, grade it, manager reacts (retry-safe) |
| `POST /api/runs/:id/publish` | Freeze the run, create the portfolio entry |
| `GET /api/problems/:slug/data/:file` | Serve a CSV — only files listed in the case's `dataFiles` |
| `/api/studio/scenarios/**` + `/studio` pages | Scenario Studio: create/import, edit (validated on save), list in Community, export, delete |
| `/portfolio/:runId` (page) | Public record of a published run |
| `lib/agents.ts` | The orchestrator (fire triggers, reply, post-evaluation reaction) |
| `lib/session.ts` | Anonymous identity cookie |
| `lib/runEvents.ts` | Validates what a browser may log (allow-list) |
| `lib/problems.ts` | The only door to content — official files *and* Studio scenarios (slug `s-…`); client-safe views + server-only bundles |

### Packages

| Package | Key files | Responsibility |
|---|---|---|
| `domain` | `run.ts`, `entities.ts` | Event types, the run state machine, content/agent types |
| `database` | `src/runs.ts`, `migrations/*.sql` | Insert/read runs, append events (row-locked), publish atomically |
| `agents` | `triggers.ts`, `hints.ts`, `prompt.ts`, `respond.ts`, `guard.ts`, `evaluator.ts` | The agent engine and the grader |
| `ai` | `anthropicProvider.ts`, `openaiCompatibleProvider.ts`, `mockProvider.ts`, `config.ts` | Model calls (Claude or Gemini/Groq/…); model choice; offline mode |
| `simulation-engine` | `loadRolePack.ts`, `scenarioSchema.ts`, `starterScenario.ts` | Load cases; the one schema every scenario must pass; Studio template; strip secrets |
| `content-tools` | `streamwave.ts`, `analyzeStreamwave.ts`, `import-scenario.ts` | Seeded data generator + analyzer; promote Studio exports to official files |

### Content (`content/role-packs/data-analyst/companies/streamwave/`)

| File | Goes to the browser? | What |
|---|---|---|
| `personas/*.json` | name/title/colour only | Who the coworkers are, how they write |
| `simulations/watch-time-decline/simulation.json` | yes, **minus the truth model** | Brief, resources, concepts, data file list |
| `…/data/*.csv` | yes | The six tables |
| `…/agents.json` | **never** | What each agent knows, hint levels, triggers, leak guards |
| `…/rubric.json` | labels only | Criteria with weak/strong anchors |
| `…/analysis.json` | **never** | Facts measured from the CSVs, for the grader |

## Key concepts

**Run** — one attempt at one problem. Status moves
`started → in_progress → submitted → evaluated → published`. Published runs are frozen by
Postgres triggers.

**Event log** — a run is a list of things that happened, only ever appended:
`run_started`, `brief_viewed`, `resource_opened`, `query_run`, `message_sent`,
`message_received`, `submission_drafted`, `submission_finalized`, `evaluation_returned`,
`run_published`. Chat messages don't change the status.

**Trigger** — a rule in `agents.json` for when a coworker speaks up on their own (e.g. Sam, the
first time you query `sessions`). Each fires at most once per run.

**Hint level** — how much an agent may help right now; unlocks with time spent or questions
asked, computed in code.

**Leak guard** — a regex check on every agent reply; if it reveals something you haven't raised
yourself, it's replaced and flagged.

**Truth model + measured facts** — the hidden answer, and the numbers that prove it, given only to
the grader.

## Walkthrough: one query, end to end

1. You run `SELECT device, app_version, COUNT(*) FROM sessions GROUP BY 1,2` → DuckDB answers in
   your browser in ~10 ms.
2. `SqlConsole` posts `{type: "query_run", sql, rowCount: 4}` to `/api/runs/<id>/events`.
3. The route validates it (`parseClientEvent`), stamps the time, and `appendRunEvent` locks the
   run row, checks the state machine, and inserts the event.
4. The response returns; then Next's `after()` calls `fireDueTriggers`:
   - `dueTriggers` sees two new matches: `sam-hello` (query mentions `sessions`) and
     `sam-app-versions` (mentions `app_version`);
   - `sam-hello` has fixed text → posted as `message_received` with `trigger: "sam-hello"`;
   - `sam-app-versions` has a prompt → `generateAgentMessage` builds Sam's system prompt (persona,
     knowledge, hint policy) and a user turn (activity log, transcript, hint level, instruction),
     calls the small model, runs the leak guard, and posts the result.
5. Within 4 s, the Slack panel's poll picks them up and shows an unread badge on Sam.

## Walkthrough: submitting

1. `POST /submit` validates the write-up (Zod), appends `submission_finalized`.
2. `evaluateSubmission` sends rubric + truth + measured facts + submission + query log to the most
   capable model with a strict output schema; the overall score is computed in code.
3. `evaluation_returned` is appended; Priya's reaction is generated and posted.
4. If grading fails, the run stays `submitted`; calling submit again grades the stored write-up.

## Defence in depth

| Risk | Stopped by |
|---|---|
| Browser posts its own grade | Event allow-list (`lib/runEvents.ts`) |
| Someone reads another user's run | Every query filters by the cookie's user id; returns 404 |
| Illegal step (edit after submitting) | Domain state machine → 409 |
| Two requests at once | Row lock (`select … for update`); unique index for triggers |
| A bug edits a published run | Postgres triggers |
| Truth reaches the browser | `toClientSafe` + type + leak test; `readDataFile` allow-list |
| An agent gives the answer away | Split knowledge, coded hint levels, prompt rules, leak guard, eval |
| Grader parses free text wrong | Structured outputs + code-computed score |

## Running it locally

```bash
pnpm install
createdb casebench && createdb casebench_test
DATABASE_URL=postgres://localhost/casebench pnpm db:migrate
DATABASE_URL=postgres://localhost/casebench_test pnpm db:migrate
cp .env.example apps/web/.env.local     # set DATABASE_URL; add ANTHROPIC_API_KEY for real agents
pnpm dev                                 # http://localhost:3000

TEST_DATABASE_URL=postgres://localhost/casebench_test pnpm test
pnpm --filter @casebench/agents eval     # needs ANTHROPIC_API_KEY
pnpm --filter @casebench/content-tools generate:streamwave   # regenerate the dataset
```
