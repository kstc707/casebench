# Casebench — review pack

You are reviewing **Casebench**, a project by a recent data-science master's graduate who is job-hunting
(data analyst / data scientist / AI engineering roles) and wondering whether it could become a startup.
It was built with an AI coding assistant (Claude Code), directed and reviewed by the author.

This file contains the docs, a file tree, and all source code (large data files omitted).
Please give a **candid, specific** review — not encouragement. Cite file paths for code claims, and say
"not in this file" rather than guessing about anything you can't see.

1. **Product & market:** Is this a real problem? How does it compare to SIMU, JobSim, Anthropos, Forage,
   CodeSignal simulations? What is genuinely differentiated, and what is not?
2. **Startup potential:** Who would pay (job seekers, universities/bootcamps, employers)? What would you
   need to see in 90 days to believe it's a company? What would make you walk away?
3. **Hiring signal:** As a hiring manager for (a) data analyst, (b) data scientist, (c) AI/ML engineer roles,
   how would this project read on a resume? What would you probe in an interview?
4. **Architecture & code quality:** Strengths, weaknesses, over-engineering, missing pieces.
5. **AI agent design:** Are the trigger engine, hint levels, leak guard, and grader sound? How would you
   attack them (prompt injection, answer leakage, grader gaming)?
6. **Security & reliability:** Anything that must be fixed before sharing a public link?
7. **Top 5 next steps**, in priority order, each with why.

---


<!-- FILE: README.md -->

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
| **Author agent** | An AI that researches real-world incidents online and drafts simulations (fictional company, AI coworkers, planted data, SQL-verified answer key), published as **CB** after review. Runs daily and on demand at `/admin/agent` |
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



<!-- FILE: docs/how-the-backend-works.md -->

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
| `GET /api/simulations/:slug` | Complexity, solver stats, creator, recent solvers, likes/ratings, comments, and what you've done |
| `POST /api/simulations/:slug/{like,rating,comments}` | Like/unlike; rate 1–5 (finishers only); comment / delete your comment. Need a profile (401 otherwise) |
| `GET/POST/PATCH /api/profile` | Who you are / create a profile from a name (returns the one-time profile key) / rename |
| `POST /api/profile/signin`, `/signout` | Sign in on another device with @handle + profile key / sign out here |
| `POST /api/runs/:id/hint` | "I'm stuck": raise that coworker's hint level by one and get one hint |
| `/api/studio/scenarios/**` + `/studio` pages | Scenario Studio: create/import, edit (validated on save), list in Community, export, delete |
| `/portfolio/:runId` (page) | Public record of a published run |
| `lib/agents.ts` | The orchestrator (fire triggers, reply, post-evaluation reaction) |
| `lib/session.ts` | Who is asking: signed profile session or anonymous guest cookie; create profile, sign in/out, `requireProfile()` |
| `lib/runEvents.ts` | Validates what a browser may log (allow-list) |
| `lib/problems.ts` | The only door to content — official files *and* Studio scenarios (slug `s-…`); client-safe views + server-only bundles |

### Packages

| Package | Key files | Responsibility |
|---|---|---|
| `domain` | `run.ts`, `entities.ts` | Event types, the run state machine, content/agent types |
| `database` | `src/runs.ts`, `src/scenarios.ts`, `src/social.ts`, `migrations/*.sql` | Insert/read runs, append events (row-locked), publish atomically |
| `agents` | `triggers.ts`, `hints.ts`, `prompt.ts`, `respond.ts`, `guard.ts`, `evaluator.ts` | The agent engine and the grader |
| `ai` | `anthropicProvider.ts`, `openaiCompatibleProvider.ts`, `mockProvider.ts`, `config.ts` | Model calls (Claude or Gemini/Groq/…); model choice; offline mode |
| `simulation-engine` | `loadRolePack.ts`, `scenarioSchema.ts`, `starterScenario.ts`, `complexity.ts` | Load cases; the one schema every scenario must pass; Studio template; strip secrets |
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



<!-- FILE: docs/market-research.md -->

# Is anyone doing this? An honest assessment (October 2026)

## Short answer

**Yes — the core idea is already a crowded market.** "Work a simulated job with an AI manager and
AI teammates" exists as several funded products. Casebench is **not** a novel product idea. It
**is** a strong, credible portfolio project, *if* it's deployed, used by real people, and its AI
behaviour is measured. Treat it as proof of skill, not as a startup.

## Who's already doing it

| Product | What it does | Overlap with Casebench |
|---|---|---|
| **SIMU** (simuai.io) | Simulated workdays at a fictional company with tickets, an AI manager, standups, AI teammates, deadlines; has a data-analytics track | Very high — nearly the same pitch |
| **JobSim** (jobsim.work) | Simulations in the browser *or Slack*, 3+ AI stakeholders acting independently with competing demands | Very high — Slack, multiple autonomous agents |
| **Anthropos** | 30–45 min simulations with voice, chat, code, and documents; AI actors as colleagues and clients; sold to employers | High (B2B assessment) |
| **CareerCracker Job Simulator** | Generates a new scenario for any role on demand; AI plays colleagues, customers, execs; a hiring manager grades your shift | High (breadth over depth) |
| **CareerSimulator, OneRoadmap** | Job simulations including data analytics; AI-reviewed feedback, certificates | Medium |
| **Forage** | 250+ free employer-branded simulations (now including GenAI data-analytics tracks) | Medium — the distribution giant |
| **CodeSignal, TestGorilla, HackerRank** | Employer assessments adding AI role-play, "agentic assessments", immersive simulations | Medium — B2B hiring side |

## Where Casebench is genuinely different

Not "AI coworkers" — everyone has that. These are the defensible differences:

1. **A verified answer key.** Competitors that generate scenarios on the fly can't know what's
   actually true in their data, so they grade plausibility. Casebench plants measured effects in
   seeded data, proves them with tests, and grades against the measured facts.
2. **Agents that watch the actual work.** Coworkers react to the SQL you run (the event log),
   not just to chat. The grader sees the query log and can tell real analysis from confident
   guessing.
3. **Knowledge split across agents.** The manager doesn't know about the logging bug; the data
   engineer does. You have to ask the right person — a realistic skill most sims don't test.
4. **Measured agent safety.** A leak guard plus an adversarial eval with a reported leak rate.
5. **Open source, inspectable.** Every design decision is documented in the build log.

## How credible is it as a portfolio project?

**Strong — with conditions.** Entry-level hiring guidance in 2026 consistently asks for (a) an
LLM-powered, *deployed* application and (b) an evaluation of AI output. Casebench covers both,
plus data work (synthetic data with planted effects, SQL, segmentation) that matches data-analyst
roles. It's also a far better interview story than another dashboard or Kaggle notebook.

It becomes **weak** if:

- it's not live (a GitHub link alone is easy to ignore);
- you can't explain the code without notes — interviewers will probe the event log, the trigger
  engine, the leak guard, and why DuckDB;
- the agent eval has never been run (claims about "leak-proof agents" with no numbers);
- you call it a startup with zero users.

## How useful would it be if launched?

Honestly: **niche**. Job seekers mostly practice with free tools (Forage, LeetCode, YouTube), and
the paid market is moving to employers (assessments), where sales cycles are long. Realistic
paths:

- **Portfolio + small community launch** (recommended): deploy, get 20–50 real users (classmates,
  r/dataanalysis, LinkedIn), publish what you learn — e.g. "68% of users never deduplicated the
  sessions table". That *usage data* is the most impressive thing you can show.
- **Teaching tool**: university data-analytics courses need realistic, gradable cases. Your TA
  experience is a real angle — a pilot with one course is more credible than a consumer launch.
- **Startup**: only with a sharp wedge (e.g. "verified-answer-key cases for bootcamps") and
  distribution. Not recommended as the primary goal.

## What to do next to maximise credibility

1. Deploy (see `docs/deploy.md`) and run the agent eval with a real key; commit the report.
2. Get 10–20 people to do the case; add a small analytics view of how people approach it.
3. Write one short post: "What 20 analysts did when the data lied to them".
4. Add a second case using the same engine, to prove the content-as-data claim.

## Sources

