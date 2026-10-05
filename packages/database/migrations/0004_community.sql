-- Community layer: likes, ratings, comments on simulations (keyed by slug,
-- so official and Studio simulations work the same way).

create table if not exists simulation_likes (
  slug text not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (slug, user_id)
);

-- One rating per person per simulation; only people who finished it may rate
-- (enforced in the app, where "finished" is known).
create table if not exists simulation_ratings (
  slug text not null,
  user_id uuid not null,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (slug, user_id)
);

create table if not exists simulation_comments (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  user_id uuid not null,
  author_name text not null check (char_length(author_name) between 1 and 60),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists simulation_comments_slug_idx on simulation_comments (slug, created_at desc);

-- Solver stats are computed from runs; make "all runs of a simulation" cheap.
create index if not exists runs_problem_slug_idx on runs (problem_slug, status);
