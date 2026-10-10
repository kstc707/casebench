"""
Practice-mode spike: can a real, already-fixed open-source bug become a
practice task automatically?

For one commit that changed both source code and tests, this:
  1. checks out the code as it was just BEFORE the fix,
  2. adds only the commit's new/changed tests,
  3. runs them: tests that fail here are the bug the learner must fix,
  4. applies the real fix and runs them again: they must now pass.

A commit is a usable practice task when at least one test goes from fail to
pass ("fail_to_pass") and no test that passed before breaks. The same idea
SWE-bench uses to test AI models; here it's for training people.

Usage:
  python make_task.py REPO_DIR COMMIT [--python PATH] [--out FILE]
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout


def changed_files(repo: Path, commit: str) -> list[str]:
    return [f for f in git(repo, "show", "--name-only", "--format=", commit).splitlines() if f]


def is_test_file(path: str) -> bool:
    return path.startswith("tests/") or "/tests/" in path or Path(path).name.startswith("test_")


def take_from(work: Path, commit: str, path: str) -> None:
    """Make `path` in the worktree match `commit`: copied in, or removed if the commit deleted it."""
    if git(work, "ls-tree", "--name-only", commit, "--", path).strip():
        git(work, "checkout", commit, "--", path)
    elif (work / path).exists():
        git(work, "rm", "-q", "--", path)


def install(workdir: Path, python: str) -> None:
    """Editable install, no dependencies (the venv already has the test tools). The fake
    version keeps build tools that derive it from git tags from failing on a worktree."""
    done = subprocess.run(
        [python, "-m", "pip", "install", "-q", "--no-deps", "-e", "."],
        cwd=workdir,
        env={**os.environ, "SETUPTOOLS_SCM_PRETEND_VERSION": "0.0.0"},
        capture_output=True,
        text=True,
        timeout=600,
    )
    if done.returncode != 0:
        raise RuntimeError(f"install failed: {done.stderr.strip().splitlines()[-1] if done.stderr.strip() else done.returncode}")


def run_tests(workdir: Path, python: str, test_files: list[str]) -> dict[str, str]:
    """Runs pytest on the given files; returns {test id: "passed" | "failed" | "skipped"}.
    A file that can't even be imported is reported as one "<file>::<collection error>" entry."""
    existing = [f for f in test_files if (workdir / f).exists() and f.endswith(".py")]
    if not existing:
        return {}
    report = workdir / ".spike-report.xml"
    subprocess.run(
        [python, "-m", "pytest", "-q", "-p", "no:cacheprovider", "-o", "addopts=", f"--junitxml={report}", *existing],
        cwd=workdir,
        env={k: v for k, v in os.environ.items() if k != "PYTHONPATH"},
        capture_output=True,
        text=True,
        timeout=600,
    )
    if not report.exists():  # pytest couldn't even start (e.g. import error)
        return {}
    results: dict[str, str] = {}
    for case in ET.parse(report).getroot().iter("testcase"):
        if not case.get("classname"):  # pytest's way of reporting a file it couldn't collect
            results[f"{case.get('name')}::<collection error>"] = "failed"
            continue
        test_id = f"{case.get('classname')}::{case.get('name')}"
        if case.find("failure") is not None or case.find("error") is not None:
            results[test_id] = "failed"
        elif case.find("skipped") is not None:
            results[test_id] = "skipped"
        else:
            results[test_id] = "passed"
    return results


def make_task(repo: Path, commit: str, python: str) -> dict:
    commit = git(repo, "rev-parse", commit).strip()
    files = changed_files(repo, commit)
    test_files = [f for f in files if is_test_file(f)]
    source_files = [f for f in files if not is_test_file(f) and f.endswith(".py")]
    task = {
        "repo": git(repo, "remote", "get-url", "origin").strip(),
        "fix_commit": commit,
        "base_commit": git(repo, "rev-parse", f"{commit}^").strip(),
        "title": git(repo, "log", "-1", "--format=%s", commit).strip(),
        "test_files": test_files,
        "source_files": source_files,
    }

    with tempfile.TemporaryDirectory(prefix="practice-") as tmp:
        work = Path(tmp) / "work"
        git(repo, "worktree", "add", "--detach", str(work), task["base_commit"])
        try:
            # Install this old version of the project, as a contributor would. Some versions
            # read their own version number from the installed package, so running from
            # src/ alone isn't enough.
            install(work, python)

            # 1-3: the code before the fix, plus the fix's tests.
            for f in test_files:
                take_from(work, commit, f)
            before = run_tests(work, python, test_files)

            # 4: apply the real fix.
            for f in source_files:
                take_from(work, commit, f)
            after = run_tests(work, python, test_files)
        finally:
            git(repo, "worktree", "remove", "--force", str(work))

    task["fail_to_pass"] = sorted(t for t, r in after.items() if r == "passed" and before.get(t) == "failed")
    task["pass_to_pass"] = sorted(t for t, r in after.items() if r == "passed" and before.get(t) == "passed")
    task["broken_by_fix"] = sorted(t for t, r in before.items() if r == "passed" and after.get(t) == "failed")
    task["tests_run"] = len(after)

    if not after or any(t.endswith("<collection error>") for t in after):
        # The environment is broken, which says nothing about whether this commit is a good task.
        task["usable"], task["reason"] = False, "tests could not run"
    elif not task["source_files"]:
        task["usable"], task["reason"] = False, "no source change (tests only)"
    elif task["broken_by_fix"]:
        task["usable"], task["reason"] = False, "the fix breaks other tests"
    elif not task["fail_to_pass"]:
        task["usable"], task["reason"] = False, "no test fails before the fix"
    else:
        task["usable"], task["reason"] = True, f"{len(task['fail_to_pass'])} test(s) prove the fix"
    return task


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("repo", type=Path)
    p.add_argument("commit")
    p.add_argument("--python", default=sys.executable, help="Python with pytest installed")
    p.add_argument("--out", type=Path)
    a = p.parse_args()
    task = make_task(a.repo.resolve(), a.commit, a.python)
    text = json.dumps(task, indent=2)
    if a.out:
        a.out.write_text(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
