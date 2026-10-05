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
