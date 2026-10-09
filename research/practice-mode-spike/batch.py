"""
Runs make_task.py over every recent commit that changed both source and
tests, and reports how many become usable practice tasks.

Usage:
  python batch.py REPO_DIR [--python PATH] [--limit N] [--max-lines N] [--out FILE]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from make_task import changed_files, git, is_test_file, make_task


def candidates(repo: Path, limit: int, max_lines: int) -> list[str]:
    """Non-merge commits touching both source and test .py files, with a small diff (beginner-sized)."""
    out = []
    for commit in git(repo, "log", "--no-merges", "--format=%H", f"-n{limit}").split():
        files = changed_files(repo, commit)
        if not any(f.endswith(".py") and is_test_file(f) for f in files):
            continue
        if not any(f.endswith(".py") and not is_test_file(f) for f in files):
            continue
        added = sum(int(l.split()[0]) for l in git(repo, "show", "--numstat", "--format=", commit).splitlines() if l.split()[0].isdigit())
        if added <= max_lines:
            out.append(commit)
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("repo", type=Path)
    p.add_argument("--python", default=sys.executable)
    p.add_argument("--limit", type=int, default=600, help="how many recent commits to scan")
    p.add_argument("--max-lines", type=int, default=80, help="skip commits adding more lines than this")
    p.add_argument("--out", type=Path)
    a = p.parse_args()

    repo = a.repo.resolve()
    tasks = []
    for commit in candidates(repo, a.limit, a.max_lines):
        try:
            task = make_task(repo, commit, a.python)
        except Exception as e:  # keep going; record why
            task = {"fix_commit": commit, "title": git(repo, "log", "-1", "--format=%s", commit).strip(), "usable": False, "reason": f"error: {e}"}
        tasks.append(task)
        print(f"{'OK ' if task['usable'] else '-- '} {commit[:7]}  {task['reason']:<34} {task['title'][:60]}", flush=True)

    usable = [t for t in tasks if t["usable"]]
    print(f"\n{len(usable)} of {len(tasks)} candidate commits became usable practice tasks.")
    for reason, n in Counter(t["reason"] for t in tasks if not t["usable"]).most_common():
        print(f"  {n:>3}  {reason}")
    if a.out:
        a.out.write_text(json.dumps(tasks, indent=2) + "\n")


if __name__ == "__main__":
    main()
