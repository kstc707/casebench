-- Structured feedback from people trying Casebench: who they are, a few 1–5
-- ratings, and free-text answers. Anyone (guest or profile) can send it;
-- only admins read it.
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  persona text not null,
  problem_slug text,
  completed text not null check (completed in ('yes', 'partly', 'no')),
  ratings jsonb not null,
  would_use text not null check (would_use in ('yes', 'maybe', 'no')),
  most_useful text,
  confusing text,
  missing text,
  contact text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_idx on feedback (created_at desc);
create index if not exists feedback_user_idx on feedback (user_id, created_at desc);
