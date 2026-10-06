# 14 — A structured feedback form

## Goal

> "Something like a form to get their feedback in a structured way."

Casebench is being shared with testers alongside a case study. Free-text messages are hard to
compare, so feedback needs a fixed set of questions with answers that add up.

## What it asks

| Question | Answer |
|---|---|
| Which describes you best? | Student, looking for a job, working professional, hiring manager or recruiter, educator, other |
| Which problem did you try? | Any problem in the catalog, or none yet |
| Did you finish a problem and get graded? | Yes / started / just looked around |
| Five ratings, 1–5 | Felt like real work · coworkers believable · grading fair · easy to figure out · overall |
| Would you use it to prepare for a job? | Yes / maybe / no |
| Three open questions | Most useful · confusing or broken · what's missing |
| How can I follow up? | Optional |

The three choice questions and at least one rating are required. Every other question can be skipped.

## Where it lives

- **`/feedback`** is open to everyone, guest or profile, and is linked from the left nav ("Give
  feedback"). After grading, the workspace links to it with the problem filled in
  (`/feedback?problem=<slug>`).
- **`/admin/feedback`** is for admins only (same `CASEBENCH_ADMINS` list as the author agent). It
  shows average ratings, the would-use split, who answered, and every response, plus a JSON download.

## Files

| Piece | File |
|---|---|
| Table | `packages/database/migrations/0007_feedback.sql` |
| Questions, validation, storage, totals | `packages/database/src/feedback.ts` (+ tests) |
| API (`POST` anyone, `GET` admins) | `apps/web/app/api/feedback/route.ts` |
| Form | `apps/web/components/FeedbackForm.tsx`, `apps/web/app/feedback/page.tsx` |
| Results | `apps/web/app/admin/feedback/page.tsx` |

The questions are defined once, in `feedback.ts`. The form, the server-side validation and the admin
summary all read from there, so changing a question can't leave them out of step.

## Guard rails

- The server validates every answer: unknown choices are rejected, ratings must be integers from
  1 to 5, text is trimmed and capped at 2,000 characters (200 for contact).
- Each person (by guest or profile id) can send at most 5 responses a day, which returns `429`
  after that, so the form can't be used to flood the table.
- Only admins can read responses, through both the page and the API.

## Try it yourself

1. Add a sixth rating to `FEEDBACK_RATINGS` and watch it appear on the form and the admin page.
2. Change the daily limit in `submitFeedback` and update the test that checks it.
