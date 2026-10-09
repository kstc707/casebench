# 14 — Practice mode, section 1: fix a real bug, graded by the project's own tests

## Goal

Casebench's new direction: learners do **real** work from open source, with an AI team around them.
The first section proves the basic loop on one project, before any AI is added:

> Open a real bug that was fixed in an open-source Python project, fix it in the browser, run the
> project's real tests, get pass or fail, and have it recorded.

Python only for now. The AI team, and agents framing each task as a workplace request, come in section 2.

## What a learner sees

- **`/practice`**: the task list (PY-1 … PY-5), with the project, how many tests to fix and to keep
  passing, the file to edit, and a rough size.
- **`/practice/<task>`**, laid out like LeetCode:
  - **left:** what the bug is, the tests to fix (with the real assertion when they fail, e.g.
    `assert '2 years' == '3 years'`), how many other tests must keep passing, and pytest's error if
    the code doesn't even import;
  - **right:** a code editor (CodeMirror, Python highlighting). The files you may change are marked ✎;
    the tests and the rest of the project are read-only;
  - **Run tests** (about 3 s) and **Submit**.
- Solving it adds the task to your profile's **Solved** list ("Practice · humanize").

## Where the tasks come from

`research/practice-mode-spike/` (log of the spike in its README) turns real commits into tasks:
it rewinds the project to before a fix, adds the fix's tests, and keeps the commit only if those
tests fail before the fix and pass after it, without breaking others. `export_tasks.py` writes each
task to `content/practice/<project>/<slug>.json`:

| Field | What it is |
|---|---|
| `files` | The project's Python files and pytest config before the fix, plus the fix's tests |
| `editable` | The files the learner may change: the ones the real fix changed |
| `failToPass` | Tests that fail now and must pass ("prove the fix") |
| `passToPass` | Tests that pass now and must keep passing ("don't break anything") |

**The real fix is never stored.** The tests are the answer key.

Five humanize bugs are in, small to larger: an empty list in `natural_list`, a double minus sign in
`fractional`, an `intcomma` overflow, `naturaldelta` truncating years, and `naturalsize` rounding at
unit boundaries. humanize is MIT-licensed; its license travels with the tasks.

## How the tests run

In the **learner's browser**, with [Pyodide](https://pyodide.org) (Python compiled to WebAssembly):

- `scripts/prepare-pyodide.mjs` (runs before `dev` and `build`) copies Pyodide into `public/pyodide`
  and downloads the test tools (pytest, freezegun and their dependencies) into
  `public/pyodide-wheels`, each **pinned by version and SHA-256**. A tampered download is refused.
  Nothing loads from a CDN.
- `scripts/practice-worker.mjs` is a **module** web worker, so the page stays responsive. It's not
  bundled by Next.js, whose workers are classic scripts, and Pyodide refuses to run in those.
- `lib/practice/runner.py` is the test logic. The browser worker and the check script both load this
  one file, so a task is always tested the same way. Each run writes the project fresh, forgets the
  previous run's imports, and runs pytest on exactly the required test ids.
- A run that takes over 60 s (an infinite loop) is stopped, and Python restarts.

## How attempts are recorded

A practice attempt is an ordinary **run** (slug `practice:<task>`), so it uses the same append-only
event log, profile and solved stats as simulations:

| Event | When |
|---|---|
| `run_started` | The first "Run tests", after you've picked a profile |
| `tests_run` (new) | Every test run: passed / total, which failed, pytest's error |
| `submission_finalized` | Submit: your version of the editable files, frozen |
| `evaluation_returned` | Score 100, `checkedIn: "browser"` |

The submit route refuses a submission unless **every** required test passed (422, listing what still
fails), and only accepts files the task lets you edit. A run is only marked solved when it's actually
solved. You can run tests without a profile; they just aren't recorded.

## Known limit: the result is checked in the browser

The tests run on the learner's machine, so a determined person could fake a passing result. Running
the code on **our** server instead isn't safe without a real sandbox: Pyodide can reach the
JavaScript around it, and on a server that means environment variables and the network. So
section 1 says so plainly: every solve is stored with `checkedIn: "browser"` and the page says
"Checked in your browser". The submitted code is stored with it, so it can be re-checked later.
**Server-side verification in a proper sandbox is its own future section.**

## Checks

- `apps/web/lib/practice/practice.test.ts` covers the submit rules, `tests_run` validation, and that every task file is complete.
- `pnpm exec tsx scripts/check-practice-tasks.ts [--fix-repo PATH]` runs every task through the real
  Pyodide runner: the "prove the fix" tests fail on the starting code and the rest pass. With a clone
  of the project it also applies the real fix and checks that everything passes. **5 of 5 OK.**
- A browser test (Playwright):
  1. open the task;
  2. create a profile;
  3. run the tests: **390 of 392** pass;
  4. paste in the real fix: **392 of 392** pass;
  5. submit, and the task shows on the profile;
  6. reload: it still shows "Solved".

  Also checked: a syntax error in the learner's code shows `SyntaxError` with the line; submitting
  without a profile is refused with a message; at phone width (390 px) nothing scrolls sideways.

## Files

| Piece | File |
|---|---|
| Task export | `research/practice-mode-spike/export_tasks.py` |
| Tasks | `content/practice/humanize/` |
| Pyodide + pinned tools | `apps/web/scripts/prepare-pyodide.mjs` |
| Test runner | `apps/web/lib/practice/runner.py`, `apps/web/scripts/practice-worker.mjs`, `apps/web/components/practice/useTestRunner.ts` |
| Node side + checks | `apps/web/lib/practice/runner.ts`, `apps/web/scripts/check-practice-tasks.ts` |
| Pages | `apps/web/app/practice/`, `apps/web/components/practice/PracticeWorkspace.tsx` |
| API | `apps/web/app/api/practice/runs/` |
| Rules | `apps/web/lib/practice/submission.ts`, `tests_run` in `packages/domain/src/run.ts` and `apps/web/lib/runEvents.ts` |

## Try it yourself

1. Open PY-1 and make the test pass. Run the tests before you change anything, and read the failure.
2. Break a test that should keep passing on purpose, and watch the left panel tell you.
3. Export another humanize task: `python research/practice-mode-spike/export_tasks.py <humanize clone>
   content/practice/humanize <commit> --python <venv python> --license MIT`, then check it with
   `check-practice-tasks.ts`.
