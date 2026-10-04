# Working on Casebench

The project owner presents this project in interviews and must be able to explain every part
of it. Documentation is part of the deliverable, not an afterthought.

## Every step gets a build-log entry

For each meaningful change (a feature, a port from the prototype, a schema change), add
`docs/build-log/NN-short-name.md` using the same sections as the existing entries:
Goal · Where we started · What we built (with file paths) · Decisions and why (with rejected
alternatives) · Problems found along the way · How it was verified · Explain it in an
interview · Try it yourself. Add a row to `docs/build-log/README.md`. Keep
`docs/how-the-backend-works.md` accurate when files or flows change.

Write for someone with a data-analysis background learning web/backend engineering: define
terms on first use, prefer plain language, and point to exact files.

## Conventions

- TypeScript for the app (Next.js in `apps/web`, shared code in `packages/*`).
- Content generation/validation lives in `packages/content-tools` (TypeScript, seeded, tested).
- Database changes are new numbered files in `packages/database/migrations/` — never edit an
  applied migration.
- The case-study truth model must never reach the client; keep the leak test passing.
- Before pushing: `pnpm typecheck`, `pnpm test` (with `TEST_DATABASE_URL` set), and
  `pnpm --filter @casebench/web build`.
