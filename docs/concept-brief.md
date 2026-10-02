# Casebench — Concept Brief (for AI handoff)

This document is meant to be handed to another AI assistant (or a new session of this one) with
no other context, and have it understand what Casebench is, why it's built the way it is, and
what to do next.

## 1. The idea in one paragraph

Casebench is a platform where someone preparing for a job (a Data Analyst, Data Scientist,
Software Engineer, etc.) gets dropped into a realistic work assignment at a fictional company:
an AI "manager" gives them an ambiguous brief, they dig through a messy dataset or solve a coding
problem, submit a deliverable, and get a rubric-based evaluation plus a portfolio-ready writeup.
The goal is to feel like doing the actual job, not like a quiz — the data is realistic and messy,
the manager persona behaves like a real manager (gives hints, won't just hand over the answer),
and the evaluation is grounded in a hidden "truth" about what's actually going on, not just
surface plausibility.

## 2. The problem it solves

Standard interview prep (LeetCode-style problems, generic case-study PDFs) tests isolated skills
in a vacuum. It doesn't test: can you work with ambiguous instructions, navigate messy/duplicated
real-world data, communicate with a stakeholder who won't just tell you the answer, and produce a
deliverable a real manager would accept. Casebench's bet is that *simulating the actual job*,
including its ambiguity and its people, is both better practice and a better portfolio artifact
than one more isolated puzzle.

## 3. Core user flow

1. User browses a problem list (filterable by role) — looks like a dashboard: status, difficulty,
   tags, estimated time.
2. User opens a problem. For a **case study**: they see a brief from the manager persona, can
   explore resources, query the dataset (SQL sandbox), and chat with the manager (who can hint
   but won't solve it for them). For a **coding problem**: they see a spec with constraints and
   examples, and write code in an in-browser editor.
3. User submits. For case studies, submission is a structured write-up (findings +
   recommendation). For coding, submission is run against a hidden test suite first.
4. User gets evaluated:
   - Case study: an AI evaluator scores against a rubric, with access to the hidden "truth model"
     the user never saw, so it can check the submission against what's actually true in the data.
   - Coding: correctness is scored **deterministically** by the test runner; a separate AI call
     then reviews code quality, already told the correctness result so it can't contradict it.
5. User gets a portfolio-ready summary of the run, suitable for sharing (e.g. with a recruiter).

## 4. The two structural ideas that matter most

**(a) Content-as-data.** Every problem (case study or coding) is a self-contained data bundle —
manager persona, brief, resources, hidden truth model, rubric or test cases — not hard-coded
logic. Adding a new company, role, or problem should be an authoring task, not an engineering
task. See the proposed layout:

```
content/role-packs/<role>/companies/<company>/
  manager-persona.json
  simulations/<slug>/simulation.json   # brief + hidden truth model
  simulations/<slug>/rubric.json
  simulations/<slug>/data/*.csv
  problems/<slug>/problem.json         # for coding problems
  problems/<slug>/testcases.json
```

**(b) The hidden truth model must never reach the client.** The thing that makes this a real
investigation instead of a scripted exercise is that the user doesn't know the answer going in.
Any implementation must keep the "truth" (what's actually causing the watch-time decline, what
the real confound in the experiment is, etc.) in a clearly separate, server-only structure, and
this should be *verified programmatically* (e.g. serialize what's sent to the client and assert
the truth fields aren't in it), not just assumed from code review.

## 5. Evaluation design (the part most likely to go wrong)

- Case studies are graded holistically by an AI evaluator against a rubric with named criteria
  (e.g. for an experiment-readout case: experiment validity, statistical reasoning, confound
  identification, segmentation, recommendation, communication). The evaluator prompt must be given
  the hidden truth model so it can tell a submission that *sounds* confident from one that's
  *actually* correct.
- Coding problems are graded hybrid: test-case pass rate is computed deterministically (results
  compared as sets/order-independent where the problem allows multiple valid orderings), and a
  separate "code review" AI call scores complexity/clarity/style — told the pass rate up front so
  it never praises code that actually fails hidden tests.
- **Test-case design needs real rigor.** When this was built for a session-deduplication coding
  problem, an ambiguous spec allowed a plausible-but-wrong solution (dedupe against the last
  *kept* event instead of the last *seen* event) to pass 8 of 9 tests — only a hidden "chained
  re-sends" test case caught it. Any new problem's test suite should be checked against at least
  one plausible near-miss solution, not just the correct one and the naive one.

## 6. Manager persona / anti-leakage prompting

The manager is a system-prompted persona with an explicit hint policy (what it can reveal, at what
level of asking, and what's off-limits) and an explicit instruction never to reveal the hidden
truth model or solve the problem outright. This is a prompt-design problem as much as an
engineering one: the persona needs to feel like a real, slightly busy manager — not an oracle and
not a brick wall.

## 7. What exists today vs. what's conceptual

**Built and working:** a single-file HTML/JS prototype implementing the full flow above for three
role tracks (Data Analyst, Data Scientist, Software Engineer), with a real SQL sandbox, a real
code editor + deterministic test runner, and live AI calls for manager chat / evaluation /
portfolio summary. Its one real constraint: the AI-powered parts only work when hosted somewhere
with an authenticated Claude session (it calls the API directly from the browser) — everything
else works fully offline.

**Conceptual / not yet (re)built:** a proper modular app (the content-as-data layout above, a
Postgres-backed event-log state machine for runs, a provider-abstraction layer for AI calls so
the evaluator isn't locked to one vendor, server-side evaluation instead of browser-side). This
was scaffolded once in an earlier build session but that work was lost before being committed to
git, so it needs to be rebuilt — the design is sound, the previous code just doesn't exist anymore.

## 8. Immediate next step

Rebuild the modular app per section 7, following the content-as-data layout in section 4, using
the existing prototype (`prototype/casebench-demo.html`) as the behavioral reference for what the
UI and flows should do — but not as a structural pattern to copy from, since it's deliberately a
single-file shortcut.

## 9. Open product questions (not yet decided)

- Final product name — "Project Codename" and "Casebench" have both been used; neither is final.
- How configurable should the manager's hint policy be (e.g. a "harder mode")?
- Should the coding track support languages beyond JS, and how would the deterministic test
  runner generalize safely if so?
- Account system and persistent (multi-run) portfolios are not yet designed.
