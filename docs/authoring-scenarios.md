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
