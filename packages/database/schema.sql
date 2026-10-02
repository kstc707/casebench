-- Casebench database schema.
-- Mirrors packages/domain/src/run.ts: a run is an append-only event log.
-- See docs/architecture.md for the reasoning.

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  problem_slug text not null,
  user_id uuid not null,
  status text not null check (status in ('started', 'in_progress', 'submitted', 'evaluated', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists run_events_run_id_idx on run_events (run_id, created_at);

-- Immutability: once a run is published, no further events may be appended
-- and its status/updated_at may never change again. This is the real
-- guarantee behind the portfolio feature — a shared result reflects a
-- frozen run, not one still being edited after the grade was seen.

create or replace function reject_changes_to_published_run()
returns trigger as $$
begin
  if OLD.status = 'published' then
    raise exception 'Run % is published and immutable', OLD.id;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger runs_immutable_once_published
  before update on runs
  for each row
  execute function reject_changes_to_published_run();

create or replace function reject_events_on_published_run()
returns trigger as $$
declare
  run_status text;
begin
  select status into run_status from runs where id = NEW.run_id;
  if run_status = 'published' then
    raise exception 'Run % is published; no further events may be appended', NEW.run_id;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger run_events_block_after_publish
  before insert on run_events
  for each row
  execute function reject_events_on_published_run();

-- Portfolio: a denormalized, queryable snapshot generated once a run is
-- published, so the portfolio UI doesn't need to replay the full event log
-- on every view. This table is write-once alongside the publish event.

create table if not exists portfolio_entries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references runs(id),
  user_id uuid not null,
  problem_slug text not null,
  summary text not null,
  score numeric,
  created_at timestamptz not null default now()
);
