# 02 — A real StreamWave dataset, with a provable hidden truth

## Goal

Replace the 3-row placeholder CSVs with a realistic, deliberately messy dataset where the hidden
"answer" is genuinely true in the data — and *prove* it with tests, so the AI evaluator grades
against facts, not against a story someone wrote down.

## Where we started

`content/.../watch-time-decline/data/` held tiny fake CSVs and a `NOTE.md` saying the originals
were lost. The truth model said "PLACEHOLDER". Grading anything against it would have been
meaningless.

## What we built

| File | What it is |
|---|---|
| `packages/content-tools/src/rng.ts` | Seeded random number generator (same seed → same data, always) |
| `packages/content-tools/src/streamwave.ts` | The generator: builds 6 tables with the story baked in |
| `packages/content-tools/src/analyzeStreamwave.ts` | An *independent* analyzer that reads the CSVs and measures the story |
| `packages/content-tools/src/csv.ts` | Tiny CSV reader/writer |
| `packages/content-tools/scripts/generate-streamwave.ts` | Script: generate → write CSVs → analyze the written files → write `analysis.json` |
| `packages/content-tools/src/streamwave.test.ts` | Tests that every claim in the truth model holds in the committed files |
| `content/.../watch-time-decline/simulation.json` | New brief, resources (data dictionary, metric definition, release calendar), truth model |
| `content/.../watch-time-decline/rubric.json` | 6 criteria, 0–4 scale, with "weak" and "strong" anchors |
| `content/.../watch-time-decline/analysis.json` | Measured facts (server-only; never served to the browser) |

Regenerate any time with `pnpm --filter @casebench/content-tools generate:streamwave`.

### The story in the data

Three things happen on the same day (Aug 3), which is exactly what makes it a good case:

| Driver | What happened | What a good analyst finds |
|---|---|---|
| **Measurement artifact** | Mobile app 5.2.0 re-sent ~34% of play events (duplicate rows seconds apart, new `session_id`). 5.3.0 fixed it on Aug 3. | The "before" period was inflated. Raw decline **−21.5%** → after dedupe **−13.8%**. |
| **Mix shift** | "Summer Free Month" paid-social campaign brought young, mobile-heavy trial users. | They're ~15% of actives and watch ~47 min/week vs ~128 for existing users. Existing control-arm users: **−0.8%** (flat). |
| **Small real product effect** | Experiment `autoplay_next_v2` turned autoplay off for the treatment arm. | TV minutes/session ~59 (control) vs ~49 (treatment). Treatment users down ~10%. |

Plus realistic noise (red herrings): plan labels changed case in a billing migration
(`basic` vs `Basic`), ~10% missing genres, an old finished experiment, unrelated campaigns, and
web/TV releases in the calendar.

Size: 1,141 users, 19,045 session rows (~1 MB), 60 titles, 970 experiment rows.

## Decisions and why

| Decision | Why | Rejected alternative |
|---|---|---|
| **Generate** data instead of hand-writing it | Thousands of rows with controlled, measurable effects; easy to regenerate with tweaks | Hand-made CSVs — too small to be realistic, effects can't be tuned |
| **Seeded** randomness | Same output every run → the committed CSVs are reproducible and testable | `Math.random()` — different data every run, untestable |
| **Analyzer reads the written files**, not the generator's memory | Proves the story from what the user actually downloads | Trusting generator internals — would hide bugs in CSV writing |
| Measured numbers → `analysis.json`, given to the evaluator | The grader compares submissions to measured facts | Numbers typed into the truth model by hand — drift silently |
| TypeScript, not Python | One language across the repo; runs in the same test suite and CI | Python + pandas — natural for data work, but a second toolchain for one script |
| A metric defined in a resource ("no filters") | Mirrors real life: the dashboard definition is what hides the bug | Telling the user the metric is broken |
| A **release calendar** resource with a vague "analytics improvements" note | A fair, discoverable clue — exactly what a real analyst would cross-check | No clue at all (unfair) or an explicit "bug fixed" note (too easy) |

## Problems found along the way

1. **`tsx` failed with "top-level await not supported in cjs".** The script uses `await` at the
   top level, which needs ES modules. Fixed by setting `"type": "module"` in
   `packages/content-tools/package.json`.
2. **One duplicate after the fix date.** The tests found one "duplicate" on Aug 22. Investigation:
   it's two *genuine* sessions that happened to start in the same second — a chance collision,
   not the bug. Real data has these too, so we kept it and the test allows ≤ 2. (We also stopped
   the generator from creating re-sends in the last 5 minutes before the fix, so the bug itself
   can never cross the boundary.)
3. **Dedupe rule subtlety.** Comparing each event with the last *kept* event misses chains of
   re-sends (A, B 90s later, C 90s after B). The correct rule compares with the last *seen*
   event. There's a dedicated test for the chain case.

## How it was verified

`pnpm test` runs `streamwave.test.ts`, which checks:

- the committed CSVs are byte-for-byte what the seeded generator produces (no stale files);
- `analysis.json` matches the CSVs;
- raw decline < −18%; dedupe removes > 5 points; duplicates are mobile-only and pre-Aug 3;
- existing control-arm users are within ±3%;
- campaign users are > 10% of actives and watch < half as much;
- treatment TV sessions are 10–30% shorter.

## Explain it in an interview

> "The hardest part of a case-study product is the answer key. I wrote a seeded generator that
> plants three overlapping causes on the same date — a duplicate-event bug, a campaign that
> shifted the user mix, and an experiment with a small real effect — and then an independent
> analyzer that re-measures them from the published CSVs. Tests fail if the data ever stops
> telling that story, and the measured numbers feed the AI grader so it scores against facts."

- *Why not use a real public dataset?* — Real data has no known ground truth, so you can't grade
  "did they find the cause". Synthetic data with planted, measured effects gives a reliable answer
  key while still being messy.
- *How do you know the effects are detectable?* — The analyzer detects each one using only
  columns the user has (device, app_version, acquisition_channel, arm), and tests assert it.
- *Why three causes at once?* — A single cause is a quiz. Overlapping causes force segmentation
  and causal reasoning, which is what the rubric rewards.

## Try it yourself

1. Change the seed in `generateStreamwave()` and re-run the generator. Do the tests still pass?
   (They should — the story is structural, not luck.)
2. Change the duplicate rate from `0.3` to `0.05`, regenerate, and see which test fails.
3. In the SQL sandbox (step 03), find the duplicates yourself:
   `select user_id, content_id, device, count(*) from sessions group by user_id, content_id, device, substr(started_at,1,16) having count(*) > 1`
