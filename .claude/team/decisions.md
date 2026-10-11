# Decisions log

Every product decision, newest first. Each entry: **what**, **why**, **what it replaced or ruled out**,
and **status**. Agents add entries only after the owner agrees. "Proposed" means discussed but not yet
confirmed by the owner.

---

### 2026-10-11 · Librarian labels: "closest passages — check them" or "nothing related" · **Decided**
- **What:** section 1 never claims to have found the answer. It always shows the top passages with sources
  under "closest passages: check whether they answer it", or says "nothing related found" when the
  question clearly isn't about our work. Judging whether a passage contains the fact moves to section 2
  (Gemini must quote it, and the code checks the quote).
- **Why:** on 22 unseen questions, near-miss questions ("hex code of the sidebar", "Playwright version")
  were labelled "strong" when the passage was on-topic but lacked the fact. Keyword overlap measures
  topic, not answers, so tuning can't fix it. Also 4/16 real answers were hidden as "not found".
- **Replaces:** the strong / weak / not found labels below.

### 2026-10-11 · ~~Librarian results are labelled strong / weak / not found~~ · **Replaced** (see above)
- **What:** after the risk check, section 1 adds a small hand-kept synonym list and labels each result
  "strong match", "weak match: check it" or "not found", instead of presenting search results as answers.
  A reliable "not found" is section 2's job: the AI step must quote passages word for word.
- **Why:** the risk check found the right passage in the top 3 for 10/14 paraphrased questions, but the
  keyword score can't tell "no answer here": an on-topic question with no answer outscored 13/14 real ones.
- **Ruled out:** switching to the MiniSearch library now (it fixes word endings, not synonyms); building
  section 2 at the same time (too much to review at once).

### 2026-10-11 · Librarian section 1: search-only `team:ask` with citations · **Decided**
- **What:** a keyword-search "ask" command over `.claude/team/**` and `docs/build-log/**`. It answers with
  file:line passages or "not found", and is proven by golden questions, including unanswerable ones. No AI
  model in this section. Hand-written BM25 ranking (easier to explain than a library).
- **Why:** the owner's idea of a memory the agents can question; files stay the truth. Retrieval was chosen
  over retraining a model because it's inspectable and can be undone.
- **Later sections:** an AI answer step with quote checking, the nightly journal, the SubagentStart lessons hook.

### 2026-10-11 · Small model: Gemini free tier; nightly journal opens a PR · **Decided**
- **What:** section 2 of the librarian uses Gemini Flash-Lite on the free tier. The nightly journal job
  opens a PR for the owner to approve rather than committing to `main`.
- **Trade-off accepted:** on the free tier Google may use the prompts (team notes) to improve its products.
  The recommended alternative was paid Claude Haiku 5.5 for privacy.
- **Note:** the nightly job can only run once the team work is merged to `main` (GitHub runs scheduled
  jobs only on the default branch).

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
