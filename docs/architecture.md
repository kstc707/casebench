# Architecture

This describes the design Casebench is built around — both what the current prototype
(`prototype/casebench-demo.html`) implements directly, and what the fuller modular version
(not yet rebuilt in this repo) was scaffolded around.

## Core model: event-log state machine

Each attempt at a problem ("run") is modeled as an append-only event log rather than a single
mutable row: brief viewed, resource opened, manager message sent/received, submission drafted,
submission finalized, evaluation returned. This makes the run replayable, auditable, and safe to
extend (e.g. adding a new event type for a hint request) without migrating existing data.

A `published` run is immutable — once an evaluation is finalized, nothing about the run can be
edited, which matters for the portfolio feature downstream (a portfolio report should reflect a
real, frozen result, not a run someone kept tweaking after seeing their grade).

## Content-as-data role packs

Problems are not hard-coded; they're data. Each one lives under:

```
content/role-packs/<role>/companies/<company>/
  manager-persona.json       — who the "manager" is, tone, hint policy, prohibited behaviors
  simulations/<slug>/
    simulation.json          — brief, resources, concepts-you'll-practice, and a hidden
                                truth model (never sent to the client)
    rubric.json               — scored criteria for the AI evaluator
    data/*.csv                 — the messy dataset the user investigates
  problems/<slug>/             — for coding-track problems instead of case studies
    problem.json              — spec, constraints, examples, starter code
    testcases.json             — visible + hidden test cases
```

This means adding a new company, role, or case study is a content change, not a code change.

## Hybrid evaluation

- **Case-study tracks** (Data Analyst, Data Scientist): evaluation is AI-only, against the
  rubric, with the hidden truth model given to the evaluator (never the user) so it can check
  the submission against what's actually true in the data rather than just surface plausibility.
- **Coding track** (Software Engineer): evaluation is hybrid. Correctness is scored
  **deterministically** by running the user's function against the test suite (visible + hidden
  cases) and comparing results as sets (order-independent where appropriate). A separate AI call
  then reviews code quality/complexity/clarity — and is explicitly told the deterministic
  correctness result first, so it can't contradict it (e.g. praise clean code that actually fails
  half the hidden tests).

## Anti-leakage prompt design

The manager persona's system prompt is built to simulate a real manager: it can nudge, answer
clarifying questions, and give hints at defined levels, but is explicitly instructed not to reveal
the hidden truth model or solve the problem outright. The truth model itself is kept in a
separate, clearly-marked internal field and never included in any client-visible payload — this
was verified programmatically in the prototype build, not just asserted in the prompt.

## Why these choices

- **Modular monolith over microservices**: this is a single product with one deploy cadence;
  the complexity of service boundaries isn't earned yet.
- **Postgres** for the eventual production build: the event-log model benefits from real
  transactional guarantees (e.g. the immutability trigger on published runs).
- **Provider abstraction layer** for AI calls, with a mock adapter fallback, so content authoring
  and UI work don't require live API access, and the evaluator backend isn't locked to one vendor.
