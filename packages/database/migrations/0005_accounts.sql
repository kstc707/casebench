-- Profiles: a name people pick, so attempts, solves and simulations are
-- recorded under a person instead of an anonymous browser. No email or
-- password (this is a demo): the browser that creates a profile stays signed
-- in, and a profile key (stored only as a hash) signs in on other devices.
--
-- A profile's id is the same uuid space as the guest ids already stored in
-- runs.user_id, scenarios.author_id, likes, ratings and comments. A new
-- profile takes over the guest id of the browser that created it, so that
-- guest's history becomes the profile's with no data migration; signing in
-- on another browser moves that browser's guest history over (see
-- mergeGuestInto in src/accounts.ts).

create table if not exists users (
  id uuid primary key,
  handle text not null unique check (handle ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  key_hash text not null,
  created_at timestamptz not null default now()
);

-- Published runs stay frozen, except that their owner may change: moving a
-- guest's runs into the profile they just created. Nothing else may change.
create or replace function reject_changes_to_published_run()
returns trigger as $$
begin
  if OLD.status = 'published' and (
    NEW.id, NEW.problem_slug, NEW.status, NEW.created_at, NEW.updated_at
  ) is distinct from (
    OLD.id, OLD.problem_slug, OLD.status, OLD.created_at, OLD.updated_at
  ) then
    raise exception 'Run % is published and immutable', OLD.id;
  end if;
  return NEW;
end;
$$ language plpgsql;

create index if not exists runs_user_idx on runs (user_id, status);
