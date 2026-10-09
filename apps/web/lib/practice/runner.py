"""
Runs a practice task's tests inside Pyodide. Loaded by the browser's web
worker (public/pyodide/practice-worker.mjs) and by scripts/check-practice-tasks.ts,
so a task is always tested the same way.

_casebench_run(files_json, ids_json) writes the project fresh into /work,
forgets modules imported by the previous run (so edits take effect), runs
pytest on exactly the given test ids, and returns JSON:
  {"results": [{"id", "outcome": passed|failed|skipped|missing, "message"?}],
   "error": pytest's output if it couldn't run the tests, else null,
   "durationMs": int}
"""
import contextlib, io, json, os, shutil, sys, time
import pytest

def _casebench_run(files_json, ids_json):
    files = json.loads(files_json)
    ids = json.loads(ids_json)
    shutil.rmtree("/work", ignore_errors=True)
    for path, text in files.items():
        full = os.path.join("/work", path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(text)

    # Forget everything imported from the project last run, so edits take effect.
    roots = {"tests"} | {p.split("/")[1] for p in files if p.startswith("src/") and p.count("/") >= 2}
    for name in list(sys.modules):
        if name.split(".")[0] in roots:
            del sys.modules[name]
    for p in ("/work/src", "/work"):
        if p not in sys.path:
            sys.path.insert(0, p)
    os.chdir("/work")

    outcomes = {}
    messages = {}

    class Collector:
        def pytest_runtest_logreport(self, report):
            if report.failed:
                outcomes[report.nodeid] = "failed"
                text = getattr(report, "longreprtext", "") or ""
                messages[report.nodeid] = "\n".join(text.strip().splitlines()[-12:])[:1500]
            elif report.skipped and report.nodeid not in outcomes:
                outcomes[report.nodeid] = "skipped"
            elif report.when == "call" and report.passed:
                outcomes[report.nodeid] = "passed"

    out = io.StringIO()
    start = time.time()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
        code = pytest.main(["-q", "-p", "no:cacheprovider", "--color=no", "-o", "addopts=", *ids], plugins=[Collector()])
    results = []
    for i in ids:
        r = {"id": i, "outcome": outcomes.get(i, "missing")}
        if i in messages:
            r["message"] = messages[i]
        results.append(r)
    error = None
    if int(code) in (2, 3, 4) or (not outcomes and ids):
        # Show the real problem (e.g. a SyntaxError while importing the code), not
        # pytest's repeated "found no collectors" lines for each test id it couldn't find.
        lines = [l for l in out.getvalue().strip().splitlines() if "found no collectors" not in l]
        first = next((i for i, l in enumerate(lines) if "ERROR collecting" in l), max(0, len(lines) - 25))
        block = lines[first:first + 40]
        # pytest marks the error itself with "E "; skip its own internal stack frames when it does.
        marked = [l[1:].strip("\n") for l in block if l.startswith("E ")]
        error = "\n".join([block[0].strip(" _"), *marked] if marked else block)[:3000]
    return json.dumps({"results": results, "error": error, "durationMs": int((time.time() - start) * 1000)})
