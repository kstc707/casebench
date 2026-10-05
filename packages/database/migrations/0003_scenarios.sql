-- Scenarios authored in the in-app Scenario Studio. The whole scenario
-- (problem, coworkers, agent knowledge, rubric, CSV data) is one validated
-- JSON document — the same shape as the files in content/role-packs.
--
-- Visibility: every scenario is playable by anyone who has its link
-- (unlisted); `listed` additionally shows it in the Community section.
create table if not exists scenarios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  author_id uuid not null,
  author_name text,
  listed boolean not null default false,
  bundle jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scenarios_author_idx on scenarios (author_id, updated_at desc);
create index if not exists scenarios_listed_idx on scenarios (listed, updated_at desc) where listed;
