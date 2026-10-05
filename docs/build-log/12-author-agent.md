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
| 2. Research | Searches **Hacker News** (incident write-ups, postmortems) and **Wikipedia**, fetches the best pages, keeps readable text | no model: code |
| 3. Brief | Summarises the real-world pattern: what happened, root causes, how it shows in data, red herrings. **Cites only URLs it actually read**; invented citations are dropped | big model |
| 4. Design | Writes the whole scenario: fictional company and coworkers, private knowledge, hint levels, triggers, leak guards, hidden answer key, rubric, plus a **data recipe** and **SQL checks** | big model |
| 5. Data | Code turns the recipe into CSV tables (seeded, repeatable) | no model |
| 6. Quality gate | Scenario schema validation + the agent's SQL checks run against the generated data in Postgres. Every check must return `ok = true` | no model |
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
