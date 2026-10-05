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
