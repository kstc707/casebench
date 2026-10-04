# Deploying Casebench

Target setup: **Vercel** (the Next.js app) + **Neon** (Postgres) + an **Anthropic API key**.
All three have free tiers or pay-as-you-go pricing. About 20 minutes.

## 1. Database (Neon)

1. Create a project at neon.tech. Copy the **pooled** connection string
   (`postgres://…-pooler…/neondb?sslmode=require`).
2. From your machine, apply the migrations once:
   ```bash
   DATABASE_URL='postgres://…' pnpm db:migrate
   ```
   Run this again whenever a new file appears in `packages/database/migrations/`.

## 2. API key (Anthropic)

Create a key in the Claude Console. Set a monthly spend limit. Rough cost per attempt: agent
replies use a small model (cents per run); grading uses the most capable model once per
submission.

## 3. App (Vercel)

1. Import the GitHub repo in Vercel.
2. **Root Directory:** `apps/web`. Framework: Next.js (auto-detected). Vercel installs the pnpm
   workspace from the repo root automatically.
3. Environment variables:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon pooled connection string |
   | `ANTHROPIC_API_KEY` | your key |
   | `CASEBENCH_AGENT_MODEL` | optional — defaults to `claude-haiku-4-5` |
   | `CASEBENCH_EVALUATOR_MODEL` | optional — defaults to `claude-opus-5-5` |

4. Deploy. Open `/problems/watch-time-decline`, start, and check Priya's kickoff arrives.

## 4. Smoke test after every deploy

- Start a run → kickoff message appears.
- Run a query on `sessions` → Sam messages within a few seconds.
- DM Priya → a real (non-"offline mode") reply.
- Submit a short write-up → Feedback shows "AI" grading (no "Offline grader" pill).
- Publish → the portfolio link opens in a private window.

## Before sharing publicly

- **Rate limiting.** Anyone can start runs and trigger AI calls. Add per-user/IP limits on
  `/api/runs`, `/messages` and `/submit` (e.g. Upstash Ratelimit) before posting the link widely.
- **Spend limit** on the API key (above).
- Run the agent eval with the production model and commit `docs/evals/agents-latest.md`.

## Notes

- The SQL engine (DuckDB-WASM, ~36 MB) loads from the jsDelivr CDN in users' browsers. To serve
  it from your own deployment instead, set `NEXT_PUBLIC_DUCKDB_BUNDLE=local` and add
  `pnpm duckdb:local` before the build command.
- Grading can take up to a minute; the submit route allows up to 300 s (`maxDuration`).
