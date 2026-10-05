# 05 — Grading against the truth, and a public portfolio page

## Goal

Close the loop: submit a write-up, get graded against **what's actually true in the data** (and
what you actually did), hear back from your manager, and publish a frozen, shareable record.

## What we built

| File | What it does |
|---|---|
| `packages/agents/src/evaluator.ts` | The grader: prompt, output schema, weighted score, offline heuristic |
| `apps/web/app/api/runs/[id]/submit/route.ts` | Freeze submission → grade → record → manager reacts |
| `apps/web/app/api/runs/[id]/publish/route.ts` | Freeze the run and write the portfolio entry |
| `packages/database/src/runs.ts` | `publishRun` (one transaction) and `getPublishedRun` (public read) |
| `apps/web/components/Feedback.tsx` | Score, per-criterion bars and reasons, strengths, improvements, Publish |
| `apps/web/app/portfolio/[runId]/page.tsx` | Public page: write-up, grade, every query, the Slack conversation |

### How grading works

1. `submission_finalized` is appended (the write-up can't change after this).
2. The grader gets: the rubric with weak/strong anchors, the **truth model**, the **measured
   facts** from `analysis.json`, the submission, and a **process log** (every query, in order).
3. The model returns per-criterion scores (0–4), justifications, strengths and improvements in a
   **fixed schema** (structured outputs) — no free-text parsing.
4. **The overall score is computed in code** from the criterion scores and rubric weights.
5. `evaluation_returned` is appended and Priya reacts in Slack, in character, without a number.

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| Grader sees truth **and measured facts** | Can tell "sounds right" from "is right" with real numbers | Truth narrative only |
| Grader sees the **process log** | Claims never backed by a query deserve skepticism; good work in the queries earns credit | Grading the essay alone |
| **Structured outputs** with a Zod schema | Typed, validated scores; no regex over model text | "Respond in JSON" and hope |
| Weighted score computed in code | Deterministic and auditable; the model can't do arithmetic wrong | Asking the model for the total |
| Most capable model, high effort, server-side fallback | Grading is rare and must be right; fallback re-runs on another model if one declines | The small chat model |
| **Retry-safe submit** | If grading fails, the run stays "submitted" and pressing Submit again grades the stored write-up | Making the user re-submit (impossible — submitted runs are frozen) |
| Portfolio summary assembled from the record, no AI | It can't overstate what happened | An AI-written summary |
| Publish = event + portfolio row in **one transaction** | Never a published run without a portfolio entry, or the reverse | Two separate writes |
| Public page shows only published runs | Drafts and in-progress work stay private | Any run by id |
| Offline heuristic grader, clearly labelled | The whole flow works without an API key, but nobody mistakes it for a real grade | Failing without a key |

## How it was verified

- Unit: weighted score maths; offline heuristic rewards the right ideas and labels itself.
- Database: publish is atomic; publishing twice fails and leaves exactly one portfolio row; an
  unpublished run is not publicly readable.
- Browser: submitted a write-up → Feedback tab with score and criteria → Priya's reaction in
  Slack → Publish → the portfolio page opened in a **fresh browser with no cookies**.
- The real-model grading path typechecks against the SDK but has **not yet run against the live
  API** (no key in the build environment). Run one attempt with a key before demoing.

## Explain it in an interview

> "Grading uses the most capable model with structured outputs: it scores each rubric criterion
> 0–4 against the hidden truth and the measured facts, and it also sees the candidate's query log,
> so it can tell real analysis from confident guessing. The overall score is computed in code.
> Publishing freezes the run — Postgres triggers make it immutable — and creates a public page
> with the write-up, the grade, every query, and the conversation with the AI coworkers."

- *How do you know the grader is fair?* — Honest answer: that needs a calibration set — a few
  hand-graded submissions (strong, weak, confidently wrong) and a check that the grader ranks them
  the same way. That's the next eval to build.

## Try it yourself

1. Submit a deliberately wrong write-up ("it's the thin summer catalogue") and compare the
   feedback with a correct one.
2. Read `buildEvaluatorSystemPrompt` and find where the process log is used.
3. Try `curl -X POST /api/runs/<id>/publish` before grading. Which line returns 409?