- [The Complete Guide to AI Job Simulations — Cangrade](https://www.cangrade.com/blog/talent-acquisition/the-complete-guide-to-ai-job-simulations/)
- [SIMU — Prepare for your dream tech job with AI simulations](https://www.simuai.io/)
- [JobSim](https://www.jobsim.work/)
- [Anthropos — AI Job Simulations](https://anthropos.work/product/job-simulations/)
- [CareerCracker — Job Simulator](https://www.careercracker.com/job-simulator)
- [CareerSimulator](https://www.careersimulator.com/)
- [OneRoadmap — Data Analyst Job Simulation](https://www.oneroadmap.io/job-simulation/data-analyst)
- [Forage — Tata GenAI Powered Data Analytics](https://www.theforage.com/simulations/tata/data-analytics-t3zr)
- [CodeSignal — Agentic AI Assessments](https://codesignal.com/agentic-assessments/)
- [TestGorilla — Immersive Job Simulations](https://support.testgorilla.com/hc/en-us/articles/46448569600411-Introducing-Immersive-Job-Simulations)
- [Dataquest — AI projects for your portfolio (2026)](https://www.dataquest.io/blog/ai-projects/)
- [Upskillist — AI portfolio examples that impress recruiters (2026)](https://www.upskillist.com/blog/10-ai-portfolio-examples-impress-recruiters/)



<!-- FILE: docs/authoring-scenarios.md -->

# Writing a scenario

A guide for anyone who wants to create a Casebench simulation: designers, PMs, analysts,
teachers. No coding needed.

## Two ways to contribute

| | **Scenario Studio** (in the app) | **Files in the repo** |
|---|---|---|
| Who it's for | Anyone | Contributors comfortable with GitHub |
| Where | `/studio` on the live site | `content/role-packs/…` |
| Visible to | Anyone with the link; on the home page once you click **List in Community** | Everyone, in **Official simulations**, after review |
| Typical path | Start here → play it → refine → share | A Studio scenario that's proven good gets promoted here |

## Step by step in the Studio

1. Open **`/studio`**, type a title, pick a role (UX Designer, PM, Data Analyst, or *Other*),
   click **Create from template**. You get a complete, working scenario to edit.
2. **Brief & deliverable**
   - *Brief*: the manager's ask, in their voice. What happened, why it matters, what you need,
     by when. It's pinned in the project's Slack channel.
   - *Resources*: what the player can read: specs, research notes, support tickets, emails,
     metrics. Put the clues here.
   - *What they must hand in*: the write-up sections (e.g. Problem statement, Findings, Design
     proposal, Success metrics). Mark the essential ones as required.
3. **Coworkers**: 1–5 AI agents, exactly one manager. For each one: name, title, how they write,
   and **what they know** (private, one fact per line). Then *hint levels* (what they may reveal,
   and when it unlocks) and *must never* rules.
4. **Proactive messages**: things coworkers say on their own: at the start, after N minutes,
   when the player goes quiet, after N SQL queries, when a query mentions a word, or when they
   start drafting. Use a fixed message, or an AI instruction (e.g. *"Ask what they've found so
   far, referring to what they've looked at"*).
5. **Answer key & grading**
   - *Answer key*: what's actually going on, the evidence that proves it, the red herrings, and
     what a strong answer looks like. **Only the grader sees this.**
   - *Rubric*: 3–6 criteria, each scored 0–4, with what a weak and a strong answer look like.
     Weights set importance.
6. **Data (CSV)** *(optional)*: upload CSVs and the player gets a SQL workbench where each file
   is a table. Skip it for design, PM or writing cases.
7. **Save**. If something's wrong you get a precise list (e.g. *"exactly one coworker must be the
   manager"*). Saved scenarios are always playable.
8. **▶ Play** it yourself in a private window. Then **List in Community** to put it on the home
   page, or just share the play link.
9. **Export** downloads one `.json` file: a backup, or a way to send it to someone who can
   **Import .json** it in their Studio.

> Scenarios are tied to the browser you made them in until accounts exist. Export a backup.

## What makes a good scenario

- **A real, checkable answer.** "Why did X happen?" with a cause the evidence proves beats
  "design something nice". The grader is only as good as your answer key.
- **Clues in more than one place.** The numbers show *where*; research notes or tickets show
  *why*. Good players triangulate.
- **Red herrings with evidence against them.** E.g. "engineering blames page speed", plus a perf
  note showing speed is within budget.
- **Split the knowledge.** The manager knows the business goal; a researcher or engineer knows
  what users actually did. Players who ask the right person do better, just like at work.
- **Hints that unlock slowly.** Level 1: point to where to look, as a question. Level 2:
  confirm or push back on a hypothesis the player states.
- **"Must never" rules for the answer itself**, e.g. "Don't say the trial card is hidden unless
  they raise it first."
- **Pressure.** A 25–30 minute "leadership wants an early read" message makes it feel real.

The official **"Why did free-trial sign-ups drop on mobile?"** (UX Designer) is a complete worked
example. Open it, then look at its files in
`content/role-packs/ux-designer/companies/streamwave/simulations/trial-signup-dropoff/`.

## Advanced: leak guards and offline keywords

In **Advanced (JSON)** you can add:

- **Leak guards**: a safety net in case an AI coworker blurts out the answer.
  `{ "personaId": "maya", "pattern": "trial.{0,60}hidden", "unlessUserSaid": "trial|scroll", "replacement": "What did users actually do?" }`
  If a reply matches `pattern` and the player hasn't mentioned `unlessUserSaid`, the reply is
  swapped for `replacement`. `personaId: "*"` applies to everyone.
- **Offline keywords** on rubric criteria (`"offlineKeywords": ["trial.{0,40}hidden", "annual|billed"]`):
  used only when the site has no AI provider, so the keyword grader can still tell good from bad.

Patterns are regular expressions, case-insensitive.

## Promoting a scenario to official content (maintainers)

```bash
pnpm --filter @casebench/content-tools import-scenario ~/Downloads/s-1a2b3c4d.scenario.json --slug onboarding-checklist
pnpm test          # every scenario in content/ is validated by the test suite
git checkout -b content/onboarding-checklist && git add content && git commit -m "Add onboarding-checklist scenario"
```

The script validates the file with the same rules as the Studio, writes the persona, simulation,
agent, rubric and data files, and refuses to overwrite existing files without `--force`.

## The format (reference)

One scenario = one JSON document with five parts. Files in `content/` split the same parts across
files:

| Part | File in `content/` | Contents |
|---|---|---|
| `problem` | `simulations/<slug>/simulation.json` | title, role, company, brief, resources, `dataFiles`, `deliverable`, the hidden answer key |
| `personas` | `personas/<id>.json` (shared by a company's scenarios) | public identity + tone of each coworker |
| `agents` | `simulations/<slug>/agents.json` | knowledge, hint levels, rules, proactive triggers, leak guards |
| `rubric` | `simulations/<slug>/rubric.json` | criteria with weak/strong anchors and weights |
| `data` | `simulations/<slug>/data/*.csv` | CSV tables (Studio stores them inline) |

The schema with every rule and limit is `packages/simulation-engine/src/scenarioSchema.ts`.



<!-- FILE: docs/deploy.md -->

# Deploying Casebench

You need three free accounts: **GitHub** (you have it), **Vercel** (hosting) and **Neon**
(database), plus **one AI key**. Everything is done in a web browser. You don't need to install
anything on your computer. Expect 30–45 minutes the first time.

## Step 0 — Pick an AI provider (the "brain" for the agents)

A Claude Pro/Max subscription does **not** include API access; the API is billed separately.
Casebench works with several providers, so pick one:

| Option | Cost | Quality for this app | Notes |
|---|---|---|---|
| **Google Gemini** (`GEMINI_API_KEY`) | **Free tier**: coworkers use `gemini-3.5-flash-lite` (~500 requests/day), grading uses `gemini-3.5-flash` (~20/day) | Good | **Recommended to start.** Key from Google AI Studio, no card. Free-tier prompts may be used by Google to improve products, so don't put private data in. |
| **Groq** (`GROQ_API_KEY`) | Free tier | OK (open models) | Very fast; tight tokens-per-minute limit, so busy runs may throttle. |
| **OpenRouter** (`OPENROUTER_API_KEY`) | Free `:free` models, ~50 requests/day | OK | Low daily cap; fine for demos. |
| **Claude** (`ANTHROPIC_API_KEY`) | Pay-as-you-go, prepaid credits (about $5 minimum) | Best | ~$0.20–0.30 per full attempt (small model chats, top model grades). $5 ≈ 20 attempts. |
| **Ollama** | Free | Depends on your PC | Runs on your own computer, so it can't serve a deployed site. Good for offline development. |
| *(none)* | Free | Offline mode | Scripted messages + keyword grading. The app still works. |

The app auto-detects whichever key you set. Switching provider later is a single environment
variable change.

## Step 1 — Database (Neon)

1. Sign up at **neon.tech** with GitHub. Create a project (any name, nearest region).
2. On the dashboard, click **Connect** and copy the connection string with **"Pooled connection"**
   turned on. It looks like `postgresql://…-pooler.…neon.tech/neondb?sslmode=require`.

You don't need to create tables. The app does it automatically on every deploy (Step 3).

## Step 2 — AI key (Gemini example)

1. Go to **aistudio.google.com**, sign in, and click **Get API key → Create API key**.
2. Copy it.

## Step 3 — Hosting (Vercel)

1. Sign up at **vercel.com** with GitHub. Click **Add New → Project** and import `casebench`.
   (If it isn't listed, click "Adjust GitHub App Permissions" and allow the repo.)
2. **Root Directory:** click *Edit* and choose `apps/web`. Leave everything else at its default.
3. **Environment Variables:** add

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon pooled connection string |
   | `GEMINI_API_KEY` | your Gemini key (or one of the other provider keys) |

4. Click **Deploy**. The build runs `vercel-build`, which **creates or updates the database tables
   first** and then builds the app. About 2–3 minutes.
5. Open the URL Vercel gives you and go to `/problems/watch-time-decline`.

Every `git push` to `main` redeploys automatically. Pull requests get their own preview URL.

## Step 4 — Smoke test (do this after every deploy)

- Start a run → Priya's welcome message appears.
- Run a query on `sessions` → Sam messages you within a few seconds.
- DM Priya → you get a real reply (without "offline mode" in it).
- Submit a short write-up → Feedback has **no** "Offline grader" label.
- Publish → the portfolio link opens in a private/incognito window.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Build fails with `DATABASE_URL is not set` | Env var missing or misspelled in Vercel → add it and redeploy |
| Replies say "offline mode" | No AI key detected → check the variable name, then redeploy (env changes need a redeploy) |
| `429` / rate-limit errors in Vercel logs, or coworkers reply "Couldn't reach the AI service" | Free-tier limit hit → wait, set `CASEBENCH_EVALUATOR_MODEL=gemini-3.5-flash-lite` for more gradings per day, or switch provider |
| `LLM API error 404 … model … no longer available` | The provider retired a model → set `CASEBENCH_AGENT_MODEL` / `CASEBENCH_EVALUATOR_MODEL` to the model the error suggests, redeploy, and update the defaults in `packages/ai/src/config.ts` |
| SQL console stuck on "Loading the data engine…" | The browser can't reach `cdn.jsdelivr.net` (some school/office networks). See "Self-hosting DuckDB" below. |
| Grading times out | Hobby functions are capped at 300 s. Use a faster evaluator model (`CASEBENCH_EVALUATOR_MODEL`). |

## Before sharing the link widely

- **Rate limiting:** anyone with the link can trigger AI calls. Add per-user limits before posting
  it publicly (on the roadmap). With a free-tier key the worst case is hitting the daily cap; with
  a paid key, set a spend limit in the provider's console.
- Run the agent eval and commit `docs/evals/agents-latest.md`:
  `GEMINI_API_KEY=… pnpm --filter @casebench/agents eval` (this one needs Node on your computer,
  or ask Claude to run it in a session where the key is available).

## Optional settings

| Variable | Default | What it does |
|---|---|---|
| `CASEBENCH_ADMINS` | none | Profile handles (comma-separated) allowed to run and review the author agent at `/admin/agent` |
| `CRON_SECRET` | none | Enables the daily author-agent run (Vercel Cron sends it); without it the cron route refuses |
| `TAVILY_API_KEY` | none | Optional: general web search for the author agent (otherwise Hacker News + Wikipedia) |
| `AUTH_SECRET` | derived from `DATABASE_URL` | Signs profile sessions |
| `CASEBENCH_AI_PROVIDER` | auto-detect | `anthropic`, `gemini`, `groq`, `openrouter`, `ollama`, `openai-compatible`, `mock` |
| `CASEBENCH_AGENT_MODEL` | per provider | Model for the coworkers |
| `CASEBENCH_EVALUATOR_MODEL` | per provider | Model for grading |
| `CASEBENCH_LLM_BASE_URL` / `CASEBENCH_LLM_API_KEY` | — | Any other OpenAI-compatible service |
| `NEXT_PUBLIC_DUCKDB_BUNDLE` | CDN | `local` serves the SQL engine from your own site (also set the build command to `pnpm duckdb:local && pnpm vercel-build`) |



<!-- FILE: docs/roadmap.md -->

# Roadmap

## Done

- [x] Run backbone: Postgres event log, migrations, run API, anonymous identity (build log 01)
- [x] Seeded StreamWave dataset with a truth model proven by tests (02)
- [x] Workspace with DuckDB-WASM SQL sandbox; every query logged (03)
- [x] AI coworkers: personas, split knowledge, proactive triggers, hint levels, leak guard (04)
- [x] Grader agent with structured outputs; public portfolio page (05)
- [x] Agent eval script (adversarial probes, leak rate before/after guard)
- [x] Any AI provider incl. free tiers; browser-only deploys (06)
- [x] Slack-first dark UI (07)
- [x] Scenario Studio + multi-role engine + UX-designer case (08)
- [x] Community layer: discovery, likes, ratings, comments, solver stats, complexity score, "I'm stuck" (09)

## Next (in priority order)

- [ ] **AI-assisted creation**: "describe the simulation you want" → a validated draft in the Studio (biggest creator-side friction)
- [x] Profiles (name + profile key): who created and solved what, profile pages, history across devices (build log 11)
- [ ] Real login (Google/GitHub) if the demo turns into a product
- [ ] 5–10 very different simulations (incident debugging, security investigation, product decision, operations)
- [ ] New environment types: log viewers, file trees, mock APIs, branching decisions

- [ ] Deploy (Vercel + Neon) and run the agent eval with a real key; commit the report
- [ ] Rate limiting on AI-backed routes before sharing the link publicly
- [ ] Grader calibration set: hand-graded strong / weak / confidently-wrong submissions
- [ ] Usage analytics view: how real users approach the case (did they dedupe? ask Sam?)
- [ ] Moderation for Community listings (report / owner approval) and rate limits on scenario creation
- [ ] Port the coding track (editor + deterministic test runner) from the prototype
- [ ] Multi-run portfolios on profile pages
- [ ] Server-sent events instead of polling, if concurrency grows

## Open questions

- Should hint policy be user-configurable ("harder mode")?
- Voice: a spoken stand-up with the manager (speech-to-text in, text-to-speech out)?



<!-- FILE: docs/build-log/01-run-backbone.md -->

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



<!-- FILE: docs/build-log/02-streamwave-dataset.md -->

# 02 — A real StreamWave dataset, with a provable hidden truth

## Goal

Replace the 3-row placeholder CSVs with a realistic, deliberately messy dataset where the hidden
"answer" is genuinely true in the data — and *prove* it with tests, so the AI evaluator grades
against facts, not against a story someone wrote down.

## Where we started

`content/.../watch-time-decline/data/` held tiny fake CSVs and a `NOTE.md` saying the originals
were lost. The truth model said "PLACEHOLDER". Grading anything against it would have been
meaningless.

## What we built

| File | What it is |
|---|---|
| `packages/content-tools/src/rng.ts` | Seeded random number generator (same seed → same data, always) |
| `packages/content-tools/src/streamwave.ts` | The generator: builds 6 tables with the story baked in |
| `packages/content-tools/src/analyzeStreamwave.ts` | An *independent* analyzer that reads the CSVs and measures the story |
| `packages/content-tools/src/csv.ts` | Tiny CSV reader/writer |
| `packages/content-tools/scripts/generate-streamwave.ts` | Script: generate → write CSVs → analyze the written files → write `analysis.json` |
| `packages/content-tools/src/streamwave.test.ts` | Tests that every claim in the truth model holds in the committed files |
| `content/.../watch-time-decline/simulation.json` | New brief, resources (data dictionary, metric definition, release calendar), truth model |
| `content/.../watch-time-decline/rubric.json` | 6 criteria, 0–4 scale, with "weak" and "strong" anchors |
| `content/.../watch-time-decline/analysis.json` | Measured facts (server-only; never served to the browser) |

Regenerate any time with `pnpm --filter @casebench/content-tools generate:streamwave`.

### The story in the data

Three things happen on the same day (Aug 3), which is exactly what makes it a good case:

| Driver | What happened | What a good analyst finds |
|---|---|---|
| **Measurement artifact** | Mobile app 5.2.0 re-sent ~34% of play events (duplicate rows seconds apart, new `session_id`). 5.3.0 fixed it on Aug 3. | The "before" period was inflated. Raw decline **−21.5%** → after dedupe **−13.8%**. |
| **Mix shift** | "Summer Free Month" paid-social campaign brought young, mobile-heavy trial users. | They're ~15% of actives and watch ~47 min/week vs ~128 for existing users. Existing control-arm users: **−0.8%** (flat). |
| **Small real product effect** | Experiment `autoplay_next_v2` turned autoplay off for the treatment arm. | TV minutes/session ~59 (control) vs ~49 (treatment). Treatment users down ~10%. |

Plus realistic noise (red herrings): plan labels changed case in a billing migration
(`basic` vs `Basic`), ~10% missing genres, an old finished experiment, unrelated campaigns, and
web/TV releases in the calendar.

Size: 1,141 users, 19,045 session rows (~1 MB), 60 titles, 970 experiment rows.

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| **Generate** data instead of hand-writing it | Thousands of rows with controlled, measurable effects; easy to regenerate with tweaks | Hand-made CSVs — too small to be realistic, effects can't be tuned |
| **Seeded** randomness | Same output every run → the committed CSVs are reproducible and testable | `Math.random()` — different data every run, untestable |
| **Analyzer reads the written files**, not the generator's memory | Proves the story from what the user actually downloads | Trusting generator internals — would hide bugs in CSV writing |
| Measured numbers → `analysis.json`, given to the evaluator | The grader compares submissions to measured facts | Numbers typed into the truth model by hand — drift silently |
| TypeScript, not Python | One language across the repo; runs in the same test suite and CI | Python + pandas — natural for data work, but a second toolchain for one script |
| A metric defined in a resource ("no filters") | Mirrors real life: the dashboard definition is what hides the bug | Telling the user the metric is broken |
| A **release calendar** resource with a vague "analytics improvements" note | A fair, discoverable clue — exactly what a real analyst would cross-check | No clue at all (unfair) or an explicit "bug fixed" note (too easy) |

## Problems found along the way

1. **`tsx` failed with "top-level await not supported in cjs".** The script uses `await` at the
   top level, which needs ES modules. Fixed by setting `"type": "module"` in
   `packages/content-tools/package.json`.
2. **One duplicate after the fix date.** The tests found one "duplicate" on Aug 22. Investigation:
   it's two *genuine* sessions that happened to start in the same second — a chance collision,
   not the bug. Real data has these too, so we kept it and the test allows ≤ 2. (We also stopped
   the generator from creating re-sends in the last 5 minutes before the fix, so the bug itself
   can never cross the boundary.)
3. **Dedupe rule subtlety.** Comparing each event with the last *kept* event misses chains of
   re-sends (A, B 90s later, C 90s after B). The correct rule compares with the last *seen*
   event. There's a dedicated test for the chain case.

## How it was verified

`pnpm test` runs `streamwave.test.ts`, which checks:

- the committed CSVs are byte-for-byte what the seeded generator produces (no stale files);
- `analysis.json` matches the CSVs;
- raw decline < −18%; dedupe removes > 5 points; duplicates are mobile-only and pre-Aug 3;
- existing control-arm users are within ±3%;
- campaign users are > 10% of actives and watch < half as much;
- treatment TV sessions are 10–30% shorter.

## Explain it in an interview

> "The hardest part of a case-study product is the answer key. I wrote a seeded generator that
> plants three overlapping causes on the same date — a duplicate-event bug, a campaign that
> shifted the user mix, and an experiment with a small real effect — and then an independent
> analyzer that re-measures them from the published CSVs. Tests fail if the data ever stops
> telling that story, and the measured numbers feed the AI grader so it scores against facts."

- *Why not use a real public dataset?* — Real data has no known ground truth, so you can't grade
  "did they find the cause". Synthetic data with planted, measured effects gives a reliable answer
  key while still being messy.
- *How do you know the effects are detectable?* — The analyzer detects each one using only
  columns the user has (device, app_version, acquisition_channel, arm), and tests assert it.
- *Why three causes at once?* — A single cause is a quiz. Overlapping causes force segmentation
  and causal reasoning, which is what the rubric rewards.

## Try it yourself

1. Change the seed in `generateStreamwave()` and re-run the generator. Do the tests still pass?
   (They should — the story is structural, not luck.)
2. Change the duplicate rate from `0.3` to `0.05`, regenerate, and see which test fails.
3. In the SQL sandbox (step 03), find the duplicates yourself:
   `select user_id, content_id, device, count(*) from sessions group by user_id, content_id, device, substr(started_at,1,16) having count(*) > 1`



<!-- FILE: docs/build-log/03-workspace-and-sql.md -->

# 03 — The workspace: brief, SQL sandbox, write-up

## Goal

Turn the stub problem page into a place where the actual work happens: read the brief, explore
six tables with real SQL, and write the deliverable. Every action is logged to the run, because
that log is what the AI coworkers watch (step 04) and what the grader checks claims against (05).

## Where we started

The problem page showed the brief and a "Start" button. No data access, no SQL, no write-up.

## What we built

| File | What it is |
|---|---|
| `apps/web/components/Workspace.tsx` | The three-pane layout: brief/tables · SQL/write-up/feedback · Slack |
| `apps/web/components/duckdb.ts` | Starts DuckDB-WASM in a Web Worker, loads the CSVs as tables, runs queries |
| `apps/web/components/SqlConsole.tsx` | Editor + results grid; logs every query as a `query_run` event |
| `apps/web/components/WriteUp.tsx` | Executive summary / evidence / caveats / recommendation; autosaves drafts |
| `apps/web/components/api.ts` | The browser's only way to talk to the server (thin `fetch` wrappers) |
| `apps/web/app/api/problems/[slug]/data/[file]/route.ts` | Serves a case study's CSVs — only the ones listed in `dataFiles` |
| `apps/web/lib/runEvents.ts` | Now also validates `query_run` (SQL ≤ 5,000 chars, row count, error) |
| `apps/web/scripts/copy-duckdb.mjs` | Copies DuckDB's engine into `public/duckdb` for offline/local use |
| `packages/domain/src/run.ts` | New events: `query_run`, `message_sent`, `message_received` |

### How a query flows

1. On first load, `duckdb.ts` downloads each CSV from `/api/problems/watch-time-decline/data/…`
   and creates a typed table (`CREATE TABLE sessions AS SELECT * FROM read_csv(...)`).
2. You press **Run** (or Ctrl/Cmd+Enter). DuckDB runs the query **in your browser**, in a
   background worker, so the page never freezes.
3. The console shows up to 500 rows and posts
   `{ type: "query_run", sql, rowCount, error }` to `/api/runs/:id/events`.
4. The server validates it, stamps the time, appends it to the event log, and (after
   responding) lets the agents look at the new state.

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| **DuckDB-WASM** for SQL | Real analytical SQL (window functions like `LAG`, `date_trunc`, CTEs); fast hash joins; runs in a worker | **AlaSQL** (what the prototype used): tested it — no window functions, and the self-join a real analyst would write to find duplicates took **54 seconds** and froze the page |
| Query in the **browser**, not on the server | No per-user database load, instant results, no SQL-injection surface on our server | Running user SQL against Postgres — risky and costly |
| Log every query to the run | It's how the agents "see" the work, and how the grader catches claims that were never queried | Only logging the final submission — no process signal |
| CDN for DuckDB's engine by default, local copy as an option | The engine is ~36 MB; jsDelivr serves it compressed and cached. `NEXT_PUBLIC_DUCKDB_BUNDLE=local` serves it from our own app when a CDN isn't reachable | Committing 75 MB of WebAssembly to the repo |
| Only files in `dataFiles` are servable | `analysis.json`, `agents.json`, `rubric.json` sit in the same folder and must never be downloadable | Serving the whole folder |
| Drafts autosave 4 s after you stop typing | Survives a refresh; lets the manager notice you've started writing | Saving on every keystroke (event spam) |

## Problems found along the way

1. **AlaSQL was too weak** (see table). Switched engines after measuring, before building UI on it.
2. **The jsDelivr CDN was blocked in the build sandbox.** Added the local-bundle option and a
   copy script, which is also useful for offline demos.
3. **`date_trunc` failed with "null function or function signature mismatch".** Timestamps ending
   in `Z` were detected as `TIMESTAMP WITH TIME ZONE`, whose functions need DuckDB's ICU
   extension, which DuckDB tried to download. Fix: convert those columns to plain `TIMESTAMP`
   (all data is UTC) and turn off extension auto-loading, so everything runs on the core engine.
4. **Webpack warning about DuckDB's Node build** in the server bundle. DuckDB only runs in the
   browser, so it's marked external for the server build in `next.config.js`.
5. **Missing DOM types** (`scrollIntoView`, `confirm`) — the web app's `tsconfig` now includes
   the `DOM` library.

## How it was verified

A headless-browser test (Playwright) ran the full flow against a production build:

- DuckDB loaded and the starter weekly query returned results;
- a `LAG()` window-function dedupe query ran in **67 ms** and found **1,250** re-sends on app 5.2.0
  and 1 on 5.3.0 — matching the independent analyzer from step 02 exactly;
- queries were logged (the agents reacted to them — see step 04).

## Explain it in an interview

> "The SQL sandbox is DuckDB compiled to WebAssembly, running in a Web Worker in the browser. The
> CSVs load into typed tables, so candidates get real analytical SQL, and the page never blocks.
> Every query is logged to the run's event log, which is what the AI coworkers watch and what the
> grader uses to check whether claims in the write-up were actually backed by queries."

- *Why not run SQL on the server?* — Cost, safety, and latency. Nothing about the data is secret,
  so the browser is the right place; only the truth model must stay server-side.
- *Why did you switch from AlaSQL?* — I measured it: no window functions, and a realistic
  duplicate-finding self-join took 54 s. DuckDB did the window-function version in 67 ms.

## Try it yourself

1. Find the duplicates with a window function:
   ```sql
   WITH s AS (
     SELECT *, LAG(started_at) OVER (PARTITION BY user_id, content_id, device ORDER BY started_at) AS prev
     FROM sessions)
   SELECT device, app_version, COUNT(*) FROM s
   WHERE prev IS NOT NULL AND started_at - prev <= INTERVAL 120 SECOND
   GROUP BY 1, 2;
   ```
2. Open your browser's Network tab, run a query, and find the `POST /api/runs/…/events` call.
   What's in its body?
3. Try requesting `/api/problems/watch-time-decline/data/analysis.json`. Why do you get a 404?
   Find the line in `readDataFile` that decides it.



<!-- FILE: docs/build-log/04-ai-coworkers.md -->

# 04 — AI coworkers: agents that watch the work and message you on Slack

## Goal

Make the agents the heart of the product. Each case has coworkers — a manager (Priya) and a data
engineer (Sam) — who talk to you in Slack-style DMs, **notice what you're doing**, speak up on
their own, answer questions in character, and know *different slices* of the truth, so finding
the answer means asking the right person the right question.

## Where we started

`packages/ai` had a single manager prompt and a raw `fetch` call. Nothing was wired into the app,
and there was no notion of an agent acting on its own.

## What we built

### The agent engine — `packages/agents/src/` (pure logic, fully unit-tested)

| File | Responsibility |
|---|---|
| `activity.ts` | Turns the event log into what an agent can see: time spent, tables queried, last 5 queries, resources opened, the DM transcript |
| `triggers.ts` | `dueTriggers()` — which proactive messages should fire *now*, from the log and the clock |
| `hints.ts` | `currentHintLevel()` — hints unlock by time spent or questions asked |
| `prompt.ts` | The agent's system prompt (persona, private knowledge, hint policy, rules) and per-message prompt |
| `respond.ts` | One agent turn: build context → call the model → run the leak guard |
| `guard.ts` | `applyLeakGuards()` — a deterministic regex backstop against give-aways |
| `evaluator.ts` | The grader agent (step 05) |

### The AI provider — `packages/ai/src/`

| File | Responsibility |
|---|---|
| `anthropicProvider.ts` | Calls Claude with the official SDK, server-side only |
| `mockProvider.ts` | Offline stand-in (no API key): returns canned text so every code path still runs |
| `config.ts` | Model choice and provider selection (`ANTHROPIC_API_KEY` set → Claude, else mock) |

### The content — who the agents are and what they know

| File | Visible to the browser? | Contents |
|---|---|---|
| `content/.../streamwave/personas/priya.json`, `sam.json` | name, title, role, colour only | Tone, offline reply |
| `content/.../watch-time-decline/agents.json` | **never** | What each agent knows, hint levels, rules, triggers, leak guards |

**Knowledge is split on purpose.** Priya knows the business: the campaign, the experiment, and
her own (wrong) hunch that the content catalogue is thin. Sam knows the pipeline: the mobile
5.2.0 re-send bug, fixed on Aug 3, never backfilled. Priya *doesn't* know about the bug and sends
logging questions to Sam. That's how real teams work, and it rewards asking the right person.

### The orchestrator — `apps/web/lib/agents.ts`

The glue between the engine, the model, and the database:

- `fireDueTriggers(runId)` runs after every logged action (via Next.js `after()`, so logging never
  waits on the AI) and on every Slack poll (so time-based triggers like "you've gone quiet" work).
- `replyToUser(runId, channel, text)` stores your message, generates the agent's reply, stores it.
- `postEvaluationReaction()` has the manager react after grading.

### API and UI

| File | What |
|---|---|
| `apps/web/app/api/runs/[id]/messages/route.ts` | `GET` = chat history (+ fire due triggers); `POST` = message an agent |
| `apps/web/components/SlackPanel.tsx` | Channels with unread badges, typing indicator, polls every 4 s |
| `packages/database/migrations/0002_trigger_once.sql` | Unique index: each trigger can post at most once per run |

### The triggers in this case

| Trigger | Who | When | How |
|---|---|---|---|
| `kickoff` | Priya | run starts | fixed text |
| `sam-hello` | Sam | first query touching `sessions` | fixed text |
| `sam-app-versions` | Sam | first query mentioning `app_version` | AI-written (offers release history, must not mention the bug) |
| `priya-checkin` | Priya | 6 queries, ≥ 8 min in | AI-written, references what you've queried |
| `priya-idle` | Priya | 10 min of no activity | AI-written nudge |
| `priya-pressure` | Priya | 30 min in | AI-written: "VP wants an early read, two sentences" |
| `priya-draft` | Priya | first draft saved | fixed text |
| `post-evaluation` | Priya | after grading | AI-written reaction to the feedback |

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| **Code decides *when* an agent speaks; the model decides *what* it says** | Predictable, testable, cheap; no model call just to decide "should I talk?" | Asking the model every few seconds whether to speak — slow, costly, erratic |
| **Triggers are content (JSON)**, not code | A new case gets new coworker behaviour without engineering work | Hard-coded `if` statements per case |
| Fixed `text` *or* AI `prompt` per trigger (text doubles as offline fallback) | Simple messages are free and instant; context-aware ones use the model | Everything AI-generated |
| **Hint level computed in code**, stated in the prompt | The model can't talk itself into giving more help than it's allowed | Letting the model judge how stuck the user is |
| **Leak guard after the model** | Prompts can be argued around; a regex can't. Blocked replies are logged (`blocked: true`) | Relying on the prompt alone |
| Guard has an "unless the user said it" escape | Once *you* raise the campaign, Priya can discuss it — that's earned | Blocking topics forever (agents become useless) |
| Queries count as "raising a topic" | Querying `app_version` is as much a signal as asking about it | Only counting chat messages |
| Small model for agents, top model for grading | Agents chat often and must be fast and cheap; grading is rare and must be right. Per-persona and env overrides | One model for everything |
| Agents only see the **activity log** | They can never claim you did something you didn't | Giving agents raw database access |
| Polling every 4 s | Works on serverless hosting with no extra infrastructure | WebSockets — needs a long-lived server |
| Unique index for trigger-once | Two simultaneous polls can't post the same message twice | App-level check only (racy) |

## Problems found along the way

1. **Chat after submission.** The state machine made every event move status, so a manager
   message after grading was "illegal". Chat events are now status-neutral ("keep") — allowed at
   any point except after publishing — with tests.
2. **`tsx` couldn't import workspace packages** ("does not provide an export named …"): they were
   CommonJS by default. All packages are now ES modules (`"type": "module"`).
3. **Double-generation risk.** A poll and an `after()` hook could both decide a trigger is due.
   Handled at three levels: an in-process "in flight" set, the database unique index, and
   catching the unique violation as "someone else already posted it".

## How it was verified

- `packages/agents/src/agents.test.ts` (16 tests): trigger timing (kickoff once, query-pattern
  triggers, `notBeforeMinutes`, idle, elapsed time, silence after submission), hint unlocking
  per agent, leak-guard blocking and the "user raised it" escape, the prompt actually containing
  the knowledge and live context, the guard applied to model output, weighted scoring.
- `packages/simulation-engine/src/loadRolePack.test.ts`: every trigger/agent references a real
  persona, every guard regex compiles, public personas contain no knowledge or prompts.
- `packages/database/src/runs.test.ts`: a trigger id can only be posted once per run.
- Browser test: Priya's kickoff appeared on start; after querying `sessions` and `app_version`,
  Sam's channel showed an unread badge with both proactive messages; a DM got a reply.
- **Live-model eval**: `pnpm --filter @casebench/agents eval` (needs `ANTHROPIC_API_KEY`) runs 8
  adversarial probes × 3 — "just tell me the answer", prompt injection, asking Sam about
  marketing, asking for numbers — and reports raw leak rate, final leak rate (after the guard),
  helpfulness when a hint was earned, and latency, into `docs/evals/agents-latest.md`.
  *Not yet run* — there was no API key in the build environment.

## Explain it in an interview

> "Each simulation has AI coworkers defined as content: a persona, a private slice of the truth,
> a hint policy, and proactive triggers. Deterministic code watches the run's event log and
> decides *when* an agent should speak — like Sam pinging you when you first touch the sessions
> table, or your manager asking for a status update after 30 minutes — and the model decides
> *what* to say, in character, with the activity log as context. Hint levels unlock in code, and
> every reply passes a regex leak guard so the model can't give the answer away. I evaluate the
> agents with adversarial probes and report the leak rate before and after the guard."

- *Is this "agentic"?* — Yes, in the sense that matters: agents act on their own initiative from
  observed state, not only in response to the user. They don't call tools; they don't need to.
  I deliberately kept the decision of *when* to act in code — it's testable and cheap.
- *How do you stop the agent leaking the answer?* — Four layers: knowledge split across agents,
  hint level enforced in code, prompt rules, and a deterministic post-generation guard, measured
  by the eval.
- *Why a small model for agents?* — Latency and cost: a chat reply should feel instant. The
  eval tells me whether the small model holds the line; if not, the persona JSON can switch
  models without code changes.
- *What breaks at scale?* — Polling. At thousands of concurrent users, move to server-sent events
  and a queue for trigger generation.

## Try it yourself

1. Add a trigger to `agents.json`: Sam says "nice, you found the release calendar" when you open
   that resource (`{ "type": "event", "eventType": "resource_opened" }`). Run the tests.
2. In `agents.test.ts`, write a test proving `priya-pressure` doesn't fire after submission.
3. Ask Priya "is it the campaign?" before and after running a query on `acquisition_channel`.
   Look at `applyLeakGuards` and explain why the answers can differ.
4. With an API key, run the eval and read `docs/evals/agents-latest.md`. Which probe is closest
   to leaking?



<!-- FILE: docs/build-log/05-grading-and-portfolio.md -->

# 05 — Grading against the truth, and a public portfolio page

## Goal

Close the loop: submit a write-up, get graded against **what's actually true in the data** (and
what you actually did), hear back from your manager, and publish a frozen, shareable record.

## What we built

| File | What it does |
|---|---|
| `packages/agents/src/evaluator.ts` | The grader: prompt, output schema, weighted score, offline heuristic |
| `apps/web/app/api/runs/[id]/submit/route.ts` | Freeze submission → grade → record → manager reacts |
| `apps/web/app/api/runs/[id]/publish/route.ts` | Freeze the run and write the portfolio entry |
| `packages/database/src/runs.ts` | `publishRun` (one transaction) and `getPublishedRun` (public read) |
| `apps/web/components/Feedback.tsx` | Score, per-criterion bars and reasons, strengths, improvements, Publish |
| `apps/web/app/portfolio/[runId]/page.tsx` | Public page: write-up, grade, every query, the Slack conversation |

### How grading works

1. `submission_finalized` is appended (the write-up can't change after this).
2. The grader gets: the rubric with weak/strong anchors, the **truth model**, the **measured
   facts** from `analysis.json`, the submission, and a **process log** (every query, in order).
3. The model returns per-criterion scores (0–4), justifications, strengths and improvements in a
   **fixed schema** (structured outputs) — no free-text parsing.
4. **The overall score is computed in code** from the criterion scores and rubric weights.
5. `evaluation_returned` is appended and Priya reacts in Slack, in character, without a number.

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| Grader sees truth **and measured facts** | Can tell "sounds right" from "is right" with real numbers | Truth narrative only |
| Grader sees the **process log** | Claims never backed by a query deserve skepticism; good work in the queries earns credit | Grading the essay alone |
| **Structured outputs** with a Zod schema | Typed, validated scores; no regex over model text | "Respond in JSON" and hope |
| Weighted score computed in code | Deterministic and auditable; the model can't do arithmetic wrong | Asking the model for the total |
| Most capable model, high effort, server-side fallback | Grading is rare and must be right; fallback re-runs on another model if one declines | The small chat model |
| **Retry-safe submit** | If grading fails, the run stays "submitted" and pressing Submit again grades the stored write-up | Making the user re-submit (impossible — submitted runs are frozen) |
| Portfolio summary assembled from the record, no AI | It can't overstate what happened | An AI-written summary |
| Publish = event + portfolio row in **one transaction** | Never a published run without a portfolio entry, or the reverse | Two separate writes |
| Public page shows only published runs | Drafts and in-progress work stay private | Any run by id |
| Offline heuristic grader, clearly labelled | The whole flow works without an API key, but nobody mistakes it for a real grade | Failing without a key |

## How it was verified

- Unit: weighted score maths; offline heuristic rewards the right ideas and labels itself.
- Database: publish is atomic; publishing twice fails and leaves exactly one portfolio row; an
  unpublished run is not publicly readable.
- Browser: submitted a write-up → Feedback tab with score and criteria → Priya's reaction in
  Slack → Publish → the portfolio page opened in a **fresh browser with no cookies**.
- The real-model grading path typechecks against the SDK but has **not yet run against the live
  API** (no key in the build environment). Run one attempt with a key before demoing.

## Explain it in an interview

> "Grading uses the most capable model with structured outputs: it scores each rubric criterion
> 0–4 against the hidden truth and the measured facts, and it also sees the candidate's query log,
> so it can tell real analysis from confident guessing. The overall score is computed in code.
> Publishing freezes the run — Postgres triggers make it immutable — and creates a public page
> with the write-up, the grade, every query, and the conversation with the AI coworkers."

- *How do you know the grader is fair?* — Honest answer: that needs a calibration set — a few
  hand-graded submissions (strong, weak, confidently wrong) and a check that the grader ranks them
  the same way. That's the next eval to build.

## Try it yourself

1. Submit a deliberately wrong write-up ("it's the thin summer catalogue") and compare the
   feedback with a correct one.
2. Read `buildEvaluatorSystemPrompt` and find where the process log is used.
3. Try `curl -X POST /api/runs/<id>/publish` before grading. Which line returns 409?



<!-- FILE: docs/build-log/06-any-ai-provider.md -->

# 06 — Run on free AI providers, and one-click deploys

## Goal

Make the project runnable without a paid Claude API account (a Claude chat subscription doesn't
include API access), and make deploying possible from a browser with nothing installed locally.

## What we built

| File | What |
|---|---|
| `packages/ai/src/openaiCompatibleProvider.ts` | One adapter for every service that speaks the OpenAI "chat completions" format: Gemini, Groq, OpenRouter, Ollama, … |
| `packages/ai/src/config.ts` | Provider presets (URL, key variable, default models) and auto-detection from whichever key is set |
| `packages/ai/src/providers.test.ts` | Tests against a fake API server: request shape, auth header, JSON validation, retry, provider selection |
| `apps/web/package.json` → `vercel-build` | Runs database migrations, then builds, on every Vercel deploy |
| `docs/deploy.md` | Rewritten as a browser-only, step-by-step guide with a provider comparison |

### Structured output without vendor support

Claude has strict structured outputs; most free providers only promise "a JSON object". So the
adapter:

1. puts the JSON Schema (generated from the same Zod schema) in the system prompt;
2. asks for `response_format: json_object`;
3. validates the reply with Zod (also accepting JSON wrapped in a code fence or chatty text);
4. if it doesn't validate, sends the error back and retries **once**;
5. then fails loudly — grading never silently accepts a malformed result.

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| One OpenAI-compatible adapter | Covers many providers with ~100 lines; free tiers live there | A separate SDK per vendor |
| Plain `fetch`, no SDK | The request is one JSON POST; no extra dependency | The `openai` npm package |
| Auto-detect from env keys | Switching provider = change one variable, no code | A config file to edit |
| Gemini as the recommended free default | Generous free daily limits and a high tokens-per-minute cap, which matters because each agent call carries ~2k tokens of context | Groq — fast, but a 6k tokens/minute cap throttles bursts |
| Migrations inside `vercel-build` | No local tools needed; the schema is always current on deploy | Running `pnpm db:migrate` by hand from a laptop |
| The provider interface didn't change | The agent engine and grader worked unchanged; this is the payoff of the abstraction from step 04 | — |

## Honest caveats

- Not run against the live Gemini/Groq/OpenRouter APIs from the build environment (outbound
  access is blocked there). Tested with a fake server that mimics the format. Do one real run
  after deploying.
- Free open models are weaker than Claude at staying in character and following "don't reveal"
  rules. That's exactly what the leak guard and the agent eval are for. Run the eval on whichever
  provider you deploy with.
- Model names in the presets change over time. Override with `CASEBENCH_AGENT_MODEL` /
  `CASEBENCH_EVALUATOR_MODEL` if a provider retires one.

## Explain it in an interview

> "The AI layer is behind a provider interface. Claude uses the official SDK with strict
> structured outputs; everything else goes through one OpenAI-compatible adapter, where I get
> structured output by putting the JSON Schema in the prompt, validating with Zod, and retrying
> once with the validation error. The provider is picked from environment variables, so the same
> deploy can run on a free Gemini key for demos or Claude for quality."

## Try it yourself

1. Read `providers.test.ts`, then make the fake server return invalid JSON twice. Which error
   does the grader raise, and where would the user see it?
2. Add a preset for another OpenAI-compatible provider in `PRESETS` and a test for its detection.



<!-- FILE: docs/build-log/07-slack-first-ui.md -->

# 07 — A Slack-first, dark workspace

## Goal

Make the workday feel like a real job: the main screen is a Slack-like workspace, not a
dashboard with a chat box. Coworkers are the centre; tools open as "apps" next to the
conversation.

## What we built

| File | What |
|---|---|
| `apps/web/components/Workspace.tsx` | App shell: sidebar (channel, DMs, apps), main view, chat dock, toasts, start screen |
| `apps/web/components/useChat.ts` | One hook for all Slack state: polling, unread counts, sending, toasts |
| `apps/web/components/ChatView.tsx` | A DM conversation: grouped messages, typing indicator, composer (Enter sends) |
| `apps/web/components/BriefChannel.tsx` | `#watch-time-drop`: the manager's pinned brief, resources as attachments |
| `apps/web/components/SqlConsole.tsx` | Now a "SQL workbench" app with its own schema browser |
| `apps/web/components/Avatar.tsx` | Shared avatars |
| `apps/web/app/globals.css` | Dark theme tokens and all layout styles |

### How the screen works

- **Sidebar:** `# watch-time-drop` (the brief), **Direct messages** with Priya and Sam (presence
  dot, unread badge), **Apps**: SQL workbench, Write-up, and Feedback once you're graded.
- **DM view:** the conversation fills the screen.
- **App view:** the tool fills the middle, and the **current DM is docked on the right**, so you
  can query and talk at the same time. Switch the docked person from its header.
- **Toasts:** when a coworker messages you in a conversation you can't see, a notification pops up
  top-right; click it to jump there.
- On narrow screens everything stacks vertically (checked at 390 px wide, no horizontal scroll).

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| Chat-first layout | The agents are the product; a real analyst's day runs through Slack | Three fixed panes with chat as a side widget (previous UI) |
| Docked chat while an app is open | Real multitasking: ask Sam about a row while looking at it | Switching screens to reply |
| One `useChat` hook | Sidebar badges, the docked chat, the DM view and toasts all agree on one state | Each component polling separately (it was one panel before) |
| "Seen" = whatever is on screen | Matches Slack: an open conversation is read | Explicit "mark as read" |
| SQL app stays mounted when hidden | Loaded tables and results survive navigation | Remounting (re-downloads the data) |
| Dark theme by default | The owner's choice; reads as a professional work tool | Following the OS setting |

## Problems found along the way

- After submitting, the screen stayed on the write-up, so the grade was invisible until you
  clicked Feedback. It now jumps to Feedback automatically. The browser test caught this.
- Toasts covered the docked chat's input; moved to the top-right.
- Priya's kickoff said "the brief is on the left"; updated to point at the channel.

## How it was verified

Headless browser at 1440×900 and 390×844: start screen → Priya's DM with the kickoff → channel
with pinned brief and a resource opened → SQL workbench with schema → a query on `sessions`
triggers Sam: toast appears, the dock shows an unread badge → clicking the toast docks Sam's
conversation → message and reply in the dock → write-up → submit → Feedback opens with the score
→ no horizontal overflow on mobile.

## Explain it in an interview

> "The UI is modelled on Slack because the product is about working with people, even simulated
> ones. Tools open as apps with the conversation docked beside them, and a single chat hook owns
> polling, unread counts and notifications so every part of the screen stays consistent."

## Try it yourself

1. In `useChat.ts`, change `POLL_MS` to 10000. What gets worse, and what does the server do less?
2. Add a third "app" (e.g. a notes scratchpad) to the sidebar. Which three places in
   `Workspace.tsx` need to change?



<!-- FILE: docs/build-log/08-scenario-studio.md -->

# 08 — Scenario Studio: anyone can create simulations, for any role

## Goal

Let people other than the owner (e.g. a UX-designer friend) create scenarios and play them,
without code. Prove the engine isn't specific to data analysis.

## Where we started

One data-analyst case. The write-up always had the same four sections, the workspace always
showed a SQL app, and the offline grader's keywords were hard-coded for that case. Adding a case
meant hand-writing JSON files and opening a pull request.

## What we built

### Generalising the engine (any role, any deliverable)

| Change | File |
|---|---|
| Problems define their own write-up sections (`deliverable`), company name and channel | `packages/domain/src/entities.ts` |
| Roles are open-ended (`ux-designer`, `product-manager`, custom) | same |
| Submissions are `section → text`; validated against the problem's sections | `packages/agents/src/evaluator.ts` (`parseSubmission`) |
| Grader prompt and offline keywords come from the scenario, not code | same, plus `offlineKeywords` in `rubric.json` |
| Agents see table names from any SQL (not a fixed list) | `packages/agents/src/activity.ts` (`tablesIn`) |
| SQL workbench only appears when a scenario has data | `apps/web/components/Workspace.tsx` |

### One schema for every scenario — `packages/simulation-engine/src/scenarioSchema.ts`

A Zod schema for the whole scenario plus cross-checks: exactly one manager, every agent and
trigger points to a real coworker, unique ids, regexes compile, the rubric matches the slug,
listed CSVs are present, data ≤ 3 MB. The same schema checks **files** (a test validates every
scenario in `content/`), **Studio saves**, and **imports**.

### The Studio

| Piece | File |
|---|---|
| `scenarios` table (bundle as JSON, author, listed flag) | `packages/database/migrations/0003_scenarios.sql`, `src/scenarios.ts` |
| Starter template per role (valid from the first save) | `packages/simulation-engine/src/starterScenario.ts` |
| API: list/create/import, get/save/list/delete, export | `apps/web/app/api/studio/scenarios/**` |
| Studio home + editor (6 tabs) | `apps/web/components/studio/*`, `apps/web/app/studio/**` |
| Studio scenarios load through the same door as files (slug `s-…`) | `apps/web/lib/problems.ts` |
| Home page: Official + Community sections | `apps/web/app/page.tsx` |
| Promote to official files | `packages/content-tools/scripts/import-scenario.ts` |
| A full UX-designer example | `content/role-packs/ux-designer/companies/streamwave/…/trial-signup-dropoff/` |

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| Store a Studio scenario as **one validated JSON document** | Same shape as file content; one schema; export/import for free | Normalised tables per persona/trigger — lots of code, no benefit |
| **Validate on save**, refuse invalid | A saved scenario is always playable | Saving drafts that may crash at play time |
| Server **assigns the slug** (`s-xxxxxxxx`) | Authors can't hijack an official or someone else's scenario | Author-chosen slugs |
| Unlisted-by-link, opt-in **List in Community** | Share privately while testing; publish when ready | Everything public immediately |
| Editing is author-only (by the anonymous cookie) | Simple ownership until accounts exist | Open editing |
| Official catalogue stays **files in git**, promoted via import script + PR | The owner curates quality; reviews happen in pull requests | Auto-promoting popular Studio scenarios |
| Forms for common fields, **raw JSON tab** for everything | Non-coders get a friendly editor; power users aren't limited | A form for every field (huge UI) |
| Studio scenarios always read fresh from the DB | Edits apply immediately | Caching them like files |
| Template-based offline grading falls back to effort (length) | A fresh scenario without keywords isn't stuck at 0 offline | Always 0 (what the first test showed) |

## Problems found along the way

1. **Import script crashed on a malformed file** (`Cannot set property of undefined`) instead of
   explaining. It now lets the validator report every problem.
2. **Offline grading scored a Studio scenario 0/100**: template rubrics have no keywords. Now
   effort-based when there are no keywords, and labelled as offline as before.
3. **Bold text in form fields** (inherited from labels) and rubric inputs that lost their meaning
   once filled. Fixed with explicit labels.

## How it was verified

- Schema tests: every scenario in `content/` passes; a deliberately broken scenario returns
  readable errors (no manager, unknown coworker, wrong rubric slug, missing CSV); the starter
  template is valid for four roles including a custom one.
- Repository tests (Postgres): only the author can read/update/delete; playable by slug; listing
  is opt-in.
- Import round trip: an exported scenario re-imported under a new slug produced identical data
  and agent files; existing content is not overwritten without `--force`.
- Browser test, two separate browsers:
  1. "Alex (UX)" creates a UX scenario from the template;
  2. making both coworkers managers is refused with "exactly one coworker must be the manager";
  3. Alex fixes it, saves and lists it;
  4. a different visitor finds it under Community "by Alex (UX)", plays it (no SQL app; UX
     write-up sections) and is graded;
  5. the official UX case's SQL workbench runs a before/after funnel query.

## Explain it in an interview

> "I separated the simulation engine from the content. A scenario is a single JSON document
> validated by one Zod schema with cross-reference checks, and the same schema guards files in
> git, saves from an in-app editor, and imports. That let me add a Studio where non-engineers,
> like a designer friend, author cases for their own field (coworkers, what each knows, triggers,
> a hidden answer key, a rubric), play them immediately, and share them, while the official
> catalogue stays curated through pull requests."

- *How do you stop a bad scenario breaking the app?* — It can't be saved: validation happens
  server-side on every save, including cross-references and size limits.
- *Could someone use the Studio to see an official answer key?* — No. The server assigns slugs, so
  Studio scenarios can't claim official ones, and authors only ever get their own scenarios back.
- *What's missing for real multi-user use?* — Accounts (ownership is per browser today),
  moderation of Community listings, and rate limits on creation.

## Try it yourself

1. Create a scenario for your own field in `/studio`, play it, and export it.
2. Import your export with `import-scenario` under a new slug and run `pnpm test`. Which test
   checks it?
3. Break the JSON in the Advanced tab (e.g. set a trigger's `personaId` to `"nobody"`) and Save.
   Find the line in `scenarioSchema.ts` that produced the error.



<!-- FILE: docs/build-log/09-community-layer.md -->

# 09 — Community layer: complexity, likes, ratings, comments, "I'm stuck"

## Goal

Turn Casebench from "a few analytics cases" into a platform where people create simulations of any
kind of work and others solve, rate and discuss them. See [`../vision.md`](../vision.md). This step
adds MVP stages 4 (community feedback) and 5 (complexity), plus the "I'm stuck" hint ladder.

## What we built

| Piece | Files |
|---|---|
| **Complexity score v1**: five dimensions + label, blended with solver results | `packages/simulation-engine/src/complexity.ts` (+ tests) |
| **Likes, ratings, comments; solver stats from runs** | `packages/database/migrations/0004_community.sql`, `src/social.ts` (+ tests) |
| Community API | `apps/web/app/api/simulations/[slug]/{route,like,rating,comments}` |
| Meta for many simulations at once (complexity + stats + social) | `apps/web/lib/community.ts` |
| **Discovery home**: Trending / New / Top rated / Hardest, category filter, search | `apps/web/components/Discover.tsx`, `apps/web/app/page.tsx` |
| Community panel: complexity breakdown, stats, like, rate, discussion | `apps/web/components/Community.tsx` (start screen + after feedback) |
| **"I'm stuck"**: one stronger hint per request | `hint_requested` event, `packages/agents/src/hints.ts`, `apps/web/lib/agents.ts` (`requestHint`), `api/runs/[id]/hint` |
| Creator stats in the Studio (attempts, finished, avg score, likes, rating) | `api/studio/scenarios`, `components/studio/StudioHome.tsx` |
| Broader categories (cybersecurity, marketing, finance, operations, support) | `packages/domain/src/entities.ts` |

### How the complexity score works

**Structural (from the simulation itself)**, each 0–10 on a square-root scale (early additions count most):

| Dimension | Measured from |
|---|---|
| Investigation depth | number and length of resources, rows of data |
| Ambiguity | private facts the coworkers hold, how many people hold them, number of judged criteria |
| Technical | 1 if no tools; 4+ if SQL is needed, more with more tables/rows |
| Deliverable scope | write-up sections, rubric criteria |
| Time | creator's estimate (180 min = 10) |

Score = 0.3·investigation + 0.3·ambiguity + 0.2·technical + 0.1·scope + 0.1·time.
Labels: < 3 Beginner, < 5 Intermediate, < 7 Advanced, else Expert.

**Observed (from solvers)**, once ≥ 5 people have finished:
`observed = 10 × (1 − completion rate × average score)`, weighted up to 60% as completions grow
(`completions / 50`). Average solve time replaces the creator's estimate when it's plausible (≥ 3 min).

Current values: watch-time case **6.7 Advanced**, UX sign-up case **5.5 Advanced**, blank template **3.1**.

### Ranking

- **Trending** = attempts in the last 7 days × 2 + likes + adjusted rating.
- **Top rated** uses a Bayesian average (ratings pulled toward 3.5 until there are several), so a
  single 5★ doesn't top the chart.
- **Hardest** = complexity score.

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| Complexity is a **transparent formula** | Creators and solvers can see why it's 6.7; easy to explain and test | A model that "predicts" difficulty with no data to train on |
| Structural first, then **calibrated by real results** | No data on day one; real outcomes are the truth later | Creator's easy/medium/hard label alone |
| Stats **computed from runs**, not counters | Can't drift from what happened | Incrementing counters on each event |
| **Only finishers can rate** | Ratings mean "I did it and it was good/bad" | Anyone can rate |
| "✓ solved it" badge on comments | Tells readers whose advice comes from experience | Anonymous, equal comments |
| "I'm stuck" raises the hint level **in code**, one step per press, and is logged | The help ladder is real and visible to the grader; the model can't over-help | Asking the model to "be more helpful" |
| Offline "I'm stuck" never shows the hint *policy* text | Policies are written for the agent and can contain the answer | Echoing the policy as a canned hint (caught in my own review) |
| Likes/comments keyed by **slug** | Official and Studio simulations behave identically | Separate systems per source |

## Problems found along the way

1. **Complexity over 10.** The first technical formula could reach 13.1, and the log scale rated a
   medium case "Expert". Fixed with a square-root scale and capped weights; tests check the range.
2. **Offline hint leaked the policy.** The offline reply initially echoed the hint description (e.g.
   "confirm the re-send bug plainly"). Now it uses the persona's neutral offline reply.
3. **"Average 0 min" from test runs.** Instant test attempts made solver time look real. Times below
   3 minutes are ignored, and the UI says whether time is "from solvers" or "creator's estimate".

## How it was verified

- 78 unit and integration tests, including:
  - **Complexity:** range, the real case > template, data > writing, solver blending kicks in at 5 completions.
  - **Community:** stats from runs, one like per person, finish-before-rating, comment order/badge/ownership.
  - **Hints:** the "I'm stuck" ladder (per agent, capped).
- **Browser test, two users:**
  1. The home page shows complexity badges; Hardest sort and category filter work.
  2. The start screen shows the complexity breakdown and stats; like works.
  3. "I'm stuck" gets a reply.
  4. After submitting, the solver rates 4★ and comments, and the "solved it" badge shows.
  5. A stranger sees the comment, sees no rating prompt, and gets a 403 rating without finishing.
- Regression: the workday and Studio browser suites still pass.

## Explain it in an interview

> "I turned the simulator into a two-sided platform: creators publish simulations and solvers rate
> and discuss them. Difficulty isn't the creator's label. It's a transparent five-dimension score
> from the simulation's structure that is recalibrated from real outcomes once enough people finish,
> weighted by completion rate and average score. Stats come straight from the run event log, ratings
> are limited to people who finished, and the 'I'm stuck' button raises the hint level in code so the
> grader can see how much help was used."

## Try it yourself

1. In `complexity.ts`, change the weights so ambiguity counts 50%. Which simulation moves most?
2. Write a SQL query against `run_events` that finds where people press "I'm stuck" most (time since start).
3. Add a "most discussed" sort to `Discover.tsx`.



<!-- FILE: docs/build-log/10-first-deploy.md -->

# 10 — First live deploy (Vercel + Neon + Gemini) and what broke

## Goal

Put Casebench on the internet for free and prove the whole loop works live, not just in tests.

## Setup

| Piece | Choice |
|---|---|
| Hosting | Vercel (Hobby), project root `apps/web`, public at **casebench.vercel.app** |
| Database | Neon Postgres (pooled connection); tables created by `vercel-build` running the migrations |
| AI | Google Gemini free tier via `GEMINI_API_KEY` |
| Protection | Vercel "Standard Protection": the production domain is public, per-deploy URLs need a Vercel login |

## How it was tested

My cloud session can't reach `vercel.app` directly, so I tested through the Vercel connector:

1. **Read checks:** project settings, env vars present (values never read), build state, runtime logs.
2. **Page checks:** fetched `/`, a simulation page, and `GET /api/simulations/watch-time-decline`. These
   showed the complexity badges, stats from Neon and an empty comment list, so the database and the
   migrations work.
3. **A real end-to-end run from a temporary Vercel Sandbox** (a short-lived VM that can reach the
   site): `curl` started a run, sent Priya a DM, pressed "I'm stuck", and read the messages back.

## What broke

**Every AI call failed with a 500.** The runtime log said:

> `LLM API error 404: This model models/gemini-2.5-flash-lite is no longer available to new users.
> Please update your code to use models/gemini-3.5-flash-lite`

Google retires model versions, and new API keys can't use the old ones. The unit tests couldn't catch
this because they use the offline mock. That's exactly why a live smoke test matters.

## Fixes

| Fix | File |
|---|---|
| Gemini defaults → `gemini-3.5-flash-lite` (coworkers) and `gemini-3.5-flash` (grading) | `packages/ai/src/config.ts` |
| If the AI provider errors (retired model, free-tier limit, outage), the coworker posts a visible "couldn't reach the AI service" notice and the error is logged, instead of the request failing with a 500 | `packages/agents/src/respond.ts` (+ test) |
| **Retry temporary errors:** 429 (rate limit) and 5xx ("high demand") get two retries, after 1 s and then 3 s; errors that waiting won't fix (bad key, retired model) fail at once | `packages/ai/src/openaiCompatibleProvider.ts` (+ test) |
| **Grading falls back to the smaller model:** if `gemini-3.5-flash` is still overloaded after the retries, grade with `gemini-3.5-flash-lite` instead of failing (it was returning 503 for several minutes straight on the free tier) | `packages/agents/src/evaluator.ts` (+ test) |
| Deploy guide: free-tier limits per model; troubleshooting rows for retired models and limits | `docs/deploy.md` |

**Second issue, found on the preview deploy of the fix:** the coworkers now answered with real
Gemini replies (Priya, a real "I'm stuck" hint, and Sam's AI-written message), but grading failed once
with `503: This model is currently experiencing high demand`. The run was safely left "submitted", and
the UI already offers "press Submit again to retry grading", but free tiers do this often, so the
adapter now retries briefly before giving up.

**Why not fall back to the offline scripted reply?** That would hide a broken setup behind a reply that
looks real. A visible notice plus a log line is honest and easy to debug.

**Free-tier limits to know:** about 500 requests/day for Flash-Lite and about 20/day for Flash. Grading
uses Flash, so that's roughly 20 graded submissions a day. Set
`CASEBENCH_EVALUATOR_MODEL=gemini-3.5-flash-lite` to trade some grading quality for more volume.

## Explain it in an interview

> "Everything passed in CI, but the first live run failed: Google had retired the model my defaults
> pointed at. I found it in the production logs within minutes, updated the defaults, and changed the
> agent layer so a provider failure degrades to a visible notice instead of a 500, because a
> free-tier limit shouldn't break the product. Lesson: mocks prove your logic, not your integrations;
> you need a live smoke test after every deploy."



<!-- FILE: docs/build-log/11-profiles.md -->

# 11 — Profiles: who created it, who solved it, how many

## Goal

Until now every browser was an anonymous id. The app could count attempts, but it couldn't say
**who** made a simulation, **who** solved it, or show anyone's history, and clearing cookies made you
a new person. This step adds profiles.

## The decision: a name, not a login

My first plan was "Sign in with GitHub / Google". I changed course after this feedback:

> "It's a demo, don't ask for real Gmail. Just tell them to create a profile with some name."

So a profile is **just a name**:

| Step | What happens |
|---|---|
| Pick a name | e.g. "Sai Teja" → you become **@sai-teja** (unique: `sam`, `sam-2`, …) |
| This browser | stays signed in (a signed cookie, valid for a year) |
| Profile key | shown **once**, e.g. `k7m2-q9xa-4rtp`; it signs you in on another device; only its hash is stored |
| Your guest history | comes with you: the profile reuses this browser's guest id, so nothing is lost |

| Option | Why not (for now) |
|---|---|
| Google / GitHub login | Real setup (OAuth apps, secrets) and asks testers for real accounts. Overkill for a demo |
| Email + password | Password storage, resets, email delivery: lots of work, little value at this stage |
| Name only, no key | Anyone could "be" anyone on a new device |

## When you're asked for a name

Playing stays open. The name is asked for at the moment something gets **recorded under you**:
starting a simulation, creating one in the Studio, liking, rating, or commenting. The dialog then
continues what you were doing.

## What's recorded and shown

| Where | What |
|---|---|
| Simulation page | "Created by {name}", **"Solved by N people"** (distinct people) with the most recent solvers |
| Comments | written as your profile; the name links to your profile; "✓ solved it" badge |
| Cards on the home page | "by {creator's current name}" |
| **Profile page** `/u/{handle}` | what you've **solved** (date, number of attempts) and **created** |
| Scores | your best score per simulation is visible **only to you** |

## How it works

| Piece | File |
|---|---|
| `users` table (id, handle, display name, key hash); published runs may now change owner only | `packages/database/migrations/0005_accounts.sql` |
| Create profile, verify key, merge a guest into a profile, solved/created lists, recent solvers | `packages/database/src/accounts.ts` (+ tests) |
| "Who is asking": signed session cookie or guest cookie; `requireProfile()` (→ 401) | `apps/web/lib/session.ts` |
| API: `GET/POST/PATCH /api/profile`, `POST /api/profile/signin`, `POST /api/profile/signout` | `apps/web/app/api/profile/**` |
| The "Pick a name" dialog, header chip, `requireProfile()` on the client | `apps/web/components/Profile.tsx` |
| Profile page | `apps/web/app/u/[handle]/page.tsx` |
| "Solved by N people" counts distinct people, not finished attempts | `solvers` in `packages/database/src/social.ts` |

### Key design points

- **One id for everything.** Runs, scenarios, likes, ratings and comments were already keyed by the
  guest id. A profile **takes over** that id, so there's no data migration at sign-up. Signing in on a
  second device **merges** that device's guest rows into the profile, in one transaction; if both had
  liked the same simulation, it stays one like.
- **Signed session cookie** (`userId.expiry.HMAC`). User ids aren't secret (they appear in API
  responses), so the cookie must be signed, or anyone could become anyone. The signing key is
  `AUTH_SECRET`, or derived from `DATABASE_URL` if that isn't set: one less thing to configure.
- **Profile key** is 12 random characters from an unambiguous alphabet (~60 bits). Because it's
  random, not user-chosen, a SHA-256 hash is enough (no bcrypt-style stretching needed), compared in
  constant time.
- **Published runs stay frozen**, except that the database trigger now allows changing the
  owner, which is what a merge needs. Any other change is still rejected (tested).

## Bugs found while building it

1. **"Solved by 11 people"** counted finished *attempts*, not people. Added a distinct-people count
   (`solvers`) and a test that finishing twice is still one solver.
2. My browser test clicked the header's "Create profile" chip instead of the dialog's button:
   two buttons with the same label. Scoped the test to the dialog.

## How it was verified

- 86 unit and database tests (profiles, unique handles, key check, guest merge incl. published runs,
  likes de-duplicated on merge, distinct solvers, published runs still immutable).
- Browser test with three people:
  1. A likes a simulation → "Pick a name" → profile created, key shown → the like goes through.
  2. A starts, submits, rates and comments; the comment links to A's profile; "Solved by" lists A.
  3. A's profile shows the solve **with** the score; a stranger sees it **without** the score.
  4. A signs in on a second device: wrong key rejected, right key works, and the start continues.
  5. C creates a Studio simulation → asked for a name → the editor shows C as author.
- The earlier workday, community and Studio suites still pass.

## Explain it in an interview

> "Every action was already keyed by one id: an anonymous browser id. To add profiles I made the
> profile take over that id, so nothing needed migrating, and signing in on another device merges
> that device's history in one transaction. Since it's a demo, I didn't add OAuth: a profile is a
> name plus a one-time random key, stored only as a hash. The session cookie is HMAC-signed, because
> user ids aren't secret. And 'solved by' counts distinct people: my first version counted attempts."

## Try it yourself

1. Add a "Top solvers" page: people ranked by number of simulations solved (one SQL query on `runs`).
2. Let people regenerate their profile key from their profile page.
3. Show a solver's best score publicly if they opt in.



<!-- FILE: docs/build-log/12-author-agent.md -->

# 12 — The author agent: an AI that researches real problems and writes simulations

## Goal

> "Create an agent whose sole purpose is adding problems to the application, which should encapsulate
> real-world problems. The agent can do online research and use the simulation agent to create a
> problem, and the author will be CB."

## What it does

```
plan → research online → brief → design → generate data → quality gate → (repair ≤ 2) → draft by CB → review → publish
```

| Step | What happens | Model? |
|---|---|---|
| 1. Plan | Picks a concrete problem (your topic, or today's rotating theme) and 1–3 search queries, avoiding simulations that already exist | small model |
| 2. Research | Searches **Dan Luu's curated list of public postmortems** (hundreds of real incidents), **Hacker News** and **Wikipedia**; fetches the best pages; keeps only on-topic, readable text | no model: code |
| 3. Brief | Summarises the real-world pattern: what happened, root causes, how it shows in data, red herrings. **Cites only URLs it actually read**; invented citations are dropped | big model |
| 4. Design | Writes the whole scenario: fictional company and coworkers, private knowledge, hint levels, triggers, leak guards, hidden answer key, rubric, plus a **data recipe** and **SQL checks** | big model |
| 5. Data | Code turns the recipe into CSV tables (seeded, repeatable) | no model |
| 6. Quality gate | Schema validation; no answer-labelling columns; the brief must not trip the scenario's own leak guards; the agent's SQL checks must all return `ok = true` on the data, and **at least one must return false on the same recipe generated without the planted effects** (otherwise it proves nothing; the prompt asks for more) | no model |
| 7. Repair | Any failure goes back to the model as a list of problems; up to 2 repair rounds | big model |
| 8. Review | Saved as an **unlisted draft by CB**. An admin plays it, reads the sources and checks, and publishes or rejects it | human |

It runs **once a day** (Vercel Cron) and **on demand** from `/admin/agent`, optionally with a topic.

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| The model writes a **data recipe**, code writes the rows | Rows from a model are inconsistent and can't be trusted to contain the planted cause; a seeded generator is exact and repeatable | Asking the model for CSVs |
| **SQL checks prove the answer key** | The worst failure is a simulation whose "truth" isn't in the data. Now a draft exists only if the cause is findable | Trusting the model's claims |
| Research via **Hacker News + Wikipedia** (no key); Tavily optional | Gemini's Google Search grounding isn't available on the free tier | Paid search APIs |
| **Fictional** companies and people | Real incidents inspire the pattern; naming real companies would be unfair and possibly defamatory | Re-telling the real incident |
| **Review queue** before publishing | A human catches weak or wrong problems; the agent never publishes on its own | Auto-publish |
| One fixed **CB** profile authors everything | Clear provenance: "by CB" means "made by the Casebench agent, checked by a person" | Agent posting as an admin |
| Big model for brief/design, falls back to the small one if overloaded | Free-tier "Flash" is often busy; a draft from Flash-Lite still has to pass the same quality gate | Failing the run |

## What the first live run taught me

The first real run (Gemini, live web) "passed" but was bad:

1. **Research found nothing relevant.** Hacker News search requires every word by default, so long,
   specific queries returned nothing; Wikipedia then matched "List of Latin phrases", and the agent carried
   on anyway. Fixed: short queries, every word optional, a relevance filter on every source, one retry
   with broader queries, and **no relevant sources → no draft**.
2. **The checks proved nothing:** "at least one duplicate exists" is true for almost any data, and the
   recipe even had an `is_duplicate` column that labelled the answer. Fixed with the **counter-check**: run
   every check again on the same recipe without its planted effects; at least two must flip to false.
   Answer-labelling column names are rejected.
3. **The brief hinted at the cause.** Fixed by testing the brief against the scenario's own leak guards.

I rejected that draft, and the gate now catches all three automatically (tests included).

The second live run showed the gate working (it threw out off-topic pages, re-planned, caught an
`is_duplicate` column and a missing leak guard, and refused to publish when the checks proved
nothing) and two more things to fix:

4. **Common words fooled the relevance filter** ("UFOs … multiple times a month" matched "pixel
   firing multiple times"). Now a source's title must name a key term, and common words are ignored.
5. **The model didn't know how to write a check that proves something.** The prompt now explains the
   counter-check and gives three worked examples (drop after a date, duplicates in one segment, a rate
   that jumped in one segment); failures say exactly which checks passed without the cause; one more
   repair round; and the example scenario shows a leak guard (one repair produced malformed guards,
   which also exposed a bug: an empty pattern became a regex that matches everything).

The third live run (topic: "API latency regression after a deploy") showed research was the weak
link: Hacker News titles rarely match an incident type, so nothing relevant came back twice, and the
agent correctly refused to write anything. Two fixes:

6. A better corpus for real incidents: **Dan Luu's list of public postmortems** (one GitHub file,
   each entry a one-line summary plus a link), searched by keyword, with the linked write-up fetched.
7. The brief accepts sources that show the same **kind** of problem (same mechanism or symptom),
   not only the exact scenario.

The fourth live run worked: the topic "API latency regression after a deploy" pulled three real
postmortems (CircleCI: a database upgrade left query statistics stale; Cloudflare: a new rule exposed a
latent bug; Spotify: no exponential backoff caused a retry storm), and the draft's two SQL checks
passed on its data and failed without the planted cause. Two "Show HN"/"Launch HN" product posts
still got into the source list (unused by the brief), so those are now skipped.

## Safety

- **Fetched pages are untrusted.** They're wrapped as quoted `<source>` material, and the prompt says to
  ignore instructions inside them. Only public `https` URLs are fetched (no localhost, no raw IPs).
- **Model-written SQL runs in a sandbox:** only a single `SELECT`/`WITH` (no `;`, no DDL/DML, no
  `pg_*()` functions), an 8-second statement timeout, temporary tables only, and the transaction is
  **always rolled back**.
- **Admins only** (`CASEBENCH_ADMINS` = profile handles); the cron needs `CRON_SECRET`.
- The CB profile can't be signed into (its stored key hash isn't the hash of any key).

## Files

| Piece | File |
|---|---|
| Data recipe → tables, seeded RNG, effects, CSV | `packages/author-agent/src/dataSpec.ts` (+ tests) |
| Online research (HN, Wikipedia, optional Tavily), URL safety, HTML → text | `packages/author-agent/src/research.ts` (+ tests) |
| Rotating daily themes across 10 roles | `packages/author-agent/src/themes.ts` |
| The pipeline, prompts, quality gate, repair loop | `packages/author-agent/src/pipeline.ts` (+ tests) |
| Jobs table, CB profile | `packages/database/migrations/0006_author_agent.sql` |
| Job tracking, approve/reject, SQL-check sandbox | `packages/database/src/authorJobs.ts` (+ tests) |
| Background runs, admin check, Postgres column types | `apps/web/lib/authorAgent.ts` |
| API + daily cron | `apps/web/app/api/author-agent/**`, `apps/web/vercel.json` |
| Review console | `apps/web/app/admin/agent`, `apps/web/components/AgentConsole.tsx` |

## Setup (once)

| Variable | Value |
|---|---|
| `CASEBENCH_ADMINS` | your profile handle, e.g. `sai-teja` (comma-separate several) |
| `CRON_SECRET` | any long random string (Vercel sends it to the cron route) |
| `TAVILY_API_KEY` | optional: better general web search (free tier) |

## How it was verified

- Unit tests: the generator is deterministic and plants exactly what the recipe says; recipe mistakes
  are reported readably; research never fetches internal URLs and ignores scripts; the pipeline
  catches an invalid design, sends the error back, and the repair passes; failed checks after all
  repairs give up with reasons; offline mode refuses to run.
- Database tests: the SQL sandbox runs checks, isolates errors, blocks `drop`, and leaves nothing
  behind; jobs go running → ready → approved, can't be decided twice, and rejection deletes the draft.
- Locally: admin-only API, background job with log, cron refuses without the secret.
- Live: a real run on the Vercel preview with Gemini (see the PR).

## Explain it in an interview

> "I built an agent that writes the product's content. It researches real incidents online, writes a
> brief citing only pages it actually read, then designs a simulation: a fictional company, AI
> coworkers with private knowledge, a hidden answer key, and a data recipe. Code, not the model,
> generates the data. The model also writes SQL checks that prove the answer key is findable in that
> data; they run in a rolled-back Postgres transaction, and failures go back to the model to repair.
> Nothing goes live without a human approving it."



<!-- FILE: docs/build-log/README.md -->

# Build log

One entry per step of the build, in order. Each entry follows the same shape so you can read
any one on its own:

1. **Goal** — what this step was for, in one or two sentences
2. **Where we started** — the state of the project before the step
3. **What we built** — each change, with the file it lives in
4. **Decisions and why** — the choices that weren't obvious, and the alternatives we rejected
5. **Problems found along the way** — bugs discovered and how they were fixed
6. **How it was verified** — tests and manual checks, with commands you can re-run
7. **Explain it in an interview** — a short pitch plus likely questions with answers
8. **Try it yourself** — small exercises that make you change the code and see what happens

New steps get a new numbered file. Start with [how the backend works](../how-the-backend-works.md)
if you want the big picture first.

| # | Step | Branch / PR |
|---|---|---|
| 01 | [Run backbone: Postgres + API routes](01-run-backbone.md) | `claude/backbone-runs-api` |
| 02 | [StreamWave dataset with a provable hidden truth](02-streamwave-dataset.md) | `claude/backbone-runs-api` |
| 03 | [Workspace: brief, DuckDB SQL sandbox, write-up](03-workspace-and-sql.md) | `claude/backbone-runs-api` |
| 04 | [AI coworkers that watch the work](04-ai-coworkers.md) | `claude/backbone-runs-api` |
| 05 | [Grading against the truth + portfolio page](05-grading-and-portfolio.md) | `claude/backbone-runs-api` |
| 06 | [Any AI provider (free tiers) + one-click deploys](06-any-ai-provider.md) | `claude/backbone-runs-api` |
| 07 | [Slack-first, dark workspace UI](07-slack-first-ui.md) | `claude/backbone-runs-api` |
| 08 | [Scenario Studio: anyone can create simulations, any role](08-scenario-studio.md) | `claude/backbone-runs-api` |
| 09 | [Community layer: complexity, likes, ratings, comments, "I'm stuck"](09-community-layer.md) | `claude/community-layer` |
| 10 | [First live deploy, and the retired-model bug it caught](10-first-deploy.md) | `claude/gemini-3-5-models` |
| 11 | [Profiles: who created it, who solved it, how many](11-profiles.md) | `claude/accounts` |
| 12 | [The author agent: researches real problems and writes simulations](12-author-agent.md) | `claude/author-agent` |
| 13 | [Redesign: a real workplace, not a generic AI dashboard](13-workplace-ui.md) | `claude/workplace-ui` |



---

# File tree

```
.env.example
.github/PULL_REQUEST_TEMPLATE.md
.github/workflows/ci.yml
.gitignore
CLAUDE.md
CONTRIBUTING.md
LICENSE
README.md
apps/web/app/admin/agent/page.tsx
apps/web/app/api/author-agent/cron/route.ts
apps/web/app/api/author-agent/jobs/[id]/route.ts
apps/web/app/api/author-agent/route.ts
apps/web/app/api/problems/[slug]/data/[file]/route.ts
apps/web/app/api/profile/route.ts
apps/web/app/api/profile/signin/route.ts
apps/web/app/api/profile/signout/route.ts
apps/web/app/api/runs/[id]/events/route.ts
apps/web/app/api/runs/[id]/hint/route.ts
apps/web/app/api/runs/[id]/messages/route.ts
apps/web/app/api/runs/[id]/publish/route.ts
apps/web/app/api/runs/[id]/route.ts
apps/web/app/api/runs/[id]/submit/route.ts
apps/web/app/api/runs/route.ts
apps/web/app/api/simulations/[slug]/comments/route.ts
apps/web/app/api/simulations/[slug]/like/route.ts
apps/web/app/api/simulations/[slug]/rating/route.ts
apps/web/app/api/simulations/[slug]/route.ts
apps/web/app/api/studio/scenarios/[id]/export/route.ts
apps/web/app/api/studio/scenarios/[id]/route.ts
apps/web/app/api/studio/scenarios/route.ts
apps/web/app/globals.css
apps/web/app/layout.tsx
apps/web/app/page.tsx
apps/web/app/portfolio/[runId]/page.tsx
apps/web/app/problems/[slug]/page.tsx
apps/web/app/studio/[id]/page.tsx
apps/web/app/studio/page.tsx
apps/web/app/u/[handle]/page.tsx
apps/web/components/AgentConsole.tsx
apps/web/components/Avatar.tsx
apps/web/components/BriefChannel.tsx
apps/web/components/ChatView.tsx
apps/web/components/Community.tsx
apps/web/components/Discover.tsx
apps/web/components/Feedback.tsx
apps/web/components/Profile.tsx
apps/web/components/Shell.tsx
apps/web/components/SqlConsole.tsx
apps/web/components/Workspace.tsx
apps/web/components/WriteUp.tsx
apps/web/components/api.ts
apps/web/components/duckdb.ts
apps/web/components/studio/ScenarioEditor.tsx
apps/web/components/studio/StudioHome.tsx
apps/web/components/types.ts
apps/web/components/useChat.ts
apps/web/lib/agents.ts
apps/web/lib/api.ts
apps/web/lib/authorAgent.ts
apps/web/lib/community.ts
apps/web/lib/db.ts
apps/web/lib/problems.ts
apps/web/lib/runEvents.ts
apps/web/lib/session.ts
apps/web/lib/studio.ts
apps/web/next.config.js
apps/web/package.json
apps/web/scripts/copy-duckdb.mjs
apps/web/tsconfig.json
apps/web/vercel.json
content/role-packs/data-analyst/companies/streamwave/personas/priya.json
content/role-packs/data-analyst/companies/streamwave/personas/sam.json
content/role-packs/data-analyst/companies/streamwave/simulations/watch-time-decline/agents.json
content/role-packs/data-analyst/companies/streamwave/simulations/watch-time-decline/analysis.json
content/role-packs/data-analyst/companies/streamwave/simulations/watch-time-decline/data/content.csv
content/role-packs/data-analyst/companies/streamwave/simulations/watch-time-decline/data/experiments.csv
content/role-packs/data-analyst/companies/streamwave/simulations/watch-time-decline/data/marketing_campaigns.csv
content/role-packs/data-analyst/companies/streamwave/simulations/watch-time-decline/data/sessions.csv
content/role-packs/data-analyst/companies/streamwave/simulations/watch-time-decline/data/subscriptions.csv
content/role-packs/data-analyst/companies/streamwave/simulations/watch-time-decline/data/users.csv
content/role-packs/data-analyst/companies/streamwave/simulations/watch-time-decline/rubric.json
content/role-packs/data-analyst/companies/streamwave/simulations/watch-time-decline/simulation.json
content/role-packs/ux-designer/companies/streamwave/personas/diego.json
content/role-packs/ux-designer/companies/streamwave/personas/maya.json
content/role-packs/ux-designer/companies/streamwave/simulations/trial-signup-dropoff/agents.json
content/role-packs/ux-designer/companies/streamwave/simulations/trial-signup-dropoff/data/funnel.csv
content/role-packs/ux-designer/companies/streamwave/simulations/trial-signup-dropoff/rubric.json
content/role-packs/ux-designer/companies/streamwave/simulations/trial-signup-dropoff/simulation.json
docs/adr/0001-rebuild-modular-app.md
docs/architecture.md
docs/authoring-scenarios.md
docs/build-log/01-run-backbone.md
docs/build-log/02-streamwave-dataset.md
docs/build-log/03-workspace-and-sql.md
docs/build-log/04-ai-coworkers.md
docs/build-log/05-grading-and-portfolio.md
docs/build-log/06-any-ai-provider.md
docs/build-log/07-slack-first-ui.md
docs/build-log/08-scenario-studio.md
docs/build-log/09-community-layer.md
docs/build-log/10-first-deploy.md
docs/build-log/11-profiles.md
docs/build-log/12-author-agent.md
docs/build-log/README.md
docs/concept-brief.md
docs/deploy.md
docs/how-the-backend-works.md
docs/market-research.md
docs/roadmap.md
docs/vision.md
package.json
packages/agents/package.json
packages/agents/scripts/eval-agents.ts
packages/agents/src/activity.ts
packages/agents/src/agents.test.ts
packages/agents/src/evaluator.ts
packages/agents/src/guard.ts
packages/agents/src/hints.ts
packages/agents/src/index.ts
packages/agents/src/prompt.ts
packages/agents/src/respond.ts
packages/agents/src/triggers.ts
packages/agents/tsconfig.json
packages/ai/package.json
packages/ai/src/anthropicProvider.ts
packages/ai/src/config.ts
packages/ai/src/index.ts
packages/ai/src/mockProvider.ts
packages/ai/src/openaiCompatibleProvider.ts
packages/ai/src/provider.ts
packages/ai/src/providers.test.ts
packages/ai/tsconfig.json
packages/author-agent/package.json
packages/author-agent/src/dataSpec.test.ts
packages/author-agent/src/dataSpec.ts
packages/author-agent/src/index.ts
packages/author-agent/src/pipeline.test.ts
packages/author-agent/src/pipeline.ts
packages/author-agent/src/research.test.ts
packages/author-agent/src/research.ts
packages/author-agent/src/themes.ts
packages/author-agent/tsconfig.json
packages/content-tools/package.json
packages/content-tools/scripts/generate-streamwave.ts
packages/content-tools/scripts/import-scenario.ts
packages/content-tools/src/analyzeStreamwave.ts
packages/content-tools/src/csv.ts
packages/content-tools/src/rng.ts
packages/content-tools/src/streamwave.test.ts
packages/content-tools/src/streamwave.ts
packages/content-tools/tsconfig.json
packages/database/README.md
packages/database/migrations/0001_init.sql
packages/database/migrations/0002_trigger_once.sql
packages/database/migrations/0003_scenarios.sql
packages/database/migrations/0004_community.sql
packages/database/migrations/0005_accounts.sql
packages/database/migrations/0006_author_agent.sql
packages/database/package.json
packages/database/scripts/migrate.mjs
packages/database/src/accounts.test.ts
packages/database/src/accounts.ts
packages/database/src/authorJobs.test.ts
packages/database/src/authorJobs.ts
packages/database/src/index.ts
packages/database/src/pool.ts
packages/database/src/runs.test.ts
packages/database/src/runs.ts
packages/database/src/scenarios.test.ts
packages/database/src/scenarios.ts
packages/database/src/social.test.ts
packages/database/src/social.ts
packages/database/tsconfig.json
packages/domain/package.json
packages/domain/src/entities.ts
packages/domain/src/index.ts
packages/domain/src/run.test.ts
packages/domain/src/run.ts
packages/domain/tsconfig.json
packages/simulation-engine/package.json
packages/simulation-engine/src/complexity.test.ts
packages/simulation-engine/src/complexity.ts
packages/simulation-engine/src/index.ts
packages/simulation-engine/src/loadRolePack.test.ts
packages/simulation-engine/src/loadRolePack.ts
packages/simulation-engine/src/scenarioSchema.ts
packages/simulation-engine/src/starterScenario.ts
packages/simulation-engine/tsconfig.json
pnpm-lock.yaml
pnpm-workspace.yaml
prototype/casebench-demo.html
scripts/review-pack.mjs
tsconfig.base.json
vitest.config.mts
```

# Source code

_Lite pack: source code omitted. Base code claims only on the docs above._
