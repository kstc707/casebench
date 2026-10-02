# @casebench/database

Raw SQL migrations rather than an ORM, on purpose: the immutability guarantee
on published runs (see `schema.sql`) is enforced by Postgres triggers, and
that guarantee is load-bearing for the portfolio feature — it should live at
the database layer, not be something an ORM could accidentally bypass.

## Local setup

```bash
createdb casebench
psql casebench -f schema.sql
```

A proper migration tool (e.g. `node-pg-migrate` or `sqlx`-style numbered
migrations) should replace this single schema.sql once the schema starts
changing across environments — this is deliberately the simplest possible
starting point, not the intended long-term migration strategy.
