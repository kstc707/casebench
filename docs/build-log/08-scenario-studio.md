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
