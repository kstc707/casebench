"""
Exports practice tasks for the app: one JSON file per task in content/practice/<project>/.

For each commit it runs make_task (natively, to prove the task is valid), then
writes what the browser needs to run it:

  - the project's Python files and pytest config as they were BEFORE the fix,
    with the fix's test files added: what the learner starts from;
  - which files the learner may edit (the ones the real fix changed);
  - the exact tests that must pass: the ones the fix made pass ("prove the fix")
    and the ones that already passed ("don't break anything"), as pytest node ids.

The real fix itself is never exported: the tests are the answer key.

Usage:
  python export_tasks.py REPO_DIR OUT_DIR COMMIT [COMMIT ...] --python PATH --license MIT
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from make_task import git, make_task


def node_id(junit_id: str, test_files: list[str]) -> str:
    """'tests.test_time::test_x[a]' (JUnit style) -> 'tests/test_time.py::test_x[a]' (pytest node id).
    The JUnit class name may also include a test class: 'tests.test_x.TestY::test_z'."""
    classname, _, name = junit_id.partition("::")
    parts = classname.split(".")
    for i in range(len(parts), 0, -1):
        path = "/".join(parts[:i]) + ".py"
        if path in test_files:
            return "::".join([path, *parts[i:], name])
    raise ValueError(f"can't map {junit_id} to one of {test_files}")


def project_files(repo: Path, base: str, fix: str, test_files: list[str]) -> dict[str, str]:
    """Python sources + package data the tests need, at the base commit; the fix's tests on top."""
    files: dict[str, str] = {}
    for path in git(repo, "ls-tree", "-r", "--name-only", base).splitlines():
        keep = (path.startswith("src/") and path.endswith(".py")) or path in ("pyproject.toml", "tests/__init__.py", "tests/conftest.py")
        if keep:
            files[path] = git(repo, "show", f"{base}:{path}")
    for path in test_files:
        files[path] = git(repo, "show", f"{fix}:{path}")
    # The version module is generated at build time; the package imports it.
    for init in [p for p in files if p.startswith("src/") and p.endswith("/__init__.py") and p.count("/") == 2]:
        files.setdefault(init.replace("__init__.py", "_version.py"), '__version__ = version = "0.0.0"\n')
    return files


def export(repo: Path, out: Path, commit: str, python: str, license_name: str) -> Path:
    task = make_task(repo, commit, python)
    if not task["usable"]:
        raise SystemExit(f"{commit}: not usable ({task['reason']})")
    tests = task["test_files"]
    title = task["title"]
    m = re.search(r"\s*\(#(\d+)\)\s*$", title)
    name = re.sub(r"\.git$", "", task["repo"].rstrip("/")).rsplit("/", 1)[-1]
    added = sum(int(l.split()[0]) for l in git(repo, "show", "--numstat", "--format=", task["fix_commit"], "--", *task["source_files"]).splitlines() if l.split()[0].isdigit())
    record = {
        "slug": f"{name}-{task['fix_commit'][:7]}",
        "title": title[: m.start()] if m else title,
        "project": {
            "name": name,
            "repo": re.sub(r"\.git$", "", task["repo"]),
            "license": license_name,
            "upstreamPullRequest": int(m.group(1)) if m else None,
        },
        "baseCommit": task["base_commit"],
        "fixCommit": task["fix_commit"],
        "language": "python",
        # A rough size signal: lines the real fix added to the source (not shown to learners as a hint).
        "fixSize": added,
        "editable": task["source_files"],
        "testFiles": tests,
        "failToPass": [node_id(t, tests) for t in task["fail_to_pass"]],
        "passToPass": [node_id(t, tests) for t in task["pass_to_pass"]],
        "files": project_files(repo, task["base_commit"], task["fix_commit"], tests),
    }
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{record['slug']}.json"
    path.write_text(json.dumps(record, indent=1, ensure_ascii=False) + "\n")
    return path


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("repo", type=Path)
    p.add_argument("out", type=Path)
    p.add_argument("commits", nargs="+")
    p.add_argument("--python", default=sys.executable)
    p.add_argument("--license", required=True, help="the project's license, shown with the task")
    a = p.parse_args()
    for c in a.commits:
        path = export(a.repo.resolve(), a.out, c, a.python, a.license)
        print(f"wrote {path} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
