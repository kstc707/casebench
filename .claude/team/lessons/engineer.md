# Engineer lessons

- **Next.js bundles web workers as classic scripts; Pyodide refuses classic workers.** Serve a plain
  module worker unbundled (`apps/web/scripts/practice-worker.mjs`, copied to `public/pyodide/`). (Practice mode)
- **Next.js page files may only export page things** (default, metadata, …). Put helpers elsewhere.
- **pytest 9 needs `pygments`.** Pin every wheel by version and sha256 (`prepare-pyodide.mjs`).
- **Old commits need the tool versions of their era** (e.g. `pytest.lazy_fixture` is gone from today's
  pytest). Prefer recent fixes for practice tasks.
- **Some projects read their version from the installed package.** Install the project (`pip install -e .`)
  before running its tests, not just `PYTHONPATH=src`.
- **Never `git add -A`.** It once swept a stray `Shell.tsx` into an unrelated commit and broke CI.
- **Watch for shadowed variables.** Reusing `start` turned a duration into "1791530399.8 s".
- **Show the useful line of an error.** pytest repeats "found no collectors" after a SyntaxError; filter
  that out and show the `E `-marked lines.
- **In this sandbox, Node's `fetch` ignores the proxy.** Use `NODE_USE_ENV_PROXY=1` for scripts that
  download.
