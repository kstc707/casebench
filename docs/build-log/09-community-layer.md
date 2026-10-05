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
