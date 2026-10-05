# 10 — First live deploy (Vercel + Neon + Gemini) and what broke

## Goal

Put Casebench on the internet for free and prove the whole loop works live, not just in tests.

## Setup

| Piece | Choice |
|---|---|
| Hosting | Vercel (Hobby), project root `apps/web`, public at **casebench.vercel.app** |
| Database | Neon Postgres (pooled connection); tables created by `vercel-build` running the migrations |
| AI | Google Gemini free tier via `GEMINI_API_KEY` |
| Protection | Vercel "Standard Protection": the production domain is public, per-deploy URLs need a Vercel login |

## How it was tested

My cloud session can't reach `vercel.app` directly, so I tested through the Vercel connector:

1. **Read checks:** project settings, env vars present (values never read), build state, runtime logs.
2. **Page checks:** fetched `/`, a simulation page, and `GET /api/simulations/watch-time-decline`. These
   showed the complexity badges, stats from Neon and an empty comment list, so the database and the
   migrations work.
3. **A real end-to-end run from a temporary Vercel Sandbox** (a short-lived VM that can reach the
   site): `curl` started a run, sent Priya a DM, pressed "I'm stuck", and read the messages back.

## What broke

**Every AI call failed with a 500.** The runtime log said:

> `LLM API error 404: This model models/gemini-2.5-flash-lite is no longer available to new users.
> Please update your code to use models/gemini-3.5-flash-lite`

Google retires model versions, and new API keys can't use the old ones. The unit tests couldn't catch
this because they use the offline mock. That's exactly why a live smoke test matters.

## Fixes

| Fix | File |
|---|---|
| Gemini defaults → `gemini-3.5-flash-lite` (coworkers) and `gemini-3.5-flash` (grading) | `packages/ai/src/config.ts` |
| If the AI provider errors (retired model, free-tier limit, outage), the coworker posts a visible "couldn't reach the AI service" notice and the error is logged, instead of the request failing with a 500 | `packages/agents/src/respond.ts` (+ test) |
| **Retry temporary errors:** 429 (rate limit) and 5xx ("high demand") get two retries, after 1 s and then 3 s; errors that waiting won't fix (bad key, retired model) fail at once | `packages/ai/src/openaiCompatibleProvider.ts` (+ test) |
| **Grading falls back to the smaller model:** if `gemini-3.5-flash` is still overloaded after the retries, grade with `gemini-3.5-flash-lite` instead of failing (it was returning 503 for several minutes straight on the free tier) | `packages/agents/src/evaluator.ts` (+ test) |
| Deploy guide: free-tier limits per model; troubleshooting rows for retired models and limits | `docs/deploy.md` |

**Second issue, found on the preview deploy of the fix:** the coworkers now answered with real
Gemini replies (Priya, a real "I'm stuck" hint, and Sam's AI-written message), but grading failed once
with `503: This model is currently experiencing high demand`. The run was safely left "submitted", and
the UI already offers "press Submit again to retry grading", but free tiers do this often, so the
adapter now retries briefly before giving up.

**Why not fall back to the offline scripted reply?** That would hide a broken setup behind a reply that
looks real. A visible notice plus a log line is honest and easy to debug.

**Free-tier limits to know:** about 500 requests/day for Flash-Lite and about 20/day for Flash. Grading
uses Flash, so that's roughly 20 graded submissions a day. Set
`CASEBENCH_EVALUATOR_MODEL=gemini-3.5-flash-lite` to trade some grading quality for more volume.

## Explain it in an interview

> "Everything passed in CI, but the first live run failed: Google had retired the model my defaults
> pointed at. I found it in the production logs within minutes, updated the defaults, and changed the
> agent layer so a provider failure degrades to a visible notice instead of a 500, because a
> free-tier limit shouldn't break the product. Lesson: mocks prove your logic, not your integrations;
> you need a live smoke test after every deploy."
