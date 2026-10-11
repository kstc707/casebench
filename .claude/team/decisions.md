# Decisions log

Every product decision, newest first. Each entry: **what**, **why**, **what it replaced or ruled out**,
and **status**. Agents add entries only after the owner agrees. "Proposed" means discussed but not yet
confirmed by the owner.

---

### 2026-10-11 · Add a cofounder agent and one-on-one chats · **Decided**
- **What:** a `cofounder` agent, a strategic partner that challenges ideas and keeps a notebook, plus `/talk
  <agent>` so the owner can chat with any team member directly (it remembers through `chats/<agent>.md`).
- **Why:** the owner wanted to interact with agents individually, *"rather than just guiding the
  manager"*, and wanted a partner for direction, separate from the builders.

### 2026-10-11 · Build a dev team of AI agents · **Decided**
- **What:** six agents (researcher, planner, engineer, reviewer, tester, docs-writer) working through RPI,
  each keeping a lessons file updated after every task.
- **Why:** the owner felt *"I am not in control of most of it"* when everything was built fast from short
  prompts. A team with an approval gate, separate review and testing, and written lessons keeps the
  owner in control and stops mistakes from repeating.
- **Ruled out for now:** building the in-product AI team for learners first. It's next, built *by* this team.

### 2026-10-10 · Learners direct an AI instead of hand-coding · **Proposed**
- **What:** in practice tasks, an AI assistant writes code at the learner's direction; grading covers the
  result (real tests) plus how well they directed, reviewed and verified the AI.
- **Why:** the owner's concern that people won't code by hand in the future; matches the original note
  "the person solving should have access to AI" and "token optimization".
- **Status:** waiting for the owner's confirmation before planning.

### 2026-10-09 · Practice mode section 1 shipped (PR #8, merged) · **Decided**
- **What:** five real humanize bugs; code before the fix; the project's own tests run **in the browser**
  (Pyodide); solved only when every required test passes.
- **Limit accepted:** results are checked in the browser and could be faked, so each solve is labelled
  `checkedIn: "browser"`. Server-side checking needs a real sandbox first.
- **Ruled out:** running learner code on our server via Pyodide in Node, since it could reach secrets.

### 2026-10-09 · Python only; one project until one section fully works · **Decided**
- **Why (owner):** *"we will include more if we are able to successfully do one section."*

### 2026-10 · Real tasks from open source; practice before live · **Decided**
- **What:** Tier 1 = already-fixed issues graded by the real tests from the real fix (unlimited, no
  maintainer burden). Tier 2 = live issues, unlocked by a threshold rather than a fixed "top 10", one
  claimant per issue, a reviewer gate, and AI use disclosed.
- **Why:** differentiates from Kaggle/LeetCode and AI-coworker simulators (SIMU, Anthropos, Forage);
  real outcomes; maintainers are wary of AI-generated PRs (GitHub added PR limits on 2026-08-27).
- **Replaced:** invented "investigate the metric" case studies as the main product.

### 2026-10 · Agents must be load-bearing · **Decided**
- **What:** a task should need its agents; if deleting them leaves the task unchanged, they're a gimmick.
- **Why:** feedback from a data chief that the data-analyst demo looked like Kaggle.

### 2026-10 · A PDF case study instead of a feedback form · **Decided**
- **What:** share Casebench with a PDF case study; the feedback-form PR (#7) isn't needed.
- **Status:** PR #7 should be closed.

### 2026-10 · Research → Plan → Implement; the owner approves plans before code · **Decided**
- **Why:** from the owner's notes; keeps the owner in control.
