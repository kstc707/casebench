# Vision: what Casebench is

> **Create, share, and solve realistic simulations of real work.**
> Don't ask people questions about doing the work. Put them in a situation where they have to do it.

Casebench is a platform where anyone can build an interactive work situation (a broken
dashboard, a production incident, a failed campaign, a confusing sign-up flow) and anyone else can
step into it and try to solve it. Internally, the mental model is *LeetCode's repeatable practice +
Chegg's help when you're stuck + a community that creates and rates the problems*, with the static
question replaced by a small working environment.

## The difference from a practice-question site

| A practice question | A Casebench simulation |
|---|---|
| "Find the shortest path between two nodes." | "Delivery times are up. Management wants to know why." |
| The problem is defined for you | You first work out *what the problem is* |
| One right answer, checked by tests | Several defensible answers, graded against a hidden truth and your process |
| Static | Coworkers who message you, data to query, documents to read, time pressure |

## The core loops

**Solver:** discover → enter the environment → investigate (query, read, ask coworkers, ask for
hints) → submit → evaluation → debrief → rate and discuss → next simulation.

**Creator:** create (from a template or an export) → play-test → publish → see attempts, completion
rate, scores, ratings and comments → improve.

More creators → more simulations → more solvers → better feedback for creators → better simulations.

## The simulation primitive

Every simulation, in any field, is the same shape (`packages/simulation-engine/src/scenarioSchema.ts`):

| Part | What it is | In the code today |
|---|---|---|
| Metadata | title, category, skills, time | `problem` |
| Environment | documents, data (SQL), channel | `problem.resources`, `dataFiles` |
| Actors | manager, coworkers (AI agents with private knowledge) | `personas`, `agents.agents` |
| State | what the solver has done; hidden truth | the run's event log; `truthModel` |
| Behaviour | who speaks up when; hint ladder; leak guards | `agents.triggers`, `hintLevels`, `leakGuards` |
| Deliverable | the sections the solver hands in | `problem.deliverable` |
| Evaluation | rubric + ground truth + process signals | `rubric`, grader in `packages/agents/src/evaluator.ts` |
| Debrief | scores, reasons, strengths, improvements | evaluation result + feedback view |
| Complexity | computed difficulty profile | `packages/simulation-engine/src/complexity.ts` |

## Where we are (honestly)

| MVP stage | Status |
|---|---|
| 1. Simulation runtime: environment, agents, submit, evaluate, debrief | ✅ Built |
| 2. Creator: structured, form-based (+ JSON) | ✅ Built (Simulation Studio) |
| 3. Publishing: others discover and solve | ✅ Built (Community listing, play links) |
| 4. Community feedback: like, rate, comment, creator stats | ✅ Built (build log 09) |
| 5. Complexity score: structural, then calibrated by solvers | ✅ v1 built (build log 09) |
| "I'm stuck" hint ladder | ✅ Built (build log 09) |
| AI author agent: researches real problems online → drafts a simulation by CB → human review | ✅ Built (build log 12) |
| AI-assisted creation for community creators ("describe it → draft") | ⏳ Next: reuse the author agent in the Studio |
| Profiles: who created / solved what, profile pages | ✅ Built (build log 11): name + profile key, no email (demo) |
| More environment types: logs, file trees, mock APIs, branching decisions | ⏳ Later |
| Moderation, rate limits | ⏳ Before a public launch |

## Deliberately NOT now

Recruiter marketplace, hiring assessments, certificates, creator monetisation, enterprise
dashboards, recommendation engines, dozens of categories, hundreds of simulations.

## The two questions that matter

1. **Do people enjoy solving these?** Measure starts → finishes → ratings → "want another one".
2. **Will people create good simulations for others?** The strongest signal: someone finishes one
   and says *"I want to make one for my friends."*

The first real test: 5–10 very different simulations (data investigation, incident debugging,
security investigation, product decision, operations problem) in front of 20 real people.

## The moat isn't "AI"

Many products have AI characters. What compounds here is the loop:
**creator → simulation → solver → observable actions → evaluation → community feedback → better
simulation**. Over time the event logs show what makes a simulation hard, where people get stuck,
which paths experts take, and what makes one fun. No one can copy that data.
