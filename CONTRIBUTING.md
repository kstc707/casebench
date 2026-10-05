# Contributing

Casebench is early-stage and the architecture is still settling. Useful contributions right now:

1. **Rebuilding the modular app** — see `docs/architecture.md` for the intended structure
   (domain entities, run state machine, Postgres migrations, provider abstraction layer). The
   prototype is a reference for behavior, not a pattern to copy structurally.
2. **New content** — additional role tracks, companies, case studies, or coding problems under
   `content/role-packs/` (once the modular app exists) are low-risk, high-value additions.
3. **Prototype fixes** — bugs or rough edges in `prototype/casebench-demo.html` are fair game
   too; it's still the only runnable artifact in this repo today.

## Ground rules

- Keep the hidden "truth model" / solution data genuinely inaccessible to the client — this is
  the thing that makes the simulations real investigations instead of scripted exercises. Any
  change touching evaluation or content loading should be checked for leakage before merging.
- For the coding track, any change to test-case semantics should be verified against *all*
  existing test cases for ambiguity, not just the happy path — a prior near-miss solution
  (comparing against the last *kept* event instead of the last *seen* event) passed 8/9 tests
  and only the hidden "chained re-sends" case caught it.

## Getting started

Open an issue describing what you want to work on before a large PR — the content format and
module boundaries are still likely to shift.

## Adding a scenario

You don't need to write code. Create it in the **Scenario Studio** (`/studio`), play-test it, and
**Export** it. To propose it for the official catalogue, open an issue with the exported `.json`
attached, or import it yourself with `pnpm --filter @casebench/content-tools import-scenario` and
open a pull request. See [`docs/authoring-scenarios.md`](docs/authoring-scenarios.md).

