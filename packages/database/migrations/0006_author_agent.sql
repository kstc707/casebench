-- The author agent: an AI that researches real-world work problems online and
-- drafts simulations, published under the "CB" (Casebench) profile after a
-- human approves them.

-- The CB profile. Nobody can sign in as it: its key hash is not a hash of any key.
insert into users (id, handle, display_name, key_hash)
values ('00000000-0000-4000-8000-0000000000cb', 'cb', 'CB', 'no-login')
on conflict do nothing;
-- If someone already took the handle "cb", fall back to "casebench".
insert into users (id, handle, display_name, key_hash)
values ('00000000-0000-4000-8000-0000000000cb', 'casebench', 'CB', 'no-login')
on conflict do nothing;

-- One row per agent run: what it researched, what it built, and its log.
create table if not exists author_agent_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running', 'ready', 'failed', 'approved', 'rejected')),
  trigger text not null check (trigger in ('cron', 'manual')),
  topic text,
  requested_by uuid,
  scenario_id uuid references scenarios(id) on delete set null,
  title text,
  plan jsonb,
  brief jsonb,
  sources jsonb,
  checks jsonb,
  log jsonb not null default '[]',
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists author_agent_jobs_created_idx on author_agent_jobs (created_at desc);
