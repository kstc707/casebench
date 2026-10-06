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
| 14 | [A structured feedback form](14-feedback-form.md) | `claude/feedback-form` |
