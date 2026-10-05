# @casebench/database

Raw SQL migrations rather than an ORM, on purpose: the immutability guarantee
on published runs (see `migrations/0001_init.sql`) is enforced by Postgres
triggers, and that guarantee is load-bearing for the portfolio feature — it
should live at the database layer, not be something an ORM could accidentally
bypass.

## What's here

- `migrations/NNNN_*.sql` — numbered migrations, applied in order, once each.
- `scripts/migrate.mjs` — the runner. Tracks applied files in a
  `schema_migrations` table and applies each new file in its own transaction.
- `src/` — the run repository used by the web app's API routes
  (`insertRun`, `getRun`, `listRuns`, `appendRunEvent`). State-machine rules
  come from `@casebench/domain`; this layer makes them durable and
  serializes concurrent appends to the same run with a row lock.

## Local setup

```bash
createdb casebench
DATABASE_URL=postgres://localhost/casebench pnpm --filter @casebench/database migrate
```

Hosted Postgres (Neon, Supabase, …) works the same way — point `DATABASE_URL`
at it and run the same command. Never edit a migration that has already been
applied anywhere; add a new numbered file instead.
