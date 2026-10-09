# Spike: can a real, already-fixed bug become a practice task automatically?

**Status:** research only. Nothing here is used by the app.

## The question

Practice mode would give learners real open-source bugs that were already fixed, then check their
fix with the project's own tests from the real fix. The riskiest assumption is that this can be done
**automatically**, without someone hand-building each task. This spike tests that.

## How it works

`make_task.py` takes one commit that changed both source code and tests, and:

1. checks out the project as it was just **before** the fix, and installs it;
2. adds only the commit's tests;
3. runs them. The tests that **fail** are the bug the learner has to fix;
4. applies the real fix and runs them again. They must now **pass**, and nothing else may break.

A commit becomes a task when at least one test goes from fail to pass (`fail_to_pass`) and no
passing test breaks. The other tests that pass both times (`pass_to_pass`) also check the learner
didn't break anything. This is the method SWE-bench uses to test AI models. Here it would be used to
train people.

`batch.py` runs this over every recent commit that changed both source and test `.py` files and added
at most 80 lines (beginner-sized), then reports how many became tasks. See `example-task.json` for one.

```
python make_task.py REPO_DIR COMMIT --python /path/to/venv/bin/python
python batch.py REPO_DIR --python /path/to/venv/bin/python [--limit 600] [--max-lines 80]
```

The Python must have pytest and the project's test dependencies installed.

## Results (October 2026)

| Project | Candidate commits | Became tasks | Rejected: no bug to practice | Rejected: tests couldn't run |
|---|---|---|---|---|
| [humanize](https://github.com/python-humanize/humanize) | 62 | **39** (63%) | 22 | 1 |
| [prettytable](https://github.com/prettytable/prettytable) | 56 | **23** (41%) | 7 | 26 |

Examples of tasks it produced:
- "Fix `naturaldelta` truncating years instead of rounding": 2 tests fail before, pass after; 390 others keep passing.
- "Fix metric(0) crash": the `metric(0)` test fails before, passes after.
- "Fix GitHub-Flavoured Markdown for narrow centred columns" (prettytable).

## What we learned

1. **The idea works.** Real bug fixes become practice tasks automatically, with no hand-work per task,
   and they're graded by the project's own tests, pass or fail, like LeetCode but real.
2. **The filter is trustworthy.** Rejected "no bug" commits are mostly tooling changes ("Upgrade
   pre-commit", "Replace Flake8 with Ruff", type hints), and those should be rejected.
3. **The real cost is old environments.** Every "couldn't run" result in prettytable is one cause:
   old tests use a pytest plugin (`pytest.lazy_fixture`) that today's pytest no longer supports. A
   task needs the **tool versions from its own time**, not today's. SWE-bench hits the same problem and
   builds a separate container image per project version. For Casebench this means:
   - prefer **recent** fixes, which run on today's tools (most of the humanize tasks are recent);
   - long-term, one container image per project era.
4. **Small fixes in translation features need extra setup** (compiled translation files). That's a
   known build step, not a blocker.
5. **The issue text needs GitHub's API.** The learner should see the original issue, not just the
   commit title. The API was blocked from this sandbox (HTTP 403); in the product it would use a token.

## Bugs found in the spike itself

The first run reported 19 of 62 for humanize. That was wrong: older versions read their version
number from the installed package, so running from `src/` crashed every test, and the script counted
the crash as "no bug". Fixed by installing each version properly and reporting a crash as "tests
couldn't run". The lesson: **always tell "the environment is broken" apart from "there's no bug"**.

## Not tested yet

- Projects in other languages (JavaScript, Go, …) and bigger projects.
- Whether these tasks are the right difficulty for beginners, which needs people to try them.
- How long a learner takes, and how the AI team would guide them.
